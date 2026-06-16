-- ===========================================================================
-- Match Day: assign EVERY current player a random game at creation (not lazily
-- on "reveal"), and reject a lock time that's already in the past so a round
-- can't be born dead. Late joiners still get one via assign_matchday on open.
-- ===========================================================================
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
  if p_locks_at <= now() then
    raise exception 'Lock time must be in the future';
  end if;
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

  -- give every current player a random game from that day (LATERAL re-rolls per
  -- entrant, so they're independently assigned).
  insert into sweepstake.predict_picks (round_id, entrant_id, match_id)
  select v_id, e.id, mm.id
  from sweepstake.entrants e
  cross join lateral (
    select m.id from sweepstake.matches m
     where m.league_id = v_sess.league_id
       and m.kickoff_at::date = p_game_date
       and e.id is not null   -- correlate on the entrant so random() re-rolls per player
     order by random() limit 1
  ) mm
  where e.league_id = v_sess.league_id;

  perform sweepstake._activity(
    v_sess.league_id, 'matchday',
    '🎲 Match Day added for ' || to_char(p_game_date, 'Dy DD Mon') || ' — everyone has a game!');
  return v_id;
end;
$$;
