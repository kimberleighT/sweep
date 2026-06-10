export interface Team {
  /** FIFA 3-letter code, e.g. "BRA" */
  code: string;
  name: string;
  /** ISO-2 country code used for the flag image (flagcdn). */
  flag: string;
  /** Seeding pot 1 (strongest) .. 4 (outsiders). */
  pot: 1 | 2 | 3 | 4;
}

export interface Entrant {
  id: string;
  name: string;
}

export interface Allocation {
  entrantId: string;
  teamCodes: string[];
}

export type Stage =
  | "group"
  | "r32"
  | "r16"
  | "qf"
  | "sf"
  | "final";

export interface Fixture {
  id: string;
  stage: Stage;
  /** Group letter for group games, else null. */
  group: string | null;
  kickoff: string; // ISO date
  homeCode: string;
  awayCode: string;
  homeScore: number | null;
  awayScore: number | null;
  status: "scheduled" | "live" | "finished";
  /** true when a human typed the score rather than the API. */
  manual?: boolean;
}

export interface ScoringConfig {
  win: number;
  draw: number;
  perGoal: number;
  /** progression bonus awarded to a team that REACHES this stage. */
  reach: Record<Exclude<Stage, "group">, number>;
  winnerBonus: number;
}

export interface PrizeConfig {
  entryFee: number;
  /** currency symbol, e.g. "£" */
  currency: string;
}

/**
 * A bonus prediction round. Every kind is auto-resolved from the match results
 * (no human judging) over the fixtures in its `scope` round. See
 * `resolveBonusAnswer` in lib/challenges.ts.
 */
export type ChallengeKind =
  | "total_goals" // total goals scored in the round (number)
  | "biggest_margin" // biggest winning margin in the round (number)
  | "top_scoring_team" // team that scored the most goals in the round (pick a team)
  | "highest_scoring_match" // most goals in a single match in the round (number)
  | "total_draws" // how many matches were drawn in the round (number)
  | "total_clean_sheets" // how many clean sheets were kept in the round (number)
  | "one_goal_games" // matches decided by exactly one goal (number)
  | "high_scoring_games"; // matches with 3+ total goals (number)

export interface BonusChallenge {
  id: string;
  kind: ChallengeKind;
  /** which round the challenge is computed over (its fixtures must all finish). */
  scope: Stage;
  /** the question shown to players, e.g. "Total goals in the Round of 16?" */
  prompt: string;
  /** points a correct prediction earns (doubled if the player jokers it). */
  points: number;
  /** ISO timestamp; predictions are locked once now() passes this. */
  locksAt: string;
  /** legacy column — answers are now computed from results, not stored. */
  answer: string | null;
  createdAt: string;
}

/**
 * One entrant's answer to a challenge. Maps 1:1 to the planned
 * `predictions` table (entrantId → auth_uid under RLS later).
 */
export interface Prediction {
  challengeId: string;
  entrantId: string;
  answer: string;
  /** the entrant spent their one Joker here → correct answer scores 2×. */
  joker: boolean;
}

export interface Game {
  id: string;
  name: string;
  createdAt: string;
  entrants: Entrant[];
  allocations: Allocation[];
  scoring: ScoringConfig;
  /** has the animated draw been completed & committed? */
  drawn: boolean;
  /** optional captain (double-points) team code per entrant id */
  captains?: Record<string, string>;
  prize?: PrizeConfig;
  /** bonus prediction rounds (added throughout the tournament). */
  challenges?: BonusChallenge[];
  /** entrants' answers to the bonus challenges. */
  predictions?: Prediction[];
}

export interface StandingRow {
  entrant: Entrant;
  points: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  bonus: number;
  /** points won from correct bonus-challenge predictions (incl. jokers). */
  predictionPoints: number;
  teams: string[];
  /** the entrant's captain team code, if set */
  captain?: string;
  /** how many of this entrant's teams are still alive in the tournament */
  alive: number;
}
