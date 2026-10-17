-- Alerts on journey engine v2. Apply after journey_engine_v2.sql.
--
-- Same three functions, same outputs, rewired to the new steps:
--   · alert_window reads each step's own overdue_by — no private copy of the
--     thresholds any more. "Handover overdue" becomes "Setup overdue": work
--     still open past its closure date.
--   · the sweep chases an estimate sitting with supply, and warns the day
--     before a setup (setup_date replaces the old handover date).
--   · the digest counts supply as a waiting lane and treats setup day as today.

begin;

create or replace function public.alert_window(p_scope text default 'me')
returns table (
  category text, pid text, property_name text, headline text, detail text,
  age_days int, overdue_by int, route text, severity text
)
language sql
stable
security definer
set search_path = public
as $$
  with s as (select * from public.property_journey_state(p_scope)),
  thr as (
    select s.pid, s.property_name, s.days_to_setup, x.v as th,
           (x.v->>'age_days')::int as age, (x.v->>'overdue_by')::int as over, (x.v->>'limit_days')::int as lim
      from s cross join lateral jsonb_array_elements(s.open_threads) x(v)
  )

  -- past_sla: a Flent step past its limit, or a planning step too close to setup day
  select 'past_sla', l.pid, l.property_name, l.th->>'label',
         l.th->>'next_action_label'
           || case when l.lim is null and l.days_to_setup is not null
                   then ' · setup ' || case when l.days_to_setup < 0 then 'started ' || -l.days_to_setup || 'd ago'
                                            when l.days_to_setup = 0 then 'is today' else 'in ' || l.days_to_setup || 'd' end
                   else '' end,
         l.age, l.over, l.th->>'next_action_route',
         case when l.lim is null then case when coalesce(l.days_to_setup, 99) <= 0 then 'critical' else 'high' end
              when l.over > 3 * l.lim then 'critical'
              when l.over > l.lim then 'high'
              else 'medium' end
    from thr l
   where l.th->>'urgency' = 'overdue' and l.th->>'waiting_on' = 'setup_ops'

  union all
  -- disputed_twice
  select 'disputed_twice', s.pid, s.property_name,
         'Disputed ' || wi.dispute_count || '×: ' || coalesce(nullif(wi.description, ''), 'item'),
         coalesce(nullif(w.vendor_name, ''), 'Vendor') || ' · ' || coalesce(w.trade, '')
           || case when wi.dispute_reason is not null then ' · ' || left(wi.dispute_reason, 80) else '' end,
         greatest(0, (current_date - coalesce(w.updated_at, w.created_at)::date))::int, null,
         '/properties/' || s.pid || '/work-orders', 'critical'
    from s join work_orders w on w.pid = s.pid join work_order_items wi on wi.work_order_id = w.id
   where wi.status = 'disputed' and wi.dispute_count >= 2

  union all
  -- estimate_silent: with supply or the landlord past its limit
  select 'estimate_silent', l.pid, l.property_name, l.th->>'label',
         l.th->>'next_action_label' || coalesce(' · ' || (l.th->>'note'), ''),
         l.age, l.over, l.th->>'next_action_route',
         case when l.over > 3 * l.lim then 'critical' when l.over > l.lim then 'high' else 'medium' end
    from thr l
   where l.th->>'code' in ('estimate_sent', 'landlord_deciding') and l.over is not null

  union all
  -- scheduled_no_vendor
  select 'scheduled_no_vendor', s.pid, s.property_name,
         coalesce(w.trade, 'Work') || ' dated ' || to_char(coalesce(w.scheduled_end, w.scheduled_start), 'DD Mon') || ', no vendor',
         case when coalesce(w.scheduled_end, w.scheduled_start) < current_date then 'Date has passed'
              when coalesce(w.scheduled_end, w.scheduled_start) = current_date then 'That is today'
              else 'In ' || (coalesce(w.scheduled_end, w.scheduled_start) - current_date) || 'd' end,
         greatest(0, current_date - w.created_at::date)::int, null,
         '/properties/' || s.pid || '/work-orders',
         case when coalesce(w.scheduled_end, w.scheduled_start) <= current_date + 1 then 'critical' else 'high' end
    from s join work_orders w on w.pid = s.pid
   where coalesce(w.scheduled_end, w.scheduled_start) is not null and w.vendor_id is null and w.status <> 'verified'

  union all
  -- setup_overdue: work still open past its closure date
  select 'setup_overdue', l.pid, l.property_name, l.th->>'label', l.th->>'next_action_label',
         l.age, l.age, l.th->>'next_action_route',
         case when l.age > 3 then 'critical' else 'high' end
    from thr l
   where l.th->>'code' = 'wo_overdue'
