import { useState } from "react";
import type { Fixture, Stage, Team } from "../types";
import { flagUrl, TEAMS_BY_CODE } from "../data/teams";
import { GROUP_LETTERS, KNOCKOUT_SCHEDULE } from "../data/worldcup2026";
import { newId } from "../lib/storage";

/** "Thu 11 Jun" from an ISO kickoff, or "" if unparseable. */
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

const STAGE_LABEL: Record<Stage, string> = {
  group: "Group Stage",
  r32: "Round of 32",
  r16: "Round of 16",
  qf: "Quarter-finals",
  sf: "Semi-finals",
  final: "Final",
};

const STAGE_ORDER: Stage[] = ["group", "r32", "r16", "qf", "sf", "final"];

function ScoreInput({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
}) {
  return (
    <input
      type="number"
      min={0}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      className="w-12 rounded border border-white/15 bg-black/30 px-1 py-1 text-center"
    />
  );
}

export function Fixtures({
  fixtures,
  teams,
  onChange,
  readOnly = false,
}: {
  fixtures: Fixture[];
  teams: Team[];
  onChange: (f: Fixture[]) => void;
  /** Players see the calendar but can't edit scores or add fixtures. */
  readOnly?: boolean;
}) {
  const [adding, setAdding] = useState(false);

  function setScore(id: string, side: "home" | "away", n: number | null) {
    onChange(
      fixtures.map((f) => {
        if (f.id !== id) return f;
        const next: Fixture = {
          ...f,
          manual: true,
          [side === "home" ? "homeScore" : "awayScore"]: n,
        };
        next.status =
          next.homeScore !== null && next.awayScore !== null ? "finished" : "scheduled";
        return next;
      })
    );
  }

  const sortByKick = (a: Fixture, b: Fixture) => a.kickoff.localeCompare(b.kickoff);

  // Group stage, broken out by group letter (A–L). Any group fixture missing a
  // letter (e.g. legacy/API) falls into an "Other" bucket.
  const groupSections = GROUP_LETTERS.map((g) => ({
    g,
    items: fixtures.filter((f) => f.stage === "group" && f.group === g).sort(sortByKick),
  })).filter((s) => s.items.length > 0);
  const ungrouped = fixtures
    .filter((f) => f.stage === "group" && !f.group)
    .sort(sortByKick);

  // Knockout fixtures that have actually been entered (real teams).
  const knockoutSections = STAGE_ORDER.filter((s) => s !== "group")
    .map((stage) => ({
      stage,
      items: fixtures.filter((f) => f.stage === stage).sort(sortByKick),
    }))
    .filter((s) => s.items.length > 0);

  const anyFixtures = fixtures.length > 0;

  function row(f: Fixture) {
    const home = TEAMS_BY_CODE[f.homeCode];
    const away = TEAMS_BY_CODE[f.awayCode];
    return (
      <div
        key={f.id}
        className="flex items-center gap-2 border-t border-white/5 px-3 py-2 first:border-t-0"
      >
        <span className="w-14 shrink-0 text-[11px] text-white/40">{fmtDate(f.kickoff)}</span>
        <div className="flex flex-1 items-center justify-end gap-2 text-right">
          <span className="truncate text-sm">{home?.name ?? f.homeCode}</span>
          {home && <img src={flagUrl(home, 80)} className="h-4 w-6 rounded-sm object-cover" />}
        </div>
        {readOnly ? (
          <span className="px-1 text-sm font-bold text-white/80">
            {f.homeScore ?? "–"}<span className="text-white/30"> : </span>{f.awayScore ?? "–"}
          </span>
        ) : (
          <>
            <ScoreInput value={f.homeScore} onChange={(n) => setScore(f.id, "home", n)} />
            <span className="text-white/30">–</span>
            <ScoreInput value={f.awayScore} onChange={(n) => setScore(f.id, "away", n)} />
          </>
        )}
        <div className="flex flex-1 items-center gap-2">
          {away && <img src={flagUrl(away, 80)} className="h-4 w-6 rounded-sm object-cover" />}
          <span className="truncate text-sm">{away?.name ?? f.awayCode}</span>
        </div>
        {f.manual && (
          <span className="ml-1 rounded bg-white/10 px-1 text-[10px] text-white/50">manual</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!readOnly && (
        <div className="flex justify-end">
          <button
            onClick={() => setAdding((v) => !v)}
            className="rounded-lg border border-white/20 px-3 py-1.5 text-sm font-bold uppercase tracking-wide hover:bg-white/10"
          >
            {adding ? "Close" : "+ Add result"}
          </button>
        </div>
      )}

      {adding && !readOnly && (
        <AddFixture
          teams={teams}
          onAdd={(f) => {
            onChange([...fixtures, f]);
            setAdding(false);
          }}
        />
      )}

      {!anyFixtures && !adding && (
        <p className="card p-6 text-center text-white/50">
          {readOnly
            ? "No fixtures yet — the host will load the schedule."
            : "No fixtures yet. Hit “Load 2026 schedule” to pull in the full group stage, or add results manually."}
        </p>
      )}

      {/* Group stage, by group */}
      {groupSections.map(({ g, items }) => (
        <section key={g}>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-gold/80">
            Group {g}
          </h3>
          <div className="overflow-hidden rounded-xl border border-white/10">
            {items.map(row)}
          </div>
        </section>
      ))}

      {ungrouped.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-gold/80">
            Group stage
          </h3>
          <div className="overflow-hidden rounded-xl border border-white/10">
            {ungrouped.map(row)}
          </div>
        </section>
      )}

      {/* Knockout fixtures that have been entered */}
      {knockoutSections.map(({ stage, items }) => (
        <section key={stage}>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-gold/80">
            {STAGE_LABEL[stage]}
          </h3>
          <div className="overflow-hidden rounded-xl border border-white/10">
            {items.map(row)}
          </div>
        </section>
      ))}

      {/* Full knockout schedule (read-only until teams are known) */}
      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-white/40">
          Knockout schedule
        </h3>
        <div className="overflow-hidden rounded-xl border border-white/10 bg-black/10">
          {KNOCKOUT_SCHEDULE.map((k) => (
            <div
              key={k.match}
              className="flex items-center gap-2 border-t border-white/5 px-3 py-1.5 text-sm first:border-t-0"
            >
              <span className="w-14 shrink-0 text-[11px] text-white/40">{fmtDate(`${k.date}T00:00:00`)}</span>
              <span className="w-10 shrink-0 text-[10px] font-bold uppercase tracking-wider text-gold/60">
                {STAGE_LABEL[k.stage].replace("Round of ", "R")}
              </span>
              <span className="flex-1 text-right text-white/70">{k.home}</span>
              <span className="text-white/30">v</span>
              <span className="flex-1 text-white/70">{k.away}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function AddFixture({
  teams,
  onAdd,
}: {
  teams: Team[];
  onAdd: (f: Fixture) => void;
}) {
  const [home, setHome] = useState(teams[0]?.code ?? "");
  const [away, setAway] = useState(teams[1]?.code ?? "");
  const [hs, setHs] = useState<number | null>(null);
  const [as, setAs] = useState<number | null>(null);
  const [stage, setStage] = useState<Stage>("group");

  const valid = home && away && home !== away;

  return (
    <div className="card grid gap-3 p-4 sm:grid-cols-2">
      <select
        value={home}
        onChange={(e) => setHome(e.target.value)}
        className="rounded-lg border border-white/15 bg-black/40 px-3 py-2"
      >
        {teams.map((t) => (
          <option key={t.code} value={t.code}>
            {t.name}
          </option>
        ))}
      </select>
      <select
        value={away}
        onChange={(e) => setAway(e.target.value)}
        className="rounded-lg border border-white/15 bg-black/40 px-3 py-2"
      >
        {teams.map((t) => (
          <option key={t.code} value={t.code}>
            {t.name}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-2">
        <ScoreInput value={hs} onChange={setHs} />
        <span className="text-white/40">–</span>
        <ScoreInput value={as} onChange={setAs} />
      </div>
      <select
        value={stage}
        onChange={(e) => setStage(e.target.value as Stage)}
        className="rounded-lg border border-white/15 bg-black/40 px-3 py-2"
      >
        {STAGE_ORDER.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABEL[s]}
          </option>
        ))}
      </select>
      <button
        disabled={!valid}
        onClick={() =>
          onAdd({
            id: `manual:${newId()}`,
            stage,
            group: null,
            kickoff: new Date().toISOString(),
            homeCode: home,
            awayCode: away,
            homeScore: hs,
            awayScore: as,
            status: hs !== null && as !== null ? "finished" : "scheduled",
            manual: true,
          })
        }
        className="rounded-lg bg-gold py-2 font-black uppercase text-black disabled:opacity-40 sm:col-span-2"
      >
        Add result
      </button>
    </div>
  );
}
