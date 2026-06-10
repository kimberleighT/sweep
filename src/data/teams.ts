import type { Team } from "../types";

/**
 * 48-team field for the 2026 World Cup, grouped into 4 seeding pots
 * (pot 1 = strongest). This is a best-effort default and is fully
 * EDITABLE by the host on the setup screen before the draw — swap any
 * team or move it between pots to match the final, official line-up.
 *
 * `flag` is an ISO 3166-1 alpha-2 code (or gb-eng / gb-wls) used to
 * build a flagcdn.com image URL. See flagUrl() below.
 */
export const TEAMS: Team[] = [
  // Pot 1 — hosts + top seeds
  { code: "USA", name: "United States", flag: "us", pot: 1 },
  { code: "MEX", name: "Mexico", flag: "mx", pot: 1 },
  { code: "CAN", name: "Canada", flag: "ca", pot: 1 },
  { code: "ARG", name: "Argentina", flag: "ar", pot: 1 },
  { code: "FRA", name: "France", flag: "fr", pot: 1 },
  { code: "ESP", name: "Spain", flag: "es", pot: 1 },
  { code: "ENG", name: "England", flag: "gb-eng", pot: 1 },
  { code: "BRA", name: "Brazil", flag: "br", pot: 1 },
  { code: "POR", name: "Portugal", flag: "pt", pot: 1 },
  { code: "NED", name: "Netherlands", flag: "nl", pot: 1 },
  { code: "BEL", name: "Belgium", flag: "be", pot: 1 },
  { code: "GER", name: "Germany", flag: "de", pot: 1 },

  // Pot 2
  { code: "CRO", name: "Croatia", flag: "hr", pot: 2 },
  { code: "ITA", name: "Italy", flag: "it", pot: 2 },
  { code: "MAR", name: "Morocco", flag: "ma", pot: 2 },
  { code: "COL", name: "Colombia", flag: "co", pot: 2 },
  { code: "URU", name: "Uruguay", flag: "uy", pot: 2 },
  { code: "SUI", name: "Switzerland", flag: "ch", pot: 2 },
  { code: "JPN", name: "Japan", flag: "jp", pot: 2 },
  { code: "SEN", name: "Senegal", flag: "sn", pot: 2 },
  { code: "DEN", name: "Denmark", flag: "dk", pot: 2 },
  { code: "KOR", name: "South Korea", flag: "kr", pot: 2 },
  { code: "AUT", name: "Austria", flag: "at", pot: 2 },
  { code: "ECU", name: "Ecuador", flag: "ec", pot: 2 },

  // Pot 3
  { code: "UKR", name: "Ukraine", flag: "ua", pot: 3 },
  { code: "AUS", name: "Australia", flag: "au", pot: 3 },
  { code: "SRB", name: "Serbia", flag: "rs", pot: 3 },
  { code: "EGY", name: "Egypt", flag: "eg", pot: 3 },
  { code: "ALG", name: "Algeria", flag: "dz", pot: 3 },
  { code: "POL", name: "Poland", flag: "pl", pot: 3 },
  { code: "WAL", name: "Wales", flag: "gb-wls", pot: 3 },
  { code: "HUN", name: "Hungary", flag: "hu", pot: 3 },
  { code: "NOR", name: "Norway", flag: "no", pot: 3 },
  { code: "TUR", name: "Türkiye", flag: "tr", pot: 3 },
  { code: "NGA", name: "Nigeria", flag: "ng", pot: 3 },
  { code: "SWE", name: "Sweden", flag: "se", pot: 3 },

  // Pot 4 — outsiders
  { code: "QAT", name: "Qatar", flag: "qa", pot: 4 },
  { code: "KSA", name: "Saudi Arabia", flag: "sa", pot: 4 },
  { code: "GHA", name: "Ghana", flag: "gh", pot: 4 },
  { code: "CIV", name: "Côte d'Ivoire", flag: "ci", pot: 4 },
  { code: "TUN", name: "Tunisia", flag: "tn", pot: 4 },
  { code: "CRC", name: "Costa Rica", flag: "cr", pot: 4 },
  { code: "JAM", name: "Jamaica", flag: "jm", pot: 4 },
  { code: "PAN", name: "Panama", flag: "pa", pot: 4 },
  { code: "NZL", name: "New Zealand", flag: "nz", pot: 4 },
  { code: "UZB", name: "Uzbekistan", flag: "uz", pot: 4 },
  { code: "JOR", name: "Jordan", flag: "jo", pot: 4 },
  { code: "CPV", name: "Cape Verde", flag: "cv", pot: 4 },
];

export function flagUrl(team: Team, width: 80 | 160 | 320 = 160): string {
  return `https://flagcdn.com/w${width}/${team.flag}.png`;
}

export const TEAMS_BY_CODE: Record<string, Team> = Object.fromEntries(
  TEAMS.map((t) => [t.code, t])
);
