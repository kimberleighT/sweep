import type {
  Allocation,
  BonusChallenge,
  Entrant,
  Fixture,
  Prediction,
  PredictPick,
  PredictRound,
  ScoringConfig,
  Stage,
  StandingRow,
} from "../types";
import { scoreBonus, STAGE_LABEL, STAGE_ORDER } from "./challenges.ts";

export const DEFAULT_SCORING: ScoringConfig = {
  win: 3,
  draw: 1,
  perGoal: 1,
  reach: { r32: 2, r16: 5, qf: 10, sf: 15, final: 25 },
  winnerBonus: 40,
  shortTeamBonus: 1,
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

  // Group-stage exits: a knockout loss already flags `eliminated`, but teams
  // that simply didn't qualify never lose a knockout game. Once the R32 is
  // drawn, the 32 teams in it are exactly the survivors — anyone owned but not
  // among them is out (so "teams alive" drops the moment the bracket is built).
  const r32Teams = new Set<string>();
  for (const f of fixtures) {
    if (f.stage === "r32") {
      r32Teams.add(f.homeCode);
      r32Teams.add(f.awayCode);
    }
  }
  if (r32Teams.size > 0) {
    for (const [code, t] of totals) {
      if (!r32Teams.has(code)) t.eliminated = true;
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

  // Fairness comp for an uneven draw: anyone holding fewer teams than the
  // league's top count earns extra points per win and per draw.
  const comp = scoring.shortTeamBonus ?? 1;
  const maxTeams = entrants.reduce(
    (m, e) => Math.max(m, (allocByEntrant.get(e.id) ?? []).length),
    0
  );

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
    // short-handed entrants get `comp` extra points for each win and each draw
    const shortTeamBonus =
      teams.length < maxTeams ? (agg.won + agg.drawn) * comp : 0;
    return {
      entrant,
      teams,
      captain,
      alive,
      points: agg.points + predictionPoints + shortTeamBonus,
      played: agg.played,
      won: agg.won,
      drawn: agg.drawn,
      lost: agg.lost,
      goalsFor: agg.goalsFor,
      bonus: agg.bonus,
      predictionPoints,
      shortTeamBonus,
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

const resultSign = (a: number, b: number): number => (a > b ? 1 : a < b ? -1 : 0);

/**
 * Match Day points per entrant: for each pick whose assigned game has finished,
 * an exact score scores `points_score`, a correct result (only) `points_result`,
 * else nothing. Fully derived from the results.
 */
export function scoreMatchDay(
  rounds: PredictRound[],
  picks: PredictPick[],
  fixtures: Fixture[]
): Record<string, number> {
  const roundById = new Map(rounds.map((r) => [r.id, r]));
  const fxById = new Map(fixtures.map((f) => [f.id, f]));
  const out: Record<string, number> = {};
  for (const p of picks) {
    if (p.homeScore === null || p.awayScore === null) continue;
    const f = fxById.get(p.matchId);
    if (!f || f.status !== "finished" || f.homeScore === null || f.awayScore === null) continue;
    const r = roundById.get(p.roundId);
    if (!r) continue;
    const exact = p.homeScore === f.homeScore && p.awayScore === f.awayScore;
    const sameResult = resultSign(p.homeScore, p.awayScore) === resultSign(f.homeScore, f.awayScore);
    const pts = exact ? r.pointsScore : sameResult ? r.pointsResult : 0;
    if (pts) out[p.entrantId] = (out[p.entrantId] ?? 0) + pts;
  }
  return out;
}

/** Sum two per-entrant point maps into one. */
export function mergePoints(
  a: Record<string, number>,
  b: Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v;
  return out;
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

/* ------------------------------------------------------------------ *
 * Per-entrant points breakdown — "where did these points come from?"
 * Reconciles EXACTLY to the entrant's row in buildStandings.
 * ------------------------------------------------------------------ */

/** One scoring line, e.g. "Win" +3, "2 goals" +2, "Reached Round of 16" +5. */
export interface PointLine {
  label: string;
  points: number;
}

/** A single finished game and what the owned team earned from it (pre-captain). */
export interface GameContribution {
  fixtureId: string;
  stage: Stage;
  kickoff: string;
  teamCode: string;
  oppCode: string;
  teamScore: number;
  oppScore: number;
  result: "W" | "D" | "L";
  /** points the team earned in this game, before any captain ×2 */
  basePoints: number;
  lines: PointLine[];
}

/** Everything one owned team contributed (matches + progression bonuses). */
export interface TeamContribution {
  teamCode: string;
  captain: boolean;
  eliminated: boolean;
  games: GameContribution[];
  /** progression / champion bonuses, before any captain ×2 */
  bonusLines: PointLine[];
  /** matches + bonuses, before captain ×2 */
  baseTotal: number;
  /** baseTotal, doubled if this team is the captain */
  total: number;
}

export interface EntrantBreakdown {
  teams: TeamContribution[];
  /** sum of every team's `total` (incl. captain doubling) */
  teamsTotal: number;
  predictionPoints: number;
  shortTeamBonus: number;
  /** grand total — equals the entrant's points in buildStandings */
  total: number;
}

/**
 * Explain exactly how an entrant's league points were earned: per owned team,
 * the games that scored and the points each gave, plus progression bonuses,
 * captain doubling, prediction points and the fewer-teams comp. The grand total
 * is identical to the entrant's `points` from buildStandings, by construction.
 */
export function explainEntrant(
  entrantId: string,
  entrants: Entrant[],
  allocations: Allocation[],
  fixtures: Fixture[],
  scoring: ScoringConfig,
  captains: Record<string, string> = {},
  predictionPointsByEntrant: Record<string, number> = {}
): EntrantBreakdown {
  const teamCodesOf = (id: string) =>
    allocations.find((a) => a.entrantId === id)?.teamCodes ?? [];
  const teamCodes = teamCodesOf(entrantId);
  const captainCode = captains[entrantId];

  // Same fairness-comp basis as buildStandings.
  const comp = scoring.shortTeamBonus ?? 1;
  const maxTeams = entrants.reduce((m, e) => Math.max(m, teamCodesOf(e.id).length), 0);

  // Which teams are still in it (mirrors scoreTeams' elimination logic).
  const elimByCode = new Map<string, boolean>();
  for (const [code, t] of scoreTeams(fixtures, scoring)) elimByCode.set(code, t.eliminated);

  const teams: TeamContribution[] = teamCodes.map((code) => {
    const isCap = captainCode === code;
    const stagesSeen = new Set<Stage>();
    const games: GameContribution[] = [];

    for (const f of fixtures) {
      const isHome = f.homeCode === code;
      const isAway = f.awayCode === code;
      if (!isHome && !isAway) continue;
      stagesSeen.add(f.stage);
      if (f.status !== "finished" || f.homeScore === null || f.awayScore === null) continue;

      const teamScore = isHome ? f.homeScore : f.awayScore;
      const oppScore = isHome ? f.awayScore : f.homeScore;
      const oppCode = isHome ? f.awayCode : f.homeCode;
      const lines: PointLine[] = [];
      let base = 0;
      if (teamScore > 0) {
        const p = teamScore * scoring.perGoal;
        lines.push({ label: `${teamScore} goal${teamScore === 1 ? "" : "s"}`, points: p });
        base += p;
      }
      let result: "W" | "D" | "L";
      if (teamScore > oppScore) {
        result = "W";
        lines.push({ label: "Win", points: scoring.win });
        base += scoring.win;
      } else if (teamScore === oppScore) {
        result = "D";
        lines.push({ label: "Draw", points: scoring.draw });
        base += scoring.draw;
      } else {
        result = "L";
      }
      games.push({
        fixtureId: f.id,
        stage: f.stage,
        kickoff: f.kickoff,
        teamCode: code,
        oppCode,
        teamScore,
        oppScore,
        result,
        basePoints: base,
        lines,
      });
    }

    const bonusLines: PointLine[] = [];
    for (const st of KNOCKOUT_STAGES) {
      if (stagesSeen.has(st)) bonusLines.push({ label: `Reached ${STAGE_LABEL[st]}`, points: scoring.reach[st] });
    }
    const wonFinal = fixtures.some(
      (f) =>
        f.stage === "final" &&
        f.status === "finished" &&
        f.homeScore !== null &&
        f.awayScore !== null &&
        f.homeScore !== f.awayScore &&
        ((f.homeScore > f.awayScore && f.homeCode === code) ||
          (f.awayScore > f.homeScore && f.awayCode === code))
    );
    if (wonFinal) bonusLines.push({ label: "Won the World Cup", points: scoring.winnerBonus });

    const baseTotal =
      games.reduce((s, g) => s + g.basePoints, 0) +
      bonusLines.reduce((s, b) => s + b.points, 0);

    return {
      teamCode: code,
      captain: isCap,
      eliminated: elimByCode.get(code) ?? false,
      games,
      bonusLines,
      baseTotal,
      total: isCap ? baseTotal * 2 : baseTotal,
    };
  });

  // Fewer-teams comp: extra `comp` per win & per draw across all owned teams.
  const wonDrawn = teams.reduce(
    (s, t) => s + t.games.filter((g) => g.result === "W" || g.result === "D").length,
    0
  );
  const shortTeamBonus = teamCodes.length < maxTeams ? wonDrawn * comp : 0;
  const teamsTotal = teams.reduce((s, t) => s + t.total, 0);
  const predictionPoints = predictionPointsByEntrant[entrantId] ?? 0;

  return {
    teams,
    teamsTotal,
    predictionPoints,
    shortTeamBonus,
    total: teamsTotal + predictionPoints + shortTeamBonus,
  };
}
