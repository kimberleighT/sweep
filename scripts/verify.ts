// Standalone sanity checks for the pure engines. Run:
//   node --experimental-strip-types scripts/verify.ts
import { drawSeededPots, describeSplit } from "../src/lib/allocation.ts";
import { buildStandings, DEFAULT_SCORING, managersOfRound, scoreMatchDay } from "../src/lib/scoring.ts";
import { isCorrect, resolveBonusAnswer, scoreBonus } from "../src/lib/challenges.ts";
import { mergeFixtures } from "../src/lib/api.ts";
import { TEAMS } from "../src/data/teams.ts";
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

console.log(failed === 0 ? "\nALL PASS ✅" : `\n${failed} FAILED ❌`);
process.exit(failed === 0 ? 0 : 1);
