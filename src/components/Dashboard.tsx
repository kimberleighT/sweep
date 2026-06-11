import { useState } from "react";
import type { BonusChallenge, Fixture, Game, Prediction, Team } from "../types";
import { Standings } from "./Standings";
import { Fixtures } from "./Fixtures";
import { Bonus } from "./Bonus";
import { DailyDigest } from "./DailyDigest";
import { PowerRanking } from "./PowerRanking";
import { fetchSeasonFixtures, mergeFixtures } from "../lib/api";
import { TEAMS_BY_CODE } from "../data/teams";
import { buildScheduleFixtures } from "../data/worldcup2026";
import { NextUp } from "./Countdown";

type Tab = "table" | "fixtures" | "bonus" | "power";

const TAB_LABEL: Record<Tab, string> = {
  table: "League",
  fixtures: "Fixtures",
  bonus: "Bonus",
  power: "Power",
};

export function Dashboard({
  game,
  teams,
  fixtures,
  onFixtures,
  onGame,
  onReset,
}: {
  game: Game;
  teams: Team[];
  fixtures: Fixture[];
  onFixtures: (f: Fixture[]) => void;
  onGame: (g: Game) => void;
  onReset: () => void;
}) {
  const [tab, setTab] = useState<Tab>("table");
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const pot = game.prize ? game.prize.entryFee * game.entrants.length : 0;

  function setCaptain(entrantId: string, code: string | null) {
    const captains = { ...(game.captains ?? {}) };
    if (code) captains[entrantId] = code;
    else delete captains[entrantId];
    onGame({ ...game, captains });
  }

  const setChallenges = (challenges: BonusChallenge[]) =>
    onGame({ ...game, challenges });
  const setPredictions = (predictions: Prediction[]) =>
    onGame({ ...game, predictions });

  async function sync() {
    setSyncing(true);
    setMsg(null);
    try {
      const { fixtures: incoming, matched, skipped } = await fetchSeasonFixtures(teams);
      onFixtures(mergeFixtures(fixtures, incoming));
      setMsg(
        matched === 0
          ? "API returned no matches — add results manually for now."
          : `Synced ${matched} fixtures${skipped ? `, skipped ${skipped} unknown` : ""}.`
      );
    } catch (e) {
      setMsg(`Sync failed: ${(e as Error).message}. Use manual entry.`);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">{game.name}</h1>
          <p className="text-xs uppercase tracking-widest text-white/40">
            {game.entrants.length} entrants · {teams.length} teams
            {pot > 0 && (
              <span className="text-gold">
                {" "}
                · 💰 {game.prize!.currency}
                {pot} pot
              </span>
            )}
          </p>
          <div className="mt-2">
            <NextUp fixtures={fixtures} challenges={game.challenges ?? []} />
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              onFixtures(mergeFixtures(buildScheduleFixtures(), fixtures));
              setMsg("Loaded the full 2026 group-stage schedule.");
            }}
            className="rounded-lg bg-gold px-4 py-2 text-sm font-black uppercase tracking-wide text-black transition hover:brightness-110"
          >
            Load 2026 schedule
          </button>
          <button
            onClick={sync}
            disabled={syncing}
            className="rounded-lg bg-gold px-4 py-2 text-sm font-black uppercase tracking-wide text-black transition hover:brightness-110 disabled:opacity-50"
          >
            {syncing ? "Syncing…" : "Sync results"}
          </button>
          <button
            onClick={() => {
              if (confirm("Reset everything and start a new sweepstake?")) onReset();
            }}
            className="rounded-lg border border-white/20 px-3 py-2 text-sm font-bold uppercase tracking-wide hover:bg-white/10"
          >
            Reset
          </button>
        </div>
      </header>

      {msg && (
        <p className="mb-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/70">
          {msg}
        </p>
      )}

      <DailyDigest game={game} fixtures={fixtures} />

      <div className="mb-4 inline-flex rounded-xl border border-white/10 bg-black/20 p-1">
        {(["table", "fixtures", "bonus", "power"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-1.5 text-sm font-bold uppercase tracking-wide transition ${
              tab === t ? "bg-gold text-black" : "text-white/60 hover:text-white"
            }`}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {tab === "table" && (
        <Standings game={game} fixtures={fixtures} onCaptain={setCaptain} />
      )}
      {tab === "fixtures" && (
        <Fixtures fixtures={fixtures} teams={teams} onChange={onFixtures} />
      )}
      {tab === "bonus" && (
        <Bonus
          game={game}
          teams={teams}
          fixtures={fixtures}
          onChallenges={setChallenges}
          onPredictions={setPredictions}
        />
      )}
      {tab === "power" && <PowerRanking game={game} teamsByCode={TEAMS_BY_CODE} />}
    </div>
  );
}
