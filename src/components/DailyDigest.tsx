import type { Fixture, Game } from "../types";
import { buildDailyDigest, type OwnedFixture } from "../lib/headlines";
import { TEAMS_BY_CODE, flagUrl } from "../data/teams";

function FixtureLine({ of }: { of: OwnedFixture }) {
  const { fixture: f, homeTeam, awayTeam, homeOwner, awayOwner } = of;
  const d = new Date(f.kickoff);
  const date = Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return (
    <div className="flex items-center gap-2 border-t border-white/5 px-3 py-1.5 text-sm first:border-t-0">
      <span className="w-12 shrink-0 text-xs text-white/40">{date || "—"}</span>
      <span className="flex flex-1 items-center justify-end gap-1.5 text-right">
        <span className="truncate">{homeTeam?.name ?? f.homeCode}</span>
        {homeOwner && <span className="text-[10px] text-gold">({homeOwner})</span>}
        {homeTeam && <img src={flagUrl(homeTeam, 80)} className="h-3.5 w-5 rounded-sm object-cover" />}
      </span>
      <span className="shrink-0 text-white/40">
        {f.status === "finished" ? `${f.homeScore}–${f.awayScore}` : "v"}
      </span>
      <span className="flex flex-1 items-center gap-1.5">
        {awayTeam && <img src={flagUrl(awayTeam, 80)} className="h-3.5 w-5 rounded-sm object-cover" />}
        <span className="truncate">{awayTeam?.name ?? f.awayCode}</span>
        {awayOwner && <span className="text-[10px] text-gold">({awayOwner})</span>}
      </span>
    </div>
  );
}

export function DailyDigest({ game, fixtures }: { game: Game; fixtures: Fixture[] }) {
  // Local calendar date (not UTC) so "today's action" is right in BST etc.
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const digest = buildDailyDigest(
    fixtures,
    game.allocations,
    game.entrants,
    TEAMS_BY_CODE,
    game.scoring,
    today,
    game.captains ?? {}
  );

  const hasAnything =
    digest.headlines.length || digest.todays.length || digest.upcoming.length;
  if (!hasAnything) return null;

  return (
    <div className="mb-4 space-y-3">
      {digest.headlines.length > 0 && (
        <div className="card p-3">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-gold/80">
            Latest headlines
          </h3>
          <ul className="space-y-1.5">
            {digest.headlines.map((h, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span>{h.icon}</span>
                <span className="text-white/80">{h.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {digest.todays.length > 0 && (
        <div className="card overflow-hidden">
          <h3 className="px-3 pt-3 text-xs font-bold uppercase tracking-[0.2em] text-gold/80">
            Today’s action
          </h3>
          <div className="mt-2">
            {digest.todays.map((of) => (
              <FixtureLine key={of.fixture.id} of={of} />
            ))}
          </div>
        </div>
      )}

      {digest.todays.length === 0 && digest.upcoming.length > 0 && (
        <div className="card overflow-hidden">
          <h3 className="px-3 pt-3 text-xs font-bold uppercase tracking-[0.2em] text-gold/80">
            Coming up
          </h3>
          <div className="mt-2">
            {digest.upcoming.map((of) => (
              <FixtureLine key={of.fixture.id} of={of} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
