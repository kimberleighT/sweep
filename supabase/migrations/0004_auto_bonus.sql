-- ===========================================================================
-- Auto-resolving bonus challenges.
-- ---------------------------------------------------------------------------
-- The human-judged kinds (motm, custom, favourite_result) are gone. Every kind
-- is now computed from the match results over the fixtures in its `scope` round,
-- client-side (see lib/challenges.ts resolveBonusAnswer). The DB just stores the
-- kind + scope; the `answer` column is now vestigial (kept, always null).
-- ===========================================================================

alter table sweepstake.bonus_challenges
  add column if not exists scope text not null default 'group'
    check (scope in ('group', 'r32', 'r16', 'qf', 'sf', 'final'));

alter table sweepstake.bonus_challenges
  drop constraint if exists bonus_challenges_kind_check;
alter table sweepstake.bonus_challenges
  add constraint bonus_challenges_kind_check check (kind in (
    'total_goals', 'biggest_margin', 'top_scoring_team',
    'highest_scoring_match', 'total_draws', 'total_clean_sheets'));

-- create_challenge gains p_scope. Drop the old signature first.
drop function if exists sweepstake.create_challenge(text, text, text, int, timestamptz);

create function sweepstake.create_challenge(
  p_token text,
  p_kind text,
  p_prompt text,
  p_points int,
  p_locks_at timestamptz,
  p_scope text
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
  insert into sweepstake.bonus_challenges (league_id, kind, scope, prompt, points, locks_at)
  values (v_sess.league_id, p_kind, p_scope, nullif(trim(p_prompt), ''), p_points, p_locks_at)
  returning id into v_id;
  return v_id;
end;
$$;

-- get_league_state must surface `scope` on each challenge.
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
        and (c.locks_at <= now() or p.entrant_id = v_viewer))
  );
end;
$$;

-- Re-apply the privilege model (covers the new create_challenge signature).
revoke execute on all functions in schema sweepstake from public;
grant execute on all functions in schema sweepstake to anon, authenticated;
revoke execute on function sweepstake._gen_join_code()                     from anon, authenticated;
revoke execute on function sweepstake._issue_session(uuid, uuid, boolean)  from anon, authenticated;
revoke execute on function sweepstake._session(text)                       from anon, authenticated;
revoke execute on function sweepstake._host_session(text)                  from anon, authenticated;
