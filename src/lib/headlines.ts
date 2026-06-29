import type {
  Allocation,
  Entrant,
  Fixture,
  ScoringConfig,
  Team,
} from "../types";
import { buildStandings } from "./scoring.ts";

export interface OwnedFixture {
  fixture: Fixture;
  homeTeam?: Team;
  awayTeam?: Team;
  homeOwner?: string;
  awayOwner?: string;
}

export interface Headline {
  icon: string;
  text: string;
}

export interface DailyDigest {
  /** date of the most recent finished match-day, e.g. "2026-06-14" */
  date: string | null;
  headlines: Headline[];
  /** fixtures on the real-world "today", annotated with owners */
  todays: OwnedFixture[];
  /** soonest upcoming fixtures if nothing is on today */
  upcoming: OwnedFixture[];
}

const dayOf = (kickoff: string) => kickoff.slice(0, 10);

/** Points a single fixture earns each team (no progression bonuses). */
function matchPoints(f: Fixture, s: ScoringConfig): Record<string, number> {
  if (f.homeScore === null || f.awayScore === null) return {};
  let home = f.homeScore * s.perGoal;
  let away = f.awayScore * s.perGoal;
  if (f.homeScore > f.awayScore) home += s.win;
  else if (f.awayScore > f.homeScore) away += s.win;
  else {
    home += s.draw;
    away += s.draw;
  }
  return { [f.homeCode]: home, [f.awayCode]: away };
}

/** A scored, prioritised headline candidate; `matchId` keeps the feed varied. */
interface Candidate {
  icon: string;
  text: string;
  priority: number;
  matchId?: string;
}

/** Stable per-day pick (no Math.random → no flicker; rotates day to day). */
function seededIndex(seed: string, len: number): number {
  let h = 7;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return len ? h % len : 0;
}

const BANTER = [
  "🎙️ Form is temporary — a good draw is permanent.",
  "📺 VAR has entered the chat.",
  "🐐 Somebody's about to claim they 'always backed them'.",
  "🍺 A group-stage hero is one bad day from being forgotten.",
  "🎲 The bracket gods are watching.",
  "🧤 Cup runs are won by keepers and held by nerves.",
  "📈 Points don't lie. People do.",
];

