import type { Allocation, Entrant, Team } from "../types";

export interface Pick {
  teamCode: string;
  entrantId: string;
  pot: 1 | 2 | 3 | 4;
}

export interface DrawResult {
  /** ordered reveal sequence for the animated draw */
  picks: Pick[];
  allocations: Allocation[];
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Seeded-pot draw. Each pot is shuffled and dealt round-robin to the
 * entrants, so everyone receives a balanced spread across all four
 * strength tiers. The starting entrant rotates between pots, so when a
 * pot doesn't divide evenly the "extra" teams are shared out fairly
 * rather than always landing with the first few entrants.
 *
 * Seed guarantee: Pot 1 (the seeded teams) is dealt FIRST, one per entrant
 * from entrant 0, so every player gets a seeded team as long as there are at
 * least as many seeds as players (12 seeds → up to 12 players). With more
 * players than seeds it's impossible to give everyone one, but the pot
 * rotation then hands the seedless players the first (strongest) picks of
 * Pot 2 — so nobody is left with only weak teams.
 */
export function drawSeededPots(entrants: Entrant[], teams: Team[]): DrawResult {
  const picks: Pick[] = [];
  const n = entrants.length;
  let startOffset = 0;

  for (const pot of [1, 2, 3, 4] as const) {
    const potTeams = shuffle(teams.filter((t) => t.pot === pot));
    potTeams.forEach((team, i) => {
      const entrant = entrants[(i + startOffset) % n]!;
      picks.push({ teamCode: team.code, entrantId: entrant.id, pot });
    });
    startOffset = (startOffset + potTeams.length) % n;
  }

  const byEntrant = new Map<string, string[]>(entrants.map((e) => [e.id, []]));
  for (const p of picks) byEntrant.get(p.entrantId)!.push(p.teamCode);

  const allocations: Allocation[] = entrants.map((e) => ({
    entrantId: e.id,
    teamCodes: byEntrant.get(e.id)!,
  }));

  return { picks, allocations };
}

/** How many teams each entrant will receive, e.g. "6 each" or "6–7 each". */
export function describeSplit(entrantCount: number, totalTeams: number): string {
  if (entrantCount <= 0) return "—";
  const base = Math.floor(totalTeams / entrantCount);
  const remainder = totalTeams % entrantCount;
  if (remainder === 0) return `${base} teams each`;
  return `${remainder} entrant${remainder > 1 ? "s" : ""} get ${base + 1}, the rest get ${base}`;
}
