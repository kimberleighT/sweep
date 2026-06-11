-- ===========================================================================
-- Server-side guarantee: a league can never store two rows for the same match.
-- set_matches now de-dupes the incoming list by (stage, unordered team pair),
-- keeping the row that has a score / is manual. This backstops the client-side
-- merge so duplicates can't survive even from a stale client or a click race.
-- ===========================================================================
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

  with rows as (
    select
      m->>'stage' as stage,
      nullif(m->>'grp', '') as grp,
      nullif(m->>'kickoff_at', '')::timestamptz as kickoff_at,
      m->>'home_code' as home_code,
      m->>'away_code' as away_code,
      nullif(m->>'home_score', '')::int as home_score,
      nullif(m->>'away_score', '')::int as away_score,
      coalesce(nullif(m->>'status', ''), 'scheduled') as status,
      coalesce((m->>'manual')::boolean, false) as manual
    from jsonb_array_elements(coalesce(p_matches, '[]'::jsonb)) as m
  )
  insert into sweepstake.matches
    (league_id, stage, grp, kickoff_at, home_code, away_code,
     home_score, away_score, status, manual)
  select distinct on (stage, least(home_code, away_code), greatest(home_code, away_code))
    v_sess.league_id, stage, grp, kickoff_at, home_code, away_code,
    home_score, away_score, status, manual
  from rows
  order by
    stage,
    least(home_code, away_code),
    greatest(home_code, away_code),
    (home_score is not null and away_score is not null) desc, -- prefer the scored row
    manual desc;

  perform sweepstake._activity(v_sess.league_id, 'results', 'Results updated');
end;
$$;
