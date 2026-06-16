import { useState } from "react";
import { loadGame } from "./lib/storage";
import {
  clearSession,
  loadLastLeague,
  loadSession,
  saveLastLeague,
  saveSession,
  type LeagueSession,
} from "./lib/session";
import { leagueModeAvailable, type AuthResult } from "./lib/db";
import { LocalGame } from "./components/LocalGame";
import { LeagueLobby } from "./components/LeagueLobby";
import { LeagueRoom } from "./components/LeagueRoom";

type Mode = "choose" | "local" | "league";

export default function App() {
  const [session, setSession] = useState<LeagueSession | null>(() => loadSession());
  const [mode, setMode] = useState<Mode>(() =>
    loadSession() ? "league" : loadGame() ? "local" : "choose"
  );

  if (mode === "league") {
    if (!session)
      return (
        <LeagueLobby
          lastLeague={loadLastLeague()}
          onAuthed={(r: AuthResult) => {
            const s: LeagueSession = {
              joinCode: r.joinCode,
              token: r.token,
              entrantId: r.entrantId,
              isHost: r.isHost,
            };
            saveSession(s);
            // Remember where they were so they can get back in after logging
            // out. Players only — a host must return via "Host login" or the
            // Welcome-back resume would log them in as a plain player and strip
            // their host powers (the host PIN doubles as their player PIN).
            if (r.entrantId && !r.isHost)
              saveLastLeague({ joinCode: r.joinCode, displayName: r.displayName });
            setSession(s);
          }}
          onBack={() => setMode("choose")}
        />
      );
    return (
      <LeagueRoom
        session={session}
        onLeave={() => {
          clearSession();
          setSession(null);
          setMode("choose");
        }}
      />
    );
  }

  if (mode === "local") return <LocalGame onSwitchMode={() => setMode("choose")} />;

  return (
    <ModeChooser
      leagueAvailable={leagueModeAvailable()}
      onLocal={() => setMode("local")}
      onLeague={() => setMode("league")}
    />
  );
}

function ModeChooser({
  leagueAvailable,
  onLocal,
  onLeague,
}: {
  leagueAvailable: boolean;
  onLocal: () => void;
  onLeague: () => void;
}) {
  return (
    <div className="mx-auto max-w-md p-6">
      <header className="mb-8 text-center">
        <p className="text-sm font-bold uppercase tracking-[0.3em] text-gold">
          World Cup 2026
        </p>
        <h1 className="mt-1 text-4xl font-black tracking-tight">Sweepstake</h1>
        <p className="mt-2 text-white/60">How do you want to play?</p>
      </header>

      <div className="space-y-4">
        <button
          onClick={onLocal}
          className="card w-full p-6 text-left transition hover:border-gold/50"
        >
          <span className="block text-lg font-black">Quick play</span>
          <span className="mt-1 block text-sm text-white/60">
            One device, no sign-up. Run the whole sweepstake from the host's phone —
            great for the pub.
          </span>
        </button>

        <button
          onClick={onLeague}
          disabled={!leagueAvailable}
          className="card w-full p-6 text-left transition hover:border-gold/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="block text-lg font-black">
            Create / join a league
          </span>
          <span className="mt-1 block text-sm text-white/60">
            Everyone plays on their own phone with a shared code and a personal PIN.
            Live table, locked predictions.
          </span>
          {!leagueAvailable && (
            <span className="mt-2 block text-xs text-amber-300/80">
              Needs VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in .env
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
