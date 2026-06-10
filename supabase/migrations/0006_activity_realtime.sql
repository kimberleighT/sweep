-- ===========================================================================
-- Activity feed + Realtime "live feel", within the RPC-gateway security model.
-- ---------------------------------------------------------------------------
-- Postgres-changes Realtime can't reach anon (the tables have no SELECT grants),
-- so we use Realtime BROADCAST driven from the RPCs: each meaningful action
-- writes an `activity` row AND broadcasts on a public per-league channel
-- ('league:<join_code>'). Clients subscribe to that channel and refetch.
-- Activity is system-generated only — no user-typed text.
-- ===========================================================================

create table if not exists sweepstake.activity (
  id         bigint generated always as identity primary key,
  league_id  uuid not null references sweepstake.leagues(id) on delete cascade,
  kind       text not null,
  text       text not null,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists activity_league_idx
  on sweepstake.activity (league_id, created_at desc);
alter table sweepstake.activity enable row level security;
revoke all on sweepstake.activity from anon, authenticated;

-- Internal: record an activity row + broadcast it (broadcast is best-effort).
create or replace function sweepstake._activity(
  p_league_id uuid, p_kind text, p_text text, p_meta jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = sweepstake, public, extensions, pg_temp
as $$
declare
  v_code text;
begin
  insert into sweepstake.activity (league_id, kind, text, meta)
  values (p_league_id, p_kind, p_text, coalesce(p_meta, '{}'::jsonb));

  select join_code into v_code from sweepstake.leagues where id = p_league_id;
  begin
    perform realtime.send(
      jsonb_build_object('kind', p_kind, 'text', p_text),
      'activity', 'league:' || v_code, false);
  exception when others then
    null; -- realtime is optional; the poll fallback covers it
  end;
end;
$$;

-- Public: read recent activity for a league.
create or replace function sweepstake.get_activity(p_join_code text, p_limit int default 30)
returns jsonb
language plpgsql
security definer
set search_path = sweepstake, public, extensions, pg_temp
as $$
declare
  v_id uuid;
begin
  select id into v_id from sweepstake.leagues where join_code = upper(trim(p_join_code));
  if v_id is null then raise exception 'No league with that join code'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', a.id, 'kind', a.kind, 'text', a.text, 'created_at', a.created_at)
             order by a.created_at desc), '[]'::jsonb)
    from (
      select * from sweepstake.activity
       where league_id = v_id order by created_at desc
       limit greatest(1, least(p_limit, 100))
    ) a);
end;
$$;

-- ---------------------------------------------------------------------------
-- Hook _activity into the mutators (bodies otherwise unchanged from 0002/0003/0005).
-- ---------------------------------------------------------------------------

create or replace function sweepstake.join_league(
  p_join_code text, p_display_name text, p_pin text
) returns jsonb
language plpgsql
security definer
set search_path = sweepstake, public, extensions, pg_temp
as $$
declare
  v_league_id uuid;
  v_entrant sweepstake.entrants;
  v_name text := nullif(trim(p_display_name), '');
  v_token text;
  v_is_new boolean := false;
begin
  if v_name is null then raise exception 'A display name is required'; end if;
  if coalesce(trim(p_pin), '') = '' then raise exception 'A PIN is required'; end if;

  select id into v_league_id from sweepstake.leagues where join_code = upper(trim(p_join_code));
  if v_league_id is null then raise exception 'No league with that join code'; end if;

  select * into v_entrant from sweepstake.entrants
   where league_id = v_league_id and display_name = v_name;

  if found then
    if crypt(p_pin, v_entrant.pin_hash) <> v_entrant.pin_hash then
      raise exception 'That name is taken — wrong PIN';
    end if;
  else
    insert into sweepstake.entrants (league_id, display_name, pin_hash)
    values (v_league_id, v_name, crypt(p_pin, gen_salt('bf')))
    returning * into v_entrant;
    v_is_new := true;
  end if;

  if v_is_new then
    perform sweepstake._activity(v_league_id, 'join', v_name || ' joined the league');
  end if;

  v_token := sweepstake._issue_session(v_league_id, v_entrant.id, false);
  return jsonb_build_object(
    'entrant_id', v_entrant.id, 'league_id', v_league_id,
    'token', v_token, 'is_new', v_is_new);
end;
$$;

create or replace function sweepstake.set_allocations(p_token text, p_allocations jsonb)
returns void
language plpgsql
security definer
set search_path = sweepstake, public, extensions, pg_temp
as $$
declare
  v_sess sweepstake.sessions;
