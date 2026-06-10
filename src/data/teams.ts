import type { Team } from "../types";
import { WC2026_TEAMS } from "./worldcup2026.ts";

/**
 * 48-team field for the 2026 World Cup, derived from the official line-up in
 * worldcup2026.ts (the single source of truth for teams, groups + schedule).
 * Still editable by the host on the setup screen before the draw.
 *
 * `flag` is an ISO 3166-1 alpha-2 code (or gb-eng / gb-sct) used to build a
 * flagcdn.com image URL. See flagUrl() below.
 */
export const TEAMS: Team[] = WC2026_TEAMS.map(({ group: _group, ...t }) => t);

export function flagUrl(team: Team, width: 80 | 160 | 320 = 160): string {
  return `https://flagcdn.com/w${width}/${team.flag}.png`;
}

export const TEAMS_BY_CODE: Record<string, Team> = Object.fromEntries(
  TEAMS.map((t) => [t.code, t])
);
