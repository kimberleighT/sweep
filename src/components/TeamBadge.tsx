import { flagUrl } from "../data/teams";
import type { Team } from "../types";

export function TeamBadge({
  team,
  size = "md",
}: {
  team: Team;
  size?: "sm" | "md" | "lg";
}) {
  const dim = size === "lg" ? "h-10 w-14" : size === "sm" ? "h-4 w-6" : "h-6 w-9";
  const text = size === "lg" ? "text-lg" : size === "sm" ? "text-xs" : "text-sm";
  return (
    <span className="inline-flex items-center gap-2">
      <img
        src={flagUrl(team)}
        alt={team.name}
        loading="lazy"
        className={`${dim} rounded-sm object-cover ring-1 ring-black/30`}
      />
      <span className={`${text} font-semibold tracking-tight`}>{team.name}</span>
    </span>
  );
}
