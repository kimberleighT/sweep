import { useCallback, useEffect, useState } from "react";
import type { Allocation, Fixture } from "../types";
import { TEAMS } from "../data/teams";
import { TEAMS_BY_CODE } from "../data/teams";
import { loadTeams } from "../lib/storage";
import { fetchSeasonFixtures, mergeFixtures } from "../lib/api";
import {
  createChallenge,
  deleteChallenge,
  getLeagueState,
  setAllocations,
  setCaptain,
  setChallengeAnswer,
  setMatches,
  submitPrediction,
  type LeagueState,
} from "../lib/db";
import type { LeagueSession } from "../lib/session";
import { Draw } from "./Draw";
import { Standings } from "./Standings";
import { Fixtures } from "./Fixtures";
import { LeagueBonus } from "./LeagueBonus";
import { PowerRanking } from "./PowerRanking";
import { DailyDigest } from "./DailyDigest";

type Tab = "table" | "fixtures" | "bonus" | "power";
const TAB_LABEL: Record<Tab, string> = {
  table: "League",
  fixtures: "Fixtures",
  bonus: "Bonus",
  power: "Power",
};

export function LeagueRoom({
  session,
  onLeave,
}: {
  session: LeagueSession;
  onLeave: () => void;
}) {
  const teams = loadTeams() ?? TEAMS;
  const [state, setState] = useState<LeagueState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("table");

  const refresh = useCallback(async () => {
    try {
      setState(await getLeagueState(session.joinCode, session.token));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [session.joinCode, session.token]);

  // initial load + light polling so players see each other update
  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 15000);
    return () => clearInterval(id);
  }, [refresh]);

  /** Run a mutation, surface errors, then refetch authoritative state. */
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!state) {
    return (
      <div className="mx-auto max-w-md p-10 text-center text-white/60">
        {error ? (
          <>
            <p className="mb-4 text-red-300">{error}</p>
            <button
              onClick={onLeave}
              className="rounded-lg border border-white/20 px-4 py-2 text-sm font-bold uppercase tracking-wide hover:bg-white/10"
            >
              Leave
            </button>
          </>
        ) : (
          "Loading league…"
        )}
      </div>
    );
  }

  const { game, fixtures, viewer } = state;
  const isHost = viewer.isHost;
  const pot = game.prize ? game.prize.entryFee * game.entrants.length : 0;

  // ----- pre-draw -----
  if (!game.drawn) {
    if (isHost) {
      return (
        <Draw
          game={game}
          teams={teams}
          onComplete={(allocations: Allocation[]) =>
            act(() =>
              setAllocations(
                session.token,
                allocations.map((a) => ({
                  entrantId: a.entrantId,
                  teamCodes: a.teamCodes,
                  captain: null,
                }))
              )
            )
          }
          onBack={onLeave}
        />
      );
    }
    return (
      <LeagueShell
        state={state}
        pot={pot}
        onLeave={onLeave}
        onRefresh={() => void refresh()}
      >
        <div className="card p-8 text-center">
          <p className="text-lg font-bold">Waiting for the draw…</p>
          <p className="mt-2 text-sm text-white/60">
            {game.entrants.length} player{game.entrants.length === 1 ? "" : "s"} in so
            far. The host runs the draw to hand out teams — sit tight.
          </p>
        </div>
      </LeagueShell>
    );
  }

  // ----- in play -----
  return (
    <LeagueShell state={state} pot={pot} onLeave={onLeave} onRefresh={() => void refresh()}>
      {error && (
        <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}
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
        <Standings
          game={game}
          fixtures={fixtures}
          onCaptain={
            isHost
              ? (entrantId, code) =>
                  void act(() => setCaptain(session.token, entrantId, code ?? ""))
              : undefined
          }
        />
      )}

      {tab === "fixtures" &&
        (isHost ? (
          <div className="space-y-3">
            <div className="flex justify-end">
              <button
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    const { fixtures: incoming, matched, skipped } =
                      await fetchSeasonFixtures(teams);
                    await setMatches(session.token, mergeFixtures(fixtures, incoming));
                    setMsg(
                      matched === 0
                        ? "API returned no matches — add results manually for now."
                        : `Synced ${matched} fixtures${
                            skipped ? `, skipped ${skipped} unknown` : ""
                          }.`
                    );
                  })
                }
                className="rounded-lg bg-gold px-4 py-2 text-sm font-black uppercase tracking-wide text-black transition hover:brightness-110 disabled:opacity-50"
              >
                {busy ? "Syncing…" : "Sync results"}
              </button>
            </div>
            <Fixtures
              fixtures={fixtures}
              teams={teams}
              onChange={(next) => void act(() => setMatches(session.token, next))}
            />
          </div>
        ) : (
          <ReadOnlyFixtures fixtures={fixtures} />
        ))}

      {tab === "bonus" && (
        <LeagueBonus
          game={game}
          teams={teams}
          isHost={isHost}
          viewerEntrantId={viewer.entrantId}
          onCreateChallenge={(c) => void act(() => createChallenge(session.token, c))}
          onResolveChallenge={(id, answer) =>
            void act(() => setChallengeAnswer(session.token, id, answer))
          }
          onDeleteChallenge={(id) => void act(() => deleteChallenge(session.token, id))}
          onSubmitPrediction={(id, answer, isJoker) =>
            void act(() => submitPrediction(session.token, id, answer, isJoker))
          }
        />
      )}

      {tab === "power" && <PowerRanking game={game} teamsByCode={TEAMS_BY_CODE} />}
    </LeagueShell>
  );
}

