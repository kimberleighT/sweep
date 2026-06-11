-- ===========================================================================
-- Match Day predictions (league mode).
-- ---------------------------------------------------------------------------
-- The host adds a "Match Day" for a date that has fixtures. Each player is
-- randomly assigned ONE game from that day and predicts its score before the
-- lock. Auto-scored from the result (client-side): exact score = points_score,
-- correct result only = points_result, else 0. RLS-locked + RPC-only like the
-- rest of the schema.
-- ===========================================================================

create table sweepstake.predict_rounds (
  id            uuid primary key default gen_random_uuid(),
  league_id     uuid not null references sweepstake.leagues(id) on delete cascade,
  game_date     date not null,
  locks_at      timestamptz not null,
  points_result int not null default 3,
  points_score  int not null default 6,
  created_at    timestamptz not null default now()
);
create index predict_rounds_league_idx on sweepstake.predict_rounds (league_id);

create table sweepstake.predict_picks (
  id         uuid primary key default gen_random_uuid(),
  round_id   uuid not null references sweepstake.predict_rounds(id) on delete cascade,
  entrant_id uuid not null references sweepstake.entrants(id) on delete cascade,
  match_id   uuid not null references sweepstake.matches(id) on delete cascade,
  home_score int,
  away_score int,
  created_at timestamptz not null default now(),
  unique (round_id, entrant_id)
);

alter table sweepstake.predict_rounds enable row level security;
alter table sweepstake.predict_picks  enable row level security;
revoke all on sweepstake.predict_rounds from anon, authenticated;
revoke all on sweepstake.predict_picks  from anon, authenticated;

-- Host: create a Match Day (errors if no fixtures fall on that date).
create or replace function sweepstake.create_predict_round(
  p_token text, p_game_date date, p_locks_at timestamptz,
  p_points_result int default 3, p_points_score int default 6
) returns uuid
language plpgsql security definer
set search_path = sweepstake, public, extensions, pg_temp
as $$
declare
  v_sess sweepstake.sessions;
  v_id uuid;
begin
  v_sess := sweepstake._host_session(p_token);
  if not exists (
    select 1 from sweepstake.matches
     where league_id = v_sess.league_id and kickoff_at::date = p_game_date
  ) then
    raise exception 'No fixtures on that date — load the schedule first';
  end if;
  insert into sweepstake.predict_rounds (league_id, game_date, locks_at, points_result, points_score)
  values (v_sess.league_id, p_game_date, p_locks_at,
          coalesce(p_points_result, 3), coalesce(p_points_score, 6))
  returning id into v_id;
  perform sweepstake._activity(
    v_sess.league_id, 'matchday',
    '🎲 Match Day added for ' || to_char(p_game_date, 'Dy DD Mon'));
  return v_id;
end;
$$;

create or replace function sweepstake.delete_predict_round(p_token text, p_round_id uuid)
returns void
language plpgsql security definer
set search_path = sweepstake, public, extensions, pg_temp
as $$
declare
  v_sess sweepstake.sessions;
begin
  v_sess := sweepstake._host_session(p_token);
  delete from sweepstake.predict_rounds where id = p_round_id and league_id = v_sess.league_id;
end;
$$;

-- Player: get (assigning a random game on first call) this round's assignment.
create or replace function sweepstake.assign_matchday(p_token text, p_round_id uuid)
returns jsonb
language plpgsql security definer
set search_path = sweepstake, public, extensions, pg_temp
as $$
declare
  v_sess sweepstake.sessions;
  v_round sweepstake.predict_rounds;
  v_pick sweepstake.predict_picks;
  v_match sweepstake.matches;
  v_match_id uuid;
begin
  v_sess := sweepstake._session(p_token);
  if v_sess.entrant_id is null then raise exception 'Players only'; end if;

  select * into v_round from sweepstake.predict_rounds where id = p_round_id;
  if not found then raise exception 'Match Day not found'; end if;
  if v_round.league_id <> v_sess.league_id then raise exception 'Wrong league'; end if;

  select * into v_pick from sweepstake.predict_picks
   where round_id = p_round_id and entrant_id = v_sess.entrant_id;

  if not found then
    if now() >= v_round.locks_at then
      return null; -- too late to be assigned a game
    end if;
    select id into v_match_id from sweepstake.matches
     where league_id = v_sess.league_id and kickoff_at::date = v_round.game_date
     order by random() limit 1;
    if v_match_id is null then raise exception 'No fixtures for this Match Day'; end if;
    insert into sweepstake.predict_picks (round_id, entrant_id, match_id)
    values (p_round_id, v_sess.entrant_id, v_match_id)
    returning * into v_pick;
  end if;

  select * into v_match from sweepstake.matches where id = v_pick.match_id;
  return jsonb_build_object(
    'round_id', p_round_id, 'match_id', v_pick.match_id,
    'home_code', v_match.home_code, 'away_code', v_match.away_code,
    'kickoff_at', v_match.kickoff_at, 'status', v_match.status,
    'home_score', v_pick.home_score, 'away_score', v_pick.away_score,
    'locks_at', v_round.locks_at,
    'points_result', v_round.points_result, 'points_score', v_round.points_score);
end;
$$;

