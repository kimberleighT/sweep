import { useEffect, useState } from "react";
import { DEFAULT_SCORING } from "../lib/scoring";
import {
  createLeague,
  getLeagueState,
  hostLogin,
  joinLeague,
  type AuthResult,
} from "../lib/db";
import { clearLastLeague, type LastLeague } from "../lib/session";

type LobbyTab = "join" | "create" | "host";

const inputCls =
  "mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 outline-none focus:border-gold";
const labelCls = "text-xs font-bold uppercase tracking-widest text-white/50";

export function LeagueLobby({
  lastLeague,
  onAuthed,
  onBack,
}: {
  lastLeague: LastLeague | null;
  onAuthed: (r: AuthResult) => void;
  onBack: () => void;
}) {
  // A returning player lands on "Welcome back" first; "join as new / different
  // league" drops them into the normal tabbed lobby.
  const [showWelcome, setShowWelcome] = useState(Boolean(lastLeague));

  if (showWelcome && lastLeague) {
    return (
      <WelcomeBack
        lastLeague={lastLeague}
        onAuthed={onAuthed}
        onUseLobby={() => setShowWelcome(false)}
        onBack={onBack}
      />
    );
  }

  return <Lobby onAuthed={onAuthed} onBack={onBack} />;
}

/**
 * Re-entry for a logged-out player: pull the league roster (public — no token)
 * so they tap the exact name they used, then enter their PIN. Tapping an
 * existing name + correct PIN resumes that entrant rather than creating a new
 * one, which is the whole point — free-typing a slightly different name is how
 * duplicate entrants happen.
 */
