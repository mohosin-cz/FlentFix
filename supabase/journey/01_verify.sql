-- Branch A verify. Run AFTER journey_engine.sql. Read-only.
-- Prints: timing, counts for each inspector, ownership after backfill, a
-- sample of headline rows, and the version-item statuses the engine does not
-- yet read (so we can decide whether it should).
create temp table if not exists _j_timing (label text, ms numeric);
truncate _j_timing;
do $$
declare t0 timestamptz; n int;
begin
  t0 := clock_timestamp();
  select count(*) into n from public.property_journey_state('all');
  insert into _j_timing values ('property_journey_state(all) · ' || n || ' rows', extract(ms from clock_timestamp() - t0));
  t0 := clock_timestamp();
  perform public.property_journey_counts('all');
  insert into _j_timing values ('property_journey_counts(all)', extract(ms from clock_timestamp() - t0));
end $$;

select 'timing' as section, label as key, round(ms, 1)::text as value from _j_timing
union all
select 'counts', 'all', property_journey_counts('all')::text
union all
select 'counts', e, property_journey_counts(e)::text
  from unnest(array['himanshu@flent.in','mohosin@flent.in','shanafil@flent.in','mayank@flent.in']) e
union all
select 'ownership', 'live properties with owner_email',
       count(owner_email) || ' of ' || count(*)
  from properties where deleted_at is null and source is distinct from 'payments_backfill'
union all
select 'ownership', 'owner_email distribution',
       string_agg(coalesce(owner_email,'∅') || '=' || n, ', ')
  from (select owner_email, count(*) n from properties
         where deleted_at is null and source is distinct from 'payments_backfill'
         group by 1 order by 2 desc) s
union all
select 'version_items', 'item_status values', string_agg(coalesce(item_status,'∅') || '=' || n, ', ')
  from (select item_status, count(*) n from estimate_version_items group by 1 order by 2 desc) s
union all
select 'version_items', 'status values', string_agg(coalesce(status,'∅') || '=' || n, ', ')
  from (select status, count(*) n from estimate_version_items group by 1 order by 2 desc) s
union all
select 'version_items', 'query_reason values', string_agg(coalesce(query_reason,'∅') || '=' || n, ', ')
  from (select query_reason, count(*) n from estimate_version_items group by 1 order by 2 desc) s
union all
select 'sample', pid,
       stage_code || ' · ' || blocked_on || ' · ' || urgency || ' · ' || age_days || 'd · ' ||
       next_action_label || ' → ' || next_action_route || ' · threads=' ||
       (select string_agg(x->>'code', '+') from jsonb_array_elements(open_threads) x)
  from property_journey_state('all')
order by 1, 2;