$$;

create or replace function public.journey_alerts_sweep()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t      jsonb := public.journey_thresholds();
  n_est  int := 0; n_wo int := 0; n_setup int := 0;
  r      record;
begin
  -- a · an estimate sitting with supply
  for r in
    select s.pid, s.property_name, th->>'since' as since, (th->>'age_days')::int as age, th->>'note' as note,
           (select e.id from estimates e where e.pid = s.pid order by e.created_at desc limit 1) as est_id
      from property_journey_state('all') s cross join lateral jsonb_array_elements(s.open_threads) th
     where th->>'code' = 'estimate_sent' and (th->>'age_days')::int >= (t->>'supply_forward_days')::int
  loop
    if r.est_id is null then continue; end if;
    n_est := n_est + notify_property(r.pid, 'estimate_unopened',
      'Estimate with supply for ' || r.age || ' days',
      coalesce(r.property_name, r.pid) || ' · sent ' || to_char(r.since::timestamptz, 'DD Mon') || coalesce(' · ' || r.note, '') || ' · chase supply',
      '/estimate/' || r.est_id,
      'estimate_unopened:' || r.est_id || ':' || (r.age / greatest(1, (t->>'unopened_renotify_days')::int)),
      false);
  end loop;

  -- b · a vendor is due tomorrow
  for r in
    select w.id, w.pid, w.vendor_name, w.trade, w.scheduled_start, w.vendor_id
      from property_journey_state('all') s join work_orders w on w.pid = s.pid
     where w.scheduled_start = current_date + (t->>'execution_lookahead_days')::int
       and w.status in ('draft', 'assigned')
  loop
    n_wo := n_wo + notify_property(r.pid, 'execution_tomorrow',
      case when r.vendor_id is null then 'No vendor for tomorrow''s ' || coalesce(r.trade, 'work') || ' at ' || r.pid
           else coalesce(nullif(r.vendor_name, ''), 'Vendor') || ' due tomorrow: ' || coalesce(r.trade, 'work') || ' at ' || r.pid end,
      'Scheduled ' || to_char(r.scheduled_start, 'DD Mon'),
      '/properties/' || r.pid || '/work-orders',
      'execution_day:' || r.id || ':' || r.scheduled_start, false);
  end loop;

  -- c · setup day is tomorrow
  for r in
    select s.pid, s.property_name, s.setup_date
      from property_journey_state('all') s
     where s.setup_date = current_date + (t->>'execution_lookahead_days')::int
  loop
    n_setup := n_setup + notify_property(r.pid, 'setup_tomorrow',
      'Setup tomorrow at ' || r.pid,
      coalesce(r.property_name, '') || ' · setup ' || to_char(r.setup_date, 'DD Mon') || ' · check vendors and utilities',
      '/properties/' || r.pid,
      'setup:' || r.pid || ':' || r.setup_date, false);
  end loop;

  return jsonb_build_object('estimate_with_supply', n_est, 'execution_tomorrow', n_wo, 'setup_tomorrow', n_setup,
                            'inserted', n_est + n_wo + n_setup, 'at', now());
end
$$;

create or replace function public.your_day_digest(p_scope text default 'me')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me       text := nullif(lower(coalesce(auth.jwt() ->> 'email', '')), '');
  v_scope    text := lower(coalesce(p_scope, 'me'));
  v_baseline timestamptz;
  st         jsonb;
  needs jsonb; today jsonb; waiting jsonb; wrong jsonb; moved jsonb;
  n_sup int; n_ll int; n_v int;
