-- ===========================================================================
-- Auto-sync real World Cup results from BBC Sport, every 10 minutes.
--
-- Source of truth = BBC's scores-fixtures JSON feed (the same data the public
-- page renders), filtered to the FIFA World Cup. The host no longer enters
-- results by hand: a pg_cron job pulls the real scores and writes them into
-- sweepstake.matches across ALL leagues.
--
-- Policy (host's choice): BBC OVERRIDES — real results replace whatever is in
-- the game, including manual entries, so every league mirrors the real
-- tournament. One carve-out: a knockout tie that BBC shows level (decided on
-- penalties) is NOT overwritten — the on-field scoreline can't express the
-- penalty winner in this schema, so those are left for the host to resolve and
-- the cron won't fight that manual entry.
--
-- Pure DB: uses the `http` extension (synchronous) + pg_cron. No edge function.
-- ===========================================================================

CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Team-name → internal code map. BBC uses full names ("South Africa",
-- "Bosnia-Herzegovina", "USA", …); we store codes (RSA, BIH, USA). Match on a
-- normalised key (lowercased, non-alphanumerics stripped) so hyphen/space/accent
-- variants all resolve.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sweepstake.team_alias (
  alias_norm text PRIMARY KEY,
  code       text NOT NULL
);

INSERT INTO sweepstake.team_alias (alias_norm, code)
SELECT lower(regexp_replace(name, '[^a-zA-Z0-9]', '', 'g')), code
FROM (VALUES
  ('Mexico','MEX'),('South Africa','RSA'),
  ('South Korea','KOR'),('Korea Republic','KOR'),('Republic of Korea','KOR'),
  ('Czech Republic','CZE'),('Czechia','CZE'),
  ('Canada','CAN'),
  ('Bosnia and Herzegovina','BIH'),('Bosnia-Herzegovina','BIH'),('Bosnia & Herzegovina','BIH'),('Bosnia Herzegovina','BIH'),
  ('Qatar','QAT'),('Switzerland','SUI'),('Brazil','BRA'),('Morocco','MAR'),('Haiti','HAI'),('Scotland','SCO'),
  ('United States','USA'),('USA','USA'),('United States of America','USA'),
  ('Paraguay','PAR'),('Australia','AUS'),
  ('Turkey','TUR'),('Türkiye','TUR'),('Turkiye','TUR'),
  ('Germany','GER'),('Curacao','CUW'),('Curaçao','CUW'),
  ('Ivory Coast','CIV'),('Côte d''Ivoire','CIV'),('Cote d''Ivoire','CIV'),
  ('Ecuador','ECU'),('Netherlands','NED'),('Japan','JPN'),('Sweden','SWE'),('Tunisia','TUN'),
  ('Belgium','BEL'),('Egypt','EGY'),('Iran','IRN'),('IR Iran','IRN'),('New Zealand','NZL'),
  ('Spain','ESP'),('Cape Verde','CPV'),('Cabo Verde','CPV'),('Saudi Arabia','KSA'),('Uruguay','URU'),
  ('France','FRA'),('Senegal','SEN'),('Iraq','IRQ'),('Norway','NOR'),
  ('Argentina','ARG'),('Algeria','ALG'),('Austria','AUT'),('Jordan','JOR'),
  ('Portugal','POR'),('DR Congo','COD'),('Congo DR','COD'),('DR Congo','COD'),('Democratic Republic of Congo','COD'),
  ('Uzbekistan','UZB'),('Colombia','COL'),
  ('England','ENG'),('Croatia','CRO'),('Ghana','GHA'),('Panama','PAN')
) AS t(name, code)
ON CONFLICT (alias_norm) DO NOTHING;

CREATE OR REPLACE FUNCTION sweepstake.code_for_team(p_name text)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT code FROM sweepstake.team_alias
  WHERE alias_norm = lower(regexp_replace(coalesce(p_name, ''), '[^a-zA-Z0-9]', '', 'g'))
  LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- sync_results_from_bbc(start, end): fetch each day's BBC feed, take the
-- finished FIFA World Cup matches, and write real scores onto matching fixtures
-- (any league, oriented to each fixture's own home/away). Returns rows updated.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sweepstake.sync_results_from_bbc(
  p_start date,
  p_end   date DEFAULT current_date
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = sweepstake, public, extensions, pg_temp
AS $$
DECLARE
  v_d    date;
  v_url  text;
  v_body jsonb;
  v_ev   jsonb;
  v_hc   text; v_ac text;
  v_hs   int;  v_as int;
  v_rc   int;
  v_updated int := 0;
  v_urn  text := 'urn%3Abbc%3Asportsdata%3Afootball%3Atournament-collection%3Acollated';
BEGIN
  FOR v_d IN SELECT g::date FROM generate_series(p_start, p_end, interval '1 day') g LOOP
    v_url := format(
      'https://web-cdn.api.bbci.co.uk/wc-poll-data/container/sport-data-scores-fixtures?selectedStartDate=%s&selectedEndDate=%s&todayDate=%s&urn=%s',
      v_d, v_d, v_d, v_urn);

    BEGIN
      SELECT (extensions.http_get(v_url)).content::jsonb INTO v_body;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE; -- a failed/garbled day shouldn't abort the run
    END;
    IF v_body IS NULL THEN CONTINUE; END IF;

    FOR v_ev IN
      SELECT jsonb_path_query(
        v_body,
        '$.**.events[*] ? (@.eventGroupingLabel like_regex "FIFA World Cup")'
      )
    LOOP
      IF (v_ev->>'status') IS DISTINCT FROM 'PostEvent' THEN CONTINUE; END IF;

      v_hc := sweepstake.code_for_team(v_ev->'home'->>'fullName');
      v_ac := sweepstake.code_for_team(v_ev->'away'->>'fullName');
      IF v_hc IS NULL OR v_ac IS NULL THEN CONTINUE; END IF;

      v_hs := COALESCE(NULLIF(v_ev->'home'->'runningScores'->>'extratime', ''),
                       NULLIF(v_ev->'home'->'runningScores'->>'fulltime', ''))::int;
      v_as := COALESCE(NULLIF(v_ev->'away'->'runningScores'->>'extratime', ''),
                       NULLIF(v_ev->'away'->'runningScores'->>'fulltime', ''))::int;
      IF v_hs IS NULL OR v_as IS NULL THEN CONTINUE; END IF;

      UPDATE sweepstake.matches m
      SET home_score = CASE WHEN m.home_code = v_hc THEN v_hs ELSE v_as END,
          away_score = CASE WHEN m.home_code = v_hc THEN v_as ELSE v_hs END,
          status     = 'finished',
          manual     = false
      WHERE ((m.home_code = v_hc AND m.away_code = v_ac)
          OR (m.home_code = v_ac AND m.away_code = v_hc))
        -- leave penalty-decided knockout ties for manual winner entry
        AND NOT (v_hs = v_as AND m.stage <> 'group')
        -- only write when something actually changes (idempotent, no churn)
        AND (m.home_score IS DISTINCT FROM (CASE WHEN m.home_code = v_hc THEN v_hs ELSE v_as END)
          OR m.away_score IS DISTINCT FROM (CASE WHEN m.home_code = v_hc THEN v_as ELSE v_hs END)
          OR m.status IS DISTINCT FROM 'finished');
      GET DIAGNOSTICS v_rc = ROW_COUNT;
      v_updated := v_updated + v_rc;
    END LOOP;
  END LOOP;

  RETURN v_updated;
END;
$$;

-- Cron wrapper: only sweep the dates that still have UNFINISHED matches (so it
-- fetches just the relevant days, and does nothing once the tournament is done).
-- Robust to the bundled schedule's dates not matching the real-world clock.
CREATE OR REPLACE FUNCTION sweepstake.cron_bbc_sync()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = sweepstake, public, extensions, pg_temp
AS $$
DECLARE v_min date; v_max date;
BEGIN
  SELECT min(kickoff_at::date), max(kickoff_at::date)
    INTO v_min, v_max
  FROM sweepstake.matches
  WHERE status <> 'finished' AND kickoff_at IS NOT NULL;

  IF v_min IS NOT NULL THEN
    PERFORM sweepstake.sync_results_from_bbc(v_min, v_max);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION sweepstake.sync_results_from_bbc(date, date) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION sweepstake.cron_bbc_sync() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION sweepstake.code_for_team(text) FROM anon, authenticated, public;

-- Every 10 minutes.
SELECT cron.unschedule('sweepstake-bbc-sync')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sweepstake-bbc-sync');
SELECT cron.schedule('sweepstake-bbc-sync', '*/10 * * * *', $cron$ SELECT sweepstake.cron_bbc_sync(); $cron$);
