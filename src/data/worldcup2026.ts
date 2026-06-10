import type { Fixture, Stage, Team } from "../types";

/**
 * Official 2026 FIFA World Cup line-up + schedule (final draw, 5 Dec 2025;
 * playoff places resolved Mar 2026). Sourced from Wikipedia / ESPN and used to
 * seed a league's fixtures and render the full calendar.
 *
 * Kickoff times are intentionally omitted — published sources gave US-Eastern
 * broadcast times, not venue-local kickoffs, so we show dates only.
 */
export type GroupLetter =
  | "A" | "B" | "C" | "D" | "E" | "F"
  | "G" | "H" | "I" | "J" | "K" | "L";

export interface WCTeam extends Team {
  group: GroupLetter;
}

export const WC2026_TEAMS: WCTeam[] = [
  { code: "MEX", name: "Mexico", flag: "mx", pot: 1, group: "A" },
  { code: "RSA", name: "South Africa", flag: "za", pot: 3, group: "A" },
  { code: "KOR", name: "South Korea", flag: "kr", pot: 2, group: "A" },
  { code: "CZE", name: "Czech Republic", flag: "cz", pot: 4, group: "A" },
  { code: "CAN", name: "Canada", flag: "ca", pot: 1, group: "B" },
  { code: "BIH", name: "Bosnia and Herzegovina", flag: "ba", pot: 4, group: "B" },
  { code: "QAT", name: "Qatar", flag: "qa", pot: 3, group: "B" },
  { code: "SUI", name: "Switzerland", flag: "ch", pot: 2, group: "B" },
  { code: "BRA", name: "Brazil", flag: "br", pot: 1, group: "C" },
  { code: "MAR", name: "Morocco", flag: "ma", pot: 2, group: "C" },
  { code: "HAI", name: "Haiti", flag: "ht", pot: 4, group: "C" },
  { code: "SCO", name: "Scotland", flag: "gb-sct", pot: 3, group: "C" },
  { code: "USA", name: "United States", flag: "us", pot: 1, group: "D" },
  { code: "PAR", name: "Paraguay", flag: "py", pot: 3, group: "D" },
  { code: "AUS", name: "Australia", flag: "au", pot: 2, group: "D" },
  { code: "TUR", name: "Turkey", flag: "tr", pot: 4, group: "D" },
  { code: "GER", name: "Germany", flag: "de", pot: 1, group: "E" },
  { code: "CUW", name: "Curacao", flag: "cw", pot: 4, group: "E" },
  { code: "CIV", name: "Ivory Coast", flag: "ci", pot: 3, group: "E" },
  { code: "ECU", name: "Ecuador", flag: "ec", pot: 2, group: "E" },
  { code: "NED", name: "Netherlands", flag: "nl", pot: 1, group: "F" },
  { code: "JPN", name: "Japan", flag: "jp", pot: 2, group: "F" },
  { code: "SWE", name: "Sweden", flag: "se", pot: 4, group: "F" },
  { code: "TUN", name: "Tunisia", flag: "tn", pot: 3, group: "F" },
  { code: "BEL", name: "Belgium", flag: "be", pot: 1, group: "G" },
  { code: "EGY", name: "Egypt", flag: "eg", pot: 3, group: "G" },
  { code: "IRN", name: "Iran", flag: "ir", pot: 2, group: "G" },
  { code: "NZL", name: "New Zealand", flag: "nz", pot: 4, group: "G" },
  { code: "ESP", name: "Spain", flag: "es", pot: 1, group: "H" },
  { code: "CPV", name: "Cape Verde", flag: "cv", pot: 4, group: "H" },
  { code: "KSA", name: "Saudi Arabia", flag: "sa", pot: 3, group: "H" },
  { code: "URU", name: "Uruguay", flag: "uy", pot: 2, group: "H" },
  { code: "FRA", name: "France", flag: "fr", pot: 1, group: "I" },
  { code: "SEN", name: "Senegal", flag: "sn", pot: 2, group: "I" },
  { code: "IRQ", name: "Iraq", flag: "iq", pot: 4, group: "I" },
  { code: "NOR", name: "Norway", flag: "no", pot: 3, group: "I" },
  { code: "ARG", name: "Argentina", flag: "ar", pot: 1, group: "J" },
  { code: "ALG", name: "Algeria", flag: "dz", pot: 3, group: "J" },
  { code: "AUT", name: "Austria", flag: "at", pot: 2, group: "J" },
  { code: "JOR", name: "Jordan", flag: "jo", pot: 4, group: "J" },
  { code: "POR", name: "Portugal", flag: "pt", pot: 1, group: "K" },
  { code: "COD", name: "DR Congo", flag: "cd", pot: 4, group: "K" },
  { code: "UZB", name: "Uzbekistan", flag: "uz", pot: 2, group: "K" },
  { code: "COL", name: "Colombia", flag: "co", pot: 3, group: "K" },
  { code: "ENG", name: "England", flag: "gb-eng", pot: 1, group: "L" },
  { code: "CRO", name: "Croatia", flag: "hr", pot: 3, group: "L" },
  { code: "GHA", name: "Ghana", flag: "gh", pot: 2, group: "L" },
  { code: "PAN", name: "Panama", flag: "pa", pot: 4, group: "L" },
];

