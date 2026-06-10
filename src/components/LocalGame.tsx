import { useEffect, useState } from "react";
import type { Allocation, Fixture, Game } from "../types";
import { TEAMS } from "../data/teams";
import {
  clearGame,
  loadFixtures,
  loadGame,
  loadTeams,
  saveFixtures,
  saveGame,
} from "../lib/storage";
import { Setup } from "./Setup";
import { Draw } from "./Draw";
import { Dashboard } from "./Dashboard";

/**
 * Quick-play mode: the original single-device, localStorage-backed flow,
 * unchanged. Lives in its own component so its state/effects only mount when
 * quick play is actually in use (and never run during league mode).
 */
export function LocalGame({ onSwitchMode }: { onSwitchMode: () => void }) {
  const [game, setGame] = useState<Game | null>(() => loadGame());
  const [fixtures, setFixtures] = useState<Fixture[]>(() => loadFixtures() ?? []);
  // prefill for Setup when stepping back from an uncommitted draw
  const [prefill, setPrefill] = useState<{ name: string; names: string[] } | null>(null);
  // host-edited team list overrides the bundled default when present
  const teams = loadTeams() ?? TEAMS;

  useEffect(() => {
    if (game) saveGame(game);
  }, [game]);

  useEffect(() => {
    saveFixtures(fixtures);
  }, [fixtures]);

  function startGame(g: Game) {
    setPrefill(null);
    setGame(g);
  }

  function backToSetup() {
    if (game) setPrefill({ name: game.name, names: game.entrants.map((e) => e.name) });
    clearGame();
    setGame(null);
  }

  function completeDraw(allocations: Allocation[]) {
    setGame((g) => (g ? { ...g, allocations, drawn: true } : g));
  }

  function reset() {
    clearGame();
    setGame(null);
    setFixtures([]);
  }

  if (!game)
    return (
      <div>
        <div className="mx-auto max-w-2xl px-6 pt-4">
          <button
            onClick={onSwitchMode}
            className="text-sm font-bold uppercase tracking-wide text-white/50 hover:text-white"
          >
            Play in a league instead →
          </button>
        </div>
        <Setup teams={teams} initial={prefill ?? undefined} onStart={startGame} />
      </div>
    );
  if (!game.drawn)
    return (
      <Draw game={game} teams={teams} onComplete={completeDraw} onBack={backToSetup} />
    );
  return (
    <Dashboard
      game={game}
      teams={teams}
      fixtures={fixtures}
      onFixtures={setFixtures}
      onGame={setGame}
      onReset={reset}
    />
  );
}
