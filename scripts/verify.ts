// Standalone sanity checks for the pure engines. Run:
//   node --experimental-strip-types scripts/verify.ts
import { drawSeededPots, describeSplit } from "../src/lib/allocation.ts";
import { buildStandings, DEFAULT_SCORING, managersOfRound, scoreMatchDay } from "../src/lib/scoring.ts";
import { isCorrect, resolveBonusAnswer, scoreBonus } from "../src/lib/challenges.ts";
import { mergeFixtures } from "../src/lib/api.ts";
import {
  allGroupsComplete,
  assignThirdsToSlots,
  bestThirdGroups,
  buildKnockoutFixtures,
  computeGroupStandings,
} from "../src/lib/bracket.ts";
import { buildDailyDigest } from "../src/lib/headlines.ts";
import { buildScheduleFixtures, WC2026_TEAMS } from "../src/data/worldcup2026.ts";
import { TEAMS, TEAMS_BY_CODE } from "../src/data/teams.ts";
import type {
  BonusChallenge,
  Entrant,
  Fixture,
  Prediction,
  PredictPick,
  PredictRound,
} from "../src/types.ts";

let failed = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failed++;
}

// ---- dataset ----
check("48 teams in dataset", TEAMS.length === 48);
check("12 teams per pot", [1, 2, 3, 4].every((p) => TEAMS.filter((t) => t.pot === p).length === 12));

// ---- seeded draw ----
const mkEntrants = (n: number): Entrant[] =>
  Array.from({ length: n }, (_, i) => ({ id: `e${i}`, name: `P${i}` }));

for (const n of [2, 5, 6, 7, 8, 13]) {
  const entrants = mkEntrants(n);
  const { picks, allocations } = drawSeededPots(entrants, TEAMS);
  const total = allocations.reduce((s, a) => s + a.teamCodes.length, 0);
  const counts = allocations.map((a) => a.teamCodes.length);
  const spread = Math.max(...counts) - Math.min(...counts);
  const allCodes = allocations.flatMap((a) => a.teamCodes);
  const unique = new Set(allCodes).size;
  check(`n=${n}: all 48 teams allocated`, total === 48 && picks.length === 48);
  check(`n=${n}: no duplicate teams`, unique === 48);
  check(`n=${n}: balanced (max-min ≤ 1 team)`, spread <= 1);
  // each entrant should get a roughly even pot spread (≤1 per pot diff)
  const potBalanced = entrants.every((e) => {
    const codes = allocations.find((a) => a.entrantId === e.id)!.teamCodes;
    const perPot = [1, 2, 3, 4].map(
      (p) => codes.filter((c) => TEAMS.find((t) => t.code === c)!.pot === p).length
    );
    return Math.max(...perPot) - Math.min(...perPot) <= 1;
  });
  check(`n=${n}: each entrant balanced across pots`, potBalanced);

  // every player should get at least one seeded (pot-1) team while seeds last
  const pot1Count = TEAMS.filter((t) => t.pot === 1).length;
  if (n <= pot1Count) {
    const everyoneSeeded = entrants.every((e) =>
      allocations
        .find((a) => a.entrantId === e.id)!
        .teamCodes.some((c) => TEAMS.find((t) => t.code === c)!.pot === 1)
    );
    check(`n=${n}: every player gets a seeded (pot 1) team`, everyoneSeeded);
  }
}

check("describeSplit 8 → even", describeSplit(8, 48) === "6 teams each");
check("describeSplit 5 → remainder", describeSplit(5, 48).includes("get 10"));

// ---- scoring ----
const entrants = mkEntrants(2); // e0, e1
const { allocations } = (() => {
  // hand-pick a known allocation: e0 = BRA, e1 = ARG
  return {
    allocations: [
      { entrantId: "e0", teamCodes: ["BRA"] },
      { entrantId: "e1", teamCodes: ["ARG"] },
    ],
  };
})();

const fixtures: Fixture[] = [
  // group: BRA wins 3-1, ARG draws 2-2
  { id: "1", stage: "group", group: "A", kickoff: "", homeCode: "BRA", awayCode: "GER", homeScore: 3, awayScore: 1, status: "finished" },
  { id: "2", stage: "group", group: "B", kickoff: "", homeCode: "ARG", awayCode: "ESP", homeScore: 2, awayScore: 2, status: "finished" },
  // final: BRA beats ARG 1-0
  { id: "3", stage: "final", group: null, kickoff: "", homeCode: "BRA", awayCode: "ARG", homeScore: 1, awayScore: 0, status: "finished" },
];

