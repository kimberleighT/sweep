import type { BonusChallenge, ChallengeKind, Prediction } from "../types";

/** The input control a challenge needs for its answer/prediction. */
export type ChallengeInput = "team" | "number" | "text" | "result";

export interface ChallengeKindMeta {
  kind: ChallengeKind;
  label: string;
  emoji: string;
  /** how the answer is entered & compared */
  input: ChallengeInput;
  /** suggested prompt the host can tweak */
  samplePrompt: string;
  defaultPoints: number;
}

export const CHALLENGE_KINDS: Record<ChallengeKind, ChallengeKindMeta> = {
  top_team: {
    kind: "top_team",
    label: "Top team of the round",
    emoji: "🔥",
    input: "team",
    samplePrompt: "Highest-scoring team this round?",
    defaultPoints: 5,
  },
  total_goals: {
    kind: "total_goals",
    label: "Total goals in a round",
    emoji: "⚽",
    input: "number",
    samplePrompt: "Total goals in this round?",
    defaultPoints: 5,
  },
  biggest_margin: {
    kind: "biggest_margin",
    label: "Biggest winning margin",
    emoji: "📏",
    input: "number",
    samplePrompt: "Biggest winning margin this round?",
    defaultPoints: 5,
  },
  motm: {
    kind: "motm",
    label: "Player of the match",
    emoji: "🌟",
    input: "text",
    samplePrompt: "Player of the Match in the selected fixture?",
    defaultPoints: 5,
  },
  favourite_result: {
    kind: "favourite_result",
    label: "Favourite win/draw/lose",
    emoji: "🎯",
    input: "result",
    samplePrompt: "Will the favourite win, draw or lose?",
    defaultPoints: 3,
  },
  custom: {
    kind: "custom",
    label: "Custom question",
    emoji: "❓",
    input: "text",
    samplePrompt: "Your own prediction question…",
    defaultPoints: 5,
  },
};

/** Fixed options for the win/draw/lose challenge. */
export const RESULT_OPTIONS = ["win", "draw", "lose"] as const;

export const kindMeta = (kind: ChallengeKind): ChallengeKindMeta =>
  CHALLENGE_KINDS[kind];

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Does a prediction match the resolved answer for this kind? */
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

export const isResolved = (c: BonusChallenge): boolean =>
  c.answer != null && c.answer !== "";

export type ChallengeStatus = "open" | "locked" | "resolved";

export function challengeStatus(
  c: BonusChallenge,
  now = Date.now()
): ChallengeStatus {
  if (isResolved(c)) return "resolved";
  return isLocked(c, now) ? "locked" : "open";
}

/** Entrant ids that have already spent their single Joker. */
export function jokersUsed(predictions: Prediction[]): Set<string> {
  const used = new Set<string>();
  for (const p of predictions) if (p.joker) used.add(p.entrantId);
  return used;
}

/**
 * Bonus points per entrant from correct predictions on resolved challenges.
 * Jokered correct answers score double. Returns a plain record so it threads
 * straight into buildStandings (and later, a JSON RPC response).
 */
export function scoreBonus(
  challenges: BonusChallenge[],
  predictions: Prediction[]
): Record<string, number> {
  const byId = new Map(challenges.map((c) => [c.id, c]));
  const out: Record<string, number> = {};
  for (const p of predictions) {
    const c = byId.get(p.challengeId);
    if (!c || !isResolved(c)) continue;
    if (!isCorrect(c.kind, c.answer as string, p.answer)) continue;
    const pts = c.points * (p.joker ? 2 : 1);
    out[p.entrantId] = (out[p.entrantId] ?? 0) + pts;
  }
  return out;
}
