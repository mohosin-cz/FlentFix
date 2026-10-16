-- Branch F verify. Run AFTER comms_context.sql. Read-only: nothing here writes.
--
-- The SQL editor / `supabase db query` has no JWT. comms_context() is not
-- scoped to the caller, but we impersonate a staff member anyway so the run
-- matches what PostgREST does for the app (and so the grant check below is
-- answered for the roles the app actually uses).
--
-- Prints, in one result set: timing per pid · the sections present · key
-- counts (threads, estimate items, queried/unanswered, work orders, open and
-- sent-back items, verified trades) · who the landlord contact resolved to and
-- from where · the full JSON for each pid (trimmed) · a grant check that anon
-- cannot execute and authenticated can.

select set_config('request.jwt.claims',
                  '{"email":"himanshu@flent.in","role":"authenticated","sub":"verify"}', false);

create temp table if not exists _f_out (ord int, section text, key text, value text);
truncate _f_out;

do $$
declare
  pids text[] := array['218', '251', '264'];
  pid  text;
  t0   timestamptz;
  c    jsonb;
  i    int := 0;
begin
  foreach pid in array pids loop
    i := i + 1;
    t0 := clock_timestamp();
    c  := public.comms_context(pid);
    insert into _f_out values (i * 10 + 0, 'timing', 'comms_context(' || pid || ')',
      round(extract(ms from clock_timestamp() - t0), 1) || ' ms');

    insert into _f_out values (i * 10 + 1, pid, 'sections',
      (select string_agg(k || case when c->k = 'null'::jsonb then '=∅' else '' end, ', ' order by k) from jsonb_object_keys(c) k));

    insert into _f_out values (i * 10 + 2, pid, 'journey',
      coalesce(c->'journey'->>'stage_code', '∅') || ' · ' || coalesce(c->'journey'->>'blocked_on', '∅')
      || ' · ' || coalesce(c->'journey'->>'age_days', '∅') || 'd · threads=' || coalesce(jsonb_array_length(c->'journey'->'threads'), 0)
      || ' [' || coalesce((select string_agg(x->>'code', ',') from jsonb_array_elements(c->'journey'->'threads') x), '') || ']');

    insert into _f_out values (i * 10 + 3, pid, 'landlord contact',
      'name=' || coalesce(c->'property'->>'landlord_name', '∅')
      || ' · phone=' || case when c->'property'->>'landlord_phone' is null then '∅' else 'yes' end
      || ' · email=' || case when c->'property'->>'landlord_email' is null then '∅' else 'yes' end
      || ' · source=' || coalesce(c->'property'->>'contact_source', '∅')
      || ' · route=' || coalesce(c->'property'->>'contact_route', '∅'));

    insert into _f_out values (i * 10 + 4, pid, 'estimate',
      case when c->'estimate' = 'null'::jsonb then '∅'
           else coalesce(c->'estimate'->>'status', '∅') || ' · sent ' || coalesce(left(c->'estimate'->>'sent_at', 10), '∅')
             || ' (' || coalesce(c->'estimate'->>'age_since_sent_days', '∅') || 'd) · counts=' || (c->'estimate'->'counts')::text
             || ' · queried rows=' || jsonb_array_length(c->'estimate'->'queried')
             || ' · unanswered=' || coalesce(c->'estimate'->>'unanswered', '0')
             || ' · pending_names=' || jsonb_array_length(c->'estimate'->'pending_names')
             || ' · token=' || case when c->'estimate'->>'share_token' is null then '∅' else 'yes' end end);

    insert into _f_out values (i * 10 + 5, pid, 'work_orders',
      jsonb_array_length(c->'work_orders') || ' · '
      || coalesce((select string_agg(
             coalesce(w->>'trade', '?') || '/' || coalesce(w->>'vendor_name', '∅') || '/' || coalesce(w->>'status', '?')
             || ' open=' || coalesce(w->>'open_count', '0') || ' back=' || coalesce(w->>'sent_back_count', '0')
             || ' closed=' || coalesce(w->>'closed_unverified', '0') || ' ok=' || coalesce(w->>'verified', '0')
             || ' phone=' || case when w->>'vendor_phone' is null then '∅' else 'yes' end
             || ' token=' || case when w->>'token' is null then '∅' else 'yes' end,
           ' | ') from jsonb_array_elements(c->'work_orders') w), 'none'));

    insert into _f_out values (i * 10 + 6, pid, 'done',
      'verified_trades=' || (c->'done'->'verified_trades')::text
      || ' · last=' || coalesce(left(c->'done'->>'last_verified_at', 10), '∅')
      || ' · all_verified=' || coalesce(c->'done'->>'all_verified', '∅'));

    -- the audience wall: nothing landlord-ish inside work_orders[], no vendor phone outside it
    insert into _f_out values (i * 10 + 7, pid, 'audience wall',
      'wo keys=' || coalesce((select string_agg(distinct k, ',' order by k)
                               from jsonb_array_elements(c->'work_orders') w, jsonb_object_keys(w) k), '∅')
      || ' · landlord keys=' || (select string_agg(k, ',' order by k) from jsonb_object_keys(c->'property') k)
      || ' · cost fields anywhere=' || (c::text ilike '%cost%')::text);

    insert into _f_out values (i * 10 + 8, pid, 'json (first 1500)', left(c::text, 1500));
  end loop;
end $$;

insert into _f_out
select 90, 'grants', r || ' can execute comms_context',
       has_function_privilege(r, 'public.comms_context(text)', 'execute')::text
  from unnest(array['anon', 'authenticated']) r;

insert into _f_out
select 91, 'function', 'security / search_path',
       case when p.prosecdef then 'definer' else 'invoker' end || ' · ' || coalesce(array_to_string(p.proconfig, ' '), 'no config')
       || ' · ' || case p.provolatile when 's' then 'stable' when 'i' then 'immutable' else 'volatile' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'comms_context';

select section, key, value from _f_out order by ord, key;