export const GROUP_LETTERS: GroupLetter[] = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L",
];

/** Team codes in each group, in standings-display order. */
export const GROUPS: Record<GroupLetter, string[]> = GROUP_LETTERS.reduce(
  (acc, g) => {
    acc[g] = WC2026_TEAMS.filter((t) => t.group === g).map((t) => t.code);
    return acc;
  },
  {} as Record<GroupLetter, string[]>
);

interface RawGroupMatch {
  match: number;
  date: string;
  group: GroupLetter;
  home: string;
  away: string;
  city: string;
}

const GROUP_MATCHES: RawGroupMatch[] = [
  { match: 1, date: "2026-06-11", group: "A", home: "MEX", away: "RSA", city: "Mexico City" },
  { match: 2, date: "2026-06-11", group: "A", home: "KOR", away: "CZE", city: "Guadalajara" },
  { match: 5, date: "2026-06-12", group: "B", home: "CAN", away: "BIH", city: "Toronto" },
  { match: 13, date: "2026-06-12", group: "D", home: "USA", away: "PAR", city: "Inglewood" },
  { match: 6, date: "2026-06-13", group: "B", home: "QAT", away: "SUI", city: "Santa Clara" },
  { match: 9, date: "2026-06-13", group: "C", home: "BRA", away: "MAR", city: "East Rutherford" },
  { match: 10, date: "2026-06-13", group: "C", home: "HAI", away: "SCO", city: "Foxborough" },
  { match: 14, date: "2026-06-13", group: "D", home: "AUS", away: "TUR", city: "Vancouver" },
  { match: 17, date: "2026-06-14", group: "E", home: "GER", away: "CUW", city: "Houston" },
  { match: 18, date: "2026-06-14", group: "E", home: "CIV", away: "ECU", city: "Philadelphia" },
  { match: 21, date: "2026-06-14", group: "F", home: "NED", away: "JPN", city: "Arlington" },
  { match: 22, date: "2026-06-14", group: "F", home: "SWE", away: "TUN", city: "Guadalajara" },
  { match: 25, date: "2026-06-15", group: "G", home: "BEL", away: "EGY", city: "Seattle" },
  { match: 26, date: "2026-06-15", group: "G", home: "IRN", away: "NZL", city: "Inglewood" },
  { match: 29, date: "2026-06-15", group: "H", home: "ESP", away: "CPV", city: "Atlanta" },
  { match: 30, date: "2026-06-15", group: "H", home: "KSA", away: "URU", city: "Miami Gardens" },
  { match: 33, date: "2026-06-16", group: "I", home: "FRA", away: "SEN", city: "East Rutherford" },
  { match: 34, date: "2026-06-16", group: "I", home: "IRQ", away: "NOR", city: "Foxborough" },
  { match: 37, date: "2026-06-16", group: "J", home: "ARG", away: "ALG", city: "Kansas City" },
  { match: 38, date: "2026-06-17", group: "J", home: "AUT", away: "JOR", city: "Santa Clara" },
  { match: 41, date: "2026-06-17", group: "K", home: "POR", away: "COD", city: "Houston" },
  { match: 42, date: "2026-06-17", group: "K", home: "UZB", away: "COL", city: "Mexico City" },
  { match: 45, date: "2026-06-17", group: "L", home: "ENG", away: "CRO", city: "Arlington" },
  { match: 46, date: "2026-06-17", group: "L", home: "GHA", away: "PAN", city: "Toronto" },
  { match: 3, date: "2026-06-18", group: "A", home: "CZE", away: "RSA", city: "Atlanta" },
  { match: 4, date: "2026-06-18", group: "A", home: "MEX", away: "KOR", city: "Guadalajara" },
  { match: 7, date: "2026-06-18", group: "B", home: "SUI", away: "BIH", city: "Inglewood" },
  { match: 8, date: "2026-06-18", group: "B", home: "CAN", away: "QAT", city: "Vancouver" },
  { match: 11, date: "2026-06-19", group: "C", home: "SCO", away: "MAR", city: "Foxborough" },
  { match: 12, date: "2026-06-19", group: "C", home: "BRA", away: "HAI", city: "Philadelphia" },
  { match: 15, date: "2026-06-19", group: "D", home: "USA", away: "AUS", city: "Seattle" },
  { match: 16, date: "2026-06-19", group: "D", home: "TUR", away: "PAR", city: "Santa Clara" },
  { match: 19, date: "2026-06-20", group: "E", home: "GER", away: "CIV", city: "Toronto" },
  { match: 20, date: "2026-06-20", group: "E", home: "ECU", away: "CUW", city: "Kansas City" },
  { match: 23, date: "2026-06-20", group: "F", home: "NED", away: "SWE", city: "Houston" },
  { match: 24, date: "2026-06-20", group: "F", home: "TUN", away: "JPN", city: "Guadalajara" },
  { match: 27, date: "2026-06-21", group: "G", home: "BEL", away: "IRN", city: "Inglewood" },
  { match: 28, date: "2026-06-21", group: "G", home: "NZL", away: "EGY", city: "Vancouver" },
  { match: 31, date: "2026-06-21", group: "H", home: "ESP", away: "KSA", city: "Atlanta" },
  { match: 32, date: "2026-06-21", group: "H", home: "URU", away: "CPV", city: "Miami Gardens" },
  { match: 35, date: "2026-06-22", group: "I", home: "FRA", away: "IRQ", city: "Philadelphia" },
  { match: 36, date: "2026-06-22", group: "I", home: "NOR", away: "SEN", city: "East Rutherford" },
  { match: 39, date: "2026-06-22", group: "J", home: "ARG", away: "AUT", city: "Arlington" },
  { match: 40, date: "2026-06-22", group: "J", home: "JOR", away: "ALG", city: "Santa Clara" },
  { match: 43, date: "2026-06-23", group: "K", home: "POR", away: "UZB", city: "Houston" },
  { match: 44, date: "2026-06-23", group: "K", home: "COL", away: "COD", city: "Guadalajara" },
  { match: 47, date: "2026-06-23", group: "L", home: "ENG", away: "GHA", city: "Foxborough" },
  { match: 48, date: "2026-06-23", group: "L", home: "PAN", away: "CRO", city: "Toronto" },
  { match: 53, date: "2026-06-24", group: "A", home: "CZE", away: "MEX", city: "Mexico City" },
  { match: 54, date: "2026-06-24", group: "A", home: "RSA", away: "KOR", city: "Guadalajara" },
  { match: 49, date: "2026-06-24", group: "B", home: "SUI", away: "CAN", city: "Vancouver" },
  { match: 50, date: "2026-06-24", group: "B", home: "BIH", away: "QAT", city: "Seattle" },
  { match: 51, date: "2026-06-24", group: "C", home: "SCO", away: "BRA", city: "Miami Gardens" },
  { match: 52, date: "2026-06-24", group: "C", home: "MAR", away: "HAI", city: "Atlanta" },
  { match: 59, date: "2026-06-25", group: "D", home: "TUR", away: "USA", city: "Inglewood" },
  { match: 60, date: "2026-06-25", group: "D", home: "PAR", away: "AUS", city: "Santa Clara" },
  { match: 55, date: "2026-06-25", group: "E", home: "ECU", away: "GER", city: "East Rutherford" },
  { match: 56, date: "2026-06-25", group: "E", home: "CUW", away: "CIV", city: "Philadelphia" },
  { match: 57, date: "2026-06-25", group: "F", home: "JPN", away: "SWE", city: "Arlington" },
  { match: 58, date: "2026-06-25", group: "F", home: "TUN", away: "NED", city: "Kansas City" },
  { match: 65, date: "2026-06-26", group: "G", home: "EGY", away: "IRN", city: "Seattle" },
  { match: 66, date: "2026-06-26", group: "G", home: "NZL", away: "BEL", city: "Vancouver" },
  { match: 63, date: "2026-06-26", group: "H", home: "URU", away: "ESP", city: "Guadalajara" },
  { match: 64, date: "2026-06-26", group: "H", home: "CPV", away: "KSA", city: "Houston" },
  { match: 61, date: "2026-06-26", group: "I", home: "NOR", away: "FRA", city: "Foxborough" },
  { match: 62, date: "2026-06-26", group: "I", home: "SEN", away: "IRQ", city: "Toronto" },
  { match: 71, date: "2026-06-27", group: "J", home: "ALG", away: "AUT", city: "Kansas City" },
  { match: 72, date: "2026-06-27", group: "J", home: "JOR", away: "ARG", city: "Arlington" },
  { match: 69, date: "2026-06-27", group: "K", home: "COL", away: "POR", city: "Miami Gardens" },
  { match: 70, date: "2026-06-27", group: "K", home: "COD", away: "UZB", city: "Atlanta" },
  { match: 67, date: "2026-06-27", group: "L", home: "PAN", away: "ENG", city: "East Rutherford" },
  { match: 68, date: "2026-06-27", group: "L", home: "CRO", away: "GHA", city: "Philadelphia" },
];

