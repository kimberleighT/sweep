import { motion } from "framer-motion";
import type { Game, Team } from "../types";
import { powerRanking } from "../lib/strength";
import { flagUrl } from "../data/teams";

export function PowerRanking({
  game,
  teamsByCode,
}: {
  game: Game;
  teamsByCode: Record<string, Team>;
}) {
  const rows = powerRanking(game.entrants, game.allocations, teamsByCode);
  const max = rows[0]?.strength || 1;

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-gold/80">
        Pre-tournament power ranking
      </h3>
      {rows.map((r, i) => (
        <motion.div
          key={r.entrant.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08 }}
          className="card p-3"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-black">
              {i + 1}. {r.entrant.name}
            </span>
            <span className="text-sm font-bold text-gold">{r.title}</span>
          </div>
          <p className="mt-0.5 text-sm text-white/60">{r.blurb}</p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/30">
            <div
              className="h-full rounded-full bg-gradient-to-r from-gold/70 to-gold"
              style={{ width: `${(r.strength / max) * 100}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {r.teams.map((t) => (
              <img
                key={t.code}
                src={flagUrl(t, 80)}
                alt={t.name}
                title={`${t.name} (Pot ${t.pot})`}
                className="h-4 w-6 rounded-sm object-cover ring-1 ring-black/30"
              />
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
