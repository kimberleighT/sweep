-- ===========================================================================
-- World Cup Sweepstake — RPC gateway.
-- ---------------------------------------------------------------------------
-- These SECURITY DEFINER functions are the ONLY authorised way to touch the
-- sweepstake.* tables (which have RLS on + no policies + no anon grants, see
-- 0001). Each function is owned by the migration role, so its body bypasses RLS;
-- the API roles (anon/authenticated) are granted EXECUTE on the public RPCs only.
--
-- Identity is a PIN, hashed with pgcrypto bcrypt. A successful create/join/login
-- mints an opaque bearer token; only its sha256 hash is stored. Mutating RPCs
-- take that token, resolve the caller, and check expiry.
--
-- search_path includes `extensions` so the pgcrypto functions (crypt, gen_salt,
-- digest, gen_random_bytes) resolve whether the extension lives in public or in
-- Supabase's extensions schema.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Internal helpers (NOT exposed to the API — see the revoke block at the end).
-- ---------------------------------------------------------------------------

create or replace function sweepstake._gen_join_code()
returns text
language plpgsql
security definer
set search_path = sweepstake, public, extensions, pg_temp
as $$
declare
  -- no I, L, O, 0, 1 — avoids "is that a one or an ell?" at the pub
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text := '';
  i int;
begin
  for i in 1..6 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return code;
end;
$$;

create or replace function sweepstake._issue_session(
  p_league_id uuid, p_entrant_id uuid, p_is_host boolean
) returns text
language plpgsql
security definer
set search_path = sweepstake, public, extensions, pg_temp
as $$
declare
  v_token text;
begin
  v_token := encode(gen_random_bytes(24), 'hex');
  insert into sweepstake.sessions (token_hash, league_id, entrant_id, is_host, expires_at)
  values (encode(digest(v_token, 'sha256'), 'hex'),
          p_league_id, p_entrant_id, p_is_host, now() + interval '90 days');
  return v_token;
end;
$$;

-- Resolve a bearer token to its session row, or raise. Prunes on expiry.
create or replace function sweepstake._session(p_token text)
returns sweepstake.sessions
language plpgsql
security definer
set search_path = sweepstake, public, extensions, pg_temp
as $$
declare
  v sweepstake.sessions;
begin
  if coalesce(p_token, '') = '' then
    raise exception 'Not signed in';
  end if;
  select * into v from sweepstake.sessions
   where token_hash = encode(digest(p_token, 'sha256'), 'hex');
  if not found then
    raise exception 'Session not found — sign in again';
  end if;
  if v.expires_at < now() then
    delete from sweepstake.sessions where token_hash = v.token_hash;
    raise exception 'Session expired — sign in again';
  end if;
  return v;
end;
$$;

create or replace function sweepstake._host_session(p_token text)
returns sweepstake.sessions
language plpgsql
security definer
set search_path = sweepstake, public, extensions, pg_temp
as $$
declare
  v sweepstake.sessions;
begin
  v := sweepstake._session(p_token);
  if not v.is_host then
    raise exception 'Host only';
  end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_league — host creates a sweepstake, gets back its join code + a host
-- token. The host PIN is the credential to re-authenticate later.
-- ---------------------------------------------------------------------------
create or replace function sweepstake.create_league(
  p_name text,
  p_host_pin text,
  p_scoring_config jsonb,
  p_entry_fee numeric default 0,
  p_currency text default '£'
) returns jsonb
language plpgsql
security definer
set search_path = sweepstake, public, extensions, pg_temp
as $$
declare
  v_code text;
  v_league_id uuid;
  v_token text;
  v_try int := 0;
