import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import confetti from "canvas-confetti";
import type { Allocation, Entrant, Game, Team } from "../types";
import { drawSeededPots, type Pick } from "../lib/allocation";
import { flagUrl, TEAMS_BY_CODE } from "../data/teams";
import { airhorn, ding, fanfare, isMuted, tick, toggleMute } from "../lib/sound";
import { PowerRanking } from "./PowerRanking";

const POT_LABEL = ["", "POT 1 · TOP SEEDS", "POT 2", "POT 3", "POT 4 · OUTSIDERS"];

function burst(big = false) {
  confetti({
    particleCount: big ? 160 : 60,
    spread: big ? 110 : 70,
    startVelocity: big ? 55 : 40,
    origin: { y: 0.4 },
    colors: ["#ffd24a", "#ffffff", "#0f5132"],
  });
}

export function Draw({
  game,
  teams,
  onComplete,
  onBack,
}: {
  game: Game;
  teams: Team[];
  onComplete: (allocations: Allocation[]) => void;
  onBack: () => void;
}) {
  // Compute the draw exactly ONCE, on mount. In league mode the parent re-fetches
  // and passes a fresh `game` object every 15s; a useMemo keyed on game.entrants
  // would re-run drawSeededPots (a new random shuffle) on each poll and make the
  // board reshuffle/flicker. The draw is a snapshot of who was in when it started.
  const [{ picks, allocations }] = useState(() => drawSeededPots(game.entrants, teams));

  const [index, setIndex] = useState(0); // picks committed to columns
  const [revealing, setRevealing] = useState<Pick | null>(null);
  const [spinCode, setSpinCode] = useState<string | null>(null); // slot-machine flag
  const [auto, setAuto] = useState(false);
  const [muted, setMuted] = useState(isMuted());
  const [present, setPresent] = useState(false);
  const busy = useRef(false);
  const timers = useRef<number[]>([]);
  const spinRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      if (spinRef.current !== null) window.clearInterval(spinRef.current);
    },
    []
  );

  const entrantById = useMemo(
    () => new Map(game.entrants.map((e) => [e.id, e])),
    [game.entrants]
  );

  const committedByEntrant = useMemo(() => {
    const m = new Map<string, string[]>(game.entrants.map((e) => [e.id, []]));
    picks.slice(0, index).forEach((p) => m.get(p.entrantId)!.push(p.teamCode));
    return m;
  }, [picks, index, game.entrants]);

  const done = index >= picks.length;

  // Once the draw is complete, hard-stop everything so nothing keeps animating.
  useEffect(() => {
    if (!done) return;
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    if (spinRef.current !== null) {
      window.clearInterval(spinRef.current);
      spinRef.current = null;
    }
    setSpinCode(null);
    setRevealing(null);
  }, [done]);

  function drawNext() {
    if (busy.current || index >= picks.length) return;
    busy.current = true;
    const pick = picks[index]!;
    const i = index;
    setRevealing(pick);

    // slot-machine: flick through random flags, then settle
    let spins = 0;
    const spin = window.setInterval(() => {
      const t = teams[Math.floor(Math.random() * teams.length)]!;
      setSpinCode(t.code);
      if (!isMuted()) tick();
      spins++;
    }, 80);
    spinRef.current = spin;

    const settle = window.setTimeout(() => {
      window.clearInterval(spin);
      spinRef.current = null;
      setSpinCode(null); // reveal the real team
      if (pick.pot === 1) {
        airhorn();
        burst();
      } else {
        ding();
      }
    }, 900);

    const commit = window.setTimeout(() => {
      setIndex((n) => n + 1);
      setRevealing(null);
      busy.current = false;
      if (i + 1 >= picks.length) {
        fanfare();
        burst(true);
      } else if (auto) {
        const next = window.setTimeout(drawNext, 350);
        timers.current.push(next);
      }
    }, 1500);

    timers.current.push(settle, commit);
  }

  function startAuto() {
    setAuto(true);
    if (!busy.current && !done) drawNext();
  }

  const revealTeam: Team | undefined = spinCode
    ? TEAMS_BY_CODE[spinCode]
    : revealing
      ? TEAMS_BY_CODE[revealing.teamCode]
      : undefined;
  const settled = !!revealing && !spinCode;
  const revealEntrant: Entrant | undefined = revealing
    ? entrantById.get(revealing.entrantId)
    : undefined;

  return (
    <div className={`mx-auto flex min-h-screen max-w-6xl flex-col p-4 ${present ? "justify-center" : ""}`}>
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (index === 0 || confirm("Discard this draw and edit entrants?")) onBack();
            }}
            title="Back to menu"
            className="rounded-lg border border-white/20 px-3 py-2 font-bold uppercase tracking-wide transition hover:bg-white/10"
          >
            ← Menu
          </button>
          {!present && (
            <div>
              <h1 className="text-2xl font-black tracking-tight">{game.name}</h1>
              <p className="text-sm text-white/50">
                {done ? "Draw complete" : `${index} / ${picks.length} teams drawn`}
              </p>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setMuted(toggleMute())}
            title={muted ? "Unmute" : "Mute"}
            className="rounded-lg border border-white/20 px-3 py-2 transition hover:bg-white/10"
          >
            {muted ? "🔇" : "🔊"}
          </button>
          <button
            onClick={() => {
              const next = !present;
              setPresent(next);
              if (next) document.documentElement.requestFullscreen?.().catch(() => {});
              else if (document.fullscreenElement) document.exitFullscreen?.();
            }}
            className="rounded-lg border border-white/20 px-3 py-2 font-bold uppercase tracking-wide transition hover:bg-white/10"
          >
            {present ? "Exit" : "📺 Present"}
          </button>
          {!done && (
            <>
              <button
                onClick={drawNext}
                className="rounded-xl bg-gold px-5 py-2 font-black uppercase tracking-wide text-black transition hover:brightness-110 disabled:opacity-40"
              >
                Draw next
              </button>
              <button
                onClick={startAuto}
                disabled={auto}
                className="rounded-xl border border-white/20 px-4 py-2 font-bold uppercase tracking-wide transition hover:bg-white/10 disabled:opacity-40"
              >
                Auto-draw all
              </button>
            </>
          )}
          {done && (
            <button
              onClick={() => onComplete(allocations)}
              className="rounded-xl bg-gold px-6 py-2 font-black uppercase tracking-wide text-black transition hover:brightness-110"
            >
              Enter the league →
            </button>
          )}
        </div>
      </header>

      {/* Stable "draw complete" banner */}
      {done && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold/40 bg-gold/15 px-4 py-3">
          <span className={`font-black text-gold ${present ? "text-3xl" : "text-lg"}`}>
            🏆 Draw complete
          </span>
          <button
            onClick={() => onComplete(allocations)}
            className="rounded-xl bg-gold px-5 py-2 font-black uppercase tracking-wide text-black transition hover:brightness-110"
          >
            Enter the league →
          </button>
        </div>
      )}

      {/* Reveal stage — static once the draw is done (no flicker, no spinning). */}
      <div className={`relative my-4 flex items-center justify-center ${present ? "h-72" : "h-44"}`}>
        {done ? (
          <div className={`text-center font-black text-gold ${present ? "text-5xl" : "text-3xl"}`}>
            🏆 All teams allocated — good luck!
          </div>
        ) : (
        <AnimatePresence mode="wait">
          {revealTeam && (
            <motion.div
              key={settled ? revealing!.teamCode : "spin"}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              className="flex flex-col items-center"
            >
              {settled && (
                <div className="mb-2 text-xs font-bold uppercase tracking-[0.3em] text-gold">
                  {POT_LABEL[revealing!.pot]}
                </div>
              )}
              <motion.img
                src={flagUrl(revealTeam, 320)}
                alt={revealTeam.name}
                animate={settled ? { rotateY: [0, 720] } : {}}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className={`rounded-md object-cover shadow-2xl ring-2 ${
                  settled ? "ring-gold/70" : "ring-white/20"
                } ${present ? "h-32 w-52" : "h-20 w-32"}`}
              />
              <div className={`mt-3 font-black ${present ? "text-5xl" : "text-2xl"}`}>
                {settled ? revealTeam.name : "…"}
              </div>
              {settled && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`text-white/70 ${present ? "text-2xl" : "text-sm"}`}
                >
                  → {revealEntrant?.name}
                </motion.div>
              )}
            </motion.div>
          )}
          {!revealTeam && (
            <motion.p key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-white/40">
              Tap “Draw next” to pull the next team from the pot…
            </motion.p>
          )}
        </AnimatePresence>
        )}
      </div>

      {/* Entrant columns (hidden in presentation mode once done, to show rankings) */}
      {!(present && done) && (
        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {game.entrants.map((e) => {
            const codes = committedByEntrant.get(e.id) ?? [];
            return (
              <div key={e.id} className="card flex flex-col p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="truncate font-bold">{e.name}</span>
                  <span className="rounded-full bg-white/10 px-2 text-xs font-bold text-white/60">
                    {codes.length}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <AnimatePresence>
                    {codes.map((code) => {
                      const t = TEAMS_BY_CODE[code];
                      if (!t) return null;
                      return (
                        <motion.div
                          key={code}
                          layout
                          initial={{ opacity: 0, x: -20, scale: 0.9 }}
                          animate={{ opacity: 1, x: 0, scale: 1 }}
                          className="flex items-center gap-2 rounded-md bg-black/20 px-2 py-1"
                        >
                          <img src={flagUrl(t, 80)} alt={t.name} className="h-4 w-6 rounded-sm object-cover" />
                          <span className="truncate text-sm">{t.name}</span>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Power ranking once the draw is complete */}
      {done && (
        <div className="mt-4">
          <PowerRanking
            game={{ ...game, allocations }}
            teamsByCode={TEAMS_BY_CODE}
          />
        </div>
      )}
    </div>
  );
}
