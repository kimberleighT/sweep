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
 * A bonus prediction round (highest-scoring team, total goals, MOTM…).
 * Maps 1:1 to the planned `bonus_challenges` Supabase table.
 */
export type ChallengeKind =
  | "top_team" // highest-scoring team of the round (pick a team)
  | "total_goals" // total goals in a round (number)
  | "biggest_margin" // biggest winning margin (number)
  | "motm" // player of the match (free text)
  | "favourite_result" // will the favourite win/draw/lose
  | "custom"; // free-text question, host judges the answer

export interface BonusChallenge {
  id: string;
  kind: ChallengeKind;
  /** the question shown to players, e.g. "Total goals in the Round of 16?" */
  prompt: string;
  /** points a correct prediction earns (doubled if the player jokers it). */
  points: number;
  /** ISO timestamp; predictions are locked once now() passes this. */
  locksAt: string;
  /** the correct answer, set by the host once known. null = unresolved. */
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
