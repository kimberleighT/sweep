import type {
  BonusChallenge,
  ChallengeKind,
  Fixture,
  Prediction,
  Stage,
} from "../types";

/** The input control a challenge's prediction needs. */
export type ChallengeInput = "team" | "number";

export interface ChallengeKindMeta {
  kind: ChallengeKind;
  label: string;
  emoji: string;
  /** how the prediction is entered & compared */
  input: ChallengeInput;
  /** builds the player-facing prompt for a given round label */
  prompt: (roundLabel: string) => string;
  defaultPoints: number;
}

export const STAGE_LABEL: Record<Stage, string> = {
  group: "Group Stage",
  r32: "Round of 32",
  r16: "Round of 16",
  qf: "Quarter-finals",
  sf: "Semi-finals",
  final: "Final",
};

export const STAGE_ORDER: Stage[] = ["group", "r32", "r16", "qf", "sf", "final"];

/**
 * The bonus challenge kinds. Every one is computed automatically from the match
 * results in its round — there are no human-judged kinds.
 */
export const CHALLENGE_KINDS: Record<ChallengeKind, ChallengeKindMeta> = {
  total_goals: {
    kind: "total_goals",
    label: "Total goals",
    emoji: "⚽",
    input: "number",
    prompt: (s) => `Total goals scored in the ${s}?`,
    defaultPoints: 5,
  },
  biggest_margin: {
    kind: "biggest_margin",
    label: "Biggest winning margin",
    emoji: "📏",
    input: "number",
    prompt: (s) => `Biggest winning margin in the ${s}?`,
    defaultPoints: 5,
  },
  top_scoring_team: {
    kind: "top_scoring_team",
    label: "Highest-scoring team",
    emoji: "🔥",
    input: "team",
    prompt: (s) => `Highest-scoring team of the ${s}?`,
    defaultPoints: 5,
  },
  highest_scoring_match: {
    kind: "highest_scoring_match",
    label: "Most goals in one match",
    emoji: "🎯",
    input: "number",
    prompt: (s) => `Most goals in a single ${s} match?`,
    defaultPoints: 5,
  },
  total_draws: {
    kind: "total_draws",
    label: "Number of draws",
    emoji: "🤝",
    input: "number",
    prompt: (s) => `How many matches are drawn in the ${s}?`,
    defaultPoints: 5,
  },
  total_clean_sheets: {
    kind: "total_clean_sheets",
    label: "Number of clean sheets",
    emoji: "🧤",
    input: "number",
    prompt: (s) => `How many clean sheets in the ${s}?`,
    defaultPoints: 5,
  },
  one_goal_games: {
    kind: "one_goal_games",
    label: "One-goal games",
    emoji: "😬",
    input: "number",
    prompt: (s) => `How many ${s} matches are decided by a single goal?`,
    defaultPoints: 5,
  },
  high_scoring_games: {
    kind: "high_scoring_games",
    label: "Goal-fests (3+ goals)",
    emoji: "🎉",
    input: "number",
    prompt: (s) => `How many ${s} matches have 3 or more goals?`,
    defaultPoints: 5,
  },
};

export const kindMeta = (kind: ChallengeKind): ChallengeKindMeta =>
  CHALLENGE_KINDS[kind];

/** Default prompt for a kind over a round (stage). */
export const defaultPrompt = (kind: ChallengeKind, scope: Stage): string =>
  CHALLENGE_KINDS[kind].prompt(STAGE_LABEL[scope]);

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Does a prediction match the (computed) answer for this kind? */
export function isCorrect(
  kind: ChallengeKind,
  answer: string,
  prediction: string
): boolean {
  if (!answer || !prediction) return false;
  if (kindMeta(kind).input === "number") {
    const a = Number.parseFloat(answer);
    const p = Number.parseFloat(prediction);
    return Number.isFinite(a) && Number.isFinite(p) && a === p;
  }
  return norm(answer) === norm(prediction);
}

/** A challenge is locked (no more predictions) once its lock time passes. */
export function isLocked(challenge: BonusChallenge, now = Date.now()): boolean {
  const t = Date.parse(challenge.locksAt);
  return Number.isFinite(t) && now >= t;
}

type FinishedFixture = Fixture & { homeScore: number; awayScore: number };
const isFinished = (f: Fixture): f is FinishedFixture =>
  f.status === "finished" && f.homeScore !== null && f.awayScore !== null;