begin
  if coalesce(trim(p_host_pin), '') = '' then
    raise exception 'A host PIN is required';
  end if;
  if p_scoring_config is null then
    raise exception 'scoring_config is required';
  end if;

  loop
    v_try := v_try + 1;
    v_code := sweepstake._gen_join_code();
    begin
      insert into sweepstake.leagues
        (name, join_code, host_pin_hash, entry_fee, currency, scoring_config)
      values
        (coalesce(nullif(trim(p_name), ''), 'World Cup Sweepstake'),
         v_code, crypt(p_host_pin, gen_salt('bf')),
         coalesce(p_entry_fee, 0), coalesce(nullif(p_currency, ''), '£'),
         p_scoring_config)
      returning id into v_league_id;
      exit;
    exception when unique_violation then
      if v_try >= 10 then
        raise exception 'Could not allocate a unique join code, please retry';
      end if;
    end;
  end loop;

  v_token := sweepstake._issue_session(v_league_id, null, true);
  return jsonb_build_object('league_id', v_league_id, 'join_code', v_code, 'token', v_token);
end;
$$;

-- ---------------------------------------------------------------------------
-- host_login — re-authenticate as host on a new device.
-- ---------------------------------------------------------------------------
create or replace function sweepstake.host_login(p_join_code text, p_host_pin text)
returns jsonb
language plpgsql
security definer
set search_path = sweepstake, public, extensions, pg_temp
as $$
declare
  v_id uuid;
  v_hash text;
  v_token text;
begin
  select id, host_pin_hash into v_id, v_hash
    from sweepstake.leagues where join_code = upper(trim(p_join_code));
  if v_id is null then
    raise exception 'No league with that join code';
  end if;
  if crypt(p_host_pin, v_hash) <> v_hash then
    raise exception 'Wrong host PIN';
  end if;
  v_token := sweepstake._issue_session(v_id, null, true);
  return jsonb_build_object('league_id', v_id, 'token', v_token);
end;
$$;

-- ---------------------------------------------------------------------------
-- join_league — join-or-resume in one call:
--   * name unseen in this league      -> create the entrant (claim name + PIN)
--   * name seen, PIN matches           -> resume (works across devices)
--   * name seen, PIN wrong             -> rejected
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

  v_token := sweepstake._issue_session(v_league_id, v_entrant.id, false);
  return jsonb_build_object(
    'entrant_id', v_entrant.id, 'league_id', v_league_id,
    'token', v_token, 'is_new', v_is_new);
end;
$$;

-- ---------------------------------------------------------------------------
-- get_league_state — the single read. Returns the whole league as one JSON blob
-- the client reshapes into its Game type. Predictions are visible only when the
-- challenge has locked, or when they belong to the calling entrant (token).
-- A stale/absent token still returns the public view (just no own-unlocked picks).
-- ---------------------------------------------------------------------------
create or replace function sweepstake.get_league_state(
  p_join_code text, p_token text default null
) returns jsonb
language plpgsql
security definer
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
      v_viewer := null;  -- a stale token must not block the public read
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
               'id', c.id, 'kind', c.kind, 'prompt', c.prompt, 'points', c.points,
               'locks_at', c.locks_at, 'answer', c.answer, 'created_at', c.created_at)
               order by c.locks_at), '[]'::jsonb)
      from sweepstake.bonus_challenges c where c.league_id = v_league.id),
    'predictions', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'challenge_id', p.challenge_id, 'entrant_id', p.entrant_id,
               'answer', p.answer, 'is_joker', p.is_joker)), '[]'::jsonb)
      from sweepstake.predictions p
      join sweepstake.bonus_challenges c on c.id = p.challenge_id
      where c.league_id = v_league.id
        and (c.locks_at <= now() or p.entrant_id = v_viewer))
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_prediction — player writes their own pick. Enforces the lock gate and
-- the one-Joker rule server-side. Empty answer clears the pick.
-- ---------------------------------------------------------------------------
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
    -- free the entrant's Joker from any other challenge (partial-unique guard)
    update sweepstake.predictions set is_joker = false
     where entrant_id = v_sess.entrant_id and is_joker and challenge_id <> p_challenge_id;
  end if;

  insert into sweepstake.predictions (challenge_id, entrant_id, answer, is_joker)
  values (p_challenge_id, v_sess.entrant_id, v_ans, coalesce(p_is_joker, false))
  on conflict (challenge_id, entrant_id)
  do update set answer = excluded.answer, is_joker = excluded.is_joker;
