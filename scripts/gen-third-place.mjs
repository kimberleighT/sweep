// Regenerate src/data/third-place-allocation.ts from FIFA's official WC2026
// Annex C third-place allocation table (the 495-combination lookup that decides
// which qualifying third-placed group fills each group-winner's Round-of-32
// slot). Source: the Wikipedia template that transcribes Annex C verbatim.
//
//   Run:  node scripts/gen-third-place.mjs
//
// We use the official table rather than computing a matching ourselves because,
// for many combinations, several allocations are individually legal but only
// one matches the real bracket — see src/lib/bracket.ts (assignThirdsToSlots).
import fs from "node:fs";

const WIKI_URL =
  "https://en.wikipedia.org/w/index.php?title=Template:2026_FIFA_World_Cup_third-place_table&action=raw";

// The 8 assignment columns of the table are the group-winner slots, in this
// fixed order; each maps to its Round-of-32 match number.
const SLOT_MATCHES = [79, 85, 81, 74, 82, 77, 87, 80]; // 1A,1B,1D,1E,1G,1I,1K,1L

const res = await fetch(WIKI_URL, { headers: { "User-Agent": "sweepstake-gen/1.0" } });
if (!res.ok) throw new Error(`Wikipedia fetch failed: ${res.status}`);
const wikitext = await res.text();

// Each of the 495 rows starts with `! scope="row" | <n>`; within a row, the
// eight bold letters ('''X''') are the qualifying groups and the eight 3X
// tokens are the per-slot assignments (column order = SLOT_MATCHES).
const rows = wikitext.split(/!\s*scope="row"\s*\|\s*\d+/).slice(1);
const table = {};
for (const r of rows) {
  const bold = [...r.matchAll(/'''([A-L])'''/g)].map((m) => m[1]);
  const asg = [...r.matchAll(/\b3([A-L])\b/g)].map((m) => m[1]);
  if (bold.length === 8 && asg.length === 8 && new Set(bold).size === 8) {
    table[[...new Set(bold)].sort().join("")] = asg.join("");
  }
}

const count = Object.keys(table).length;
if (count !== 495) {
  throw new Error(`Expected 495 combinations, parsed ${count} — aborting.`);
}

const out = `// AUTO-GENERATED — do not edit by hand. Regenerate with:
//   node scripts/gen-third-place.mjs
//
// FIFA WC2026 Annex C: the 495-combination third-place allocation table (which
// qualifying third-placed group fills each group-winner's Round-of-32 slot).
import type { GroupLetter } from "./worldcup2026";

/** R32 match numbers for the 8 third-place slots, in the allocation-string
 * column order (winner slots 1A, 1B, 1D, 1E, 1G, 1I, 1K, 1L). */
export const THIRD_SLOT_MATCHES = [${SLOT_MATCHES.join(", ")}] as const;

/** Sorted set of the 8 qualifying third-placed GROUP letters (e.g. "BDEFGIKL")
 * → the 8 assigned third-place groups, one per slot, in THIRD_SLOT_MATCHES order. */
export const THIRD_PLACE_ALLOCATION: Record<string, string> = ${JSON.stringify(table)};

/** matchNo → GroupLetter for a set of qualifying third-placed groups, or null
 * if the combination isn't in the official table. */
export function officialThirdAllocation(
  qualifying: GroupLetter[],
): Map<number, GroupLetter> | null {
  const key = [...new Set(qualifying)].sort().join("");
  const row = THIRD_PLACE_ALLOCATION[key];
  if (!row || row.length !== 8) return null;
  const out = new Map<number, GroupLetter>();
  THIRD_SLOT_MATCHES.forEach((m, i) => out.set(m, row[i] as GroupLetter));
  return out;
}
`;

const dest = new URL("../src/data/third-place-allocation.ts", import.meta.url);
fs.writeFileSync(dest, out);
console.log(`Wrote ${dest.pathname} (${count} combinations).`);