begin
  if v_scope = 'me' and v_me is not null then
    select prev_seen_at into v_baseline from home_seen where user_email = v_me;
  end if;
  v_baseline := coalesce(v_baseline, now() - interval '24 hours');

  select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) into st from public.property_journey_state(p_scope) s;

  select coalesce(jsonb_agg(jsonb_build_object(
           'pid', r->>'pid', 'property_name', r->>'property_name', 'label', r->>'stage_label',
           'action', r->>'next_action_label', 'route', r->>'next_action_route',
           'age_days', (r->>'age_days')::int, 'urgency', r->>'urgency', 'days_to_setup', (r->>'days_to_setup')::int)
           order by case r->>'urgency' when 'overdue' then 0 when 'today' then 1 when 'soon' then 2 else 3 end,
                    (r->>'days_to_setup')::int nulls last, (r->>'age_days')::int desc, r->>'pid'), '[]'::jsonb)
    into needs
    from jsonb_array_elements(st) r
   where r->>'waiting_on' = 'setup_ops' and r->>'urgency' <> 'done';

  select coalesce(jsonb_agg(jsonb_build_object(
           'pid', r->>'pid', 'property_name', r->>'property_name', 'label', x->>'label',
           'action', x->>'next_action_label', 'route', x->>'next_action_route', 'blocked_on', x->>'waiting_on')
           order by r->>'pid'), '[]'::jsonb)
    into today
    from jsonb_array_elements(st) r cross join lateral jsonb_array_elements(r->'open_threads') x
   where x->>'code' = 'setup_day';

  select coalesce(jsonb_agg(jsonb_build_object(
           'pid', r->>'pid', 'property_name', r->>'property_name', 'label', x->>'label',
           'action', x->>'next_action_label', 'route', x->>'next_action_route',
           'blocked_on', x->>'waiting_on', 'age_days', (x->>'age_days')::int, 'urgency', x->>'urgency')
           order by case x->>'waiting_on' when 'supply' then 0 when 'landlord' then 1 else 2 end,
                    case x->>'urgency' when 'overdue' then 0 when 'soon' then 1 else 2 end,
                    (x->>'age_days')::int desc, r->>'pid'), '[]'::jsonb),
         count(*) filter (where x->>'waiting_on' = 'supply'),
         count(*) filter (where x->>'waiting_on' = 'landlord'),
         count(*) filter (where x->>'waiting_on' = 'vendor')
    into waiting, n_sup, n_ll, n_v
    from jsonb_array_elements(st) r cross join lateral jsonb_array_elements(r->'open_threads') x
   where x->>'waiting_on' in ('supply', 'landlord', 'vendor') and x->>'urgency' <> 'done';

  select coalesce(jsonb_agg(jsonb_build_object(
           'category', category, 'pid', pid, 'property_name', property_name, 'headline', headline,
           'detail', detail, 'age_days', age_days, 'overdue_by', overdue_by, 'route', route, 'severity', severity)
           order by case severity when 'critical' then 0 when 'high' then 1 else 2 end, age_days desc, pid), '[]'::jsonb)
    into wrong
    from public.alert_window(p_scope);

  select coalesce(jsonb_agg(jsonb_build_object(
           'pid', r->>'pid', 'property_name', r->>'property_name', 'label', x->>'label',
           'route', x->>'next_action_route', 'blocked_on', x->>'waiting_on',
           'since', x->>'since', 'age_days', (x->>'age_days')::int)
           order by (x->>'since')::timestamptz desc), '[]'::jsonb)
    into moved
    from jsonb_array_elements(st) r cross join lateral jsonb_array_elements(r->'open_threads') x
   where (x->>'since')::timestamptz > v_baseline and x->>'urgency' <> 'done';

  return jsonb_build_object(
    'scope', v_scope, 'generated_at', now(), 'baseline', v_baseline,
    'greeting_counts', jsonb_build_object(
      'total', jsonb_array_length(st), 'needs_you', jsonb_array_length(needs), 'today', jsonb_array_length(today),
      'waiting', jsonb_array_length(waiting), 'waiting_supply', coalesce(n_sup, 0),
      'waiting_landlord', coalesce(n_ll, 0), 'waiting_vendor', coalesce(n_v, 0),
      'going_wrong', jsonb_array_length(wrong), 'moved_recently', jsonb_array_length(moved)),
    'needs_you', needs, 'today', today, 'waiting', waiting, 'going_wrong', wrong, 'moved_recently', moved);
end
$$;

revoke all on function public.alert_window(text) from public, anon;
revoke all on function public.journey_alerts_sweep() from public, anon;
revoke all on function public.your_day_digest(text) from public, anon;
grant execute on function public.alert_window(text) to authenticated;
grant execute on function public.journey_alerts_sweep() to authenticated;
grant execute on function public.your_day_digest(text) to authenticated;

commit;

select category, severity, count(*) from public.alert_window('all') group by 1, 2 order by 1, 2;
