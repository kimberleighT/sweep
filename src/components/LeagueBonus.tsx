import { useMemo, useState } from "react";
import type { BonusChallenge, ChallengeKind, Fixture, Game, Stage, Team } from "../types";
import {
  challengeStatus,
  isCorrect,
  isLocked,
  jokerScopesUsed,
  kindMeta,
  resolveBonusAnswer,
  STAGE_LABEL,
} from "../lib/challenges";
import { AnswerInput, NewChallenge, STATUS_STYLE, showAnswer } from "./Bonus";

/**
 * League-mode Bonus tab. The host creates challenges; each player enters their
 * own prediction. Answers are computed automatically from the match results
 * (no human judging), so there's nothing for the host to resolve.
 */
export function LeagueBonus({
  game,
  teams,
  fixtures,
  isHost,
  viewerEntrantId,
  onCreateChallenge,
  onDeleteChallenge,
  onSubmitPrediction,
}: {
  game: Game;
  teams: Team[];
  fixtures: Fixture[];
  isHost: boolean;
  viewerEntrantId: string | null;
  onCreateChallenge: (c: {
    kind: ChallengeKind;
    scope: Stage;
    prompt: string;
    points: number;
    locksAt: string;
  }) => void;
  onDeleteChallenge: (challengeId: string) => void;
  onSubmitPrediction: (challengeId: string, answer: string, isJoker: boolean) => void;
}) {
  const [adding, setAdding] = useState(false);
  const challenges = game.challenges ?? [];
  const predictions = game.predictions ?? [];

  const jokerScopes = useMemo(
    () => jokerScopesUsed(predictions, challenges),
    [predictions, challenges]
  );

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
          onCreate={(c: BonusChallenge) => {
            onCreateChallenge({
              kind: c.kind,
              scope: c.scope,
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
            ? " Add prediction rounds — they score themselves from the results."
            : " The host hasn't added any prediction rounds yet."}
        </p>
      )}

      {ordered.map((c) => (
        <LeagueChallengeCard
          key={c.id}
          challenge={c}
          game={game}
          teams={teams}
          fixtures={fixtures}
          isHost={isHost}
          viewerEntrantId={viewerEntrantId}
          jokerScopes={jokerScopes}
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
  fixtures,
  isHost,
  viewerEntrantId,
  jokerScopes,
  onDelete,
  onSubmit,
}: {
  challenge: BonusChallenge;
  game: Game;
  teams: Team[];
  fixtures: Fixture[];
  isHost: boolean;
  viewerEntrantId: string | null;
  jokerScopes: Map<string, Set<Stage>>;
  onDelete: () => void;
  onSubmit: (answer: string, isJoker: boolean) => void;
}) {
  const meta = kindMeta(challenge.kind);
  const status = challengeStatus(challenge, fixtures);
  const locked = isLocked(challenge);
  const answer = resolveBonusAnswer(challenge, fixtures);
  const preds = game.predictions ?? [];

  const own = viewerEntrantId
    ? preds.find((p) => p.challengeId === challenge.id && p.entrantId === viewerEntrantId)
    : undefined;

  const [pickDraft, setPickDraft] = useState(own?.answer ?? "");
  const [jokerDraft, setJokerDraft] = useState(!!own?.joker);

  const jokerLockedElsewhere =
    !!viewerEntrantId &&
    !!jokerScopes.get(viewerEntrantId)?.has(challenge.scope) &&
    !own?.joker;
  const dirty = pickDraft !== (own?.answer ?? "") || jokerDraft !== !!own?.joker;

  const lockLabel = new Date(challenge.locksAt).toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-pitch">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="flex items-center gap-2">
          <span className="text-lg">{meta.emoji}</span>
          <span>
            <span className="block font-bold">{challenge.prompt}</span>
            <span className="block text-xs uppercase tracking-wider text-white/40">
              {challenge.points} pts · {STAGE_LABEL[challenge.scope]} · locks {lockLabel}
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
        {/* auto-resolved answer */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-black/20 p-2 text-sm">
          <span className="text-xs uppercase tracking-wider text-white/40">Answer</span>
          {answer !== null ? (
            <span className="font-bold text-gold">{showAnswer(challenge.kind, answer)}</span>
          ) : (
            <span className="text-white/40">
              🤖 auto-scores once the {STAGE_LABEL[challenge.scope]} finishes
            </span>
          )}
        </div>

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
                    ? "Joker already used this round"
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
              One 🃏 Joker per round, doubles that pick if you're right.
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
              const correct = answer !== null && isCorrect(challenge.kind, answer, p.answer);
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
