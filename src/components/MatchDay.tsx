import { useMemo, useState } from "react";
import type { Fixture, Game, PredictPick, PredictRound } from "../types";
import { flagUrl, TEAMS_BY_CODE } from "../data/teams";

const STATUS_STYLE = {
  open: "bg-emerald-500/15 text-emerald-300",
  locked: "bg-amber-500/15 text-amber-300",
} as const;

const fmtDay = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
};

const isLocked = (round: PredictRound) => Date.now() >= Date.parse(round.locksAt);

const pad = (n: number) => String(n).padStart(2, "0");
const toLocalInput = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
/** A sensible future default lock: the game day at 14:00, or 2h from now if that's past. */
const futureLockFor = (date: string) => {
  if (!date) return "";
  const at14 = new Date(`${date}T14:00`);
  return toLocalInput(at14.getTime() > Date.now() ? at14 : new Date(Date.now() + 2 * 3600 * 1000));
};

/** Points a finished pick earned (or null if its game isn't finished yet). */
function pickPoints(pick: PredictPick, round: PredictRound, fixtures: Fixture[]): number | null {
  const m = fixtures.find((f) => f.id === pick.matchId);
  if (!m || m.status !== "finished" || m.homeScore === null || m.awayScore === null) return null;
  if (pick.homeScore === null || pick.awayScore === null) return 0;
  const sign = (a: number, b: number) => (a > b ? 1 : a < b ? -1 : 0);
  if (pick.homeScore === m.homeScore && pick.awayScore === m.awayScore) return round.pointsScore;
  return sign(pick.homeScore, pick.awayScore) === sign(m.homeScore, m.awayScore)
    ? round.pointsResult
    : 0;
}

function TeamRow({ code }: { code: string }) {
  const t = TEAMS_BY_CODE[code];
  return (
    <span className="inline-flex items-center gap-1.5">
      {t && <img src={flagUrl(t, 80)} className="h-3.5 w-5 rounded-sm object-cover" />}
      <span>{t?.name ?? code}</span>
    </span>
  );
}

