-- The property record's timeline — everything that happened to one property,
-- in order, from every module that already logs something. A CRM record page
-- is this: the history down the middle, the related objects down the side.
--
-- Read-only. Nothing new is logged; this only reads what each module already
-- writes (Spine 3 consolidation is separate work).

begin;

create index if not exists work_order_activity_wo_idx on public.work_order_activity (work_order_id, changed_at desc);
create index if not exists property_journey_pid_idx   on public.property_journey (pid, changed_at desc);
create index if not exists vendor_attendance_pid_idx  on public.vendor_attendance (pid, punched_at desc);

drop function if exists public.property_timeline(text, int);
create or replace function public.property_timeline(p_pid text, p_limit int default 400)
returns table (
  at      timestamptz,
  kind    text,     -- inspection · journey · estimate · landlord · work · site · payment · invoice
  title   text,
  detail  text,
  actor   text,
  route   text
)
language sql
stable
security definer
set search_path = public
as $$
  with est as (select id, share_token from estimates where pid = p_pid),
       wo  as (select id, trade, vendor_name, vendor_id from work_orders where pid = p_pid)
  select * from (
    -- inspections
    select i.created_at, 'inspection',
           'Inspection ' || coalesce(i.status, 'draft') || coalesce(' · ' || (i.config ->> 'scope'), ''),
           (select count(*) || ' items' from inspection_line_items li where li.inspection_id = i.id),
           split_part(i.owner_email, '@', 1),
           '/inspections/' || i.id || '/raw'
      from inspections i where i.pid = p_pid

    union all
    -- stage moves logged by hand / by the app
    select j.changed_at, 'journey',
           initcap(replace(j.stage, '_', ' ')),
           j.notes,
           split_part(coalesce(j.changed_by, 'system'), '@', 1),
           null
      from property_journey j where j.pid = p_pid

    union all
    -- estimate lifecycle (sent, viewed, approved, item approvals, replies)
    select ev.created_at,
           case when ev.actor = 'landlord' then 'landlord' else 'estimate' end,
           case ev.event_type
             when 'sent' then 'Estimate sent'
             when 'viewed' then 'Landlord opened the estimate'
             when 'item_approved' then 'Landlord approved ' || coalesce(ev.meta ->> 'name', 'an item')
             when 'approved' then 'Landlord approved the estimate'
             when 'partially_approved' then 'Landlord approved part of the estimate'
             when 'queried' then 'Landlord asked about ' || coalesce(ev.meta ->> 'name', 'an item')
             when 'replied' then 'Reply sent on ' || coalesce(ev.meta ->> 'name', 'a query')
             when 'dispute_resolved' then 'Query resolved' || coalesce(' · ' || (ev.meta ->> 'name'), '')
             else initcap(replace(ev.event_type, '_', ' ')) end,
           ev.meta ->> 'query',
           case when ev.actor in ('landlord', 'flent') then ev.actor else split_part(ev.actor, '@', 1) end,
           '/estimate/' || ev.estimate_id
      from estimate_events ev join est on est.id = ev.estimate_id
     where ev.event_type not in ('queried', 'viewed')   -- disputes carry the message; views are grouped below

    union all
    -- the landlord opening the link: one row per day, not one per page load
    select min(ev.created_at), 'landlord',
           'Landlord opened the estimate' || case when count(*) > 1 then ' · ' || count(*) || '×' else '' end,
           null, 'landlord', '/estimate/' || ev.estimate_id
      from estimate_events ev join est on est.id = ev.estimate_id
     where ev.event_type = 'viewed'
     group by ev.estimate_id, (ev.created_at at time zone 'Asia/Kolkata')::date

    union all
    -- landlord questions and our replies, with the words
    select d.created_at,
           case when d.author_type = 'landlord' then 'landlord' else 'estimate' end,
           case when d.author_type = 'landlord'
                then 'Landlord asked about ' || coalesce(ei.item_name, 'an item')
                else 'Flent replied on ' || coalesce(ei.item_name, 'an item') end,
           left(d.message, 200),
           coalesce(d.author_name, d.author_type),
           '/estimate/' || d.estimate_id || '#row-' || d.estimate_item_id
      from estimate_disputes d join est on est.id = d.estimate_id
      left join estimate_items ei on ei.id = d.estimate_item_id

    union all
    -- work orders: every logged event
    select a.changed_at, 'work',
           wo.trade || ' · ' || replace(a.event, '_', ' '),
           a.detail,
           split_part(coalesce(a.actor, ''), '@', 1),
           '/properties/' || p_pid || '/work-orders#wo-' || wo.id
      from work_order_activity a join wo on wo.id = a.work_order_id

    union all
    -- vendors on site: one row per vendor per day
    select min(va.punched_at), 'site',
           coalesce(v.full_name, 'Vendor') || ' on site',
           count(*) filter (where va.punch_type = 'in') || ' punch-in' || case when count(*) filter (where va.punch_type = 'in') = 1 then '' else 's' end,
           null,
           '/vendors'
      from vendor_attendance va left join vendors v on v.id = va.vendor_id
     where va.pid = p_pid
     group by va.vendor_id, v.full_name, (va.punched_at at time zone 'Asia/Kolkata')::date

    union all
    -- money out
    select coalesce(pp.paid_on::timestamptz, pp.created_at), 'payment',
           '₹' || to_char(pp.amount, 'FM9,99,99,990') || ' ' || lower(pp.kind) || coalesce(' to ' || pp.payee_name, ''),
           coalesce(pp.description, pp.trade) || case when pp.paid_on is null then ' · undated' else '' end,
           split_part(coalesce(pp.created_by, ''), '@', 1),
           '/properties/' || p_pid || '/payments#pay-' || pp.id
      from property_payments pp where pp.pid = p_pid

    union all
    -- invoices
    select li.created_at, 'invoice',
           'Invoice ' || li.invoice_number || ' · ' || coalesce(li.status, 'draft'),
           case when li.total is not null then '₹' || to_char(li.total, 'FM9,99,99,990') end,
           null,
           '/invoice/' || li.inspection_id
      from landlord_invoices li where li.pid = p_pid
  ) t(at, kind, title, detail, actor, route)
  where at is not null
  order by at desc
  limit greatest(1, least(coalesce(p_limit, 400), 2000))
$$;

revoke all on function public.property_timeline(text, int) from public, anon;
grant execute on function public.property_timeline(text, int) to authenticated;

commit;
