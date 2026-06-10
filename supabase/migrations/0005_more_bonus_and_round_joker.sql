-- ===========================================================================
-- More auto-bonus kinds + Joker-per-round.
-- ===========================================================================

-- Two more computed kinds.
alter table sweepstake.bonus_challenges
  drop constraint if exists bonus_challenges_kind_check;
alter table sweepstake.bonus_challenges
  add constraint bonus_challenges_kind_check check (kind in (
    'total_goals', 'biggest_margin', 'top_scoring_team', 'highest_scoring_match',
    'total_draws', 'total_clean_sheets', 'one_goal_games', 'high_scoring_games'));

-- Joker is now one per round. Denormalise the challenge's scope onto predictions
-- so a unique index can enforce it.
alter table sweepstake.predictions add column if not exists scope text;
update sweepstake.predictions p
  set scope = c.scope
  from sweepstake.bonus_challenges c
  where c.id = p.challenge_id and p.scope is null;

drop index if exists sweepstake.predictions_one_joker_per_entrant;
create unique index if not exists predictions_one_joker_per_round
  on sweepstake.predictions (entrant_id, scope) where is_joker;

-- submit_prediction: stamp scope, and free the Joker only within the same round.
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
    -- free the entrant's Joker from any OTHER challenge in the same round
    update sweepstake.predictions set is_joker = false
     where entrant_id = v_sess.entrant_id
       and is_joker
       and scope = v_ch.scope
       and challenge_id <> p_challenge_id;
  end if;

  insert into sweepstake.predictions (challenge_id, entrant_id, answer, is_joker, scope)
  values (p_challenge_id, v_sess.entrant_id, v_ans, coalesce(p_is_joker, false), v_ch.scope)
  on conflict (challenge_id, entrant_id)
  do update set answer = excluded.answer, is_joker = excluded.is_joker, scope = excluded.scope;
end;
$$;
