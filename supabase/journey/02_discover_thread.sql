-- Branch B discovery. Read-only. The links the thread rides on, and how populated each is.
with t(name) as (values ('property_payments'),('property_payment_items'),('landlord_invoice_items'),
  ('line_item_media'),('work_order_activity'),('vendors'),('payment_payees'))
, cols as (
  select 'cols' as section, c.table_name as key,
         string_agg(c.column_name || ':' || c.udt_name || case when c.is_nullable='NO' then '!' else '' end, ', ' order by c.ordinal_position) as value
    from information_schema.columns c join t on t.name=c.table_name where c.table_schema='public' group by 1,2)
, links as (
  select 'link' as section, 'work_order_items.inspection_line_item_id' as key,
         count(*) || ' items, ' || count(inspection_line_item_id) || ' linked, ' ||
         count(*) filter (where inspection_line_item_id is not null and not exists (select 1 from inspection_line_items l where l.id = wi.inspection_line_item_id)) || ' dangling' as value
    from work_order_items wi
  union all
  select 'link', 'estimate_items.line_item_id',
         count(*) || ' items, ' || count(line_item_id) || ' linked, ' ||
         count(*) filter (where line_item_id is not null and not exists (select 1 from inspection_line_items l where l.id = ei.line_item_id)) || ' dangling'
    from estimate_items ei
  union all
  select 'link', 'estimate_version_items.estimate_item_id',
         count(*) || ' rows, ' || count(estimate_item_id) || ' linked, ' ||
         count(*) filter (where estimate_item_id is not null and not exists (select 1 from estimate_items e where e.id = v.estimate_item_id)) || ' dangling'
    from estimate_version_items v
  union all
  select 'link', 'landlord_invoice_items.wo_item_id / estimate_item_id',
         count(*) || ' lines, ' || count(wo_item_id) || ' via wo_item, ' || count(estimate_item_id) || ' via estimate_item, ' ||
         count(*) filter (where wo_item_id is null and estimate_item_id is null) || ' unlinked'
    from landlord_invoice_items
  union all
  select 'link', 'property_payments.work_order_id',
         count(*) || ' payments, ' ||
         count(*) filter (where to_jsonb(pp) ? 'work_order_id' and (to_jsonb(pp)->>'work_order_id') is not null) || ' with work_order_id, ' ||
         count(*) filter (where source = 'import') || ' imported'
    from property_payments pp
  union all
  select 'link', 'vendor_attendance.pid',
         count(*) || ' punches, ' || count(pid) || ' with pid, ' || count(distinct pid) || ' distinct pids'
    from vendor_attendance
  union all
  select 'link', 'estimate_disputes.estimate_item_id',
         count(*) || ' disputes, ' || count(estimate_item_id) || ' linked'
    from estimate_disputes
  union all
  select 'link', 'work_orders.inspection_id',
         count(*) || ' work orders, ' || count(inspection_id) || ' linked, ' || count(vendor_id) || ' with vendor'
    from work_orders
  union all
  select 'link', 'landlord_invoices.inspection_id',
         count(*) || ' invoices, ' || count(inspection_id) || ' linked'
    from landlord_invoices
  union all
  select 'link', 'inspection_line_items per inspection (live pids)',
         count(*) || ' items across ' || count(distinct inspection_id) || ' inspections'
    from inspection_line_items)
, wo_item_src as (
  select 'wo_items' as section, 'source' as key, string_agg(source || '=' || n, ', ') as value
    from (select source, count(*) n from work_order_items group by 1) s)
select * from cols union all select * from links union all select * from wo_item_src order by 1,2;
