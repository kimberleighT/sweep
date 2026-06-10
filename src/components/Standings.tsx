import { Fragment, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { Fixture, Game } from "../types";
import { buildStandings } from "../lib/scoring";
import { scoreBonus } from "../lib/challenges";
import { TEAMS_BY_CODE } from "../data/teams";
import { TeamBadge } from "./TeamBadge";
import { shareNode } from "../lib/share";

export function Standings({
  game,
  fixtures,
  onCaptain,
}: {
  game: Game;
  fixtures: Fixture[];
  /** Omit to render captains read-only (league players can't set captains). */
  onCaptain?: (entrantId: string, code: string | null) => void;
}) {
  const bonusByEntrant = scoreBonus(game.challenges ?? [], game.predictions ?? []);
  const rows = buildStandings(
    game.entrants,
    game.allocations,
    fixtures,
    game.scoring,
    game.captains ?? {},
    bonusByEntrant
  );
  const [open, setOpen] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const leader = rows[0];
  const spoon = rows[rows.length - 1];
  const hasResults = rows.some((r) => r.played > 0);
  const pot = game.prize ? game.prize.entryFee * game.entrants.length : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-widest text-white/50">
          League table
        </h2>
        <button
          onClick={() =>
            tableRef.current && shareNode(tableRef.current, "wc-sweepstake-table.png")
          }
          className="rounded-lg border border-white/20 px-3 py-1.5 text-sm font-bold uppercase tracking-wide hover:bg-white/10"
        >
          📤 Share
        </button>
      </div>

      <div ref={tableRef} className="overflow-hidden rounded-2xl border border-white/10 bg-pitch">
        <div className="flex items-center justify-between bg-white/5 px-4 py-2">
          <span className="font-black tracking-tight">{game.name}</span>
          {pot > 0 && (
            <span className="text-sm font-bold text-gold">
              💰 {game.prize!.currency}
              {pot} pot
            </span>
          )}
        </div>
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-wider text-white/50">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Entrant</th>
              <th className="px-2 py-2 text-center" title="Teams still alive">
                ♥
              </th>
              <th className="px-2 py-2 text-center">P</th>
              <th className="px-2 py-2 text-center">W</th>
              <th className="px-2 py-2 text-center">D</th>
              <th className="px-2 py-2 text-center">GF</th>
              <th className="px-3 py-2 text-right">Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const isOpen = open === r.entrant.id;
              const isLast = i === rows.length - 1 && rows.length > 1;
              return (
                <Fragment key={r.entrant.id}>
                  <motion.tr
                    layout
                    onClick={() => setOpen(isOpen ? null : r.entrant.id)}
                    className={`cursor-pointer border-t border-white/5 transition hover:bg-white/5 ${
                      i === 0 ? "bg-gold/10" : ""
                    }`}
                  >
                    <td className="px-3 py-2 font-bold text-white/60">{i + 1}</td>
                    <td className="px-3 py-2 font-bold">
                      {i === 0 ? "👑 " : isLast ? "🥄 " : ""}
                      {r.entrant.name}
                      {r.captain && (
                        <span
                          className="ml-1 text-xs text-gold"
                          title={`Captain: ${TEAMS_BY_CODE[r.captain]?.name} (2×)`}
                        >
                          ©
                        </span>
                      )}
                      {r.predictionPoints > 0 && (
                        <span
                          className="ml-1 text-xs text-emerald-400"
                          title={`Bonus predictions: +${r.predictionPoints}`}
                        >
                          🃏+{r.predictionPoints}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-center text-white/70">{r.alive}</td>
                    <td className="px-2 py-2 text-center text-white/70">{r.played}</td>
                    <td className="px-2 py-2 text-center text-white/70">{r.won}</td>
                    <td className="px-2 py-2 text-center text-white/70">{r.drawn}</td>
                    <td className="px-2 py-2 text-center text-white/70">{r.goalsFor}</td>
                    <td className="px-3 py-2 text-right text-lg font-black text-gold">
                      {r.points}
                    </td>
                  </motion.tr>
                  {isOpen && (
                    <tr className="bg-black/20">
                      <td />
                      <td colSpan={7} className="px-3 py-3">
                        <p className="mb-2 text-xs uppercase tracking-wider text-white/40">
                          {onCaptain
                            ? "Tap a team to set captain (scores 2×)"
                            : "Teams in this entry (© = captain, scores 2×)"}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {r.teams.map((code) => {
                            const t = TEAMS_BY_CODE[code];
                            if (!t) return null;
                            const isCap = r.captain === code;
                            const cls = `rounded-md px-2 py-1 ring-1 transition ${
                              isCap
                                ? "bg-gold/20 ring-gold"
                                : "bg-white/5 ring-transparent hover:ring-white/20"
                            }`;
                            const inner = (
                              <>
                                {isCap && <span className="mr-1 text-gold">©</span>}
                                <TeamBadge team={t} size="sm" />
                              </>
                            );
                            return onCaptain ? (
                              <button
                                key={code}
                                onClick={() => onCaptain(r.entrant.id, isCap ? null : code)}
                                className={cls}
                              >
                                {inner}
                              </button>
                            ) : (
                              <span key={code} className={cls}>
                                {inner}
                              </span>
                            );
                          })}
                        </div>
                        {r.predictionPoints > 0 && (
                          <p className="mt-2 text-xs text-emerald-400">
                            🃏 Bonus predictions: +{r.predictionPoints} pts
                          </p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {pot > 0 && hasResults && leader && (
          <p className="bg-black/20 px-4 py-2 text-sm text-white/70">
            👑 <b>{leader.entrant.name}</b> leads — on for {game.prize!.currency}
            {pot}
            {spoon && rows.length > 1 ? ` · 🥄 ${spoon.entrant.name} propping it up` : ""}
          </p>
        )}
      </div>

      {!hasResults && (
        <p className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-center text-xs text-white/40">
          No results yet — sync results or add them manually to get the table moving.
        </p>
      )}
    </div>
  );
}