export function MatchDay({
  game,
  fixtures,
  isHost,
  viewerEntrantId,
  predictRounds,
  predictPicks,
  onCreate,
  onDelete,
  onAssign,
  onSubmit,
}: {
  game: Game;
  fixtures: Fixture[];
  isHost: boolean;
  viewerEntrantId: string | null;
  predictRounds: PredictRound[];
  predictPicks: PredictPick[];
  onCreate: (input: {
    gameDate: string;
    locksAt: string;
    pointsResult: number;
    pointsScore: number;
  }) => void;
  onDelete: (roundId: string) => void;
  onAssign: (roundId: string) => void;
  onSubmit: (roundId: string, homeScore: number, awayScore: number) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const fixtureDates = useMemo(
    () => [...new Set(fixtures.map((f) => f.kickoff.slice(0, 10)).filter(Boolean))].sort(),
    [fixtures]
  );
  const rounds = useMemo(
    () => [...predictRounds].sort((a, b) => a.gameDate.localeCompare(b.gameDate)),
    [predictRounds]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-widest text-white/50">
          Match Day predictions
        </h2>
        {isHost && !adding && (
          <button
            onClick={() => setAdding(true)}
            disabled={fixtureDates.length === 0}
            className="rounded-lg bg-gold px-3 py-1.5 text-sm font-black uppercase tracking-wide text-black transition hover:brightness-110 disabled:opacity-40"
          >
            + Add Match Day
          </button>
        )}
      </div>

      {isHost && adding && (
        <NewMatchDay
          dates={fixtureDates}
          onCreate={(i) => {
            onCreate(i);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {rounds.length === 0 && !adding && (
        <p className="rounded-xl border border-white/10 bg-black/20 px-3 py-6 text-center text-sm text-white/40">
          No Match Days yet.
          {isHost
            ? " Pick a game day — each player gets a random game to call the score (3 pts result, 6 pts exact)."
            : " The host hasn't added one yet."}
        </p>
      )}

      {rounds.map((r) => (
        <RoundCard
          key={r.id}
          round={r}
          game={game}
          fixtures={fixtures}
          isHost={isHost}
          viewerEntrantId={viewerEntrantId}
          picks={predictPicks.filter((p) => p.roundId === r.id)}
          onDelete={() => onDelete(r.id)}
          onAssign={() => onAssign(r.id)}
          onSubmit={(h, a) => onSubmit(r.id, h, a)}
        />
      ))}
    </div>
  );
}

function NewMatchDay({
  dates,
  onCreate,
  onCancel,
}: {
  dates: string[];
  onCreate: (i: { gameDate: string; locksAt: string; pointsResult: number; pointsScore: number }) => void;
  onCancel: () => void;
}) {
  const [gameDate, setGameDate] = useState(dates[0] ?? "");
  const [locksAt, setLocksAt] = useState(futureLockFor(dates[0] ?? ""));
  const [pointsResult, setPointsResult] = useState(3);
  const [pointsScore, setPointsScore] = useState(6);

  function pickDate(d: string) {
    setGameDate(d);
    setLocksAt(futureLockFor(d));
  }

  return (
    <div className="space-y-3 rounded-2xl border border-gold/30 bg-black/30 p-4">
      <h3 className="text-sm font-bold uppercase tracking-widest text-gold">New Match Day</h3>
      <div className="flex flex-wrap gap-4">
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wider text-white/40">Game day</span>
          <select
            value={gameDate}
            onChange={(e) => pickDate(e.target.value)}
            className="rounded-md border border-white/15 bg-black/30 px-2 py-2 text-sm outline-none focus:border-gold"
          >
            {dates.map((d) => (
              <option key={d} value={d}>
                {fmtDay(`${d}T00:00:00`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wider text-white/40">Locks at</span>
          <input
            type="datetime-local"
            value={locksAt}
            onChange={(e) => setLocksAt(e.target.value)}
            className="rounded-md border border-white/15 bg-black/30 px-2 py-2 text-sm outline-none focus:border-gold"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wider text-white/40">Result pts</span>
          <input
            type="number"
            min={0}
            value={pointsResult}
            onChange={(e) => setPointsResult(Math.max(0, Number(e.target.value) || 0))}
            className="w-16 rounded-md border border-white/15 bg-black/30 px-2 py-2 text-sm outline-none focus:border-gold"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wider text-white/40">Exact pts</span>
          <input
            type="number"
            min={0}
            value={pointsScore}
            onChange={(e) => setPointsScore(Math.max(0, Number(e.target.value) || 0))}
            className="w-16 rounded-md border border-white/15 bg-black/30 px-2 py-2 text-sm outline-none focus:border-gold"
          />
        </label>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => gameDate && locksAt && onCreate({ gameDate, locksAt: new Date(locksAt).toISOString(), pointsResult, pointsScore })}
          disabled={!gameDate || !locksAt}
          className="rounded-lg bg-gold px-4 py-2 text-sm font-black uppercase tracking-wide text-black transition hover:brightness-110 disabled:opacity-40"
        >
          Add Match Day
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-white/20 px-3 py-2 text-sm font-bold uppercase tracking-wide hover:bg-white/10"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function RoundCard({
  round,
  game,
  fixtures,
  isHost,
  viewerEntrantId,
  picks,
  onDelete,
  onAssign,
  onSubmit,
}: {
  round: PredictRound;
  game: Game;
  fixtures: Fixture[];
  isHost: boolean;
  viewerEntrantId: string | null;
  picks: PredictPick[];
  onDelete: () => void;
  onAssign: () => void;
  onSubmit: (homeScore: number, awayScore: number) => Promise<void>;
}) {
  const locked = isLocked(round);
  const own = viewerEntrantId
    ? picks.find((p) => p.entrantId === viewerEntrantId)
    : undefined;
  const ownMatch = own ? fixtures.find((f) => f.id === own.matchId) : undefined;
  const [h, setH] = useState(own?.homeScore?.toString() ?? "");
  const [a, setA] = useState(own?.awayScore?.toString() ?? "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const nameById = (id: string) => game.entrants.find((e) => e.id === id)?.name ?? "—";

  async function handleSave() {
    if (h === "" || a === "") return;
    setSaveState("saving");
    setSaveErr(null);
    try {
      await onSubmit(Number(h), Number(a));
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch (e) {
      setSaveState("error");
      setSaveErr((e as Error).message);
    }
  }

  const lockLabel = new Date(round.locksAt).toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-pitch">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <span>
          <span className="block font-bold">🎲 Match Day · {fmtDay(`${round.gameDate}T00:00:00`)}</span>
          <span className="block text-xs uppercase tracking-wider text-white/40">
            {round.pointsResult} pts result · {round.pointsScore} pts exact · locks {lockLabel}
          </span>
        </span>
        <span className={`rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${STATUS_STYLE[locked ? "locked" : "open"]}`}>
          {locked ? "locked" : "open"}
        </span>
      </div>

      <div className="space-y-3 border-t border-white/10 px-4 py-3">
        {/* the viewer's own assigned game */}
        {viewerEntrantId && !own && !locked && (
          <button
            onClick={onAssign}
            className="w-full rounded-xl bg-gold py-3 font-black uppercase tracking-wide text-black transition hover:brightness-110"
          >
            🎲 Reveal my game
          </button>
        )}
        {viewerEntrantId && !own && locked && (
          <p className="text-sm text-white/40">You didn't get a game for this Match Day.</p>
        )}

        {own && ownMatch && (
          <div className="space-y-2 rounded-xl bg-black/20 p-3">
            <span className="text-xs uppercase tracking-wider text-white/40">Your game</span>
            <div className="flex items-center justify-center gap-3 text-sm font-semibold">
              <TeamRow code={ownMatch.homeCode} />
              <span className="text-white/30">v</span>
              <TeamRow code={ownMatch.awayCode} />
            </div>
            {!locked ? (
              <>
                <div className="flex items-center justify-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={h}
                    onChange={(e) => {
                      setH(e.target.value);
                      setSaveState("idle");
                    }}
                    className="w-14 rounded-md border border-white/15 bg-black/30 px-2 py-1 text-center text-sm outline-none focus:border-gold"
                  />
                  <span className="text-white/30">–</span>
                  <input
                    type="number"
                    min={0}
                    value={a}
                    onChange={(e) => {
                      setA(e.target.value);
                      setSaveState("idle");
                    }}
                    className="w-14 rounded-md border border-white/15 bg-black/30 px-2 py-1 text-center text-sm outline-none focus:border-gold"
                  />
                  <button
                    onClick={() => void handleSave()}
                    disabled={h === "" || a === "" || saveState === "saving"}
                    className={`rounded-md px-3 py-1 text-xs font-black uppercase tracking-wide text-black transition disabled:opacity-30 ${
                      saveState === "saved"
                        ? "bg-emerald-500"
                        : "bg-gold hover:brightness-110"
                    }`}
                  >
                    {saveState === "saving"
                      ? "Saving…"
                      : saveState === "saved"
                        ? "Saved ✓"
                        : "Save"}
                  </button>
                </div>
                {saveErr && (
                  <p className="text-center text-xs text-red-300">{saveErr}</p>
                )}
              </>
            ) : (
              <p className="text-center text-sm text-white/70">
                Your call: <span className="font-bold">{own.homeScore ?? "–"}–{own.awayScore ?? "–"}</span>
              </p>
            )}
          </div>
        )}

        {/* everyone's picks once locked */}
        {locked && (
          <table className="w-full text-sm">
            <tbody>
              {picks.map((p) => {
                const m = fixtures.find((f) => f.id === p.matchId);
                const pts = pickPoints(p, round, fixtures);
                return (
                  <tr key={p.entrantId} className="border-t border-white/5">
                    <td className="py-1.5 pr-2 font-semibold">{nameById(p.entrantId)}</td>
                    <td className="py-1.5 pr-2 text-white/60">
                      {m ? `${TEAMS_BY_CODE[m.homeCode]?.name ?? m.homeCode} v ${TEAMS_BY_CODE[m.awayCode]?.name ?? m.awayCode}` : "—"}
                    </td>
                    <td className="py-1.5 pr-2 text-white/80">
                      {p.homeScore ?? "–"}–{p.awayScore ?? "–"}
                    </td>
                    <td className="w-10 py-1.5 text-right">
                      {pts !== null &&
                        (pts > 0 ? (
                          <span className="font-black text-emerald-400">+{pts}</span>
                        ) : (
                          <span className="text-white/30">0</span>
                        ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {!locked && (
          <p className="text-xs text-white/40">
            Everyone gets a random game; picks stay secret until kickoff.
          </p>
        )}

        {isHost && (
          <button
            onClick={() => {
              if (confirm("Delete this Match Day and its predictions?")) onDelete();
            }}
            className="text-xs font-bold uppercase tracking-wide text-red-400/70 hover:text-red-400"
          >
            Delete Match Day
          </button>
        )}
      </div>
    </div>
  );
}
