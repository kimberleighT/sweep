-- ===========================================================================
-- World Cup Sweepstake — isolated schema inside the YesGaffa Supabase project.
-- ---------------------------------------------------------------------------
-- This is a toy party app, NOT part of YesGaffa. Everything lives in its own
-- `sweepstake` schema and never reads, writes, or alters public.* (YesGaffa's
-- domain).
--
-- Auth model: per-entrant / per-host PIN. There is NO Supabase Auth and NO
-- auth.uid() here. Identity is (join_code, display_name, pin). Tables get RLS
-- enabled with NO policies and NO grants to anon/authenticated, so the ONLY way
-- in is the SECURITY DEFINER RPC layer defined in 0002_sweepstake_rpcs.sql.
--
-- pgcrypto (crypt, gen_salt, gen_random_bytes, gen_random_uuid) is already
-- enabled project-wide by public migration 001_extensions.
-- ===========================================================================

create schema if not exists sweepstake;

-- ---------------------------------------------------------------------------
-- leagues — one sweepstake. join_code is the public, shareable handle.
-- ---------------------------------------------------------------------------
create table sweepstake.leagues (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  join_code      text not null unique,
  host_pin_hash  text not null,                 -- bcrypt; host re-auth credential
  entry_fee      numeric not null default 0,
  currency       text not null default '£',
  scoring_config jsonb not null,                -- the ScoringConfig object verbatim
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- entrants — the players. display_name unique per league; pin is their secret.
-- ---------------------------------------------------------------------------
create table sweepstake.entrants (
  id           uuid primary key default gen_random_uuid(),
  league_id    uuid not null references sweepstake.leagues(id) on delete cascade,
  display_name text not null,
  pin_hash     text not null,                   -- bcrypt
  created_at   timestamptz not null default now(),
  unique (league_id, display_name)
);

-- ---------------------------------------------------------------------------
-- entrant_teams — the draw result. is_captain = double-points team.
-- ---------------------------------------------------------------------------
create table sweepstake.entrant_teams (
  entrant_id uuid not null references sweepstake.entrants(id) on delete cascade,
  team_code  text not null,                     -- FIFA 3-letter code
  is_captain boolean not null default false,
  primary key (entrant_id, team_code)
);

-- ---------------------------------------------------------------------------
-- matches — synced fixtures + results, mirrors the Fixture TS type.
-- ---------------------------------------------------------------------------
create table sweepstake.matches (
  id         uuid primary key default gen_random_uuid(),
  league_id  uuid not null references sweepstake.leagues(id) on delete cascade,
  stage      text not null check (stage in ('group','r32','r16','qf','sf','final')),
  grp        text,                              -- group letter, else null
  kickoff_at timestamptz,
  home_code  text not null,
  away_code  text not null,
  home_score int,
  away_score int,
  status     text not null default 'scheduled'
               check (status in ('scheduled','live','finished')),
  manual     boolean not null default false
);
create index matches_league_idx on sweepstake.matches (league_id);

-- ---------------------------------------------------------------------------
-- bonus_challenges — prediction rounds. answer is null until the host resolves.
-- ---------------------------------------------------------------------------
create table sweepstake.bonus_challenges (
  id         uuid primary key default gen_random_uuid(),
  league_id  uuid not null references sweepstake.leagues(id) on delete cascade,
  kind       text not null check (kind in (
               'top_team','total_goals','biggest_margin',
               'motm','favourite_result','custom')),
  prompt     text not null,
  points     int not null check (points > 0),
  locks_at   timestamptz not null,              -- predictions freeze after this
  answer     text,                              -- set by host once known
  created_at timestamptz not null default now()
);
create index bonus_challenges_league_idx on sweepstake.bonus_challenges (league_id);

-- ---------------------------------------------------------------------------
-- predictions — one row per (challenge, entrant). One Joker per entrant total.
-- ---------------------------------------------------------------------------
create table sweepstake.predictions (
  id           uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references sweepstake.bonus_challenges(id) on delete cascade,
  entrant_id   uuid not null references sweepstake.entrants(id) on delete cascade,
  answer       text not null,
  is_joker     boolean not null default false,
  unique (challenge_id, entrant_id)
);
-- a player may spend their single Joker on at most one challenge
create unique index predictions_one_joker_per_entrant
  on sweepstake.predictions (entrant_id) where is_joker;

-- ---------------------------------------------------------------------------
-- sessions — opaque bearer tokens so the PIN isn't resent on every call.
-- A host session has entrant_id = null; a player session has it set.
-- ---------------------------------------------------------------------------
create table sweepstake.sessions (
  token_hash text primary key,                  -- sha256 hex of the bearer token
  league_id  uuid not null references sweepstake.leagues(id) on delete cascade,
  entrant_id uuid references sweepstake.entrants(id) on delete cascade,
  is_host    boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sessions_entrant_idx on sweepstake.sessions (entrant_id);
create index sessions_league_idx on sweepstake.sessions (league_id);

-- ===========================================================================
-- Lock everything down. RLS on with NO policies blocks every direct REST query
-- from anon/authenticated. We deliberately do NOT add policies — the RPC layer
-- (SECURITY DEFINER, owned by the migration role) is the only authorised path.
-- We do NOT FORCE row level security, so the function owner still bypasses RLS.
-- ===========================================================================
alter table sweepstake.leagues          enable row level security;
alter table sweepstake.entrants         enable row level security;
alter table sweepstake.entrant_teams    enable row level security;
alter table sweepstake.matches          enable row level security;
alter table sweepstake.bonus_challenges enable row level security;
alter table sweepstake.predictions      enable row level security;
alter table sweepstake.sessions         enable row level security;

-- Belt-and-braces: even if the schema is exposed to PostgREST, the API roles
-- get no table privileges. (USAGE on the schema + EXECUTE on the functions is
-- granted in 0002 so the RPCs are callable.)
revoke all on all tables in schema sweepstake from anon, authenticated;
