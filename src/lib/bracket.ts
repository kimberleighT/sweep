import type { Fixture, Stage } from "../types";
import {
  GROUPS,
  GROUP_LETTERS,
  KNOCKOUT_SCHEDULE,
  type GroupLetter,
} from "../data/worldcup2026.ts";

/**
 * Knockout bracket engine.
 *
 * The bundled `KNOCKOUT_SCHEDULE` is a calendar of *placeholder* fixtures
 * ("Winner Group A", "Runner-up Group B", "3rd A/B/C/D/F", "Winner Match 74"…).
 * This module turns those placeholders into concrete `Fixture`s as results come
 * in — it never relies on the results API for knockout pairings (the API can't
 * supply them: the games don't exist until the groups settle, and their team
 * slots are TBD).
 *
 * Flow (all derived from the persisted group/knockout scores):
 *   group results  → 12 group tables (1st / 2nd / 3rd)
 *                  → the 8 best third-placed teams
 *                  → FIFA's reserved third-placed R32 slots (bipartite match)
 *   R32 results    → R16  (Winner Match N)
 *   R16 → QF → SF  → Final (Winner Match N)
 *
 * Re-running is idempotent: it recomputes from current scores, so calling it
 * after each round entered advances the bracket one step. Callers merge the
 * output with `mergeFixtures` so manually-entered scores are preserved.
 *
 * NOTE: the 3rd-place play-off (match 103) is intentionally NOT generated — it
 * is tagged `stage: "final"` in the schedule, and `scoreTeams` awards the
 * champion/"reached final" bonuses to anyone in a final-stage fixture, so
 * emitting it would corrupt those bonuses. Semi-final losers already score
 * their SF goals + the SF-reached bonus.
 */

export interface GroupStanding {
  code: string;
  group: GroupLetter;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  /** 1 = winner, 2 = runner-up, 3 = third, 4 = bottom. */
  rank: number;
}

const FIFA_WIN = 3;
const FIFA_DRAW = 1;
/** Each group is a 4-team round-robin → 6 matches. */
const MATCHES_PER_GROUP = 6;

/** FIFA-style ordering: points, then goal difference, goals for, then code. */
function compareStanding(a: GroupStanding, b: GroupStanding): number {
  return (
    b.points - a.points ||
    b.gd - a.gd ||
    b.gf - a.gf ||
    a.code.localeCompare(b.code)
  );
}

/** Group tables from the finished group fixtures (incomplete groups included). */
export function computeGroupStandings(
  fixtures: Fixture[]
): Map<GroupLetter, GroupStanding[]> {
  const out = new Map<GroupLetter, GroupStanding[]>();

  for (const g of GROUP_LETTERS) {
    const rows = new Map<string, GroupStanding>();
    for (const code of GROUPS[g]) {
      rows.set(code, {
        code,
        group: g,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        points: 0,
        rank: 0,
      });
    }

    for (const f of fixtures) {
      if (f.stage !== "group" || f.group !== g) continue;
      if (f.status !== "finished" || f.homeScore === null || f.awayScore === null)
        continue;
      const home = rows.get(f.homeCode);
      const away = rows.get(f.awayCode);
      if (!home || !away) continue; // a team not in our group map — ignore
      home.played++;
      away.played++;
      home.gf += f.homeScore;
      home.ga += f.awayScore;
      away.gf += f.awayScore;
      away.ga += f.homeScore;
      if (f.homeScore > f.awayScore) {
        home.won++;
        home.points += FIFA_WIN;
        away.lost++;
      } else if (f.awayScore > f.homeScore) {
        away.won++;
        away.points += FIFA_WIN;
        home.lost++;
      } else {
        home.drawn++;
        away.drawn++;
        home.points += FIFA_DRAW;
        away.points += FIFA_DRAW;
      }
    }

    const table = [...rows.values()];
    for (const r of table) r.gd = r.gf - r.ga;
    table.sort(compareStanding);
    table.forEach((r, i) => (r.rank = i + 1));
    out.set(g, table);
  }

  return out;
}

/** True once every group has all 6 of its matches finished. */
export function allGroupsComplete(fixtures: Fixture[]): boolean {
  const finishedByGroup = new Map<GroupLetter, number>();
  for (const f of fixtures) {
    if (f.stage !== "group" || !f.group) continue;
    if (f.status !== "finished" || f.homeScore === null || f.awayScore === null)
      continue;
    const g = f.group as GroupLetter;
    finishedByGroup.set(g, (finishedByGroup.get(g) ?? 0) + 1);
  }
  return GROUP_LETTERS.every((g) => (finishedByGroup.get(g) ?? 0) >= MATCHES_PER_GROUP);
}

/** The 8 best third-placed groups, ranked best → worst (by FIFA ordering). */
export function bestThirdGroups(
  standings: Map<GroupLetter, GroupStanding[]>
): GroupLetter[] {
  const thirds = GROUP_LETTERS.map((g) => standings.get(g)?.[2]).filter(
    (s): s is GroupStanding => !!s
  );
  thirds.sort(compareStanding);
  return thirds.slice(0, 8).map((s) => s.group);
}

interface ThirdSlot {
  matchNo: number;
  allowed: Set<GroupLetter>;
}

/** Parse the reserved third-placed R32 slots from the schedule ("3rd A/B/…"). */
function thirdPlaceSlots(): ThirdSlot[] {
  return KNOCKOUT_SCHEDULE.filter((k) => k.away.startsWith("3rd ")).map((k) => ({
    matchNo: k.match,
    allowed: new Set(
      k.away
        .slice("3rd ".length)
        .split("/")
        .map((s) => s.trim() as GroupLetter)
    ),
  }));
}

