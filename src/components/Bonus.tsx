import { useMemo, useState } from "react";
import type {
  BonusChallenge,
  ChallengeKind,
  Game,
  Prediction,
  Team,
} from "../types";
import {
  CHALLENGE_KINDS,
  RESULT_OPTIONS,
  challengeStatus,
  isCorrect,
  isLocked,
  jokersUsed,
  kindMeta,
} from "../lib/challenges";
import { newId } from "../lib/storage";
import { TEAMS_BY_CODE } from "../data/teams";

/* ------------------------------------------------------------------ *
 * Shared answer/prediction input, keyed off the challenge kind.
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
  if (input === "number") {
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
  if (input === "result") {
    return (
      <div className="inline-flex overflow-hidden rounded-md border border-white/15">
        {RESULT_OPTIONS.map((opt) => (
          <button
            key={opt}
            type="button"
            disabled={disabled}
            onClick={() => onChange(value === opt ? "" : opt)}
            className={`px-2 py-1 text-xs font-bold uppercase tracking-wide transition disabled:opacity-50 ${
              value === opt
                ? "bg-gold text-black"
                : "bg-black/30 text-white/60 hover:text-white"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    );
  }
  return (
    <input
      type="text"
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder ?? "Answer…"}
      className={`${base} min-w-[9rem]`}
    />
  );
}

/** Render a stored answer/prediction for display (team code → name). */
export function showAnswer(kind: ChallengeKind, value: string): string {
  if (!value) return "—";
  if (kindMeta(kind).input === "team") return TEAMS_BY_CODE[value]?.name ?? value;
  if (kindMeta(kind).input === "result") return value.toUpperCase();
  return value;
}

/* ------------------------------------------------------------------ *
 * New-challenge form.
 * ------------------------------------------------------------------ */
export function NewChallenge({
  onCreate,
  onCancel,
}: {
  onCreate: (c: BonusChallenge) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<ChallengeKind>("total_goals");
  const meta = kindMeta(kind);
  const [prompt, setPrompt] = useState(meta.samplePrompt);
  const [points, setPoints] = useState(meta.defaultPoints);
  const [locksAt, setLocksAt] = useState("");

  function pick(k: ChallengeKind) {
    setKind(k);
    const m = CHALLENGE_KINDS[k];
    setPrompt(m.samplePrompt);
    setPoints(m.defaultPoints);
  }

  function submit() {
    if (!prompt.trim() || !locksAt) return;
    onCreate({
      id: newId(),
      kind,
      prompt: prompt.trim(),
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

      <label className="block">
        <span className="mb-1 block text-xs uppercase tracking-wider text-white/40">
          Question
        </span>
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm outline-none focus:border-gold"
        />
      </label>

      <div className="flex flex-wrap gap-4">
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
          disabled={!prompt.trim() || !locksAt}
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
  jokerUsedBy,
  onPredict,
  onToggleJoker,
  onResolve,
  onDelete,
}: {
  challenge: BonusChallenge;
  game: Game;
  teams: Team[];
  jokerUsedBy: Set<string>;
  onPredict: (entrantId: string, answer: string) => void;
  onToggleJoker: (entrantId: string) => void;
  onResolve: (answer: string | null) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const meta = kindMeta(challenge.kind);
  const status = challengeStatus(challenge);
  const locked = isLocked(challenge);
  const preds = game.predictions ?? [];
  const predFor = (entrantId: string) =>
    preds.find((p) => p.challengeId === challenge.id && p.entrantId === entrantId);
  const [answerDraft, setAnswerDraft] = useState(challenge.answer ?? "");

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
              {challenge.points} pts · locks {lockLabel}
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
          {/* resolve */}
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

          {/* predictions per entrant */}
          <table className="w-full text-sm">
            <tbody>
              {game.entrants.map((e) => {
                const p = predFor(e.id);
                const ans = p?.answer ?? "";
                const correct =
                  status === "resolved" &&
                  isCorrect(challenge.kind, challenge.answer as string, ans);
                const jokerHere = !!p?.joker;
                const jokerDisabled =
                  locked || (jokerUsedBy.has(e.id) && !jokerHere);
                return (
                  <tr key={e.id} className="border-t border-white/5">
                    <td className="py-1.5 pr-2 font-semibold">{e.name}</td>
                    <td className="py-1.5 pr-2">
                      {locked ? (
                        <span className="text-white/70">
                          {showAnswer(challenge.kind, ans)}
                        </span>
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
                            : jokerUsedBy.has(e.id)
                              ? "Joker already used on another challenge"
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
              Enter each player's pick before kickoff. 🃏 = Joker (one per player,
              doubles that prediction).
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
 * Bonus tab.
 * ------------------------------------------------------------------ */
export function Bonus({
  game,
  teams,
  onChallenges,
  onPredictions,
}: {
  game: Game;
  teams: Team[];
  onChallenges: (c: BonusChallenge[]) => void;
  onPredictions: (p: Prediction[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const challenges = game.challenges ?? [];
  const predictions = game.predictions ?? [];

  const jokerUsedBy = useMemo(() => jokersUsed(predictions), [predictions]);

  // newest lock time first amongst open, resolved sink to the bottom
  const ordered = useMemo(
    () =>
      [...challenges].sort(
        (a, b) => Date.parse(a.locksAt) - Date.parse(b.locksAt)
      ),
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

  function resolve(id: string, answer: string | null) {
    onChallenges(challenges.map((c) => (c.id === id ? { ...c, answer } : c)));
  }

  function predict(challengeId: string, entrantId: string, answer: string) {
    const rest = predictions.filter(
      (p) => !(p.challengeId === challengeId && p.entrantId === entrantId)
    );
    const prev = predictions.find(
      (p) => p.challengeId === challengeId && p.entrantId === entrantId
    );
    if (!answer) {
      // clearing the pick also clears its joker
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
    // need an answer to anchor the joker; default to empty pick otherwise
    const answer = prev?.answer ?? "";
    onPredictions([
      ...rest,
      { challengeId, entrantId, answer, joker: !prev?.joker },
    ]);
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
          No bonus challenges yet. Add prediction rounds — total goals, top team,
          biggest margin, MOTM — to keep everyone engaged. Each correct pick adds
          points to the league table, and every player gets one 🃏 Joker to double a
          round.
        </p>
      )}

      {ordered.map((c) => (
        <ChallengeCard
          key={c.id}
          challenge={c}
          game={game}
          teams={teams}
          jokerUsedBy={jokerUsedBy}
          onPredict={(entrantId, answer) => predict(c.id, entrantId, answer)}
          onToggleJoker={(entrantId) => toggleJoker(c.id, entrantId)}
          onResolve={(answer) => resolve(c.id, answer)}
          onDelete={() => deleteChallenge(c.id)}
        />
      ))}
    </div>
  );
}
