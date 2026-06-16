import { useCallback, useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import type { Allocation } from "../types";
import { TEAMS, TEAMS_BY_CODE } from "../data/teams";
import { buildScheduleFixtures } from "../data/worldcup2026";
import { loadTeams } from "../lib/storage";
import { buildStandings, mergePoints, scoreMatchDay } from "../lib/scoring";
import { scoreBonus } from "../lib/challenges";
import { fetchSeasonFixtures, mergeFixtures } from "../lib/api";
import {
  assignMatchday,
  createChallenge,
  createPredictRound,
  deleteChallenge,
  deleteLeague,
  deletePredictRound,
  getActivity,
  getLeagueState,
  setAllocations,
  setCaptain,
  setMatches,
  submitPredict,
  submitPrediction,
  subscribeLeague,
  type ActivityItem,
  type LeagueState,
} from "../lib/db";
import type { LeagueSession } from "../lib/session";
import { Draw } from "./Draw";
import { Standings } from "./Standings";
import { Fixtures } from "./Fixtures";
import { LeagueBonus } from "./LeagueBonus";
import { MatchDay } from "./MatchDay";
import { PowerRanking } from "./PowerRanking";
import { DailyDigest } from "./DailyDigest";
import { NextUp } from "./Countdown";

type Tab = "table" | "fixtures" | "bonus" | "matchday" | "power";
const TAB_LABEL: Record<Tab, string> = {
  table: "League",
  fixtures: "Fixtures",
  bonus: "Bonus",
  matchday: "Match Day",
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
  const [drawing, setDrawing] = useState(false);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  // Pause polling while the host is drawing so a refetch can't churn the draw.
  const drawingRef = useRef(false);
  drawingRef.current = drawing;

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
    // Realtime is primary; poll is a slow fallback.
    const id = setInterval(() => {
      if (!drawingRef.current) void refresh();
    }, 60000);
    return () => clearInterval(id);
  }, [refresh]);

  // Activity feed: load history, then live-update via Realtime Broadcast.
  useEffect(() => {
    let active = true;
    getActivity(session.joinCode)
      .then((a) => {
        if (active) setActivity(a);
      })
      .catch(() => {});
    const unsub = subscribeLeague(session.joinCode, (p) => {
      setActivity((prev) =>
        [
          { id: prev.length ? prev[0]!.id + 1 : 1, kind: p.kind, text: p.text, created_at: new Date().toISOString() },
          ...prev,
        ].slice(0, 30)
      );
      void refresh();
    });
    return () => {
      active = false;
      unsub();
    };
  }, [session.joinCode, refresh]);

  // Celebrate when the viewer takes top spot (computed from the live standings).
  const celebratedLeader = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!state) return;
    const g = state.game;
    const pts = mergePoints(
      scoreBonus(g.challenges ?? [], g.predictions ?? [], state.fixtures),
      scoreMatchDay(state.predictRounds, state.predictPicks, state.fixtures)
    );
    const rows = buildStandings(
      g.entrants,
      g.allocations,
      state.fixtures,
      g.scoring,
      g.captains ?? {},
      pts
    );
    const leaderId = rows[0]?.entrant.id ?? null;
    if (
      celebratedLeader.current !== undefined &&
      leaderId &&
      leaderId === state.viewer.entrantId &&
      celebratedLeader.current !== leaderId
    ) {
      confetti({
        particleCount: 140,
        spread: 90,
        origin: { y: 0.3 },
        colors: ["#ffd24a", "#ffffff", "#0f5132"],
      });
      setMsg("🏆 You're top of the table!");
    }
    celebratedLeader.current = leaderId;
  }, [state]);

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

  // Host-only: wipe the league for everyone, with a clear warning first.
  function resetLeague() {
    const ok = confirm(
      "⚠️ Reset the WHOLE league?\n\n" +
        "This permanently deletes it for EVERYONE — all players, teams, " +
        "predictions and results. This cannot be undone."
    );
    if (!ok) return;
    void deleteLeague(session.token)
      .then(() => onLeave())
      .catch((e) => setError((e as Error).message));
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
    // Host runs the animated draw — needs at least themselves (never 0 → no crash).
    if (isHost && drawing && game.entrants.length >= 1) {
      return (
        <Draw
          game={game}
          teams={teams}
          onComplete={(allocations: Allocation[]) => {
            setDrawing(false); // resume polling once the draw is committed
            void act(() =>
              setAllocations(
                session.token,
                allocations.map((a) => ({
                  entrantId: a.entrantId,
                  teamCodes: a.teamCodes,
                  captain: null,
                }))
              )
            );
          }}
          onBack={() => setDrawing(false)}
        />
      );
    }

    if (isHost) {
      return (
        <LeagueShell state={state} pot={pot} activity={activity} onReset={viewer.isHost ? resetLeague : undefined} onLeave={onLeave} onRefresh={() => void refresh()}>
          <div className="card space-y-4 p-6">
            <p className="text-sm text-white/70">
              Share code{" "}
              <span className="font-mono text-lg tracking-[0.3em] text-gold">
                {state.joinCode}
              </span>{" "}
              — players join on their own phones with a name + PIN. Run the draw once
              everyone's in.
            </p>

            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-white/50">
                Players in ({game.entrants.length})
              </span>
              {game.entrants.length === 0 ? (
                <p className="mt-2 text-sm text-white/40">
                  No players yet — waiting for the first to join…
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {game.entrants.map((e) => (
                    <span
                      key={e.id}
                      className="rounded-lg bg-white/5 px-3 py-1 text-sm font-semibold ring-1 ring-white/10"
                    >
                      {e.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <button
              disabled={game.entrants.length < 1}
              onClick={() => setDrawing(true)}
              className="w-full rounded-xl bg-gold py-3 font-black uppercase tracking-wide text-black transition hover:brightness-110 disabled:opacity-40"
            >
              Run the draw →
            </button>
            {game.entrants.length < 2 && (
              <p className="text-xs text-white/40">
                Just you so far — share the code to add players (the list refreshes
                automatically), or run the draw solo to try it out.
              </p>
            )}
          </div>
        </LeagueShell>
      );
    }

    return (
      <LeagueShell state={state} pot={pot} activity={activity} onReset={viewer.isHost ? resetLeague : undefined} onLeave={onLeave} onRefresh={() => void refresh()}>
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
    <LeagueShell state={state} pot={pot} activity={activity} onReset={viewer.isHost ? resetLeague : undefined} onLeave={onLeave} onRefresh={() => void refresh()}>
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
        {(["table", "fixtures", "bonus", "matchday", "power"] as Tab[]).map((t) => (
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
          predictRounds={state.predictRounds}
          predictPicks={state.predictPicks}
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
            <div className="flex flex-wrap justify-end gap-2">
              <button
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    // base = clean schedule, overlay current scores: seeds the
                    // 72 fixtures, preserves results, and de-dupes any old rows.
                    await setMatches(
                      session.token,
                      mergeFixtures(buildScheduleFixtures(), fixtures)
                    );
                    setMsg("Loaded the full 2026 group-stage schedule.");
                  })
                }
                className="rounded-lg bg-gold px-4 py-2 text-sm font-black uppercase tracking-wide text-black transition hover:brightness-110 disabled:opacity-50"
              >
                {busy ? "Loading…" : "Load 2026 schedule"}
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    const { fixtures: incoming, matched, skipped } =
                      await fetchSeasonFixtures(teams);
                    await setMatches(session.token, mergeFixtures(fixtures, incoming));
                    setMsg(
                      matched === 0
                        ? "API returned no matches — use the 2026 schedule or add manually."
                        : `Synced ${matched} live results${
                            skipped ? `, skipped ${skipped} unknown` : ""
                          }.`
                    );
                  })
                }
                className="rounded-lg border border-white/20 px-4 py-2 text-sm font-bold uppercase tracking-wide transition hover:bg-white/10 disabled:opacity-50"
              >
                Sync live results
              </button>
            </div>
            <Fixtures
              fixtures={fixtures}
              teams={teams}
              onChange={(next) => void act(() => setMatches(session.token, next))}
            />
          </div>
        ) : (
          <Fixtures fixtures={fixtures} teams={teams} onChange={() => {}} readOnly />
        ))}

      {tab === "bonus" && (
        <LeagueBonus
          game={game}
          teams={teams}
          fixtures={fixtures}
          isHost={isHost}
          viewerEntrantId={viewer.entrantId}
          onCreateChallenge={(c) => void act(() => createChallenge(session.token, c))}
          onDeleteChallenge={(id) => void act(() => deleteChallenge(session.token, id))}
          onSubmitPrediction={(id, answer, isJoker) =>
            void act(() => submitPrediction(session.token, id, answer, isJoker))
          }
        />
      )}

      {tab === "matchday" && (
        <MatchDay
          game={game}
          fixtures={fixtures}
          isHost={isHost}
          viewerEntrantId={viewer.entrantId}
          predictRounds={state.predictRounds}
          predictPicks={state.predictPicks}
          onCreate={(i) => void act(() => createPredictRound(session.token, i))}
          onDelete={(id) => void act(() => deletePredictRound(session.token, id))}
          onAssign={(id) => void act(() => assignMatchday(session.token, id))}
          onSubmit={(id, h, a) =>
            // Return the promise so the card can show Saving…/Saved ✓/error
            // inline; refetch authoritative state on success.
            submitPredict(session.token, id, h, a).then(() => {
              void refresh();
            })
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
  activity,
  onReset,
  onLeave,
  onRefresh,
  children,
}: {
  state: LeagueState;
  pot: number;
  activity: ActivityItem[];
  /** Provided only for the host — resets (deletes) the whole league. */
  onReset?: () => void;
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
          <div className="mt-2">
            <NextUp fixtures={state.fixtures} challenges={game.challenges ?? []} />
          </div>
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
          {onReset && (
            <button
              onClick={onReset}
              title="Host only — permanently deletes the league for everyone"
              className="rounded-lg border border-red-500/40 px-3 py-2 text-sm font-bold uppercase tracking-wide text-red-300 transition hover:bg-red-500/10"
            >
              Reset
            </button>
          )}
        </div>
      </header>

      {activity.length > 0 && (
        <div className="mb-4 rounded-2xl border border-white/10 bg-black/20 p-3">
          <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-gold/70">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            Live feed
          </h3>
          <ul className="space-y-1">
            {activity.slice(0, 5).map((a) => (
              <li key={a.id} className="flex items-center gap-2 text-sm text-white/70">
                <span className="text-gold">•</span>
                <span className="flex-1">{a.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {children}
    </div>
  );
}