const rows = buildStandings(entrants, allocations, fixtures, DEFAULT_SCORING);
const e0 = rows.find((r) => r.entrant.id === "e0")!;
const e1 = rows.find((r) => r.entrant.id === "e1")!;

// BRA: group win 3 + 3 goals = 6; final win 3 + 1 goal = 4; winnerBonus 40
// reach bonuses: BRA appears in group + final only → reach.final = 25
// e0 = 6 + 4 + 40 + 25 = 75
check("BRA owner points = 75", e0.points === 75);
check("BRA owner bonus = 65 (final reach 25 + winner 40)", e0.bonus === 65);
// ARG: group draw 1 + 2 goals = 3; final loss 0 + 0 goals = 0; reach.final 25
// e1 = 1 + 2 + 25 = 28
check("ARG owner points = 28", e1.points === 28);
check("leader is BRA owner", rows[0]!.entrant.id === "e0");
check("BRA still alive after winning final", e0.alive === 1);
check("ARG eliminated after losing final", e1.alive === 0);

// captain doubles BRA's contribution: 75 -> 150
const capRows = buildStandings(entrants, allocations, fixtures, DEFAULT_SCORING, {
  e0: "BRA",
});
check("captain doubles BRA owner to 150", capRows.find((r) => r.entrant.id === "e0")!.points === 150);

// ---- bonus challenges (auto-resolved from results) ----
check("isCorrect: number match", isCorrect("total_goals", "8", "8") === true);
check("isCorrect: number mismatch", isCorrect("total_goals", "8", "7") === false);
check("isCorrect: team match", isCorrect("top_scoring_team", "BRA", "BRA") === true);
check("isCorrect: team mismatch", isCorrect("top_scoring_team", "BRA", "ARG") === false);
check("isCorrect: blank never correct", isCorrect("total_goals", "", "8") === false);

// Auto-resolution over the group fixtures above: BRA 3-1 GER, ARG 2-2 ESP.
const mk = (id: string, kind: BonusChallenge["kind"], scope: BonusChallenge["scope"]): BonusChallenge =>
  ({ id, kind, scope, prompt: "", points: 5, locksAt: "2026-06-01T00:00:00Z", answer: null, createdAt: "" });
check("resolve: group total goals = 8", resolveBonusAnswer(mk("g", "total_goals", "group"), fixtures) === "8");
check("resolve: group top team = BRA", resolveBonusAnswer(mk("t", "top_scoring_team", "group"), fixtures) === "BRA");
check("resolve: group draws = 1", resolveBonusAnswer(mk("d", "total_draws", "group"), fixtures) === "1");
check("resolve: group biggest margin = 2", resolveBonusAnswer(mk("m", "biggest_margin", "group"), fixtures) === "2");
check("resolve: r16 unresolved (no fixtures) → null", resolveBonusAnswer(mk("u", "total_goals", "r16"), fixtures) === null);
check("resolve: group one-goal games = 0", resolveBonusAnswer(mk("o", "one_goal_games", "group"), fixtures) === "0");
check("resolve: group goal-fests (3+) = 2", resolveBonusAnswer(mk("h", "high_scoring_games", "group"), fixtures) === "2");

// ---- manager of the round ----
const mgrs = managersOfRound(entrants, allocations, fixtures, DEFAULT_SCORING);
check("manager: two rounds have a winner (group + final)", mgrs.length === 2);
check("manager: group round won by BRA owner", mgrs.find((m) => m.stage === "group")!.entrant.id === "e0");
check("manager: final round won by BRA owner", mgrs.find((m) => m.stage === "final")!.entrant.id === "e0");

// ---- match day predictions (exact=6, result=3, miss=0) ----
const mdRound: PredictRound = { id: "r1", gameDate: "2026-06-11", locksAt: "2026-06-01T00:00:00Z", pointsResult: 3, pointsScore: 6 };
const mdPicks: PredictPick[] = [
  { roundId: "r1", entrantId: "e0", matchId: "1", homeScore: 3, awayScore: 1 }, // exact (BRA 3-1 GER) → 6
  { roundId: "r1", entrantId: "e1", matchId: "1", homeScore: 2, awayScore: 0 }, // home win, not exact → 3
  { roundId: "r1", entrantId: "e2", matchId: "2", homeScore: 1, awayScore: 0 }, // ARG-ESP was 2-2 draw → 0
  { roundId: "r1", entrantId: "e3", matchId: "3", homeScore: null, awayScore: null }, // no pick → 0
];
const md = scoreMatchDay([mdRound], mdPicks, fixtures);
check("matchday: exact score = 6", md.e0 === 6);
check("matchday: correct result = 3", md.e1 === 3);
check("matchday: wrong result = 0", (md.e2 ?? 0) === 0);

