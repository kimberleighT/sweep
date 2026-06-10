import { useEffect, useState } from "react";
import type { BonusChallenge, Fixture } from "../types";

/** A ticking "now" that re-renders on an interval. */
export function useNow(intervalMs = 60000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Human "3d 4h" / "2h 5m" / "4m" until a target ISO, or null if past/invalid. */
export function timeUntil(targetIso: string, now: number): string | null {
  const t = Date.parse(targetIso);
  if (!Number.isFinite(t)) return null;
  let ms = t - now;
  if (ms <= 0) return null;
  const d = Math.floor(ms / 86_400_000);
  ms -= d * 86_400_000;
  const h = Math.floor(ms / 3_600_000);
  ms -= h * 3_600_000;
  const m = Math.floor(ms / 60_000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${Math.max(1, m)}m`;
}

/**
 * A small chip for the soonest upcoming thing: the next bonus lock or the next
 * kickoff, whichever is first. Fully derived from fixtures + challenges.
 */
export function NextUp({
  fixtures,
  challenges,
}: {
  fixtures: Fixture[];
  challenges: BonusChallenge[];
}) {
  const now = useNow(60_000);

  const nextKick = fixtures
    .filter((f) => f.status !== "finished")
    .map((f) => Date.parse(f.kickoff))
    .filter((t) => Number.isFinite(t) && t > now)
    .sort((a, b) => a - b)[0];

  const nextLock = challenges
    .map((c) => Date.parse(c.locksAt))
    .filter((t) => Number.isFinite(t) && t > now)
    .sort((a, b) => a - b)[0];

  let label: string | null = null;
  let target: number | null = null;
  if (nextLock !== undefined && (nextKick === undefined || nextLock <= nextKick)) {
    label = "Bonus locks";
    target = nextLock;
  } else if (nextKick !== undefined) {
    label = "Next kickoff";
    target = nextKick;
  }
  if (label === null || target === null) return null;

  const rel = timeUntil(new Date(target).toISOString(), now);
  if (!rel) return null;

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-white/60 ring-1 ring-white/10">
      ⏱ {label} in <span className="text-gold">{rel}</span>
    </span>
  );
}
