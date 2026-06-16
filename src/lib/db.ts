/**
 * League-mode data layer.
 *
 * Talks to the YesGaffa Supabase project but ONLY through the isolated
 * `sweepstake` schema's SECURITY DEFINER RPCs (see supabase/migrations). The
 * tables themselves are RLS-locked and ungranted, so the anon key can do
 * nothing except call these functions. Identity is a PIN, exchanged for an
 * opaque bearer token by create/join/login.
 *
 * Everything here maps the server's snake_case rows to the existing camelCase
 * `Game` / `Fixture` / `BonusChallenge` / `Prediction` types, so the React
 * components stay identical between quick-play (localStorage) and league mode.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  BonusChallenge,
  ChallengeKind,
  Fixture,
  Game,
  PredictPick,
  PredictRound,
  ScoringConfig,
  Stage,
} from "../types";

/* ------------------------------------------------------------------ *
 * Client — lazily created so quick-play works with no env configured.
 * ------------------------------------------------------------------ */
let _client: SupabaseClient<any, any, any> | null = null;

/** True when league mode is configured (env present). */
export function leagueModeAvailable(): boolean {
  return Boolean(
    import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
  );
}

function client(): SupabaseClient<any, any, any> {
  if (_client) return _client;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "League mode needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env"
    );
  }
  _client = createClient(url, anon, {
    db: { schema: "sweepstake" },
    auth: { persistSession: false }, // we don't use Supabase Auth — PINs only
  });
  return _client;
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/* ------------------------------------------------------------------ *
 * Server row shapes (what get_league_state returns).
 * ------------------------------------------------------------------ */
interface LeagueRow {
  id: string;
  name: string;
  join_code: string;
  entry_fee: number;
  currency: string;
  scoring_config: ScoringConfig;
  created_at: string;
}
interface EntrantRow {
  id: string;
  display_name: string;
}
interface EntrantTeamRow {
  entrant_id: string;
  team_code: string;
  is_captain: boolean;
}
interface MatchRow {
  id: string;
  stage: Stage;
  grp: string | null;
  kickoff_at: string | null;
  home_code: string;
  away_code: string;
  home_score: number | null;
  away_score: number | null;
  status: Fixture["status"];
  manual: boolean;
}
interface ChallengeRow {
  id: string;
  kind: ChallengeKind;
  scope: Stage;
  prompt: string;
  points: number;
  locks_at: string;
  answer: string | null;
  created_at: string;
}
interface PredictionRow {
  challenge_id: string;
  entrant_id: string;
  answer: string;
  is_joker: boolean;
}
interface PredictRoundRow {
  id: string;
  game_date: string;
  locks_at: string;
  points_result: number;
  points_score: number;
}
interface PredictPickRow {
  round_id: string;
  entrant_id: string;
  match_id: string;
  home_score: number | null;
  away_score: number | null;
}
interface LeagueStateRow {
  league: LeagueRow;
  viewer: { entrant_id: string | null; is_host: boolean };
  entrants: EntrantRow[];
  entrant_teams: EntrantTeamRow[];
  matches: MatchRow[];
  bonus_challenges: ChallengeRow[];
  predictions: PredictionRow[];
  predict_rounds: PredictRoundRow[];
  predict_picks: PredictPickRow[];
}

/** The reshaped league: a Game (as the components expect) + fixtures + viewer. */
export interface LeagueState {
  joinCode: string;
  game: Game;
  fixtures: Fixture[];
  viewer: { entrantId: string | null; isHost: boolean };
  predictRounds: PredictRound[];
  predictPicks: PredictPick[];
}

function toFixture(m: MatchRow): Fixture {
  return {
    id: m.id,
    stage: m.stage,
    group: m.grp,
    kickoff: m.kickoff_at ?? "",
    homeCode: m.home_code,
    awayCode: m.away_code,
    homeScore: m.home_score,
    awayScore: m.away_score,
    status: m.status,
    manual: m.manual,
  };
}

function toChallenge(c: ChallengeRow): BonusChallenge {
  return {
    id: c.id,
    kind: c.kind,
    scope: c.scope,
    prompt: c.prompt,
    points: c.points,
    locksAt: c.locks_at,
    answer: c.answer,
    createdAt: c.created_at,
  };
}