begin
  v_sess := sweepstake._host_session(p_token);

  delete from sweepstake.entrant_teams t
   using sweepstake.entrants e
   where t.entrant_id = e.id and e.league_id = v_sess.league_id;

  insert into sweepstake.entrant_teams (entrant_id, team_code, is_captain)
  select (a->>'entrant_id')::uuid,
         tc,
         (a->>'captain') is not null and tc = (a->>'captain')
  from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) a
  cross join lateral jsonb_array_elements_text(a->'team_codes') tc
  where exists (
    select 1 from sweepstake.entrants e
     where e.id = (a->>'entrant_id')::uuid and e.league_id = v_sess.league_id);

  perform sweepstake._activity(v_sess.league_id, 'draw', 'The draw is in — everyone has their teams!');
end;
$$;

create or replace function sweepstake.set_matches(p_token text, p_matches jsonb)
returns void
language plpgsql
security definer
set search_path = sweepstake, public, extensions, pg_temp
as $$
declare
  v_sess sweepstake.sessions;
begin
  v_sess := sweepstake._host_session(p_token);

  delete from sweepstake.matches where league_id = v_sess.league_id;

  insert into sweepstake.matches
    (league_id, stage, grp, kickoff_at, home_code, away_code,
     home_score, away_score, status, manual)
  select v_sess.league_id,
         m->>'stage',
         nullif(m->>'grp', ''),
         nullif(m->>'kickoff_at', '')::timestamptz,
         m->>'home_code',
         m->>'away_code',
         nullif(m->>'home_score', '')::int,
         nullif(m->>'away_score', '')::int,
         coalesce(nullif(m->>'status', ''), 'scheduled'),
         coalesce((m->>'manual')::boolean, false)
  from jsonb_array_elements(coalesce(p_matches, '[]'::jsonb)) as m;

  perform sweepstake._activity(v_sess.league_id, 'results', 'Results updated');
end;
$$;

create or replace function sweepstake.submit_prediction(
  p_token text, p_challenge_id uuid, p_answer text, p_is_joker boolean default false
) returns void
language plpgsql
security definer
set search_path = sweepstake, public, extensions, pg_temp
as $$
declare
  v_sess sweepstake.sessions;
  v_ch sweepstake.bonus_challenges;
  v_ans text := nullif(trim(p_answer), '');
  v_name text;
begin
  v_sess := sweepstake._session(p_token);
  if v_sess.entrant_id is null then raise exception 'Players only'; end if;

  select * into v_ch from sweepstake.bonus_challenges where id = p_challenge_id;
  if not found then raise exception 'Challenge not found'; end if;
  if v_ch.league_id <> v_sess.league_id then raise exception 'Wrong league'; end if;
  if now() >= v_ch.locks_at then raise exception 'Predictions are locked'; end if;

  if v_ans is null then
    delete from sweepstake.predictions
     where challenge_id = p_challenge_id and entrant_id = v_sess.entrant_id;
    return;
  end if;

  if coalesce(p_is_joker, false) then
    update sweepstake.predictions set is_joker = false
     where entrant_id = v_sess.entrant_id
       and is_joker and scope = v_ch.scope and challenge_id <> p_challenge_id;
  end if;

  insert into sweepstake.predictions (challenge_id, entrant_id, answer, is_joker, scope)
  values (p_challenge_id, v_sess.entrant_id, v_ans, coalesce(p_is_joker, false), v_ch.scope)
  on conflict (challenge_id, entrant_id)
  do update set answer = excluded.answer, is_joker = excluded.is_joker, scope = excluded.scope;

  if coalesce(p_is_joker, false) then
    select display_name into v_name from sweepstake.entrants where id = v_sess.entrant_id;
    perform sweepstake._activity(v_sess.league_id, 'joker', coalesce(v_name, 'A player') || ' played a Joker 🃏');
  end if;
end;
$$;

-- Re-apply privileges (new get_activity is public; _activity is internal only).
revoke execute on all functions in schema sweepstake from public;
grant execute on all functions in schema sweepstake to anon, authenticated;
revoke execute on function sweepstake._gen_join_code()                     from anon, authenticated;
revoke execute on function sweepstake._issue_session(uuid, uuid, boolean)  from anon, authenticated;
revoke execute on function sweepstake._session(text)                       from anon, authenticated;
revoke execute on function sweepstake._host_session(text)                  from anon, authenticated;
revoke execute on function sweepstake._activity(uuid, text, text, jsonb)   from anon, authenticated;
