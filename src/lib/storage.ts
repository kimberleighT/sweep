import type { Fixture, Game, Team } from "../types";

const GAME_KEY = "wcs:game";
const TEAMS_KEY = "wcs:teams";
const FIXTURES_KEY = "wcs:fixtures";

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode — non-fatal */
  }
}

export const loadGame = () => read<Game>(GAME_KEY);
export const saveGame = (g: Game) => write(GAME_KEY, g);
export const clearGame = () => {
  localStorage.removeItem(GAME_KEY);
  localStorage.removeItem(FIXTURES_KEY);
};

/** Host's edited team list (overrides the bundled default when present). */
export const loadTeams = () => read<Team[]>(TEAMS_KEY);
export const saveTeams = (t: Team[]) => write(TEAMS_KEY, t);

export const loadFixtures = () => read<Fixture[]>(FIXTURES_KEY);
export const saveFixtures = (f: Fixture[]) => write(FIXTURES_KEY, f);

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}
