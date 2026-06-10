import { useMemo, useState } from "react";
import type { BonusChallenge, ChallengeKind, Game, Team } from "../types";
import {
  challengeStatus,
  isCorrect,
  isLocked,
  jokersUsed,
  kindMeta,
} from "../lib/challenges";
import { AnswerInput, NewChallenge, STATUS_STYLE, showAnswer } from "./Bonus";

/**
 * League-mode Bonus tab.
 *
 * Differs from the quick-play Bonus (which lets the host enter everyone's picks
 * on one device): here the host only creates challenges and sets answers, while
 * each player enters their own prediction. Others' picks stay hidden until the
 * challenge locks — that gate is enforced server-side; this just renders what
 * get_league_state returned.
 */
export function LeagueBonus({
  game,
  teams,
  isHost,
  viewerEntrantId,
  onCreateChallenge,
  onResolveChallenge,
  onDeleteChallenge,
  onSubmitPrediction,
}: {
  game: Game;
  teams: Team[];
  isHost: boolean;
  viewerEntrantId: string | null;
  onCreateChallenge: (c: {
    kind: ChallengeKind;
    prompt: string;
    points: number;
    locksAt: string;
  }) => void;
  onResolveChallenge: (challengeId: string, answer: string | null) => void;
  onDeleteChallenge: (challengeId: string) => void;
  onSubmitPrediction: (challengeId: string, answer: string, isJoker: boolean) => void;
}) {
  const [adding, setAdding] = useState(false);
  const challenges = game.challenges ?? [];
  const predictions = game.predictions ?? [];

  // The viewer's own Joker usage — own predictions are always returned, so this
  // is accurate for the player even while others' picks are hidden.
  const jokerUsedBy = useMemo(() => jokersUsed(predictions), [predictions]);

  const ordered = useMemo(
    () => [...challenges].sort((a, b) => Date.parse(a.locksAt) - Date.parse(b.locksAt)),
    [challenges]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-widest text-white/50">
          Bonus challenges
        </h2>
        {isHost && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="rounded-lg bg-gold px-3 py-1.5 text-sm font-black uppercase tracking-wide text-black transition hover:brightness-110"
          >
            + New challenge
          </button>
        )}
      </div>

      {isHost && adding && (
        <NewChallenge
          onCreate={(c) => {
            onCreateChallenge({
              kind: c.kind,
              prompt: c.prompt,
              points: c.points,
              locksAt: c.locksAt,
            });
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {ordered.length === 0 && !adding && (
        <p className="rounded-xl border border-white/10 bg-black/20 px-3 py-6 text-center text-sm text-white/40">
          No bonus challenges yet.
          {isHost
            ? " Add prediction rounds — total goals, top team, biggest margin, MOTM — to keep everyone engaged."
            : " The host hasn't added any prediction rounds yet."}
        </p>
      )}

      {ordered.map((c) => (
        <LeagueChallengeCard
          key={c.id}
          challenge={c}
          game={game}
          teams={teams}
          isHost={isHost}
          viewerEntrantId={viewerEntrantId}
          jokerUsedBy={jokerUsedBy}
          onResolve={(answer) => onResolveChallenge(c.id, answer)}
          onDelete={() => onDeleteChallenge(c.id)}
          onSubmit={(answer, isJoker) => onSubmitPrediction(c.id, answer, isJoker)}
        />
      ))}
    </div>
  );
}

function LeagueChallengeCard({
  challenge,
  game,
  teams,
  isHost,
  viewerEntrantId,
  jokerUsedBy,
  onResolve,
  onDelete,
  onSubmit,
}: {
  challenge: BonusChallenge;
  game: Game;
  teams: Team[];
  isHost: boolean;
  viewerEntrantId: string | null;
  jokerUsedBy: Set<string>;
  onResolve: (answer: string | null) => void;
  onDelete: () => void;
  onSubmit: (answer: string, isJoker: boolean) => void;
}) {
  const meta = kindMeta(challenge.kind);
  const status = challengeStatus(challenge);
  const locked = isLocked(challenge);
  const preds = game.predictions ?? [];

  const own = viewerEntrantId
    ? preds.find((p) => p.challengeId === challenge.id && p.entrantId === viewerEntrantId)
    : undefined;

  const [answerDraft, setAnswerDraft] = useState(challenge.answer ?? "");
  const [pickDraft, setPickDraft] = useState(own?.answer ?? "");
  const [jokerDraft, setJokerDraft] = useState(!!own?.joker);

  const jokerLockedElsewhere =
    !!viewerEntrantId && jokerUsedBy.has(viewerEntrantId) && !own?.joker;

  const lockLabel = new Date(challenge.locksAt).toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const dirty = pickDraft !== (own?.answer ?? "") || jokerDraft !== !!own?.joker;

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-pitch">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="flex items-center gap-2">
          <span className="text-lg">{meta.emoji}</span>
          <span>
            <span className="block font-bold">{challenge.prompt}</span>
            <span className="block text-xs uppercase tracking-wider text-white/40">
              {challenge.points} pts · locks {lockLabel}
            </span>
          </span>
        </span>
        <span
          className={`rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${STATUS_STYLE[status]}`}
        >
          {status}
        </span>
      </div>

      <div className="space-y-3 border-t border-white/10 px-4 py-3">
        {/* Host: set/clear the correct answer */}
        {isHost && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-black/20 p-2">
            <span className="text-xs uppercase tracking-wider text-white/40">
              Correct answer
            </span>
            <AnswerInput
              kind={challenge.kind}
              teams={teams}
              value={answerDraft}
              onChange={setAnswerDraft}
            />
            <button
              onClick={() => onResolve(answerDraft || null)}
              className="rounded-md bg-gold px-3 py-1 text-xs font-black uppercase tracking-wide text-black hover:brightness-110"
            >
              {status === "resolved" ? "Update" : "Award"}
            </button>
            {status === "resolved" && (
              <button
                onClick={() => {
                  setAnswerDraft("");
                  onResolve(null);
                }}
                className="rounded-md border border-white/20 px-3 py-1 text-xs font-bold uppercase tracking-wide hover:bg-white/10"
              >
                Clear
              </button>
            )}
          </div>
        )}

        {/* Player: enter your own pick (before lock) */}
        {viewerEntrantId && !locked && (
          <div className="space-y-2 rounded-xl bg-black/20 p-3">
            <span className="text-xs uppercase tracking-wider text-white/40">
              Your prediction
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <AnswerInput
                kind={challenge.kind}
                teams={teams}
                value={pickDraft}
                onChange={setPickDraft}
              />
              <button
                type="button"
                disabled={jokerLockedElsewhere || !pickDraft}
                onClick={() => setJokerDraft((v) => !v)}
                title={
                  jokerLockedElsewhere
                    ? "Joker already used on another challenge"
                    : "Play your Joker (doubles points if correct)"
                }
                className={`rounded-md px-2 py-1 text-xs font-bold ring-1 transition disabled:opacity-30 ${
                  jokerDraft
                    ? "bg-gold/20 text-gold ring-gold"
                    : "bg-white/5 text-white/50 ring-transparent hover:ring-white/20"
                }`}
              >
                🃏 Joker
              </button>
              <button
                type="button"
                disabled={!dirty}
                onClick={() => onSubmit(pickDraft, jokerDraft)}
                className="rounded-md bg-gold px-3 py-1 text-xs font-black uppercase tracking-wide text-black transition hover:brightness-110 disabled:opacity-30"
              >
                {pickDraft ? "Save pick" : "Clear"}
              </button>
            </div>
            <p className="text-xs text-white/40">
              One 🃏 Joker per player, doubles that round if you're right.
            </p>
          </div>
        )}

        {/* Player: own pick once locked */}
        {viewerEntrantId && locked && (
          <div className="rounded-xl bg-black/20 p-3 text-sm">
            <span className="text-white/40">Your pick: </span>
            <span className="font-semibold text-white/80">
              {showAnswer(challenge.kind, own?.answer ?? "")}
            </span>
            {own?.joker && <span className="ml-1 text-gold">🃏</span>}
          </div>
        )}

        {/* Everyone's picks, once visible (server reveals after lock) */}
        <table className="w-full text-sm">
          <tbody>
            {game.entrants.map((e) => {
              const p = preds.find(
                (x) => x.challengeId === challenge.id && x.entrantId === e.id
              );
              if (!p) return null; // hidden until lock (or not predicted)
              const correct =
                status === "resolved" &&
                isCorrect(challenge.kind, challenge.answer as string, p.answer);
              return (
                <tr key={e.id} className="border-t border-white/5">
                  <td className="py-1.5 pr-2 font-semibold">{e.name}</td>
                  <td className="py-1.5 pr-2 text-white/70">
                    {showAnswer(challenge.kind, p.answer)}
                    {p.joker && <span className="ml-1 text-gold">🃏</span>}
                  </td>
                  <td className="w-10 py-1.5 text-right">
                    {status === "resolved" &&
                      (correct ? (
                        <span className="font-black text-emerald-400">
                          +{challenge.points * (p.joker ? 2 : 1)}
                        </span>
                      ) : (
                        <span className="text-white/30">✗</span>
                      ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!locked && (
          <p className="text-xs text-white/40">
            Everyone's picks stay hidden until the round locks at kickoff.
          </p>
        )}

        {isHost && (
          <button
            onClick={() => {
              if (confirm("Delete this challenge and its predictions?")) onDelete();
            }}
            className="text-xs font-bold uppercase tracking-wide text-red-400/70 hover:text-red-400"
          >
            Delete challenge
          </button>
        )}
      </div>
    </div>
  );
}
