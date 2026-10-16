-- Branch E verify. Run AFTER journey_alerts.sql. Re-runnable: the sweep is
-- idempotent (dedupe), and nothing else here writes.
--
-- The SQL editor / `supabase db query` has no JWT, so every caller-scoped RPC
-- would see nothing. We impersonate himanshu@flent.in (owns 18 live
-- properties) by setting request.jwt.claims for the session, which is exactly
-- what PostgREST does. Everything below then runs as that person would see it.
--
-- Prints, in one result set: timings · the sweep's insert counts · unread
-- count · the first 10 inbox rows · alert_window counts by category · the
-- digest's keys and greeting counts · the trigger inventory.

select set_config('request.jwt.claims',
                  '{"email":"himanshu@flent.in","role":"authenticated","sub":"verify"}', false);

create temp table if not exists _e_out (ord int, section text, key text, value text);
truncate _e_out;

do $$
declare t0 timestamptz; v jsonb; n int;
begin
  t0 := clock_timestamp();
  v := public.journey_alerts_sweep();
  insert into _e_out values (1, 'timing', 'journey_alerts_sweep()', round(extract(ms from clock_timestamp() - t0), 1) || ' ms');
  insert into _e_out values (2, 'sweep', 'result', v::text);

  t0 := clock_timestamp();
  n := public.notifications_unread_count();
  insert into _e_out values (3, 'timing', 'notifications_unread_count()', round(extract(ms from clock_timestamp() - t0), 1) || ' ms');
  insert into _e_out values (4, 'inbox', 'unread for himanshu@flent.in', n::text);

  t0 := clock_timestamp();
  select count(*) into n from public.alert_window('me');
  insert into _e_out values (5, 'timing', 'alert_window(me) · ' || n || ' rows', round(extract(ms from clock_timestamp() - t0), 1) || ' ms');
  t0 := clock_timestamp();
  select count(*) into n from public.alert_window('all');
  insert into _e_out values (6, 'timing', 'alert_window(all) · ' || n || ' rows', round(extract(ms from clock_timestamp() - t0), 1) || ' ms');

  t0 := clock_timestamp();
  v := public.your_day_digest('me');
  insert into _e_out values (7, 'timing', 'your_day_digest(me)', round(extract(ms from clock_timestamp() - t0), 1) || ' ms');
  insert into _e_out values (8, 'digest', 'keys', (select string_agg(k, ', ' order by k) from jsonb_object_keys(v) k));
  insert into _e_out values (9, 'digest', 'greeting_counts', (v->'greeting_counts')::text);
  insert into _e_out values (10, 'digest', 'needs_you[0]', coalesce((v->'needs_you'->0)::text, '∅'));
  insert into _e_out values (11, 'digest', 'going_wrong[0]', coalesce((v->'going_wrong'->0)::text, '∅'));
end $$;

insert into _e_out
select 20, 'inbox', to_char(created_at, 'DD Mon HH24:MI') || ' · ' || kind || ' · ' || coalesce(pid, '∅'),
       title || case when body is not null then ' — ' || body else '' end || ' → ' || coalesce(route, '∅')
         || case when read_at is null then ' · unread' else '' end
  from public.notifications_list(10);

insert into _e_out
select 30, 'alert_window(me)', category || ' · ' || severity, count(*)::text
  from public.alert_window('me') group by category, severity;

insert into _e_out
select 31, 'alert_window(all)', category || ' · ' || severity, count(*)::text
  from public.alert_window('all') group by category, severity;

insert into _e_out
select 40, 'notifications', 'rows by kind (all users)',
       coalesce(string_agg(kind || '=' || n, ', '), 'none')
  from (select kind, count(*) n from public.notifications group by 1 order by 2 desc) s;

insert into _e_out
select 41, 'notifications', 'rows by user',
       coalesce(string_agg(user_email || '=' || n, ', '), 'none')
  from (select user_email, count(*) n from public.notifications group by 1 order by 2 desc) s;

insert into _e_out
select 50, 'triggers', c.relname, string_agg(t.tgname, ', ' order by t.tgname)
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace ns on ns.oid = c.relnamespace
 where ns.nspname = 'public' and not t.tgisinternal and t.tgname like 'trg_notify_%'
 group by c.relname;

insert into _e_out
select 51, 'thresholds', 'alert keys present',
       (public.journey_thresholds() ? 'unopened_renotify_days')::text || ' / '
       || (public.journey_thresholds() ? 'execution_lookahead_days')::text || ' / '
       || (public.journey_thresholds() ? 'handover_lookahead_days')::text;

insert into _e_out
select 52, 'realtime', 'notifications in supabase_realtime',
       exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'notifications')::text;

insert into _e_out
select 53, 'grants', 'anon can call ' || p.proname,
       has_function_privilege('anon', p.oid, 'execute')::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('journey_alerts_sweep', 'notifications_list', 'notifications_unread_count',
                     'notifications_mark_read', 'notifications_dismiss', 'alert_window', 'your_day_digest', 'notify_property');

select section, key, value from _e_out order by ord, key;