const challenges: BonusChallenge[] = [
  mk("g", "total_goals", "group"), // answer "8"
  mk("t", "top_scoring_team", "group"), // answer "BRA"
  mk("u", "total_goals", "r16"), // unresolved
];
const predictions: Prediction[] = [
  { challengeId: "g", entrantId: "e0", answer: "8", joker: false }, // +5
  { challengeId: "t", entrantId: "e0", answer: "BRA", joker: true }, // +10 (jokered)
  { challengeId: "g", entrantId: "e1", answer: "7", joker: false }, // wrong
  { challengeId: "u", entrantId: "e1", answer: "5", joker: false }, // unresolved → 0
];
const bonus = scoreBonus(challenges, predictions, fixtures);
check("bonus: e0 = 5 + (5×2 joker) = 15", bonus.e0 === 15);
check("bonus: e1 = 0 (wrong + unresolved)", (bonus.e1 ?? 0) === 0);

// bonus points flow into the league table
const bonusRows = buildStandings(entrants, allocations, fixtures, DEFAULT_SCORING, {}, bonus);
check("standings: e0 picks up +15 prediction points (75→90)", bonusRows.find((r) => r.entrant.id === "e0")!.points === 90);
check("standings: predictionPoints surfaced on row", bonusRows.find((r) => r.entrant.id === "e0")!.predictionPoints === 15);

// ---- fixture merge dedupe (schedule + API are the same match, diff ids) ----
const sched: Fixture[] = [
  { id: "wc:1", stage: "group", group: "A", kickoff: "2026-06-11T00:00:00", homeCode: "MEX", awayCode: "RSA", homeScore: null, awayScore: null, status: "scheduled" },
];
const apiRows: Fixture[] = [
  { id: "api:1", stage: "group", group: null, kickoff: "2026-06-11T19:00:00", homeCode: "RSA", awayCode: "MEX", homeScore: 1, awayScore: 2, status: "finished" },
];
const mergedFx = mergeFixtures(sched, apiRows);
check("merge: same match isn't duplicated", mergedFx.length === 1);
check("merge: score oriented to existing home/away", mergedFx[0]!.homeScore === 2 && mergedFx[0]!.awayScore === 1);
const deduped = mergeFixtures(sched, [...sched, ...apiRows]); // base + (dup + api)
check("merge: collapses pre-existing duplicate", deduped.length === 1);

// ---- knockout bracket engine ----
// A fully-played group stage where the stronger (lower pot) team always wins,
// so every group settles to a clean 1st(pot1) / 2nd(pot2) / 3rd(pot3) / 4th.
const potByCode = new Map(WC2026_TEAMS.map((t) => [t.code, t.pot]));
const goalsFor = (code: string) => 4 - (potByCode.get(code) ?? 4); // pot1→3 … pot4→0
const groupFx: Fixture[] = buildScheduleFixtures().map((f) => ({
  ...f,
  homeScore: goalsFor(f.homeCode),
  awayScore: goalsFor(f.awayCode),
  status: "finished" as const,
}));

check("bracket: a partial group stage is not complete", !allGroupsComplete(groupFx.slice(0, 10)));
check("bracket: full group stage is complete", allGroupsComplete(groupFx));

const standings = computeGroupStandings(groupFx);
check("bracket: 12 group tables", standings.size === 12);
const groupA = standings.get("A")!;
check("bracket: group sorted, 4 teams ranked 1–4", groupA.length === 4 && groupA[3]!.rank === 4);
check("bracket: strongest (pot 1) tops the group", potByCode.get(groupA[0]!.code) === 1);

const thirds = bestThirdGroups(standings);
check("bracket: exactly 8 best third-placed groups", thirds.length === 8);
const slotMap = assignThirdsToSlots(thirds);
check("bracket: all 8 thirds matched to reserved R32 slots", slotMap.size === 8);
const slotGroupsLegal = [...slotMap.values()].every((g) => thirds.includes(g));
check("bracket: every assigned slot holds a qualifying third", slotGroupsLegal);