/**
 * Assign the 8 qualifying third-placed groups to their reserved R32 slots,
 * respecting each slot's allowed-group set. This is FIFA's "best thirds" table
 * solved as a bipartite matching (most-constrained slots first, deterministic
 * ordering) rather than the published 495-row lookup — for a sweepstake the
 * matching gives a valid, stable bracket; the exact official table only differs
 * in how it breaks ties between equally-legal assignments. Returns matchNo →
 * group; an unmatched slot (only possible for a Hall-violating combo) is simply
 * absent, leaving that R32 game ungenerated until set manually.
 */
export function assignThirdsToSlots(
  qualifying: GroupLetter[],
  slots: ThirdSlot[] = thirdPlaceSlots()
): Map<number, GroupLetter> {
  const slotMatch = new Map<number, GroupLetter>();
  const orderedSlots = [...slots].sort(
    (a, b) => a.allowed.size - b.allowed.size || a.matchNo - b.matchNo
  );

  const tryAssign = (g: GroupLetter, visited: Set<number>): boolean => {
    for (const s of orderedSlots) {
      if (!s.allowed.has(g) || visited.has(s.matchNo)) continue;
      visited.add(s.matchNo);
      const cur = slotMatch.get(s.matchNo);
      if (cur === undefined || tryAssign(cur, visited)) {
        slotMatch.set(s.matchNo, g);
        return true;
      }
    }
    return false;
  };

  for (const g of [...qualifying].sort()) tryAssign(g, new Set());
  return slotMatch;
}

/** Find a finished, decided result for an unordered pair at a given stage. */
function findDecided(
  fixtures: Fixture[],
  a: string,
  b: string,
  stage: Stage
): { winner: string; loser: string } | null {
  for (const f of fixtures) {
    if (f.stage !== stage) continue;
    if (f.status !== "finished" || f.homeScore === null || f.awayScore === null)
      continue;
    const samePair =
      (f.homeCode === a && f.awayCode === b) ||
      (f.homeCode === b && f.awayCode === a);
    if (!samePair) continue;
    if (f.homeScore === f.awayScore) return null; // draw → winner unknown (pens)
    const winner = f.homeScore > f.awayScore ? f.homeCode : f.awayCode;
    return { winner, loser: winner === a ? b : a };
  }
  return null;
}

interface ResolveCtx {
  standings: Map<GroupLetter, GroupStanding[]>;
  slotAssignment: Map<number, GroupLetter>;
  winnerOf: Map<number, string>;
  loserOf: Map<number, string>;
}

/** Resolve one bracket placeholder string to a concrete team code, or null. */
function resolveSide(token: string, matchNo: number, ctx: ResolveCtx): string | null {
  const winnerGroup = "Winner Group ";
  const runnerUpGroup = "Runner-up Group ";
  const winnerMatch = "Winner Match ";
  const loserMatch = "Loser Match ";

  if (token.startsWith(winnerGroup)) {
    const g = token.slice(winnerGroup.length).trim() as GroupLetter;
    return ctx.standings.get(g)?.[0]?.code ?? null;
  }
  if (token.startsWith(runnerUpGroup)) {
    const g = token.slice(runnerUpGroup.length).trim() as GroupLetter;
    return ctx.standings.get(g)?.[1]?.code ?? null;
  }
  if (token.startsWith("3rd")) {
    const g = ctx.slotAssignment.get(matchNo);
    return g ? ctx.standings.get(g)?.[2]?.code ?? null : null;
  }
  if (token.startsWith(winnerMatch)) {
    return ctx.winnerOf.get(Number(token.slice(winnerMatch.length))) ?? null;
  }
  if (token.startsWith(loserMatch)) {
    return ctx.loserOf.get(Number(token.slice(loserMatch.length))) ?? null;
  }
  return null;
}

/**
 * Build the concrete knockout fixtures that the current results support.
 * Returns scheduled fixtures (no scores) — callers merge them with
 * `mergeFixtures(fixtures, buildKnockoutFixtures(fixtures))`, which preserves
 * any scores already entered. Empty until every group is complete.
 */
export function buildKnockoutFixtures(fixtures: Fixture[]): Fixture[] {
  if (!allGroupsComplete(fixtures)) return [];

  const standings = computeGroupStandings(fixtures);
  const slotAssignment = assignThirdsToSlots(bestThirdGroups(standings));
  const ctx: ResolveCtx = {
    standings,
    slotAssignment,
    winnerOf: new Map(),
    loserOf: new Map(),
  };

  const out: Fixture[] = [];
  // Schedule is in match-number order and only ever references lower-numbered
  // matches, so a single forward pass resolves every dependency in turn.
  for (const k of KNOCKOUT_SCHEDULE) {
    if (k.match === 103) continue; // 3rd-place play-off — see file header
    const home = resolveSide(k.home, k.match, ctx);
    const away = resolveSide(k.away, k.match, ctx);
    if (!home || !away) continue; // teams not known yet → generate later

    out.push({
      id: `wc:${k.match}`,
      stage: k.stage,
      group: null,
      kickoff: `${k.date}T00:00:00`,
      homeCode: home,
      awayCode: away,
      homeScore: null,
      awayScore: null,
      status: "scheduled",
    });

    // Record the result (if played) so later rounds can advance off it.
    const decided = findDecided(fixtures, home, away, k.stage);
    if (decided) {
      ctx.winnerOf.set(k.match, decided.winner);
      ctx.loserOf.set(k.match, decided.loser);
    }
  }

  return out;
}
