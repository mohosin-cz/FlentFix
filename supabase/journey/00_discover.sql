-- Branch A discovery. Read-only. Paste the whole thing into the SQL editor and
-- copy the result grid back (CSV / "copy as markdown" both fine).
with t(name) as (values
  ('properties'),('inspections'),('inspection_line_items'),
  ('estimates'),('estimate_items'),('estimate_versions'),('estimate_version_items'),
  ('estimate_disputes'),('estimate_events'),('estimate_activity'),
  ('work_orders'),('work_order_items'),('landlord_invoices'),
  ('property_journey'),('activity_feed'),('task_catalogue'),('vendor_attendance'))
, cols as (
  select 'cols' as section, c.table_name as key,
         string_agg(c.column_name || ':' || c.udt_name
                    || case when c.is_nullable='NO' then '!' else '' end, ', '
                    order by c.ordinal_position) as value
    from information_schema.columns c join t on t.name=c.table_name
   where c.table_schema='public' group by c.table_name)
, fks as (
  select 'fk' as section, tc.table_name as key,
         string_agg(kcu.column_name || '->' || ccu.table_name || '.' || ccu.column_name, ', ') as value
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on kcu.constraint_name=tc.constraint_name and kcu.table_schema=tc.table_schema
    join information_schema.constraint_column_usage ccu on ccu.constraint_name=tc.constraint_name and ccu.table_schema=tc.table_schema
    join t on t.name=tc.table_name
   where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public' group by tc.table_name)
, trg as (
  select 'trigger' as section, event_object_table as key,
         string_agg(distinct trigger_name || '(' || event_manipulation || ')', ', ') as value
    from information_schema.triggers join t on t.name=event_object_table
   where trigger_schema='public' group by event_object_table)
, counts as (
  select 'count' as section, 'properties live' as key, count(*)::text as value
    from properties where deleted_at is null and source is distinct from 'payments_backfill'
  union all select 'count','properties has owner_email', count(owner_email)::text
    from properties where deleted_at is null and source is distinct from 'payments_backfill'
  union all select 'count','inspections', count(*)::text from inspections
  union all select 'count','inspections with owner_email', count(owner_email)::text from inspections
  union all select 'count','estimates', count(*)::text from estimates
  union all select 'count','work_orders', count(*)::text from work_orders
  union all select 'count','work_order_items', count(*)::text from work_order_items
  union all select 'count','landlord_invoices', count(*)::text from landlord_invoices
  union all select 'count','estimate_disputes', count(*)::text from estimate_disputes
  union all select 'count','property_journey', count(*)::text from property_journey
  union all select 'count','estimate_events', count(*)::text from estimate_events
  union all select 'count','estimate_activity', count(*)::text from estimate_activity
  union all select 'count','activity_feed', count(*)::text from activity_feed)
, statuses as (
  select 'status' as section, 'inspections' as key, string_agg(coalesce(status,'∅')||'='||n, ', ') as value
    from (select status, count(*) n from inspections group by 1 order by 2 desc) s
  union all select 'status','estimates', string_agg(coalesce(status,'∅')||'='||n, ', ')
    from (select status, count(*) n from estimates group by 1 order by 2 desc) s
  union all select 'status','estimate_items', string_agg(coalesce(status,'∅')||'='||n, ', ')
    from (select status, count(*) n from estimate_items group by 1 order by 2 desc) s
  union all select 'status','work_orders', string_agg(coalesce(status,'∅')||'='||n, ', ')
    from (select status, count(*) n from work_orders group by 1 order by 2 desc) s
  union all select 'status','work_order_items', string_agg(coalesce(status,'∅')||'='||n, ', ')
    from (select status, count(*) n from work_order_items group by 1 order by 2 desc) s
  union all select 'status','landlord_invoices', string_agg(coalesce(status,'∅')||'='||n, ', ')
    from (select status, count(*) n from landlord_invoices group by 1 order by 2 desc) s
  union all select 'status','properties.stage', string_agg(coalesce(stage,'∅')||'='||n, ', ')
    from (select stage, count(*) n from properties where deleted_at is null group by 1 order by 2 desc) s
  union all select 'status','properties.source', string_agg(coalesce(source,'∅')||'='||n, ', ')
    from (select source, count(*) n from properties group by 1 order by 2 desc) s)
, funcs as (
  select 'func' as section, 'existing journey-ish functions' as key,
         string_agg(p.proname, ', ' order by p.proname) as value
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname ~ '(journey|stage|next_action|property_state)')
, users as (
  select 'count' as section, 'distinct inspection owner_emails' as key,
         string_agg(e||'='||n, ', ') as value
    from (select owner_email e, count(*) n from inspections where owner_email is not null group by 1 order by 2 desc) s)
select * from cols
union all select * from fks
union all select * from trg
union all select * from counts
union all select * from statuses
union all select * from funcs
union all select * from users
order by 1,2;