function reshape(row: LeagueStateRow): LeagueState {
  const teamsByEntrant = new Map<string, string[]>();
  const captains: Record<string, string> = {};
  for (const t of row.entrant_teams) {
    const list = teamsByEntrant.get(t.entrant_id) ?? [];
    list.push(t.team_code);
    teamsByEntrant.set(t.entrant_id, list);
    if (t.is_captain) captains[t.entrant_id] = t.team_code;
  }

  const game: Game = {
    id: row.league.id,
    name: row.league.name,
    createdAt: row.league.created_at,
    entrants: row.entrants.map((e) => ({ id: e.id, name: e.display_name })),
    allocations: row.entrants.map((e) => ({
      entrantId: e.id,
      teamCodes: teamsByEntrant.get(e.id) ?? [],
    })),
    scoring: row.league.scoring_config,
    drawn: row.entrant_teams.length > 0,
    captains,
    prize:
      row.league.entry_fee > 0
        ? { entryFee: row.league.entry_fee, currency: row.league.currency }
        : undefined,
    challenges: row.bonus_challenges.map(toChallenge),
    predictions: row.predictions.map((p) => ({
      challengeId: p.challenge_id,
      entrantId: p.entrant_id,
      answer: p.answer,
      joker: p.is_joker,
    })),
  };

  return {
    joinCode: row.league.join_code,
    game,
    fixtures: row.matches.map(toFixture),
    viewer: {
      entrantId: row.viewer.entrant_id,
      isHost: row.viewer.is_host,
    },
    predictRounds: row.predict_rounds.map((r) => ({
      id: r.id,
      gameDate: r.game_date,
      locksAt: r.locks_at,
      pointsResult: r.points_result,
      pointsScore: r.points_score,
    })),
    predictPicks: row.predict_picks.map((p) => ({
      roundId: p.round_id,
      entrantId: p.entrant_id,
      matchId: p.match_id,
      homeScore: p.home_score,
      awayScore: p.away_score,
    })),
  };
}

/* ------------------------------------------------------------------ *
 * Auth / lobby.
 * ------------------------------------------------------------------ */
export interface AuthResult {
  token: string;
  leagueId: string;
  joinCode: string;
  entrantId: string | null;
  isHost: boolean;
  isNew: boolean;
  /** The name this player is known by, so we can remember it for re-entry. */
  displayName: string | null;
}

export async function createLeague(input: {
  name: string;
  hostName: string;
  hostPin: string;
  scoring: ScoringConfig;
  entryFee: number;
  currency: string;
}): Promise<AuthResult> {
  const data = await rpc<{
    league_id: string;
    join_code: string;
    token: string;
    entrant_id: string;
  }>("create_league", {
    p_name: input.name,
    p_host_pin: input.hostPin,
    p_scoring_config: input.scoring,
    p_entry_fee: input.entryFee,
    p_currency: input.currency,
    p_host_name: input.hostName,
  });
  return {
    token: data.token,
    leagueId: data.league_id,
    joinCode: data.join_code,
    entrantId: data.entrant_id, // the host plays too
    isHost: true,
    isNew: true,
    displayName: input.hostName.trim() || null,
  };
}

export async function hostLogin(joinCode: string, hostPin: string): Promise<AuthResult> {
  const data = await rpc<{ league_id: string; token: string }>("host_login", {
    p_join_code: joinCode,
    p_host_pin: hostPin,
  });
  return {
    token: data.token,
    leagueId: data.league_id,
    joinCode: joinCode.trim().toUpperCase(),
    entrantId: null,
    isHost: true,
    isNew: false,
    displayName: null, // host-only login isn't tied to a player name
  };
}

/** Join-or-resume: claims the name+PIN, or resumes if the PIN matches. */
export async function joinLeague(
  joinCode: string,
  displayName: string,
  pin: string
): Promise<AuthResult> {
  const data = await rpc<{
    entrant_id: string;
    league_id: string;
    token: string;
    is_new: boolean;
  }>("join_league", {
    p_join_code: joinCode,
    p_display_name: displayName,
    p_pin: pin,
  });
  return {
    token: data.token,
    leagueId: data.league_id,
    joinCode: joinCode.trim().toUpperCase(),
    entrantId: data.entrant_id,
    isHost: false,
    isNew: data.is_new,
    displayName: displayName.trim() || null,
  };
}

/* ------------------------------------------------------------------ *
 * Reads.
 * ------------------------------------------------------------------ */
export async function getLeagueState(
  joinCode: string,
  token?: string | null
): Promise<LeagueState> {
  const row = await rpc<LeagueStateRow>("get_league_state", {
    p_join_code: joinCode,
    p_token: token ?? null,
  });
  return reshape(row);
}

/* ------------------------------------------------------------------ *
 * Player writes.
 * ------------------------------------------------------------------ */
export async function submitPrediction(
  token: string,
  challengeId: string,
  answer: string,
  isJoker: boolean
): Promise<void> {
  await rpc<null>("submit_prediction", {
    p_token: token,
    p_challenge_id: challengeId,
    p_answer: answer,
    p_is_joker: isJoker,
  });
}