end;
$$;

-- ---------------------------------------------------------------------------
-- Host actions — all require a host token for the league.
-- ---------------------------------------------------------------------------

-- Commit the draw. p_allocations: [{entrant_id, team_codes:[...], captain:code|null}]
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
end;
$$;

create or replace function sweepstake.set_captain(
  p_token text, p_entrant_id uuid, p_team_code text
) returns void
language plpgsql
security definer
set search_path = sweepstake, public, extensions, pg_temp
as $$
declare
  v_sess sweepstake.sessions;
begin
  v_sess := sweepstake._host_session(p_token);
  if not exists (select 1 from sweepstake.entrants
                 where id = p_entrant_id and league_id = v_sess.league_id) then
    raise exception 'Entrant not in this league';
  end if;
  update sweepstake.entrant_teams
     set is_captain = (team_code = p_team_code)
   where entrant_id = p_entrant_id;
end;
$$;

-- Full-replace the league's fixtures/results (mirrors the client's saveFixtures).
-- p_matches: [{stage, grp, kickoff_at, home_code, away_code, home_score, away_score, status, manual}]
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
end;
$$;

create or replace function sweepstake.create_challenge(
  p_token text, p_kind text, p_prompt text, p_points int, p_locks_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path = sweepstake, public, extensions, pg_temp
as $$
declare
  v_sess sweepstake.sessions;
  v_id uuid;
begin
  v_sess := sweepstake._host_session(p_token);
  insert into sweepstake.bonus_challenges (league_id, kind, prompt, points, locks_at)
  values (v_sess.league_id, p_kind, nullif(trim(p_prompt), ''),
          p_points, p_locks_at)
  returning id into v_id;
  return v_id;
end;
$$;

-- Set or clear the correct answer (null/empty clears it back to unresolved).
create or replace function sweepstake.set_challenge_answer(
  p_token text, p_challenge_id uuid, p_answer text
) returns void
language plpgsql
security definer
set search_path = sweepstake, public, extensions, pg_temp
as $$
declare
  v_sess sweepstake.sessions;
begin
  v_sess := sweepstake._host_session(p_token);
  update sweepstake.bonus_challenges
     set answer = nullif(trim(p_answer), '')
   where id = p_challenge_id and league_id = v_sess.league_id;
  if not found then raise exception 'Challenge not found'; end if;
end;
$$;

create or replace function sweepstake.delete_challenge(p_token text, p_challenge_id uuid)
returns void
language plpgsql
security definer
set search_path = sweepstake, public, extensions, pg_temp
as $$
declare
  v_sess sweepstake.sessions;
begin
  v_sess := sweepstake._host_session(p_token);
  delete from sweepstake.bonus_challenges
   where id = p_challenge_id and league_id = v_sess.league_id;
end;
$$;

-- ===========================================================================
-- Privileges. PostgREST calls in as `anon` (the sweepstake client uses the anon
-- key, no JWT). Drop the default PUBLIC grant on every function, give the API
-- roles everything, then claw back the internal helpers so they can never be
-- called directly (only from within the SECURITY DEFINER bodies, as owner).
-- ===========================================================================
grant usage on schema sweepstake to anon, authenticated;

revoke execute on all functions in schema sweepstake from public;
grant execute on all functions in schema sweepstake to anon, authenticated;

revoke execute on function sweepstake._gen_join_code()                     from anon, authenticated;
revoke execute on function sweepstake._issue_session(uuid, uuid, boolean)  from anon, authenticated;
revoke execute on function sweepstake._session(text)                       from anon, authenticated;
revoke execute on function sweepstake._host_session(text)                  from anon, authenticated;
