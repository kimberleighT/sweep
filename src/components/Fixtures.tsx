import { useState } from "react";
import type { Fixture, Stage, Team } from "../types";
import { flagUrl, TEAMS_BY_CODE } from "../data/teams";
import { newId } from "../lib/storage";

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
}: {
  fixtures: Fixture[];
  teams: Team[];
  onChange: (f: Fixture[]) => void;
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

  const grouped = STAGE_ORDER.map((stage) => ({
    stage,
    items: fixtures
      .filter((f) => f.stage === stage)
      .sort((a, b) => a.kickoff.localeCompare(b.kickoff)),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={() => setAdding((v) => !v)}
          className="rounded-lg border border-white/20 px-3 py-1.5 text-sm font-bold uppercase tracking-wide hover:bg-white/10"
        >
          {adding ? "Close" : "+ Add result"}
        </button>
      </div>

      {adding && (
        <AddFixture
          teams={teams}
          onAdd={(f) => {
            onChange([...fixtures, f]);
            setAdding(false);
          }}
        />
      )}

      {grouped.length === 0 && !adding && (
        <p className="card p-6 text-center text-white/50">
          No fixtures yet. Hit “Sync results” to pull them from the API, or add results
          manually.
        </p>
      )}

      {grouped.map(({ stage, items }) => (
        <section key={stage}>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-gold/80">
            {STAGE_LABEL[stage]}
          </h3>
          <div className="overflow-hidden rounded-xl border border-white/10">
            {items.map((f) => {
              const home = TEAMS_BY_CODE[f.homeCode];
              const away = TEAMS_BY_CODE[f.awayCode];
              return (
                <div
                  key={f.id}
                  className="flex items-center gap-2 border-t border-white/5 px-3 py-2 first:border-t-0"
                >
                  <div className="flex flex-1 items-center justify-end gap-2 text-right">
                    <span className="truncate text-sm">{home?.name ?? f.homeCode}</span>
                    {home && (
                      <img src={flagUrl(home, 80)} className="h-4 w-6 rounded-sm object-cover" />
                    )}
                  </div>
                  <ScoreInput value={f.homeScore} onChange={(n) => setScore(f.id, "home", n)} />
                  <span className="text-white/30">–</span>
                  <ScoreInput value={f.awayScore} onChange={(n) => setScore(f.id, "away", n)} />
                  <div className="flex flex-1 items-center gap-2">
                    {away && (
                      <img src={flagUrl(away, 80)} className="h-4 w-6 rounded-sm object-cover" />
                    )}
                    <span className="truncate text-sm">{away?.name ?? f.awayCode}</span>
                  </div>
                  {f.manual && (
                    <span className="ml-1 rounded bg-white/10 px-1 text-[10px] text-white/50">
                      manual
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
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
