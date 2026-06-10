import { useMemo, useState } from "react";
import type { Entrant, Game, Team } from "../types";
import { describeSplit } from "../lib/allocation";
import { DEFAULT_SCORING } from "../lib/scoring";
import { newId } from "../lib/storage";

export function Setup({
  teams,
  initial,
  onStart,
}: {
  teams: Team[];
  /** prefill when returning from the draw screen so names aren't lost */
  initial?: { name: string; names: string[] };
  onStart: (game: Game) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "Office World Cup 2026");
  const [count, setCount] = useState(initial?.names.length ?? 8);
  const [names, setNames] = useState<string[]>(
    () => initial?.names ?? Array.from({ length: 8 }, (_, i) => `Player ${i + 1}`)
  );
  const [entryFee, setEntryFee] = useState(5);
  const [currency, setCurrency] = useState("£");

  const split = useMemo(() => describeSplit(count, teams.length), [count, teams.length]);

  function setCountSafe(next: number) {
    const c = Math.max(2, Math.min(24, Math.floor(next || 0)));
    setCount(c);
    setNames((prev) => {
      const out = prev.slice(0, c);
      while (out.length < c) out.push(`Player ${out.length + 1}`);
      return out;
    });
  }

  function start() {
    const entrants: Entrant[] = names.map((n, i) => ({
      id: newId(),
      name: n.trim() || `Player ${i + 1}`,
    }));
    onStart({
      id: newId(),
      name: name.trim() || "World Cup Sweepstake",
      createdAt: new Date().toISOString(),
      entrants,
      allocations: [],
      scoring: DEFAULT_SCORING,
      drawn: false,
      captains: {},
      prize: entryFee > 0 ? { entryFee, currency } : undefined,
    });
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <header className="mb-8 text-center">
        <p className="text-sm font-bold uppercase tracking-[0.3em] text-gold">
          World Cup 2026
        </p>
        <h1 className="mt-1 text-4xl font-black tracking-tight">Sweepstake League</h1>
        <p className="mt-2 text-white/60">
          {teams.length} teams · seeded-pot draw · live league table
        </p>
      </header>

      <div className="card space-y-6 p-6">
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-widest text-white/50">
            League name
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 outline-none focus:border-gold"
          />
        </label>

        <label className="block">
          <span className="text-xs font-bold uppercase tracking-widest text-white/50">
            Number of entrants
          </span>
          <div className="mt-1 flex items-center gap-3">
            <input
              type="range"
              min={2}
              max={24}
              value={count}
              onChange={(e) => setCountSafe(Number(e.target.value))}
              className="flex-1 accent-gold"
            />
            <input
              type="number"
              min={2}
              max={24}
              value={count}
              onChange={(e) => setCountSafe(Number(e.target.value))}
              className="w-16 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-center"
            />
          </div>
          <p className="mt-2 text-sm text-gold/90">{split}</p>
        </label>

        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-white/50">
            Entrant names
          </span>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {names.map((n, i) => (
              <input
                key={i}
                value={n}
                onChange={(e) =>
                  setNames((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))
                }
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-gold"
              />
            ))}
          </div>
        </div>

        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-white/50">
            Prize pot (optional)
          </span>
          <div className="mt-1 flex items-center gap-2">
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value.slice(0, 3))}
              className="w-14 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-center"
            />
            <input
              type="number"
              min={0}
              value={entryFee}
              onChange={(e) => setEntryFee(Math.max(0, Number(e.target.value)))}
              className="w-24 rounded-lg border border-white/10 bg-black/30 px-3 py-2"
            />
            <span className="text-sm text-white/50">entry each</span>
            <span className="ml-auto text-sm font-bold text-gold">
              {entryFee > 0 ? `Pot: ${currency}${entryFee * count}` : "No pot"}
            </span>
          </div>
        </div>

        <button
          onClick={start}
          className="w-full rounded-xl bg-gold py-3 text-lg font-black uppercase tracking-wide text-black transition hover:brightness-110"
        >
          Start the draw →
        </button>
      </div>
    </div>
  );
}
