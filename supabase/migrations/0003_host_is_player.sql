-- ===========================================================================
-- Make the host a player too.
-- ---------------------------------------------------------------------------
-- Originally the host was a pure admin with no entrant row, so a freshly created
-- league had zero players and the draw couldn't run until two *others* joined.
-- The organiser of a sweepstake normally plays. So: create_league now also
-- creates an entrant for the host, and the host's session carries that
-- entrant_id (plus is_host). `leagues.host_entrant_id` records which entrant is
-- the host so host_login can resume them as that player on another device.
-- ===========================================================================

alter table sweepstake.leagues
  add column if not exists host_entrant_id uuid
    references sweepstake.entrants(id) on delete set null;

-- create_league gains p_host_name and seeds the host entrant. Drop the old
-- 5-arg signature so only the host-as-player version exists.
drop function if exists sweepstake.create_league(text, text, jsonb, numeric, text);

create function sweepstake.create_league(
  p_name text,
  p_host_pin text,
  p_scoring_config jsonb,
  p_entry_fee numeric default 0,
  p_currency text default '£',
  p_host_name text default 'Host'
) returns jsonb
language plpgsql
security definer
set search_path = sweepstake, public, extensions, pg_temp
as $$
declare
  v_code text;
  v_league_id uuid;
  v_entrant_id uuid;
  v_token text;
  v_try int := 0;
  v_name text := coalesce(nullif(trim(p_host_name), ''), 'Host');
begin
  if coalesce(trim(p_host_pin), '') = '' then
    raise exception 'A host PIN is required';
  end if;
  if p_scoring_config is null then
    raise exception 'scoring_config is required';
  end if;

  loop
    v_try := v_try + 1;
    v_code := sweepstake._gen_join_code();
    begin
      insert into sweepstake.leagues
        (name, join_code, host_pin_hash, entry_fee, currency, scoring_config)
      values
        (coalesce(nullif(trim(p_name), ''), 'World Cup Sweepstake'),
         v_code, crypt(p_host_pin, gen_salt('bf')),
         coalesce(p_entry_fee, 0), coalesce(nullif(p_currency, ''), '£'),
         p_scoring_config)
      returning id into v_league_id;
      exit;
    exception when unique_violation then
      if v_try >= 10 then
        raise exception 'Could not allocate a unique join code, please retry';
      end if;
    end;
  end loop;

  -- the host plays too: same PIN doubles as their player PIN
  insert into sweepstake.entrants (league_id, display_name, pin_hash)
  values (v_league_id, v_name, crypt(p_host_pin, gen_salt('bf')))
  returning id into v_entrant_id;

  update sweepstake.leagues set host_entrant_id = v_entrant_id where id = v_league_id;

  v_token := sweepstake._issue_session(v_league_id, v_entrant_id, true);
  return jsonb_build_object(
    'league_id', v_league_id, 'join_code', v_code,
    'token', v_token, 'entrant_id', v_entrant_id);
end;
$$;

-- host_login resumes the host as their player entrant (+ host powers).
create or replace function sweepstake.host_login(p_join_code text, p_host_pin text)
returns jsonb
language plpgsql
security definer
set search_path = sweepstake, public, extensions, pg_temp
as $$
declare
  v_id uuid;
  v_hash text;
  v_ent uuid;
  v_token text;
begin
  select id, host_pin_hash, host_entrant_id into v_id, v_hash, v_ent
    from sweepstake.leagues where join_code = upper(trim(p_join_code));
  if v_id is null then
    raise exception 'No league with that join code';
  end if;
  if crypt(p_host_pin, v_hash) <> v_hash then
    raise exception 'Wrong host PIN';
  end if;
  v_token := sweepstake._issue_session(v_id, v_ent, true);
  return jsonb_build_object('league_id', v_id, 'token', v_token, 'entrant_id', v_ent);
end;
$$;

-- Re-apply the privilege model to all functions (covers the new create_league).
revoke execute on all functions in schema sweepstake from public;
grant execute on all functions in schema sweepstake to anon, authenticated;
revoke execute on function sweepstake._gen_join_code()                     from anon, authenticated;
revoke execute on function sweepstake._issue_session(uuid, uuid, boolean)  from anon, authenticated;
revoke execute on function sweepstake._session(text)                       from anon, authenticated;
revoke execute on function sweepstake._host_session(text)                  from anon, authenticated;