export interface KnockoutMatch {
  match: number;
  date: string;
  stage: Exclude<Stage, "group">;
  home: string; // bracket placeholder, e.g. "Winner Group A"
  away: string;
  city: string;
}

export const KNOCKOUT_SCHEDULE: KnockoutMatch[] = [
  { match: 73, date: "2026-06-28", stage: "r32", home: "Runner-up Group A", away: "Runner-up Group B", city: "Inglewood" },
  { match: 74, date: "2026-06-29", stage: "r32", home: "Winner Group E", away: "3rd A/B/C/D/F", city: "Foxborough" },
  { match: 75, date: "2026-06-29", stage: "r32", home: "Winner Group F", away: "Runner-up Group C", city: "Guadalajara" },
  { match: 76, date: "2026-06-29", stage: "r32", home: "Winner Group C", away: "Runner-up Group F", city: "Houston" },
  { match: 77, date: "2026-06-30", stage: "r32", home: "Winner Group I", away: "3rd C/D/F/G/H", city: "East Rutherford" },
  { match: 78, date: "2026-06-30", stage: "r32", home: "Runner-up Group E", away: "Runner-up Group I", city: "Arlington" },
  { match: 79, date: "2026-06-30", stage: "r32", home: "Winner Group A", away: "3rd C/E/F/H/I", city: "Mexico City" },
  { match: 80, date: "2026-07-01", stage: "r32", home: "Winner Group L", away: "3rd E/H/I/J/K", city: "Atlanta" },
  { match: 81, date: "2026-07-01", stage: "r32", home: "Winner Group D", away: "3rd B/E/F/I/J", city: "Santa Clara" },
  { match: 82, date: "2026-07-01", stage: "r32", home: "Winner Group G", away: "3rd A/E/H/I/J", city: "Seattle" },
  { match: 83, date: "2026-07-02", stage: "r32", home: "Runner-up Group K", away: "Runner-up Group L", city: "Toronto" },
  { match: 84, date: "2026-07-02", stage: "r32", home: "Winner Group H", away: "Runner-up Group J", city: "Inglewood" },
  { match: 85, date: "2026-07-02", stage: "r32", home: "Winner Group B", away: "3rd E/F/G/I/J", city: "Vancouver" },
  { match: 86, date: "2026-07-03", stage: "r32", home: "Winner Group J", away: "Runner-up Group H", city: "Miami Gardens" },
  { match: 87, date: "2026-07-03", stage: "r32", home: "Winner Group K", away: "3rd D/E/I/J/L", city: "Kansas City" },
  { match: 88, date: "2026-07-03", stage: "r32", home: "Runner-up Group D", away: "Runner-up Group G", city: "Arlington" },
  { match: 89, date: "2026-07-04", stage: "r16", home: "Winner Match 74", away: "Winner Match 77", city: "Philadelphia" },
  { match: 90, date: "2026-07-04", stage: "r16", home: "Winner Match 73", away: "Winner Match 75", city: "Houston" },
  { match: 91, date: "2026-07-05", stage: "r16", home: "Winner Match 76", away: "Winner Match 78", city: "East Rutherford" },
  { match: 92, date: "2026-07-05", stage: "r16", home: "Winner Match 79", away: "Winner Match 80", city: "Mexico City" },
  { match: 93, date: "2026-07-06", stage: "r16", home: "Winner Match 83", away: "Winner Match 84", city: "Arlington" },
  { match: 94, date: "2026-07-06", stage: "r16", home: "Winner Match 81", away: "Winner Match 82", city: "Seattle" },
  { match: 95, date: "2026-07-07", stage: "r16", home: "Winner Match 86", away: "Winner Match 88", city: "Atlanta" },
  { match: 96, date: "2026-07-07", stage: "r16", home: "Winner Match 85", away: "Winner Match 87", city: "Vancouver" },
  { match: 97, date: "2026-07-09", stage: "qf", home: "Winner Match 89", away: "Winner Match 90", city: "Foxborough" },
  { match: 98, date: "2026-07-10", stage: "qf", home: "Winner Match 93", away: "Winner Match 94", city: "Inglewood" },
  { match: 99, date: "2026-07-11", stage: "qf", home: "Winner Match 91", away: "Winner Match 92", city: "Miami Gardens" },
  { match: 100, date: "2026-07-11", stage: "qf", home: "Winner Match 95", away: "Winner Match 96", city: "Kansas City" },
  { match: 101, date: "2026-07-14", stage: "sf", home: "Winner Match 97", away: "Winner Match 98", city: "Arlington" },
  { match: 102, date: "2026-07-15", stage: "sf", home: "Winner Match 99", away: "Winner Match 100", city: "Atlanta" },
  { match: 103, date: "2026-07-18", stage: "final", home: "Loser Match 101", away: "Loser Match 102", city: "Miami Gardens" },
  { match: 104, date: "2026-07-19", stage: "final", home: "Winner Match 101", away: "Winner Match 102", city: "East Rutherford" },
];

/**
 * The 72 group-stage matches as app Fixtures (concrete teams), ready to seed a
 * league. Knockout matches are omitted — their teams are TBD until standings
 * settle, so the host adds them as they're known (the calendar still shows the
 * knockout schedule from KNOCKOUT_SCHEDULE).
 */
export function buildScheduleFixtures(): Fixture[] {
  return GROUP_MATCHES.map((m) => ({
    id: `wc:${m.match}`,
    stage: "group" as Stage,
    group: m.group,
    kickoff: `${m.date}T00:00:00`,
    homeCode: m.home,
    awayCode: m.away,
    homeScore: null,
    awayScore: null,
    status: "scheduled" as const,
  }));
}
