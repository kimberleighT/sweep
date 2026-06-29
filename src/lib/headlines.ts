import type {
  Allocation,
  Entrant,
  Fixture,
  ScoringConfig,
  Team,
} from "../types";

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

export function buildDailyDigest(
  fixtures: Fixture[],
  allocations: Allocation[],
  entrants: Entrant[],
  teamsByCode: Record<string, Team>,
  scoring: ScoringConfig,
  todayISO: string
): DailyDigest {
  const ownerByTeam = new Map<string, string>();
  const nameById = new Map(entrants.map((e) => [e.id, e.name]));
  for (const a of allocations)
    for (const code of a.teamCodes) ownerByTeam.set(code, a.entrantId);
  const ownerName = (code: string) => {
    const id = ownerByTeam.get(code);
    return id ? nameById.get(id) : undefined;
  };

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

  const headlines: Headline[] = [];
  if (latestDay) {
    const dayFixtures = finished.filter((f) => dayOf(f.kickoff) === latestDay);

    // biggest win of the day
    const byMargin = [...dayFixtures].sort(
      (a, b) =>
        Math.abs((b.homeScore ?? 0) - (b.awayScore ?? 0)) -
        Math.abs((a.homeScore ?? 0) - (a.awayScore ?? 0))
    );
    const big = byMargin[0];
    if (big && Math.abs((big.homeScore ?? 0) - (big.awayScore ?? 0)) >= 2) {
      // Orient the scoreline to the winner so the named team's goals come
      // first — otherwise an away win reads back-to-front ("Austria 1–3").
      const homeWon = (big.homeScore ?? 0) > (big.awayScore ?? 0);
      const winnerCode = homeWon ? big.homeCode : big.awayCode;
      const loserCode = homeWon ? big.awayCode : big.homeCode;
      const winnerGoals = homeWon ? big.homeScore : big.awayScore;
      const loserGoals = homeWon ? big.awayScore : big.homeScore;
      const w = teamsByCode[winnerCode];
      const l = teamsByCode[loserCode];
      const owner = ownerName(winnerCode);
      headlines.push({
        icon: "🔥",
        text: `${w?.name ?? winnerCode} ran riot ${winnerGoals}–${loserGoals} v ${
          l?.name ?? loserCode
        }${owner ? ` — big points for ${owner}` : ""}.`,
      });
    }

    // entrant who gained the most points on the day
    const dayPoints = new Map<string, number>();
    for (const f of dayFixtures) {
      const mp = matchPoints(f, scoring);
      for (const [code, pts] of Object.entries(mp)) {
        const id = ownerByTeam.get(code);
        if (id) dayPoints.set(id, (dayPoints.get(id) ?? 0) + pts);
      }
    }
    const topMover = [...dayPoints.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topMover && topMover[1] > 0) {
      headlines.push({
        icon: "📈",
        text: `${nameById.get(topMover[0])} was the day's big winner with +${topMover[1]} pts.`,
      });
    }

    // any team that scored 3+
    const hauls = dayFixtures
      .flatMap((f) => [
        { code: f.homeCode, goals: f.homeScore ?? 0, opp: f.awayCode },
        { code: f.awayCode, goals: f.awayScore ?? 0, opp: f.homeCode },
      ])
      .filter((x) => x.goals >= 3)
      .sort((a, b) => b.goals - a.goals);
    const haul = hauls[0];
    if (haul) {
      const owner = ownerName(haul.code);
      headlines.push({
        icon: "⚽",
        text: `${teamsByCode[haul.code]?.name ?? haul.code} stuck ${haul.goals} past ${
          teamsByCode[haul.opp]?.name ?? haul.opp
        }${owner ? ` (${owner})` : ""}.`,
      });
    }
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