export function buildDailyDigest(
  fixtures: Fixture[],
  allocations: Allocation[],
  entrants: Entrant[],
  teamsByCode: Record<string, Team>,
  scoring: ScoringConfig,
  todayISO: string,
  captains: Record<string, string> = {}
): DailyDigest {
  const ownerByTeam = new Map<string, string>();
  const nameById = new Map(entrants.map((e) => [e.id, e.name]));
  for (const a of allocations)
    for (const code of a.teamCodes) ownerByTeam.set(code, a.entrantId);
  const ownerName = (code: string) => {
    const id = ownerByTeam.get(code);
    return id ? nameById.get(id) : undefined;
  };
  const teamName = (code: string) => teamsByCode[code]?.name ?? code;
  const potOf = (code: string) => teamsByCode[code]?.pot ?? 4;

  const annotate = (f: Fixture): OwnedFixture => ({
    fixture: f,
    homeTeam: teamsByCode[f.homeCode],
    awayTeam: teamsByCode[f.awayCode],
    homeOwner: ownerName(f.homeCode),
    awayOwner: ownerName(f.awayCode),
  });

  const finished = fixtures.filter((f) => f.status === "finished");
  const sortedDays = finished.map((f) => dayOf(f.kickoff)).sort();
  const latestDay = sortedDays.length ? sortedDays[sortedDays.length - 1] ?? null : null;
  const knockoutUnderway = fixtures.some((f) => f.stage !== "group");

  const cands: Candidate[] = [];

  // ---- League-race lines: these move whenever ANY result is entered ----
  const table = buildStandings(entrants, allocations, fixtures, scoring, captains);
  const live = table.filter((r) => r.played > 0 || r.points !== 0);
  if (live.length >= 2) {
    const [first, second] = live;
    const gap = first!.points - second!.points;
    if (gap === 0) {
      cands.push({
        icon: "👑",
        priority: 100,
        text: `Deadlock at the top — ${first!.entrant.name} and ${second!.entrant.name} tied on ${first!.points} pts.`,
      });
    } else if (gap <= 2) {
      cands.push({
        icon: "👑",
        priority: 100,
        text: `${first!.entrant.name} lead by just ${gap} — ${second!.entrant.name} is breathing down their neck.`,
      });
    } else {
      cands.push({
        icon: "👑",
        priority: 95,
        text: `${first!.entrant.name} top the pile on ${first!.points} pts, ${gap} clear of ${second!.entrant.name}.`,
      });
    }
    // Wooden spoon — only worth a dig once there's a real field.
    if (live.length >= 4) {
      const last = live[live.length - 1]!;
      cands.push({
        icon: "🥄",
        priority: 32,
        text: `${last.entrant.name} prop up the table on ${last.points} — someone get them a drink.`,
      });
    }
  }

  // Survival watch — knockouts only, where being "alive" actually means something.
  if (knockoutUnderway && live.length) {
    const byAlive = [...live].sort((a, b) => b.alive - a.alive);
    const most = byAlive[0]!;
    if (most.alive > 0) {
      cands.push({
        icon: "🛡️",
        priority: 48,
        text: `${most.entrant.name} still has ${most.alive} team${most.alive === 1 ? "" : "s"} in the hunt.`,
      });
    }
    const wipedOut = live.find((r) => r.alive === 0 && r.teams.length > 0);
    if (wipedOut) {
      cands.push({
        icon: "💀",
        priority: 56,
        text: `${wipedOut.entrant.name} is out of runners — bonus points only from here.`,
      });
    }
  }

  // ---- The latest finished day's drama ----
  if (latestDay) {
    const dayFixtures = finished.filter((f) => dayOf(f.kickoff) === latestDay);

    // Biggest win of the day, oriented to the winner, with margin-tiered flavour.
    const byMargin = [...dayFixtures].sort(
      (a, b) =>
        Math.abs((b.homeScore ?? 0) - (b.awayScore ?? 0)) -
        Math.abs((a.homeScore ?? 0) - (a.awayScore ?? 0))
    );
    const big = byMargin[0];
    if (big) {
      const margin = Math.abs((big.homeScore ?? 0) - (big.awayScore ?? 0));
      if (margin >= 2) {
        const homeWon = (big.homeScore ?? 0) > (big.awayScore ?? 0);
        const winnerCode = homeWon ? big.homeCode : big.awayCode;
        const loserCode = homeWon ? big.awayCode : big.homeCode;
        const wg = homeWon ? big.homeScore : big.awayScore;
        const lg = homeWon ? big.awayScore : big.homeScore;
        const verb = margin >= 4 ? "demolished" : margin >= 3 ? "ran riot past" : "saw off";
        const owner = ownerName(winnerCode);
        cands.push({
          icon: margin >= 4 ? "💥" : "🔥",
          priority: 52 + margin * 6,
          matchId: big.id,
          text: `${teamName(winnerCode)} ${verb} ${teamName(loserCode)} ${wg}–${lg}${
            owner ? ` — big points for ${owner}` : ""
          }.`,
        });
      }
    }

    // Upset of the day — a weaker pot beating a stronger one (juicier in knockouts).
    let upset: { f: Fixture; winner: string; loser: string; diff: number } | null = null;
    for (const f of dayFixtures) {
      if (f.homeScore === null || f.awayScore === null || f.homeScore === f.awayScore)
        continue;
      const homeWon = f.homeScore > f.awayScore;
      const winner = homeWon ? f.homeCode : f.awayCode;
      const loser = homeWon ? f.awayCode : f.homeCode;
      const diff = potOf(winner) - potOf(loser); // >0 ⇒ weaker beat stronger
      if (diff > 0 && (!upset || diff > upset.diff)) upset = { f, winner, loser, diff };
    }
    if (upset) {
      const ko = upset.f.stage !== "group";
      const owner = ownerName(upset.winner);
      cands.push({
        icon: "😱",
        priority: 60 + upset.diff * 8 + (ko ? 10 : 0),
        matchId: upset.f.id,
        text: ko
          ? `Giant-killing! ${teamName(upset.winner)} dumped ${teamName(upset.loser)} OUT${owner ? ` (${owner})` : ""}.`
          : `Upset! ${teamName(upset.winner)} stunned ${teamName(upset.loser)}${owner ? ` — ${owner} cashing in` : ""}.`,
      });
    }

    // Knockout eliminations of a heavyweight (pot 1–2) — gut-punch headlines.
    for (const f of dayFixtures) {
      if (f.stage === "group") continue;
      if (f.homeScore === null || f.awayScore === null || f.homeScore === f.awayScore)
        continue;
      const loser = f.homeScore > f.awayScore ? f.awayCode : f.homeCode;
      if (potOf(loser) <= 2) {
        const owner = ownerName(loser);
        cands.push({
          icon: "💔",
          priority: 68,
          matchId: f.id,
          text: `${teamName(loser)} are OUT${owner ? ` — gut-punch for ${owner}` : ""}.`,
        });
      }
    }

    // Goal hauls — 3 is a treat, 4+ is a statement.
    const hauls = dayFixtures
      .flatMap((f) => [
        { id: f.id, code: f.homeCode, goals: f.homeScore ?? 0, opp: f.awayCode },
        { id: f.id, code: f.awayCode, goals: f.awayScore ?? 0, opp: f.homeCode },
      ])
      .filter((x) => x.goals >= 3)
      .sort((a, b) => b.goals - a.goals);
    const haul = hauls[0];
    if (haul) {
      const owner = ownerName(haul.code);
      cands.push({
        icon: haul.goals >= 4 ? "🎩" : "⚽",
        priority: haul.goals >= 4 ? 64 : 50,
        matchId: haul.id,
        text: `${teamName(haul.code)} ${haul.goals >= 4 ? "put" : "stuck"} ${haul.goals} past ${teamName(haul.opp)}${owner ? ` (${owner})` : ""}.`,
      });
    }

    // Goal-fest — the day's most entertaining scoreline.
    const byGoals = [...dayFixtures].sort(
      (a, b) =>
        (b.homeScore ?? 0) + (b.awayScore ?? 0) - ((a.homeScore ?? 0) + (a.awayScore ?? 0))
    );
    const fest = byGoals[0];
    if (fest && (fest.homeScore ?? 0) + (fest.awayScore ?? 0) >= 5) {
      cands.push({
        icon: "🎆",
        priority: 54,
        matchId: fest.id,
        text: `Goal-fest: ${teamName(fest.homeCode)} ${fest.homeScore}–${fest.awayScore} ${teamName(fest.awayCode)} (${(fest.homeScore ?? 0) + (fest.awayScore ?? 0)} goals!).`,
      });
    }

    // Entrant who cleaned up on the day.
    const dayPoints = new Map<string, number>();
    for (const f of dayFixtures) {
      for (const [code, pts] of Object.entries(matchPoints(f, scoring))) {
        const id = ownerByTeam.get(code);
        if (id) dayPoints.set(id, (dayPoints.get(id) ?? 0) + pts);
      }
    }
    const topMover = [...dayPoints.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topMover && topMover[1] > 0) {
      cands.push({
        icon: "📈",
        priority: 58,
        text: `${nameById.get(topMover[0])} cleaned up with +${topMover[1]} pts on the day.`,
      });
    }
  }

  // Always leave one cheeky line in the mix (rotates by day, never random).
  cands.push({
    icon: "🎙️",
    priority: 16,
    text: BANTER[seededIndex(latestDay ?? "kickoff", BANTER.length)]!,
  });

  // Pick the most interesting ~5, keeping the feed varied across matches.
  const headlines: Headline[] = [];
  const usedMatch = new Set<string>();
  for (const c of cands.sort((a, b) => b.priority - a.priority)) {
    if (headlines.length >= 5) break;
    if (c.matchId) {
      if (usedMatch.has(c.matchId)) continue;
      usedMatch.add(c.matchId);
    }
    headlines.push({ icon: c.icon, text: c.text });
  }

  const todays = fixtures
    .filter((f) => dayOf(f.kickoff) === todayISO)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
    .map(annotate);

  const upcoming = todays.length
    ? []
    : fixtures
        .filter((f) => f.status !== "finished" && f.kickoff.slice(0, 10) >= todayISO)
        .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
        .slice(0, 6)
        .map(annotate);

  return { date: latestDay, headlines, todays, upcoming };
}
