-- The setup panel listed only vendors with a work order at the property, so
-- anyone else who punched in there (a helper, an extra cleaner, someone moved
-- over mid-shift) was invisible. 'others' lists them: on site today or on any
-- day since setup, with no work order here.

CREATE OR REPLACE FUNCTION public.property_setup_panel(p_pid text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with p as (select pid, setup_date from properties where pid = p_pid and deleted_at is null),
  wo as (
    select w.vendor_id, max(w.vendor_name) vendor_name, array_agg(distinct w.trade) trades,
           min(coalesce(w.scheduled_end, w.scheduled_start)) closure_date,
           count(wi.*) filter (where coalesce(wi.included, true)) items_total,
           count(wi.*) filter (where coalesce(wi.included, true) and wi.status in ('vendor_closed', 'verified')) items_closed,
           count(wi.*) filter (where wi.status = 'disputed') items_sent_back
      from work_orders w left join work_order_items wi on wi.work_order_id = w.id
     where w.pid = p_pid and w.vendor_id is not null
     group by w.vendor_id
  ),
  today as (
    select va.vendor_id,
           min(va.punched_at) filter (where va.punch_type = 'in') first_in,
           max(va.punched_at) filter (where va.punch_type = 'out') last_out,
           (array_agg(va.punch_type order by va.punched_at desc))[1] last_type
      from vendor_attendance va
     where va.pid = p_pid and (va.punched_at at time zone 'Asia/Kolkata')::date = current_date
     group by va.vendor_id
  ),
  since_setup as (
    select va.vendor_id, count(distinct (va.punched_at at time zone 'Asia/Kolkata')::date) days
      from vendor_attendance va, p
     where va.pid = p_pid and va.punch_type = 'in' and p.setup_date is not null
       and (va.punched_at at time zone 'Asia/Kolkata')::date >= p.setup_date
     group by va.vendor_id
  ),
  -- at the property but on no work order here: punched in today, or on any
  -- day since setup (helpers, a cleaner sent over, someone moved in mid-shift)
  others as (
    select va.vendor_id, max(va.punched_at) filter (where va.punch_type = 'in') last_in
      from vendor_attendance va left join p on true
     where va.pid = p_pid and va.punch_type = 'in' and va.vendor_id is not null
       and ((va.punched_at at time zone 'Asia/Kolkata')::date = current_date
            or (p.setup_date is not null and (va.punched_at at time zone 'Asia/Kolkata')::date >= p.setup_date))
       and not exists (select 1 from wo where wo.vendor_id = va.vendor_id)
     group by va.vendor_id
  )
  select jsonb_build_object(
    'pid', p_pid,
    'setup_date', (select setup_date from p),
    'days_to_setup', (select setup_date - current_date from p),
    'vendors', coalesce((
      select jsonb_agg(jsonb_build_object(
               'vendor_id', wo.vendor_id,
               'name', coalesce(v.full_name, wo.vendor_name, 'Vendor'),
               'trades', wo.trades,
               'closure_date', wo.closure_date,
               'items_total', wo.items_total,
               'items_closed', wo.items_closed,
               'items_sent_back', wo.items_sent_back,
               'first_in_today', t.first_in,
               'last_out_today', t.last_out,
               'on_site_now', coalesce(t.last_type = 'in', false),
               'days_on_site_since_setup', coalesce(ss.days, 0))
             order by (t.first_in is null), coalesce(v.full_name, wo.vendor_name))
        from wo
        left join vendors v on v.id = wo.vendor_id
        left join today t on t.vendor_id = wo.vendor_id
        left join since_setup ss on ss.vendor_id = wo.vendor_id), '[]'::jsonb),
    'others', coalesce((
      select jsonb_agg(jsonb_build_object(
               'vendor_id', o.vendor_id,
               'name', coalesce(v.full_name, 'Vendor'),
               'trades', case when v.trade is not null then jsonb_build_array(v.trade) else '[]'::jsonb end,
               'phone', v.phone,
               'first_in_today', t.first_in,
               'last_out_today', t.last_out,
               'on_site_now', coalesce(t.last_type = 'in', false),
               'last_in', o.last_in,
               'days_on_site_since_setup', coalesce(ss.days, 0))
             order by (t.first_in is null), coalesce(t.last_type = 'in', false) desc, v.full_name)
        from others o
        left join vendors v on v.id = o.vendor_id
        left join today t on t.vendor_id = o.vendor_id
        left join since_setup ss on ss.vendor_id = o.vendor_id), '[]'::jsonb),
    'utilities', jsonb_build_object(
      'wifi', exists (select 1 from property_utilities u where u.pid = p_pid and u.utility_type = 'wifi' and u.status = 'active'),
      'ro',   exists (select 1 from property_utilities u where u.pid = p_pid and u.utility_type = 'water_purifier' and u.status = 'active'),
      'pest', exists (select 1 from property_utilities u where u.pid = p_pid and u.utility_type = 'pest_control' and u.status = 'active')),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
               'at', va.punched_at, 'type', va.punch_type, 'kind', va.kind,
               'vendor', coalesce(v.full_name, 'Vendor'), 'trade', v.trade,
               'assigned', exists (select 1 from work_orders w where w.pid = p_pid and w.vendor_id = va.vendor_id),
               'flag', va.pid_flag)
             order by va.punched_at desc)
        from vendor_attendance va left join vendors v on v.id = va.vendor_id
       where va.pid = p_pid), '[]'::jsonb)
  )
  where exists (select 1 from p)
$function$;
