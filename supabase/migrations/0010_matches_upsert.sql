-- ===========================================================================
-- Make set_matches upsert in place instead of delete-and-reinsert.
-- ---------------------------------------------------------------------------
-- Match Day picks reference matches.id (ON DELETE CASCADE), so the old
-- "delete all + reinsert" approach changed every match id on each result entry
-- and silently wiped predictions. Now we keep stable ids (and orientation):
-- update scores on matches that persist, insert new ones, delete only those no
-- longer present. Backstops the existing client/server dedup too.
-- ===========================================================================

-- 1) Remove any pre-existing duplicate matches (keep the scored row per pairing)
--    so the unique index below can be built.
delete from sweepstake.matches
 where id in (
   select id from (
     select id, row_number() over (
       partition by league_id, stage,
                    least(home_code, away_code), greatest(home_code, away_code)
       order by (home_score is not null) desc, id
     ) as rn
     from sweepstake.matches
   ) t where rn > 1
 );

-- 2) One row per (league, stage, unordered pair).
create unique index if not exists matches_league_stage_pair
  on sweepstake.matches (league_id, stage, least(home_code, away_code), greatest(home_code, away_code));

-- 3) Upserting set_matches.
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

  create temp table _incoming on commit drop as
  select distinct on (stage, least(home_code, away_code), greatest(home_code, away_code)) *
  from (
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
  ) src
  order by stage, least(home_code, away_code), greatest(home_code, away_code),
           (home_score is not null) desc;

  -- drop matches no longer in the incoming set (by pairing)
  delete from sweepstake.matches mm
   where mm.league_id = v_sess.league_id
     and not exists (
       select 1 from _incoming i
        where i.stage = mm.stage
          and least(i.home_code, i.away_code) = least(mm.home_code, mm.away_code)
          and greatest(i.home_code, i.away_code) = greatest(mm.home_code, mm.away_code)
     );

  -- upsert: keep existing id + orientation, update scores oriented to that row
  insert into sweepstake.matches
    (league_id, stage, grp, kickoff_at, home_code, away_code,
     home_score, away_score, status, manual)
  select v_sess.league_id, stage, grp, kickoff_at, home_code, away_code,
         home_score, away_score, status, manual
  from _incoming
  on conflict (league_id, stage, least(home_code, away_code), greatest(home_code, away_code))
  do update set
    home_score = case when sweepstake.matches.home_code = excluded.home_code
                      then excluded.home_score else excluded.away_score end,
    away_score = case when sweepstake.matches.home_code = excluded.home_code
                      then excluded.away_score else excluded.home_score end,
    status = excluded.status,
    kickoff_at = coalesce(excluded.kickoff_at, sweepstake.matches.kickoff_at),
    grp = coalesce(excluded.grp, sweepstake.matches.grp),
    manual = excluded.manual;

  perform sweepstake._activity(v_sess.league_id, 'results', 'Results updated');
end;
$$;