create or replace function sweepstake.submit_predict(
  p_token text, p_round_id uuid, p_home_score int, p_away_score int
) returns void
language plpgsql security definer
set search_path = sweepstake, public, extensions, pg_temp
as $$
declare
  v_sess sweepstake.sessions;
  v_round sweepstake.predict_rounds;
begin
  v_sess := sweepstake._session(p_token);
  if v_sess.entrant_id is null then raise exception 'Players only'; end if;
  select * into v_round from sweepstake.predict_rounds where id = p_round_id;
  if not found then raise exception 'Match Day not found'; end if;
  if v_round.league_id <> v_sess.league_id then raise exception 'Wrong league'; end if;
  if now() >= v_round.locks_at then raise exception 'Match Day predictions are locked'; end if;

  update sweepstake.predict_picks
     set home_score = p_home_score, away_score = p_away_score
   where round_id = p_round_id and entrant_id = v_sess.entrant_id;
  if not found then raise exception 'No game assigned yet — open Match Day first'; end if;
end;
$$;

-- Extend get_league_state with predict_rounds + (gated) predict_picks.
create or replace function sweepstake.get_league_state(
  p_join_code text, p_token text default null
) returns jsonb
language plpgsql security definer
set search_path = sweepstake, public, extensions, pg_temp
as $$
declare
  v_league sweepstake.leagues;
  v_viewer uuid := null;
  v_is_host boolean := false;
  v_sess sweepstake.sessions;
begin
  select * into v_league from sweepstake.leagues where join_code = upper(trim(p_join_code));
  if not found then raise exception 'No league with that join code'; end if;

  if coalesce(p_token, '') <> '' then
    begin
      v_sess := sweepstake._session(p_token);
      if v_sess.league_id = v_league.id then
        v_viewer := v_sess.entrant_id;
        v_is_host := v_sess.is_host;
      end if;
    exception when others then
      v_viewer := null;
    end;
  end if;

  return jsonb_build_object(
    'league', jsonb_build_object(
      'id', v_league.id, 'name', v_league.name, 'join_code', v_league.join_code,
      'entry_fee', v_league.entry_fee, 'currency', v_league.currency,
      'scoring_config', v_league.scoring_config, 'created_at', v_league.created_at),
    'viewer', jsonb_build_object('entrant_id', v_viewer, 'is_host', v_is_host),
    'entrants', (
      select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'display_name', e.display_name)
                                order by e.created_at), '[]'::jsonb)
      from sweepstake.entrants e where e.league_id = v_league.id),
    'entrant_teams', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'entrant_id', t.entrant_id, 'team_code', t.team_code, 'is_captain', t.is_captain)), '[]'::jsonb)
      from sweepstake.entrant_teams t
      join sweepstake.entrants e on e.id = t.entrant_id
      where e.league_id = v_league.id),
    'matches', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', m.id, 'stage', m.stage, 'grp', m.grp, 'kickoff_at', m.kickoff_at,
               'home_code', m.home_code, 'away_code', m.away_code,
               'home_score', m.home_score, 'away_score', m.away_score,
               'status', m.status, 'manual', m.manual)
               order by m.kickoff_at nulls last), '[]'::jsonb)
      from sweepstake.matches m where m.league_id = v_league.id),
    'bonus_challenges', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', c.id, 'kind', c.kind, 'scope', c.scope, 'prompt', c.prompt,
               'points', c.points, 'locks_at', c.locks_at, 'answer', c.answer,
               'created_at', c.created_at)
               order by c.locks_at), '[]'::jsonb)
      from sweepstake.bonus_challenges c where c.league_id = v_league.id),
    'predictions', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'challenge_id', p.challenge_id, 'entrant_id', p.entrant_id,
               'answer', p.answer, 'is_joker', p.is_joker)), '[]'::jsonb)
      from sweepstake.predictions p
      join sweepstake.bonus_challenges c on c.id = p.challenge_id
      where c.league_id = v_league.id
        and (c.locks_at <= now() or p.entrant_id = v_viewer)),
    'predict_rounds', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', r.id, 'game_date', r.game_date, 'locks_at', r.locks_at,
               'points_result', r.points_result, 'points_score', r.points_score)
               order by r.game_date), '[]'::jsonb)
      from sweepstake.predict_rounds r where r.league_id = v_league.id),
    'predict_picks', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'round_id', pp.round_id, 'entrant_id', pp.entrant_id, 'match_id', pp.match_id,
               'home_score', pp.home_score, 'away_score', pp.away_score)), '[]'::jsonb)
      from sweepstake.predict_picks pp
      join sweepstake.predict_rounds pr on pr.id = pp.round_id
      where pr.league_id = v_league.id
        and (pr.locks_at <= now() or pp.entrant_id = v_viewer))
  );
end;
$$;

-- Re-apply privileges (new public RPCs; internal helpers stay revoked).
revoke execute on all functions in schema sweepstake from public;
grant execute on all functions in schema sweepstake to anon, authenticated;
revoke execute on function sweepstake._gen_join_code()                     from anon, authenticated;
revoke execute on function sweepstake._issue_session(uuid, uuid, boolean)  from anon, authenticated;
revoke execute on function sweepstake._session(text)                       from anon, authenticated;
revoke execute on function sweepstake._host_session(text)                  from anon, authenticated;
revoke execute on function sweepstake._activity(uuid, text, text, jsonb)   from anon, authenticated;