/** Header chrome shared by the waiting screen and the in-play tabs. */
function LeagueShell({
  state,
  pot,
  onLeave,
  onRefresh,
  children,
}: {
  state: LeagueState;
  pot: number;
  onLeave: () => void;
  onRefresh: () => void;
  children: React.ReactNode;
}) {
  const { game, viewer } = state;
  return (
    <div className="mx-auto max-w-3xl p-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">{game.name}</h1>
          <p className="text-xs uppercase tracking-widest text-white/40">
            Code{" "}
            <span className="font-mono tracking-[0.2em] text-gold">{state.joinCode}</span>{" "}
            · {game.entrants.length} entrants
            {viewer.isHost && <span className="text-gold"> · host</span>}
            {pot > 0 && (
              <span className="text-gold">
                {" "}
                · 💰 {game.prize!.currency}
                {pot} pot
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onRefresh}
            className="rounded-lg border border-white/20 px-3 py-2 text-sm font-bold uppercase tracking-wide hover:bg-white/10"
          >
            ↻ Refresh
          </button>
          <button
            onClick={() => {
              if (confirm("Leave this league on this device?")) onLeave();
            }}
            className="rounded-lg border border-white/20 px-3 py-2 text-sm font-bold uppercase tracking-wide hover:bg-white/10"
          >
            Leave
          </button>
        </div>
      </header>
      {children}
    </div>
  );
}

function ReadOnlyFixtures({ fixtures }: { fixtures: Fixture[] }) {
  if (fixtures.length === 0) {
    return (
      <p className="card p-6 text-center text-white/50">
        No fixtures yet — the host will sync or add results.
      </p>
    );
  }
  const played = fixtures.filter(
    (f) => f.homeScore !== null && f.awayScore !== null
  );
  return (
    <div className="overflow-hidden rounded-xl border border-white/10">
      {(played.length ? played : fixtures).map((f) => {
        const home = TEAMS_BY_CODE[f.homeCode];
        const away = TEAMS_BY_CODE[f.awayCode];
        return (
          <div
            key={f.id}
            className="flex items-center justify-between gap-2 border-t border-white/5 px-3 py-2 text-sm first:border-t-0"
          >
            <span className="flex-1 text-right">{home?.name ?? f.homeCode}</span>
            <span className="font-bold text-gold">
              {f.homeScore ?? "–"} : {f.awayScore ?? "–"}
            </span>
            <span className="flex-1">{away?.name ?? f.awayCode}</span>
          </div>
        );
      })}
    </div>
  );
}