function WelcomeBack({
  lastLeague,
  onAuthed,
  onUseLobby,
  onBack,
}: {
  lastLeague: LastLeague;
  onAuthed: (r: AuthResult) => void;
  onUseLobby: () => void;
  onBack: () => void;
}) {
  const [leagueName, setLeagueName] = useState<string | null>(null);
  const [names, setNames] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<string | null>(lastLeague.displayName);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getLeagueState(lastLeague.joinCode)
      .then((s) => {
        if (!active) return;
        setLeagueName(s.game.name);
        setNames(s.game.entrants.map((e) => e.name));
      })
      .catch(() => {
        // League gone (reset/deleted) or code no longer valid — drop the stale
        // breadcrumb and fall back to the normal lobby.
        if (!active) return;
        clearLastLeague();
        onUseLobby();
      });
    return () => {
      active = false;
    };
  }, [lastLeague.joinCode, onUseLobby]);

  async function logBackIn() {
    if (!selected || !pin) return;
    setBusy(true);
    setError(null);
    try {
      onAuthed(await joinLeague(lastLeague.joinCode, selected, pin));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md p-6">
      <button
        onClick={onBack}
        className="mb-4 text-sm font-bold uppercase tracking-wide text-white/50 hover:text-white"
      >
        ← Back
      </button>

      <header className="mb-6 text-center">
        <p className="text-sm font-bold uppercase tracking-[0.3em] text-gold">
          Welcome back
        </p>
        <h1 className="mt-1 text-3xl font-black tracking-tight">
          {leagueName ?? "Your league"}
        </h1>
        <p className="mt-2 text-sm text-white/60">
          Code{" "}
          <span className="font-mono tracking-[0.2em] text-gold">
            {lastLeague.joinCode}
          </span>{" "}
          · tap your name and pop in your PIN.
        </p>
      </header>

      <div className="card space-y-4 p-6">
        {names === null ? (
          <p className="text-center text-sm text-white/50">Loading players…</p>
        ) : names.length === 0 ? (
          <p className="text-center text-sm text-white/50">
            No players in this league yet.
          </p>
        ) : (
          <div>
            <span className={labelCls}>Your name</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {names.map((n) => (
                <button
                  key={n}
                  onClick={() => setSelected(n)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 transition ${
                    selected === n
                      ? "bg-gold text-black ring-gold"
                      : "bg-white/5 text-white/80 ring-white/10 hover:ring-white/30"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="block">
          <span className={labelCls}>Your PIN</span>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            type="password"
            inputMode="numeric"
            placeholder="the PIN you joined with"
            className={inputCls}
          />
        </label>

        <button
          disabled={busy || !selected || !pin}
          onClick={() => void logBackIn()}
          className="w-full rounded-xl bg-gold py-3 font-black uppercase tracking-wide text-black transition hover:brightness-110 disabled:opacity-40"
        >
          {busy ? "…" : "Log back in →"}
        </button>

        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <button
          onClick={onUseLobby}
          className="w-full text-center text-xs font-bold uppercase tracking-wide text-white/40 hover:text-white"
        >
          Join as a new player / different league
        </button>
      </div>
    </div>
  );
}

function Lobby({
  onAuthed,
  onBack,
}: {
  onAuthed: (r: AuthResult) => void;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<LobbyTab>("join");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // shared / per-tab fields
  const [joinCode, setJoinCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pin, setPin] = useState("");
  const [leagueName, setLeagueName] = useState("Office World Cup 2026");
  const [hostName, setHostName] = useState("");
  const [hostPin, setHostPin] = useState("");
  const [entryFee, setEntryFee] = useState(5);
  const [currency, setCurrency] = useState("£");

  async function run(fn: () => Promise<AuthResult>) {
    setBusy(true);
    setError(null);
    try {
      onAuthed(await fn());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md p-6">
      <button
        onClick={onBack}
        className="mb-4 text-sm font-bold uppercase tracking-wide text-white/50 hover:text-white"
      >
        ← Back
      </button>

      <header className="mb-6 text-center">
        <p className="text-sm font-bold uppercase tracking-[0.3em] text-gold">
          World Cup 2026
        </p>
        <h1 className="mt-1 text-3xl font-black tracking-tight">League play</h1>
        <p className="mt-2 text-sm text-white/60">
          Everyone plays on their own phone. Your PIN keeps your picks yours.
        </p>
      </header>

      <div className="mb-4 inline-flex w-full rounded-xl border border-white/10 bg-black/20 p-1">
        {(["join", "create", "host"] as LobbyTab[]).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              setError(null);
            }}
            className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-bold uppercase tracking-wide transition ${
              tab === t ? "bg-gold text-black" : "text-white/60 hover:text-white"
            }`}
          >
            {t === "join" ? "Join" : t === "create" ? "Create" : "Host login"}
          </button>
        ))}
      </div>

      <div className="card space-y-4 p-6">
        {tab === "join" && (
          <>
            <label className="block">
              <span className={labelCls}>League code</span>
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                className={`${inputCls} font-mono tracking-[0.3em]`}
              />
            </label>
            <label className="block">
              <span className={labelCls}>Your name</span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className={labelCls}>Your PIN</span>
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                type="password"
                inputMode="numeric"
                placeholder="choose a PIN"
                className={inputCls}
              />
            </label>
            <p className="text-xs text-white/40">
              First time joining picks your PIN. Use the same name + PIN to get back
              in from any device.
            </p>
            <button
              disabled={busy || !joinCode || !displayName || !pin}
              onClick={() => run(() => joinLeague(joinCode, displayName, pin))}
              className="w-full rounded-xl bg-gold py-3 font-black uppercase tracking-wide text-black transition hover:brightness-110 disabled:opacity-40"
            >
              {busy ? "…" : "Join league →"}
            </button>
          </>
        )}

        {tab === "create" && (
          <>
            <label className="block">
              <span className={labelCls}>League name</span>
              <input
                value={leagueName}
                onChange={(e) => setLeagueName(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className={labelCls}>Your name (you're playing too)</span>
              <input
                value={hostName}
                onChange={(e) => setHostName(e.target.value)}
                placeholder="e.g. Rich"
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className={labelCls}>Host PIN</span>
              <input
                value={hostPin}
                onChange={(e) => setHostPin(e.target.value)}
                type="password"
                inputMode="numeric"
                placeholder="manages the league + signs you in"
                className={inputCls}
              />
            </label>
            <div>
              <span className={labelCls}>Prize pot (optional)</span>
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
              </div>
            </div>
            <button
              disabled={busy || !hostPin || !hostName}
              onClick={() =>
                run(() =>
                  createLeague({
                    name: leagueName,
                    hostName,
                    hostPin,
                    scoring: DEFAULT_SCORING,
                    entryFee,
                    currency,
                  })
                )
              }
              className="w-full rounded-xl bg-gold py-3 font-black uppercase tracking-wide text-black transition hover:brightness-110 disabled:opacity-40"
            >
              {busy ? "…" : "Create league →"}
            </button>
            <p className="text-xs text-white/40">
              You'll get a share code for players, then run the draw.
            </p>
          </>
        )}

        {tab === "host" && (
          <>
            <label className="block">
              <span className={labelCls}>League code</span>
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                className={`${inputCls} font-mono tracking-[0.3em]`}
              />
            </label>
            <label className="block">
              <span className={labelCls}>Host PIN</span>
              <input
                value={hostPin}
                onChange={(e) => setHostPin(e.target.value)}
                type="password"
                inputMode="numeric"
                className={inputCls}
              />
            </label>
            <button
              disabled={busy || !joinCode || !hostPin}
              onClick={() => run(() => hostLogin(joinCode, hostPin))}
              className="w-full rounded-xl bg-gold py-3 font-black uppercase tracking-wide text-black transition hover:brightness-110 disabled:opacity-40"
            >
              {busy ? "…" : "Host login →"}
            </button>
          </>
        )}

        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
