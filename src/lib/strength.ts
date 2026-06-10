import type { Allocation, Entrant, Team } from "../types";

/** Pot 1 is strongest → highest weight. */
const POT_WEIGHT: Record<number, number> = { 1: 4, 2: 3, 3: 2, 4: 1 };

export interface PowerRow {
  entrant: Entrant;
  strength: number;
  teams: Team[];
  potCounts: [number, number, number, number]; // pot1..pot4
  title: string;
  blurb: string;
}

/**
 * Pre-tournament "power ranking". Uses each squad's pot make-up as a
 * strength proxy and hands out cheeky verdict titles. Pure fun — no
 * results needed, computed the moment the draw is done.
 */
export function powerRanking(
  entrants: Entrant[],
  allocations: Allocation[],
  teamsByCode: Record<string, Team>
): PowerRow[] {
  const allocByEntrant = new Map(allocations.map((a) => [a.entrantId, a.teamCodes]));

  const rows: PowerRow[] = entrants.map((entrant) => {
    const codes = allocByEntrant.get(entrant.id) ?? [];
    const teams = codes.map((c) => teamsByCode[c]).filter((t): t is Team => !!t);
    const potCounts: [number, number, number, number] = [0, 0, 0, 0];
    let strength = 0;
    for (const t of teams) {
      strength += POT_WEIGHT[t.pot] ?? 0;
      const idx = t.pot - 1;
      potCounts[idx] = (potCounts[idx] ?? 0) + 1;
    }
    return { entrant, strength, teams, potCounts, title: "", blurb: "" };
  });

  rows.sort((a, b) => b.strength - a.strength || b.potCounts[0] - a.potCounts[0]);

  const mostTopSeeds = [...rows].sort((a, b) => b.potCounts[0] - a.potCounts[0])[0];
  const mostMinnows = [...rows].sort((a, b) => b.potCounts[3] - a.potCounts[3])[0];

  rows.forEach((r, i) => {
    if (i === 0) {
      r.title = "🏆 Pre-tournament favourite";
      r.blurb = `Top-ranked squad — ${r.potCounts[0]} Pot 1 heavyweight${
        r.potCounts[0] === 1 ? "" : "s"
      }. The one to beat.`;
    } else if (i === rows.length - 1) {
      r.title = "🥄 Wooden-spoon watch";
      r.blurb = `Drew the short straw — ${r.potCounts[3]} Pot 4 outsider${
        r.potCounts[3] === 1 ? "" : "s"
      }. Needs a miracle (or a shock).`;
    } else if (r === mostMinnows && r.potCounts[3] >= 2) {
      r.title = "🎲 Rolling the dice";
      r.blurb = "A box of underdogs — could be a disaster, could be the great escape.";
    } else if (r === mostTopSeeds) {
      r.title = "💪 Heavyweight haul";
      r.blurb = "Stacked with seeds. Expectation is heavy on these shoulders.";
    } else {
      r.title = "🐎 Dark horse";
      r.blurb = "A balanced spread — quietly dangerous if a couple over-perform.";
    }
  });

  return rows;
}