/* ------------------------------------------------------------------ *
 * Host writes.
 * ------------------------------------------------------------------ */
export interface AllocationInput {
  entrantId: string;
  teamCodes: string[];
  captain: string | null;
}

export async function setAllocations(
  token: string,
  allocations: AllocationInput[]
): Promise<void> {
  await rpc<null>("set_allocations", {
    p_token: token,
    p_allocations: allocations.map((a) => ({
      entrant_id: a.entrantId,
      team_codes: a.teamCodes,
      captain: a.captain,
    })),
  });
}

export async function setCaptain(
  token: string,
  entrantId: string,
  teamCode: string
): Promise<void> {
  await rpc<null>("set_captain", {
    p_token: token,
    p_entrant_id: entrantId,
    p_team_code: teamCode,
  });
}

export async function setMatches(token: string, fixtures: Fixture[]): Promise<void> {
  await rpc<null>("set_matches", {
    p_token: token,
    p_matches: fixtures.map((f) => ({
      stage: f.stage,
      grp: f.group,
      kickoff_at: f.kickoff || null,
      home_code: f.homeCode,
      away_code: f.awayCode,
      home_score: f.homeScore,
      away_score: f.awayScore,
      status: f.status,
      manual: f.manual ?? false,
    })),
  });
}

export async function createChallenge(
  token: string,
  input: {
    kind: ChallengeKind;
    scope: Stage;
    prompt: string;
    points: number;
    locksAt: string;
  }
): Promise<string> {
  return rpc<string>("create_challenge", {
    p_token: token,
    p_kind: input.kind,
    p_prompt: input.prompt,
    p_points: input.points,
    p_locks_at: input.locksAt,
    p_scope: input.scope,
  });
}

export async function deleteChallenge(token: string, challengeId: string): Promise<void> {
  await rpc<null>("delete_challenge", {
    p_token: token,
    p_challenge_id: challengeId,
  });
}

/** Host-only: permanently delete the whole league (everything cascades). */
export async function deleteLeague(token: string): Promise<void> {
  await rpc<null>("delete_league", { p_token: token });
}

/* ------------------------------------------------------------------ *
 * Match Day predictions.
 * ------------------------------------------------------------------ */
export async function createPredictRound(
  token: string,
  input: { gameDate: string; locksAt: string; pointsResult: number; pointsScore: number }
): Promise<string> {
  return rpc<string>("create_predict_round", {
    p_token: token,
    p_game_date: input.gameDate,
    p_locks_at: input.locksAt,
    p_points_result: input.pointsResult,
    p_points_score: input.pointsScore,
  });
}

export async function deletePredictRound(token: string, roundId: string): Promise<void> {
  await rpc<null>("delete_predict_round", { p_token: token, p_round_id: roundId });
}

/** Assigns the player a random game for the round (idempotent); pick lands in state. */
export async function assignMatchday(token: string, roundId: string): Promise<void> {
  await rpc<unknown>("assign_matchday", { p_token: token, p_round_id: roundId });
}

export async function submitPredict(
  token: string,
  roundId: string,
  homeScore: number,
  awayScore: number
): Promise<void> {
  await rpc<null>("submit_predict", {
    p_token: token,
    p_round_id: roundId,
    p_home_score: homeScore,
    p_away_score: awayScore,
  });
}

/* ------------------------------------------------------------------ *
 * Activity feed + Realtime.
 * ------------------------------------------------------------------ */
export interface ActivityItem {
  id: number;
  kind: string;
  text: string;
  created_at: string;
}

export async function getActivity(joinCode: string, limit = 30): Promise<ActivityItem[]> {
  return rpc<ActivityItem[]>("get_activity", { p_join_code: joinCode, p_limit: limit });
}

/**
 * Subscribe to a league's public Realtime Broadcast channel. The RPCs broadcast
 * `{ kind, text }` on `league:<code>` after each action. Returns an unsubscribe.
 */
export function subscribeLeague(
  joinCode: string,
  onEvent: (payload: { kind: string; text: string }) => void
): () => void {
  const sb = client();
  const ch = sb.channel(`league:${joinCode}`);
  // supabase-js broadcast typing is finicky; the runtime shape is { payload }.
  (ch as { on: (...a: unknown[]) => { subscribe: () => void } })
    .on("broadcast", { event: "activity" }, (msg: { payload?: { kind: string; text: string } }) => {
      if (msg.payload) onEvent(msg.payload);
    })
    .subscribe();
  return () => {
    void sb.removeChannel(ch);
  };
}