const r32only = buildKnockoutFixtures(groupFx);
check("bracket: R32 generated once groups complete (16 ties)", r32only.length === 16);
check("bracket: all generated ties are R32 with concrete teams", r32only.every((f) => f.stage === "r32" && !!f.homeCode && !!f.awayCode));
check("bracket: nothing generated mid-group-stage", buildKnockoutFixtures(groupFx.slice(0, 40)).length === 0);

// Play the R32 (home wins every tie) → the R16 should now resolve.
let withR32 = mergeFixtures(groupFx, r32only);
withR32 = withR32.map((f) =>
  f.stage === "r32" ? { ...f, homeScore: 1, awayScore: 0, status: "finished" as const, manual: true } : f
);
const advanced = buildKnockoutFixtures(withR32);
const r16 = advanced.filter((f) => f.stage === "r16");
check("bracket: R16 advances off entered R32 results (8 ties)", r16.length === 8);
check("bracket: R16 home teams are all R32 home winners", r16.every((f) => r32only.some((r) => r.homeCode === f.homeCode)));
check("bracket: re-running preserves entered scores (no dup R32)", mergeFixtures(withR32, advanced).filter((f) => f.stage === "r32").length === 16);

// ---- headline scoreline orientation (away win) ----
const hlFixtures: Fixture[] = [
  { id: "h1", stage: "group", group: "J", kickoff: "2026-06-27T00:00:00", homeCode: "ALG", awayCode: "AUT", homeScore: 1, awayScore: 3, status: "finished" },
];
const digest = buildDailyDigest(
  hlFixtures,
  [{ entrantId: "e0", teamCodes: ["AUT"] }],
  [{ id: "e0", name: "Vince" }],
  TEAMS_BY_CODE,
  DEFAULT_SCORING,
  "2026-06-27"
);
const bigWin = digest.headlines.find((h) => h.text.includes("Austria"));
check("headline: away win is oriented to the winner (Austria 3–1 v Algeria)", !!bigWin && bigWin.text.includes("3–1") && bigWin.text.includes("Austria") && bigWin.text.indexOf("Austria") < bigWin.text.indexOf("Algeria"));

// ---- enriched headlines: league race + upsets + survival ----
// Three entrants, a tight top two and a knockout giant-killing on the latest day.
const hlEnt = [
  { id: "a", name: "Ana" },
  { id: "b", name: "Ben" },
  { id: "c", name: "Cat" },
];
const hlAlloc = [
  { entrantId: "a", teamCodes: ["BRA", "MAR"] }, // MAR (pot 2) will dump BRA-less... see below
  { entrantId: "b", teamCodes: ["ARG"] },
  { entrantId: "c", teamCodes: ["JPN"] },
];
const richFx: Fixture[] = [
  // group day: Brazil batter someone for a clear leader + a goal haul
  { id: "g1", stage: "group", group: "C", kickoff: "2026-06-20T00:00:00", homeCode: "BRA", awayCode: "HAI", homeScore: 4, awayScore: 0, status: "finished" },
  { id: "g2", stage: "group", group: "J", kickoff: "2026-06-20T00:00:00", homeCode: "ARG", awayCode: "ALG", homeScore: 2, awayScore: 1, status: "finished" },
  // knockout day: Morocco (pot 2) knocks Argentina (pot 1) OUT — upset + elimination
  { id: "k1", stage: "r32", group: null, kickoff: "2026-06-28T00:00:00", homeCode: "MAR", awayCode: "ARG", homeScore: 1, awayScore: 0, status: "finished" },
  { id: "k2", stage: "r32", group: null, kickoff: "2026-07-01T00:00:00", homeCode: "JPN", awayCode: "BRA", homeScore: null, awayScore: null, status: "scheduled" },
];
const richDigest = buildDailyDigest(richFx, hlAlloc, hlEnt, TEAMS_BY_CODE, DEFAULT_SCORING, "2026-06-28");
check("headline: a league-leader line is always present", richDigest.headlines.some((h) => h.icon === "👑"));
check("headline: knockout giant-killing surfaces", richDigest.headlines.some((h) => h.text.includes("dumped") && h.text.includes("OUT")));
check("headline: latest day drives the feed (28 Jun, not 20 Jun)", richDigest.date === "2026-06-28");
check("headline: feed is capped at 5", richDigest.headlines.length <= 5);
check("headline: no duplicate headline text", new Set(richDigest.headlines.map((h) => h.text)).size === richDigest.headlines.length);

console.log(failed === 0 ? "\nALL PASS ✅" : `\n${failed} FAILED ❌`);
process.exit(failed === 0 ? 0 : 1);
