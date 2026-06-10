import { useMemo, useState } from "react";
import type {
  BonusChallenge,
  ChallengeKind,
  Fixture,
  Game,
  Prediction,
  Stage,
  Team,
} from "../types";
import {
  CHALLENGE_KINDS,
  challengeStatus,
  defaultPrompt,
  isCorrect,
  isLocked,
  jokerScopesUsed,
  kindMeta,
  resolveBonusAnswer,
  STAGE_LABEL,
  STAGE_ORDER,
} from "../lib/challenges";
import { newId } from "../lib/storage";
import { TEAMS_BY_CODE } from "../data/teams";

/* ------------------------------------------------------------------ *
 * Shared prediction input, keyed off the challenge kind (team | number).
 * ------------------------------------------------------------------ */
export function AnswerInput({
  kind,
  teams,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  kind: ChallengeKind;
  teams: Team[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const input = kindMeta(kind).input;
  const base =
    "rounded-md border border-white/15 bg-black/30 px-2 py-1 text-sm outline-none focus:border-gold disabled:opacity-50";

  if (input === "team") {
    return (
      <select
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${base} min-w-[9rem]`}
      >
        <option value="">— pick —</option>
        {teams.map((t) => (
          <option key={t.code} value={t.code}>
            {t.name}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      type="number"
      min={0}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder ?? "0"}
      className={`${base} w-20`}
    />
  );
}

/** Render a stored answer/prediction for display (team code → name). */
export function showAnswer(kind: ChallengeKind, value: string): string {
  if (!value) return "—";
  if (kindMeta(kind).input === "team") return TEAMS_BY_CODE[value]?.name ?? value;
  return value;
}

/* ------------------------------------------------------------------ *
 * New-challenge form. Kind + round (scope); the answer is auto-computed.
 * ------------------------------------------------------------------ */
export function NewChallenge({
  onCreate,
  onCancel,
}: {
  onCreate: (c: BonusChallenge) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<ChallengeKind>("total_goals");
  const [scope, setScope] = useState<Stage>("group");
  const [points, setPoints] = useState(CHALLENGE_KINDS.total_goals.defaultPoints);
  const [locksAt, setLocksAt] = useState("");

  const prompt = defaultPrompt(kind, scope);

  function pick(k: ChallengeKind) {
    setKind(k);
    setPoints(CHALLENGE_KINDS[k].defaultPoints);
  }

  function submit() {
    if (!locksAt) return;
    onCreate({
      id: newId(),
      kind,
      scope,
      prompt,
      points,
      // datetime-local has no zone; treat as local and store ISO
      locksAt: new Date(locksAt).toISOString(),
      answer: null,
      createdAt: new Date().toISOString(),
    });
  }

  return (
    <div className="space-y-3 rounded-2xl border border-gold/30 bg-black/30 p-4">
      <h3 className="text-sm font-bold uppercase tracking-widest text-gold">
        New bonus challenge
      </h3>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(CHALLENGE_KINDS) as ChallengeKind[]).map((k) => {
          const m = CHALLENGE_KINDS[k];
          return (
            <button
              key={k}
              type="button"
              onClick={() => pick(k)}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold uppercase tracking-wide ring-1 transition ${
                kind === k
                  ? "bg-gold/20 text-gold ring-gold"
                  : "bg-white/5 text-white/60 ring-transparent hover:ring-white/20"
              }`}
            >
              {m.emoji} {m.label}
            </button>
          );
        })}
      </div>

      <p className="rounded-md bg-black/30 px-3 py-2 text-sm text-white/80">{prompt}</p>
      <p className="text-xs text-white/40">
        🤖 Auto-scored from the results once every {STAGE_LABEL[scope]} match is finished.
      </p>

      <div className="flex flex-wrap gap-4">
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wider text-white/40">
            Round
          </span>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as Stage)}
            className="rounded-md border border-white/15 bg-black/30 px-2 py-2 text-sm outline-none focus:border-gold"
          >
            {STAGE_ORDER.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wider text-white/40">
            Points
          </span>
          <input
            type="number"
            min={1}
            value={points}
            onChange={(e) => setPoints(Math.max(1, Number(e.target.value) || 1))}
            className="w-20 rounded-md border border-white/15 bg-black/30 px-2 py-2 text-sm outline-none focus:border-gold"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wider text-white/40">
            Locks at (kickoff)
          </span>
          <input
            type="datetime-local"
            value={locksAt}
            onChange={(e) => setLocksAt(e.target.value)}
            className="rounded-md border border-white/15 bg-black/30 px-2 py-2 text-sm outline-none focus:border-gold"
          />
        </label>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!locksAt}
          className="rounded-lg bg-gold px-4 py-2 text-sm font-black uppercase tracking-wide text-black transition hover:brightness-110 disabled:opacity-40"
        >
          Add challenge
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-white/20 px-3 py-2 text-sm font-bold uppercase tracking-wide hover:bg-white/10"
        >
          Cancel
        </button>
      </div>
      {!locksAt && (
        <p className="text-xs text-white/40">
          Set a lock time — predictions can't be entered or changed once it passes.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * One challenge card.
 * ------------------------------------------------------------------ */
export const STATUS_STYLE = {
  open: "bg-emerald-500/15 text-emerald-300",
  locked: "bg-amber-500/15 text-amber-300",
  resolved: "bg-gold/20 text-gold",
} as const;

function ChallengeCard({
  challenge,
  game,
  teams,
  fixtures,
  jokerScopes,
  onPredict,
  onToggleJoker,
  onDelete,
}: {
  challenge: BonusChallenge;
  game: Game;
  teams: Team[];
  fixtures: Fixture[];
  jokerScopes: Map<string, Set<Stage>>;
  onPredict: (entrantId: string, answer: string) => void;
  onToggleJoker: (entrantId: string) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const meta = kindMeta(challenge.kind);
  const status = challengeStatus(challenge, fixtures);
  const locked = isLocked(challenge);
  const answer = resolveBonusAnswer(challenge, fixtures);
  const preds = game.predictions ?? [];
  const predFor = (entrantId: string) =>
    preds.find((p) => p.challengeId === challenge.id && p.entrantId === entrantId);

  const lockLabel = new Date(challenge.locksAt).toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-pitch">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/5"
      >
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
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-white/10 px-4 py-3">
          {/* auto-resolved answer */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-black/20 p-2 text-sm">
            <span className="text-xs uppercase tracking-wider text-white/40">Answer</span>
            {answer !== null ? (
              <span className="font-bold text-gold">{showAnswer(challenge.kind, answer)}</span>
            ) : (
              <span className="text-white/40">
                pending — scores once the {STAGE_LABEL[challenge.scope]} finishes
              </span>
            )}
          </div>

          {/* predictions per entrant */}
          <table className="w-full text-sm">
            <tbody>
              {game.entrants.map((e) => {
                const p = predFor(e.id);
                const ans = p?.answer ?? "";
                const correct =
                  answer !== null && isCorrect(challenge.kind, answer, ans);
                const jokerHere = !!p?.joker;
                const jokerUsedThisRound =
                  !!jokerScopes.get(e.id)?.has(challenge.scope) && !jokerHere;
                const jokerDisabled = locked || jokerUsedThisRound;
                return (
                  <tr key={e.id} className="border-t border-white/5">
                    <td className="py-1.5 pr-2 font-semibold">{e.name}</td>
                    <td className="py-1.5 pr-2">
                      {locked ? (
                        <span className="text-white/70">{showAnswer(challenge.kind, ans)}</span>
                      ) : (
                        <AnswerInput
                          kind={challenge.kind}
                          teams={teams}
                          value={ans}
                          onChange={(v) => onPredict(e.id, v)}
                        />
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-center">
                      <button
                        type="button"
                        disabled={jokerDisabled}
                        onClick={() => onToggleJoker(e.id)}
                        title={
                          jokerHere
                            ? "Joker played here (2×)"
                            : jokerUsedThisRound
                              ? "Joker already used this round"
                              : "Play Joker (doubles points if correct)"
                        }
                        className={`rounded-md px-2 py-1 text-xs font-bold ring-1 transition disabled:opacity-30 ${
                          jokerHere
                            ? "bg-gold/20 text-gold ring-gold"
                            : "bg-white/5 text-white/50 ring-transparent hover:ring-white/20"
                        }`}
                      >
                        🃏
                      </button>
                    </td>
                    <td className="w-10 py-1.5 text-right">
                      {status === "resolved" &&
                        ans &&
                        (correct ? (
                          <span className="font-black text-emerald-400">
                            +{challenge.points * (jokerHere ? 2 : 1)}
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
              Enter each player's pick before kickoff. 🃏 = Joker (one per round,
              doubles that prediction). Scored automatically from the results.
            </p>
          )}

          <button
            onClick={() => {
              if (confirm("Delete this challenge and its predictions?")) onDelete();
            }}
            className="text-xs font-bold uppercase tracking-wide text-red-400/70 hover:text-red-400"
          >
            Delete challenge
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Bonus tab (quick-play: host enters every player's pick on one device).
 * ------------------------------------------------------------------ */
export function Bonus({
  game,
  teams,
  fixtures,
  onChallenges,
  onPredictions,
}: {
  game: Game;
  teams: Team[];
  fixtures: Fixture[];
  onChallenges: (c: BonusChallenge[]) => void;
  onPredictions: (p: Prediction[]) => void;
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

  function addChallenge(c: BonusChallenge) {
    onChallenges([...challenges, c]);
    setAdding(false);
  }

  function deleteChallenge(id: string) {
    onChallenges(challenges.filter((c) => c.id !== id));
    onPredictions(predictions.filter((p) => p.challengeId !== id));
  }

  function predict(challengeId: string, entrantId: string, answer: string) {
    const rest = predictions.filter(
      (p) => !(p.challengeId === challengeId && p.entrantId === entrantId)
    );
    const prev = predictions.find(
      (p) => p.challengeId === challengeId && p.entrantId === entrantId
    );
    if (!answer) {
      onPredictions(rest);
      return;
    }
    onPredictions([
      ...rest,
      { challengeId, entrantId, answer, joker: prev?.joker ?? false },
    ]);
  }

  function toggleJoker(challengeId: string, entrantId: string) {
    const prev = predictions.find(
      (p) => p.challengeId === challengeId && p.entrantId === entrantId
    );
    const rest = predictions.filter(
      (p) => !(p.challengeId === challengeId && p.entrantId === entrantId)
    );
    const answer = prev?.answer ?? "";
    onPredictions([...rest, { challengeId, entrantId, answer, joker: !prev?.joker }]);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-widest text-white/50">
          Bonus challenges
        </h2>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="rounded-lg bg-gold px-3 py-1.5 text-sm font-black uppercase tracking-wide text-black transition hover:brightness-110"
          >
            + New challenge
          </button>
        )}
      </div>

      {adding && (
        <NewChallenge onCreate={addChallenge} onCancel={() => setAdding(false)} />
      )}

      {ordered.length === 0 && !adding && (
        <p className="rounded-xl border border-white/10 bg-black/20 px-3 py-6 text-center text-sm text-white/40">
          No bonus challenges yet. Add prediction rounds — total goals, biggest margin,
          top-scoring team — and they score themselves from the results. Every player gets
          one 🃏 Joker to double a round.
        </p>
      )}

      {ordered.map((c) => (
        <ChallengeCard
          key={c.id}
          challenge={c}
          game={game}
          teams={teams}
          fixtures={fixtures}
          jokerScopes={jokerScopes}
          onPredict={(entrantId, answer) => predict(c.id, entrantId, answer)}
          onToggleJoker={(entrantId) => toggleJoker(c.id, entrantId)}
          onDelete={() => deleteChallenge(c.id)}
        />
      ))}
    </div>
  );
}
