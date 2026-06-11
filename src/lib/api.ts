import type { Fixture, Stage, Team } from "../types";

/**
 * Results sync via TheSportsDB (free, CORS-enabled — works from the
 * browser with no backend). The free/test API key is "3". The World Cup
 * league id and season are configurable because TheSportsDB's exact ids
 * should be confirmed against live 2026 data; if the call returns nothing
 * the app falls back entirely to manual result entry.
 *
 * Docs: https://www.thesportsdb.com/free_sports_api
 */
export const API = {
  key: "3",
  leagueId: "4429", // FIFA World Cup (verify against live data)
  season: "2026",
};

const base = () => `https://www.thesportsdb.com/api/v1/json/${API.key}`;

/** TheSportsDB "intRound" magic numbers for knockout stages. */
function roundToStage(round: number, strStage?: string): Stage {
  const s = (strStage ?? "").toLowerCase();
  if (s.includes("final") && !s.includes("semi") && !s.includes("quarter")) return "final";
  if (s.includes("semi")) return "sf";
  if (s.includes("quarter")) return "qf";
  if (s.includes("16")) return "r16";
  if (s.includes("32")) return "r32";
  switch (round) {
    case 125:
      return "final";
    case 126:
      return "sf";
    case 127:
      return "qf";
    case 128:
      return "r16";
    case 129:
      return "r32";
    default:
      return "group";
  }
}

/** Aliases so API team names resolve to our internal codes. */
const ALIASES: Record<string, string> = {
  "united states": "USA",
  usa: "USA",
  "south korea": "KOR",
  "korea republic": "KOR",
  iran: "IRN",
  "ir iran": "IRN",
  "ivory coast": "CIV",
  "cote d'ivoire": "CIV",
  "côte d'ivoire": "CIV",
  turkey: "TUR",
  türkiye: "TUR",
  "czech republic": "CZE",
  czechia: "CZE",
};

function buildNameIndex(teams: Team[]): Map<string, string> {
  const idx = new Map<string, string>();
  for (const t of teams) {
    idx.set(t.name.toLowerCase(), t.code);
    idx.set(t.code.toLowerCase(), t.code);
  }
  for (const [name, code] of Object.entries(ALIASES)) idx.set(name, code);
  return idx;
}

function matchCode(idx: Map<string, string>, raw: string | null): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  return idx.get(key) ?? null;
}

interface SportsDbEvent {
  idEvent: string;
  strHomeTeam: string | null;
  strAwayTeam: string | null;
  intHomeScore: string | null;
  intAwayScore: string | null;
  dateEvent: string | null;
  strTime: string | null;
  intRound: string | null;
  strStage?: string | null;
  strStatus?: string | null;
}

function toFixture(ev: SportsDbEvent, idx: Map<string, string>): Fixture | null {
  const homeCode = matchCode(idx, ev.strHomeTeam);
  const awayCode = matchCode(idx, ev.strAwayTeam);
  if (!homeCode || !awayCode) return null; // unknown teams — skip, keep it clean

  const hs = ev.intHomeScore === null ? null : Number(ev.intHomeScore);
  const as = ev.intAwayScore === null ? null : Number(ev.intAwayScore);
  const finished =
    hs !== null && as !== null && !Number.isNaN(hs) && !Number.isNaN(as);

  return {
    id: `api:${ev.idEvent}`,
    stage: roundToStage(Number(ev.intRound ?? 0), ev.strStage ?? undefined),
    group: null,
    kickoff: `${ev.dateEvent ?? ""}T${ev.strTime ?? "00:00:00"}`,
    homeCode,
    awayCode,
    homeScore: finished ? hs : null,
    awayScore: finished ? as : null,
    status: finished ? "finished" : "scheduled",
  };
}

export interface SyncResult {
  fixtures: Fixture[];
  matched: number;
  skipped: number;
}

/** Pull the full season's fixtures + results and map to our shape. */
export async function fetchSeasonFixtures(teams: Team[]): Promise<SyncResult> {
  const url = `${base()}/eventsseason.php?id=${API.leagueId}&s=${API.season}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TheSportsDB ${res.status}`);
  const data = (await res.json()) as { events: SportsDbEvent[] | null };
  const events = data.events ?? [];

  const idx = buildNameIndex(teams);
  const fixtures: Fixture[] = [];
  let skipped = 0;
  for (const ev of events) {
    const f = toFixture(ev, idx);
    if (f) fixtures.push(f);
    else skipped++;
  }
  return { fixtures, matched: fixtures.length, skipped };
}

/**
 * Merge incoming fixtures into the existing set by the *match itself*, not by id
 * — the same game arrives from the bundled schedule (id `wc:N`) and the API
 * (id `api:N`), so id-based merging would duplicate it. We key on the unordered
 * team pair + stage, then:
 *  - if the match already exists, copy any incoming scores onto it (oriented to
 *    the existing home/away), unless the existing one was typed by hand (manual);
 *  - otherwise add it as a genuinely new fixture.
 */
export function mergeFixtures(existing: Fixture[], incoming: Fixture[]): Fixture[] {
  const keyOf = (f: Fixture) =>
    `${[f.homeCode, f.awayCode].slice().sort().join("|")}:${f.stage}`;
  const incByKey = new Map<string, Fixture>();
  for (const f of incoming) incByKey.set(keyOf(f), f);

  const seen = new Set<string>();
  const merged = existing.map((f) => {
    const k = keyOf(f);
    seen.add(k);
    const inc = incByKey.get(k);
    if (!inc || f.manual) return f;
    if (inc.homeScore === null || inc.awayScore === null) return f;
    const sameOrientation = f.homeCode === inc.homeCode;
    return {
      ...f,
      homeScore: sameOrientation ? inc.homeScore : inc.awayScore,
      awayScore: sameOrientation ? inc.awayScore : inc.homeScore,
      status: "finished" as const,
    };
  });
  for (const inc of incoming) {
    if (!seen.has(keyOf(inc))) merged.push(inc);
  }
  return merged.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}
