# World Cup Sweepstake — Supabase Migration Plan & Handoff

> **Status:** backend + client **built** (2026-06-10). The `sweepstake` schema,
> its PIN-gated RPC layer, the supabase-js data layer, and the full League-mode
> UI (lobby + room) are in the repo and compile/build green. **Not yet verified
> end-to-end** — that needs the two deploy steps in §9 (Supabase env + exposing
> the schema). Quick-play (localStorage) is unchanged and still the default.
>
> **Two decisions below were overridden — see §0.**
>
> Last updated: 2026-06-10.

---

## 0. Overrides to this doc (read first)

This plan originally assumed a standalone Supabase project with anonymous auth.
Two calls changed that; the build follows the overrides, not the original text:

1. **Reuse the YesGaffa Supabase database, walled off in its own `sweepstake`
   schema** (not a standalone project, and definitely not YesGaffa's `public`).
   Supersedes decision #2 below. Nothing touches YesGaffa's tables; the only
   project-level change is exposing the `sweepstake` schema to the API (§9).
2. **Per-entrant / per-host PIN identity, via a SECURITY DEFINER RPC gateway —
   no Supabase Auth at all.** Supersedes decision #1 below (anonymous auth).
   Tables are RLS-locked with no policies and no anon grants; every read/write
   goes through `sweepstake.*` functions that verify a PIN (bcrypt) and mint an
   opaque bearer token. This needs **zero** change to YesGaffa's auth and makes
   identity portable across devices (the "anonymous-auth durability" open item).

Implementation: `supabase/migrations/0001_sweepstake_schema.sql`,
`0002_sweepstake_rpcs.sql`, `src/lib/db.ts`, `src/lib/session.ts`, and the
`League*` / `LocalGame` components. The scoring engine is untouched and still the
single source of truth (computed client-side over rows from `get_league_state`).

---

## 1. Where we are right now

The app is a **no-backend, single-device** party app: all state lives in the
browser's `localStorage` via the `Game` object (`src/lib/storage.ts`). It runs as
a static Vite SPA. Dev server currently on `http://localhost:4000`.

### Just built (local only, not committed)
The **bonus prediction challenges + Joker** feature — the part of the original
feedback that wasn't already in the app. See `README.md` → "Bonus prediction
challenges" for the user-facing description.

Key point for the migration: **this feature was deliberately designed to port
1:1 to the planned Supabase tables.** The data shapes and the scoring function
move across unchanged.

| Local artifact | Maps to (Supabase) |
|---|---|
| `BonusChallenge` (`src/types.ts`) | `bonus_challenges` table |
| `Prediction` (`src/types.ts`) | `predictions` table |
| `scoreBonus()` (`src/lib/challenges.ts`) | edge function or Postgres function |
| `game.challenges` / `game.predictions` (on `Game`) | rows keyed by `league_id` |
| `isLocked()` / `locksAt` | `locks_at` column + RLS time gate |

The whole scoring layer is **pure functions** (`src/lib/scoring.ts`,
`src/lib/challenges.ts`) with standalone tests in `scripts/verify.ts`
(`node --experimental-strip-types scripts/verify.ts`). Keep it that way — it's
what makes the server move cheap.

---

## 2. Decisions locked (do not relitigate)

1. ~~**Auth model: league code + display name** via Supabase **anonymous
   auth** (`signInAnonymously()`).~~ **SUPERSEDED (§0.2)** — replaced by
   per-entrant/host PIN + an RPC gateway. No Supabase Auth, no `auth.uid()`.
2. ~~**Standalone Supabase project — NOT the Wescom CRM project.**~~
   **SUPERSEDED (§0.1)** — reuse the YesGaffa Supabase project, isolated in a
   dedicated `sweepstake` schema. Still touches nothing outside that schema.
3. **Server is authoritative for scoring.** `scoreBonus` / `buildStandings` stay
   the canonical engine but run server-side on results/answer changes; clients
   read computed standings + subscribe via Realtime. No more every-browser-
   recomputes-and-disagrees.
4. **Keep a no-account "quick play" mode.** The current localStorage flow stays
   as a zero-setup demo/solo path. Supabase backs a new "League" mode alongside
   it. Same UI components, swapped data layer.

---

## 3. Target schema (sketch — refine when building)

```
leagues
  id            uuid pk
  name          text
  join_code     text unique           -- short, shareable; public lookup
  entry_fee     numeric default 0
  currency      text default '£'
  scoring_config jsonb                 -- the ScoringConfig object
  created_by    uuid                   -- host's auth.uid()
  created_at    timestamptz

entrants
  id            uuid pk
  league_id     uuid fk -> leagues
  auth_uid      uuid                   -- the player's anonymous auth.uid()
  display_name  text
  unique (league_id, auth_uid)

entrant_teams                          -- the draw result
  entrant_id    uuid fk -> entrants
  team_code     text                   -- FIFA 3-letter
  is_captain    boolean default false
  primary key (entrant_id, team_code)

matches                                -- synced fixtures + results
  id            uuid pk
  league_id     uuid fk -> leagues
  stage         text                   -- group|r32|r16|qf|sf|final
  grp           text null
  kickoff_at    timestamptz
  home_code     text
  away_code     text
  home_score    int null
  away_score    int null
  status        text                   -- scheduled|live|finished
  manual        boolean default false

bonus_challenges
  id            uuid pk
  league_id     uuid fk -> leagues
  kind          text                   -- top_team|total_goals|biggest_margin|motm|favourite_result|custom
  prompt        text
  points        int
  locks_at      timestamptz            -- predictions freeze after this
  answer        text null              -- set by host once known
  created_at    timestamptz

predictions
  id            uuid pk
  challenge_id  uuid fk -> bonus_challenges
  entrant_id    uuid fk -> entrants
  answer        text
  is_joker      boolean default false  -- one true per entrant per league
  points_awarded int null              -- optional cache; or compute in view
  unique (challenge_id, entrant_id)
```

**Standings:** either a SQL view that joins `entrant_teams` + `matches` +
resolved `predictions`, or a recompute that calls the same logic. Whichever, the
arithmetic must match `buildStandings` + `scoreBonus` exactly (the verify tests
are the spec).

---

## 4. RLS rules (the whole reason for the backend)

- **`leagues`**: read by anyone who knows the `join_code` (public-ish read by
  code); write only by `created_by = auth.uid()`.
- **`entrants`**: a player can insert their own row (join), read all entrants in
  their league, update only their own (`auth_uid = auth.uid()`).
- **`entrant_teams` / `matches` / `bonus_challenges`**: read by league members;
  write by host only.
- **`predictions`** — the critical one:
  - read: own predictions always; **others' predictions only after
    `locks_at`** (so nobody copies before kickoff).
  - insert/update: only where `entrant_id` belongs to `auth.uid()` **AND**
    `now() < (select locks_at from bonus_challenges where id = challenge_id)`.
  - Enforce the time gate in **both** an RLS policy and a `BEFORE` trigger
    (belt and braces — RLS for the common path, trigger to be certain).
  - **One Joker per entrant per league**: partial unique index
    `(entrant_id) where is_joker` scoped by league, or a trigger check.

> ⚠️ Watch the `INSERT…RETURNING` + self-referencing-USING-clause trap (this bit
> Wescom — see the agent memory note `feedback_rls_returning_snapshot_trap`).
> Keep prediction-write policies simple and avoid re-querying the same table in
> the USING clause.

---

## 5. Migration path (keeps the app usable throughout)

1. **Spin up the standalone Supabase project.** Capture URL + anon key into a
   `.env` (gitignored). Add `@supabase/supabase-js`.
2. **Write migrations** for the schema in §3 + RLS in §4. Seed nothing.
3. **Data layer swap.** Introduce a `src/lib/db.ts` (Supabase client) and
   React-Query-style hooks mirroring the current `storage.ts` surface
   (`loadGame`/`saveGame` → `useLeague`, `useEntrants`, `usePredictions`…). The
   **components don't change** — they already take `Game`-shaped props.
4. **Mode switch.** Setup screen offers "Quick play (this device)" =
   localStorage, or "Create / join a league" = Supabase. App.tsx branches on mode.
5. **Server scoring.** Move `scoreBonus` + `buildStandings` into an edge function
   (or Postgres function) that recomputes on match-result or challenge-answer
   change; expose standings via a view/RPC. Clients read + subscribe (Realtime).
6. **Results sync server-side.** The current client `fetchSeasonFixtures`
   (TheSportsDB, `src/lib/api.ts`) becomes a scheduled edge function writing to
   `matches`. Manual entry stays for the host.
7. **Player prediction UX.** In League mode, each player sees only their own
   prediction inputs in the Bonus tab (not the host-enters-everyone grid that
   exists now). The host still creates challenges and sets answers.

---

## 6. Open items to decide when we pick this up

- **Scoring location:** edge function (TypeScript, reuse `scoreBonus` verbatim)
  vs Postgres function (SQL, faster/closer to data but a reimplementation).
  Leaning edge function to keep one source of truth.
- **Standings delivery:** materialized table refreshed on write, vs a live view,
  vs compute-in-edge-function-on-read. Depends on league size (party app = small,
  a live view is probably fine).
- **Join code collisions / regeneration** — short codes need a uniqueness retry.
- **Host transfer / multiple admins** — probably out of scope for v1.
- **Offline behaviour** in League mode (Realtime drop) — degrade to last-known.
- **Anonymous-auth durability** — `auth.uid()` is per-device; a player switching
  devices becomes a new identity. Acceptable for v1? If not, revisit auth.

---

## 7. Files that matter (current local build)

- `src/types.ts` — `BonusChallenge`, `Prediction`, `ChallengeKind`; `challenges`/
  `predictions` on `Game`; `predictionPoints` on `StandingRow`.
- `src/lib/challenges.ts` — kinds, presets, `isCorrect`, `isLocked`,
  `jokersUsed`, **`scoreBonus`** (the port target).
- `src/lib/scoring.ts` — `buildStandings` (takes optional
  `predictionPointsByEntrant`), `scoreTeams`, `DEFAULT_SCORING`.
- `src/lib/storage.ts` — the localStorage surface to mirror with DB hooks.
- `src/components/Bonus.tsx` — host UI for challenges/predictions/joker/resolve.
- `src/components/Dashboard.tsx` / `Standings.tsx` — tab wiring + standings display.
- `scripts/verify.ts` — pure-engine tests; **the behavioural spec** the server
  scoring must match. Run: `node --experimental-strip-types scripts/verify.ts`.

---

## 8. Quick-start for the next session

1. Read this doc + `README.md`.
2. `cd worldcup-sweepstake && pnpm install && pnpm dev` → open the **Bonus** tab
   to see the feature that needs a backend.
3. `node --experimental-strip-types scripts/verify.ts` → confirm green baseline.
4. Create the standalone Supabase project, then follow §5 step by step.
   *(Superseded — see §0 and §9. Use the YesGaffa project + `sweepstake` schema.)*

---

## 9. Deploy & verify the League backend (current build)

Everything is written and builds green; these steps light it up against the
**YesGaffa** Supabase project and verify it end-to-end.

**One-time setup**

1. **Apply the migrations** to the YesGaffa project (they only create the
   `sweepstake` schema — nothing in `public` is touched):
   `supabase/migrations/0001_sweepstake_schema.sql` then `0002_sweepstake_rpcs.sql`.
   Run via the SQL editor, `psql`, or the Supabase MCP. pgcrypto is already
   enabled on the project, so the bcrypt/token calls work as-is.
2. **Expose the schema to the API:** Supabase dashboard → Settings → API →
   *Exposed schemas* → add `sweepstake`. (Additive; does not affect YesGaffa.)
   The `0002` migration already grants `usage`/`execute` to `anon`.
3. **Point the app at the project:** copy `.env.example` to `.env` and set
   `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` to the YesGaffa project's
   values. (League mode is hidden in the chooser until these are present.)

**Verify**

- `node --experimental-strip-types scripts/verify.ts` — engine baseline stays
  green (scoring untouched).
- **Isolation:** with the anon key, a direct REST call to a `sweepstake` table
  (`/rest/v1/leagues?select=*` against the schema) is rejected, while the RPCs
  succeed — tables are reachable only through the gateway.
- **PIN gate:** join with a name+PIN, then "join" again with the same name from
  another browser → resumes the same entrant. Wrong PIN → rejected.
- **Lock gate:** a player can save a pick before `locks_at`, not after; other
  players' picks stay hidden in `get_league_state` until the challenge locks.
- **E2E:** `pnpm dev` → Create league (host) → run the draw → Join from a second
  browser profile → players submit predictions → host sets results/answers →
  the table matches the quick-play math for the same inputs.

**Notes / still open** (from §6, not blockers): join-code collisions already
retry; session TTL is 90 days; host transfer is out of scope; PIN brute-force is
acceptable for a party app (add an attempt cap on join if abused). Captains are
host-managed in League mode (`set_captain` is host-only).
