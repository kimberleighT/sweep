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
