-- ===========================================================================
-- Host-only "reset league" — permanently delete a league and everything in it.
-- Cascades to entrants, entrant_teams, matches, bonus_challenges, predictions,
-- sessions and activity via their ON DELETE CASCADE foreign keys.
-- ===========================================================================
create or replace function sweepstake.delete_league(p_token text)
returns void
language plpgsql
security definer
set search_path = sweepstake, public, extensions, pg_temp
as $$
declare
  v_sess sweepstake.sessions;
begin
  v_sess := sweepstake._host_session(p_token);
  delete from sweepstake.leagues where id = v_sess.league_id;
end;
$$;

revoke execute on all functions in schema sweepstake from public;
grant execute on all functions in schema sweepstake to anon, authenticated;
revoke execute on function sweepstake._gen_join_code()                     from anon, authenticated;
revoke execute on function sweepstake._issue_session(uuid, uuid, boolean)  from anon, authenticated;
revoke execute on function sweepstake._session(text)                       from anon, authenticated;
revoke execute on function sweepstake._host_session(text)                  from anon, authenticated;
revoke execute on function sweepstake._activity(uuid, text, text, jsonb)   from anon, authenticated;
