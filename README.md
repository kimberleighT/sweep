# World Cup Sweepstake League ⚽

A no-backend party app for running a **World Cup 2026 sweepstake** as a
live mini-league. Pick the number of entrants, watch an animated
**seeded-pot draw** share the 48 teams out fairly, then track a running
**league table** that scores every match until the final.

## How it works

1. **Setup** — name the league, choose 2–24 entrants, type their names.
2. **Draw** — teams are split into 4 strength pots and dealt one-per-pot,
   round-robin, so everyone gets a balanced spread. An animated reveal
   flips each flag and drops it into an entrant's column. Tap-by-tap or
   "Auto-draw all".
3. **League** — points accrue per match for every team you own:
   - **Win +3, Draw +1, +1 per goal scored**
   - **Progression bonuses**: reach R32 +2, R16 +5, QF +10, SF +15,
     Final +25, **win it +40**
   - Defaults live in `src/lib/scoring.ts` (`DEFAULT_SCORING`).
4. **Results** — "Sync results" pulls fixtures/scores from TheSportsDB
   (free, no key needed). Every fixture also has **manual score entry**
   as a fallback, and you can add results by hand.
   - **Knockouts build themselves.** Once every group's results are in,
     hit **"Generate knockouts"** — it reads the group tables, works out
     the 12 winners/runners-up + the 8 best third-placed teams, fills the
     Round of 32, and (each time you press it after entering a round's
     scores) advances the bracket through R16 → QF → SF → Final. No API
     needed — the knockout pairings are computed from your results, since
     the feed can't supply games that haven't been drawn yet. See
     `src/lib/bracket.ts`.
5. **Bonus** — run prediction rounds alongside the sweepstake (see below).

### Fun extras

- **The draw is an event** — slot-machine flag spinning, synthesised
  sound (tick / ding / airhorn for a Pot 1 heavyweight / closing
  fanfare, mute toggle), confetti bursts, and a fullscreen **Presentation
  mode** for running it on a TV.
- **Power ranking & verdicts** — the moment the draw finishes, squads are
  ranked by pot strength with cheeky titles (🏆 favourite, 🥄 wooden
  spoon, 🎲 rolling the dice, 🐎 dark horse). Also its own tab in the
  league.
- **Daily headlines** — after each results sync: biggest win, the day's
  top entrant, hat-trick hauls, plus a "today's action / coming up" panel
  showing whose teams play and when.
- **Bonus prediction challenges** — the **Bonus** tab lets the host run
  prediction rounds to keep everyone engaged: *highest-scoring team of the
  round*, *total goals in a round*, *biggest winning margin*, *player of the
  match*, *will the favourite win/draw/lose*, or a free-text custom question.
  Each challenge has **points** and a **lock time** (kickoff) — once it passes,
  predictions freeze. The host enters the correct answer to **award** points,
  which flow straight into the league table (shown as `🃏+N` next to the
  entrant). Every player also gets **one Joker** (🃏) to double a single
  prediction. Combines the luck of the draw with skill. (Single-device for now;
  the Supabase backend will let each player submit their own picks privately.)
- **Captain (double points)** — tap any of your teams in the league table
  to make it captain; it scores 2×.
- **Prize pot** — set an entry fee at setup; the table shows the pot and
  who's on for the money (👑 leader / 🥄 wooden spoon).
- **Shareable PNG** — "📤 Share" exports the standings as an image (native
  share sheet on mobile, download on desktop) to drop in the group chat.

All state is saved in the browser's `localStorage` — it lives on the
device you set it up on. No accounts, no server, no database.

## Run it

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm build      # static bundle in dist/ — deploy anywhere
```

## Verify the engines

```bash
node --experimental-strip-types scripts/verify.ts
```

## Notes / things to confirm before kickoff

- **Team list** (`src/data/teams.ts`) is a best-effort 48 with pot
  seedings — edit it to match the official line-up and the final pots.
- **Results API** (`src/lib/api.ts`) uses TheSportsDB's World Cup league
  id + season; confirm `API.leagueId` / `API.season` against live 2026
  data. If a sync returns nothing, manual entry covers you.
- Knockout penalty-shootout winners aren't represented by the score
  alone — a level knockout score leaves the winner undecided, so the
  bracket won't advance past it. Enter the decisive (post-pens) scoreline,
  or add the next-round tie by hand, to push through.
- The best-eight-thirds → R32-slot assignment is solved as a constraint
  matching against FIFA's reserved slots, not the official 495-row lookup
  table; it always yields a legal bracket but may differ from FIFA's exact
  tie-break in rare ambiguous cases. The 3rd-place play-off (match 103) is
  deliberately not generated (it shares the `final` stage and would skew
  the champion/finalist bonuses).

## Stack

Vite · React 18 · TypeScript · Tailwind · Framer Motion. Static SPA.