/**
 * Auto-resolve a challenge from the fixtures in its scope (round). Returns the
 * correct answer only once EVERY in-scope match is finished — otherwise null
 * (still unresolved). Number answers come back as strings to match predictions.
 */
export function resolveBonusAnswer(
  challenge: BonusChallenge,
  fixtures: Fixture[]
): string | null {
  const inScope = fixtures.filter((f) => f.stage === challenge.scope);
  if (inScope.length === 0) return null;
  const done = inScope.filter(isFinished);
  if (done.length !== inScope.length) return null; // round not complete yet

  switch (challenge.kind) {
    case "total_goals":
      return String(done.reduce((s, f) => s + f.homeScore + f.awayScore, 0));
    case "highest_scoring_match":
      return String(done.reduce((m, f) => Math.max(m, f.homeScore + f.awayScore), 0));
    case "biggest_margin":
      return String(
        done.reduce((m, f) => Math.max(m, Math.abs(f.homeScore - f.awayScore)), 0)
      );
    case "total_draws":
      return String(done.filter((f) => f.homeScore === f.awayScore).length);
    case "total_clean_sheets":
      return String(
        done.reduce(
          (n, f) => n + (f.awayScore === 0 ? 1 : 0) + (f.homeScore === 0 ? 1 : 0),
          0
        )
      );
    case "one_goal_games":
      return String(done.filter((f) => Math.abs(f.homeScore - f.awayScore) === 1).length);
    case "high_scoring_games":
      return String(done.filter((f) => f.homeScore + f.awayScore >= 3).length);
    case "top_scoring_team": {
      const goals = new Map<string, number>();
      for (const f of done) {
        goals.set(f.homeCode, (goals.get(f.homeCode) ?? 0) + f.homeScore);
        goals.set(f.awayCode, (goals.get(f.awayCode) ?? 0) + f.awayScore);
      }
      let best: string | null = null;
      let bestGoals = -1;
      for (const [code, g] of goals) {
        if (g > bestGoals) {
          bestGoals = g;
          best = code;
        }
      }
      return best; // FIFA team code
    }
  }
}

export const isResolved = (c: BonusChallenge, fixtures: Fixture[]): boolean =>
  resolveBonusAnswer(c, fixtures) !== null;

export type ChallengeStatus = "open" | "locked" | "resolved";

export function challengeStatus(
  c: BonusChallenge,
  fixtures: Fixture[],
  now = Date.now()
): ChallengeStatus {
  if (isResolved(c, fixtures)) return "resolved";
  return isLocked(c, now) ? "locked" : "open";
}

/** Entrant ids that have already spent their single Joker. */
export function jokersUsed(predictions: Prediction[]): Set<string> {
  const used = new Set<string>();
  for (const p of predictions) if (p.joker) used.add(p.entrantId);
  return used;
}

/**
 * Joker is one-per-round: maps entrant id → the set of rounds (scopes) in which
 * they've already played their Joker. A player can play one Joker per round.
 */
export function jokerScopesUsed(
  predictions: Prediction[],
  challenges: BonusChallenge[]
): Map<string, Set<Stage>> {
  const scopeOf = new Map(challenges.map((c) => [c.id, c.scope]));
  const out = new Map<string, Set<Stage>>();
  for (const p of predictions) {
    if (!p.joker) continue;
    const scope = scopeOf.get(p.challengeId);
    if (!scope) continue;
    const set = out.get(p.entrantId) ?? new Set<Stage>();
    set.add(scope);
    out.set(p.entrantId, set);
  }
  return out;
}

/**
 * Bonus points per entrant from correct predictions, scored automatically once
 * each challenge's round has finished. Jokered correct answers score double.
 */
export function scoreBonus(
  challenges: BonusChallenge[],
  predictions: Prediction[],
  fixtures: Fixture[]
): Record<string, number> {
  const byId = new Map(challenges.map((c) => [c.id, c]));
  const answerCache = new Map<string, string | null>();
  const answerFor = (c: BonusChallenge): string | null => {
    if (!answerCache.has(c.id)) answerCache.set(c.id, resolveBonusAnswer(c, fixtures));
    return answerCache.get(c.id) ?? null;
  };

  const out: Record<string, number> = {};
  for (const p of predictions) {
    const c = byId.get(p.challengeId);
    if (!c) continue;
    const ans = answerFor(c);
    if (ans === null) continue;
    if (!isCorrect(c.kind, ans, p.answer)) continue;
    out[p.entrantId] = (out[p.entrantId] ?? 0) + c.points * (p.joker ? 2 : 1);
  }
  return out;
}
