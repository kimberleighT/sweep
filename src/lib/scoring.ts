import type {
  Allocation,
  BonusChallenge,
  Entrant,
  Fixture,
  Prediction,
  ScoringConfig,
  Stage,
  StandingRow,
} from "../types";
import { scoreBonus, STAGE_ORDER } from "./challenges.ts";

export const DEFAULT_SCORING: ScoringConfig = {
  win: 3,
  draw: 1,
  perGoal: 1,
  reach: { r32: 2, r16: 5, qf: 10, sf: 15, final: 25 },
  winnerBonus: 40,
};

const KNOCKOUT_STAGES: Exclude<Stage, "group">[] = [
  "r32",
  "r16",
  "qf",
  "sf",
  "final",
];

interface TeamTotals {
  points: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  bonus: number;
  /** knocked out (lost a knockout tie, or final played and not champion) */
  eliminated: boolean;
}

function blank(): TeamTotals {
  return {
    points: 0,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    bonus: 0,
    eliminated: false,
  };
}

/** Per-team points across the whole tournament. */
export function scoreTeams(
  fixtures: Fixture[],
  scoring: ScoringConfig
): Map<string, TeamTotals> {
  const totals = new Map<string, TeamTotals>();
  const get = (code: string) => {
    let t = totals.get(code);
    if (!t) totals.set(code, (t = blank()));
    return t;
  };

  // stages each team appears in (for progression bonuses)
  const stagesSeen = new Map<string, Set<Stage>>();
  const seen = (code: string) => {
    let s = stagesSeen.get(code);
    if (!s) stagesSeen.set(code, (s = new Set()));
    return s;
  };

  for (const f of fixtures) {
    seen(f.homeCode).add(f.stage);
    seen(f.awayCode).add(f.stage);

    if (f.status !== "finished" || f.homeScore === null || f.awayScore === null) {
      continue;
    }

    const home = get(f.homeCode);
    const away = get(f.awayCode);
    home.played++;
    away.played++;
    home.goalsFor += f.homeScore;
    away.goalsFor += f.awayScore;
    home.points += f.homeScore * scoring.perGoal;
    away.points += f.awayScore * scoring.perGoal;

    const isKnockout = f.stage !== "group";
    if (f.homeScore > f.awayScore) {
      home.won++;
      home.points += scoring.win;
      away.lost++;
      if (isKnockout) away.eliminated = true;
    } else if (f.awayScore > f.homeScore) {
      away.won++;
      away.points += scoring.win;
      home.lost++;
      if (isKnockout) home.eliminated = true;
    } else {
      home.drawn++;
      away.drawn++;
      home.points += scoring.draw;
      away.points += scoring.draw;
    }

    // winner of the final gets the trophy bonus
    if (f.stage === "final" && f.homeScore !== f.awayScore) {
      const champ = f.homeScore > f.awayScore ? home : away;
      champ.bonus += scoring.winnerBonus;
      champ.points += scoring.winnerBonus;
    }
  }

  // progression bonuses for every knockout stage a team reached
  for (const [code, stages] of stagesSeen) {
    const t = get(code);
    for (const st of KNOCKOUT_STAGES) {
      if (stages.has(st)) {
        const b = scoring.reach[st];
        t.bonus += b;
        t.points += b;
      }
    }
  }

  return totals;
}

/** Roll per-team totals up to each entrant and sort into a league table. */
export function buildStandings(
  entrants: Entrant[],
  allocations: Allocation[],
  fixtures: Fixture[],
  scoring: ScoringConfig,
  captains: Record<string, string> = {},
  /** bonus points per entrant id from correct predictions (see scoreBonus). */
  predictionPointsByEntrant: Record<string, number> = {}
): StandingRow[] {
  const teamTotals = scoreTeams(fixtures, scoring);
  const allocByEntrant = new Map(allocations.map((a) => [a.entrantId, a.teamCodes]));

  const rows: StandingRow[] = entrants.map((entrant) => {
    const teams = allocByEntrant.get(entrant.id) ?? [];
    const captain = captains[entrant.id];
    const agg = blank();
    let alive = 0;
    for (const code of teams) {
      const t = teamTotals.get(code);
      if (!t) {
        alive++; // no fixtures yet → still in it
        continue;
      }
      // captain scores double
      agg.points += code === captain ? t.points * 2 : t.points;
      agg.played += t.played;
      agg.won += t.won;
      agg.drawn += t.drawn;
      agg.lost += t.lost;
      agg.goalsFor += t.goalsFor;
      agg.bonus += t.bonus;
      if (!t.eliminated) alive++;
    }
    const predictionPoints = predictionPointsByEntrant[entrant.id] ?? 0;
    return {
      entrant,
      teams,
      captain,
      alive,
      points: agg.points + predictionPoints,
      played: agg.played,
      won: agg.won,
      drawn: agg.drawn,
      lost: agg.lost,
      goalsFor: agg.goalsFor,
      bonus: agg.bonus,
      predictionPoints,
    };
  });

  rows.sort(
    (a, b) =>
      b.points - a.points ||
      b.won - a.won ||
      b.goalsFor - a.goalsFor ||
      a.entrant.name.localeCompare(b.entrant.name)
  );
  return rows;
}

export interface RoundManager {
  stage: Stage;
  entrant: Entrant;
  points: number;
}

/**
 * "Manager of the Round" — for every round (stage) that has finished fixtures,
 * the entrant who gained the most points *from that round alone* (its match
 * points + any bonus challenges scoped to it). Fully derived from results.
 */
export function managersOfRound(
  entrants: Entrant[],
  allocations: Allocation[],
  fixtures: Fixture[],
  scoring: ScoringConfig,
  captains: Record<string, string> = {},
  challenges: BonusChallenge[] = [],
  predictions: Prediction[] = []
): RoundManager[] {
  const out: RoundManager[] = [];
  for (const stage of STAGE_ORDER) {
    const stageFixtures = fixtures.filter(
      (f) =>
        f.stage === stage &&
        f.status === "finished" &&
        f.homeScore !== null &&
        f.awayScore !== null
    );
    if (stageFixtures.length === 0) continue;
    const stageBonus = scoreBonus(
      challenges.filter((c) => c.scope === stage),
      predictions,
      fixtures
    );
    const rows = buildStandings(
      entrants,
      allocations,
      stageFixtures,
      scoring,
      captains,
      stageBonus
    );
    const top = rows[0];
    if (top && top.points > 0) out.push({ stage, entrant: top.entrant, points: top.points });
  }
  return out;
}
