/**
 * League-mode session: the opaque bearer token minted by create/join/login,
 * plus who we are. Kept in localStorage, keyed separately from the quick-play
 * `wcs:*` state so the two modes never tread on each other.
 */
export interface LeagueSession {
  joinCode: string;
  token: string;
  /** null for a host-only session (the host isn't necessarily a player). */
  entrantId: string | null;
  isHost: boolean;
}

const KEY = "wcs:league-session";
const LAST_KEY = "wcs:last-league";

export function loadSession(): LeagueSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LeagueSession) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: LeagueSession): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* quota / private mode — non-fatal */
  }
}

export function clearSession(): void {
  localStorage.removeItem(KEY);
}

/**
 * A breadcrumb so a logged-out player can get back in: the league they last
 * played and the name they used. Kept separately from the session and
 * deliberately NOT cleared on Leave — only the bearer token is secret, this
 * is just a convenience hint (no PIN, no token) so we can pre-fill the code
 * and offer their name from the roster instead of making them retype it
 * (which is how duplicate entrants get created).
 */
export interface LastLeague {
  joinCode: string;
  displayName: string | null;
}

export function loadLastLeague(): LastLeague | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    return raw ? (JSON.parse(raw) as LastLeague) : null;
  } catch {
    return null;
  }
}

export function saveLastLeague(l: LastLeague): void {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(l));
  } catch {
    /* quota / private mode — non-fatal */
  }
}

export function clearLastLeague(): void {
  localStorage.removeItem(LAST_KEY);
}
