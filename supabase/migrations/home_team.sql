-- Home, admin: the Team view.
--
-- home_team() — admins only (pulse_admins(), home_desk.sql). Everything the
-- journey engine rows do not already carry; the client adds per-person load
-- and the stuck matrix from those rows, so both halves count the same way.
--
--   owners      pid → who it belongs to (assigned_to, else owner_email)
--   people      per person: items waiting on them to verify, last active
--   speed       median days per person, last 60 days vs the 60 before, with n:
--                 inspection → estimate sent   (inspection owner)
--                 estimate sent → approved     (property owner)
--                 setup date → setup closed    (property owner)
--   money       ₹ with landlords (undecided), approved but not invoiced,
--               closed without invoice (30 days)
--   exceptions  things that slipped, each with a count and the worst case
--   vendors     last 60 days: items, sent-back %, median days to close,
--               setup-day no-shows (where a setup date exists)
-- Read-only.

begin;

create or replace function public.home_team()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  out jsonb;
begin
  if not pulse_is_admin() then raise exception 'Only an admin can open the team view'; end if;

  with live as (
    select p.*, lower(coalesce(nullif(btrim(p.assigned_to), ''), p.owner_email)) who,
           coalesce(nullif(btrim(p.name), ''), p.pid) nm
      from properties p
     where p.deleted_at is null and p.source is distinct from 'payments_backfill'
       and p.pid !~* '^\s*no\s*pid\s*$'
       and p.pid !~* '^test'                       -- test properties stay out of team numbers
  ),
  act as (select * from live where journey_paused_at is null and closed_at is null and archived_at is null),   -- still being worked: not paused, closed or archived
  sent as (   -- when each estimate first went to the landlord (sent_at is missing on older rows)
    select es.id, es.pid, es.total, es.status, es.approved_at,
           coalesce(es.sent_at, (select min(x.created_at) from estimate_events x where x.estimate_id = es.id and x.event_type = 'sent'),
                    es.first_viewed_at) sent_at
      from estimates es
  ),

  -- speed ---------------------------------------------------------------
  m_insp as (   -- inspection → first estimate sent for that property
    select lower(i.owner_email) who, i.inspection_date d,
           (select min(s.sent_at) from sent s where s.pid = i.pid and s.sent_at >= i.inspection_date)::date - i.inspection_date days
      from inspections i join live l on l.pid = i.pid
     where i.status = 'completed' and i.owner_email is not null
  ),
  m_appr as (
    select l.who, s.approved_at::date d, s.approved_at::date - s.sent_at::date days
      from sent s join live l on l.pid = s.pid where s.approved_at is not null and s.sent_at is not null
  ),
  m_setup as (
    select l.who, l.setup_closed_at::date d, l.setup_closed_at::date - l.setup_date days
      from live l where l.setup_closed_at is not null and l.setup_date is not null
  ),
  metric as (
    select 'insp_to_sent' k, who, d, days from m_insp
    union all select 'sent_to_approved', who, d, days from m_appr
    -- still waiting: sent, not approved (counted against the send date)
    union all select 'sent_to_approved', l.who, s.sent_at::date, null
                from sent s join live l on l.pid = s.pid
               where s.approved_at is null and s.sent_at is not null and s.status in ('sent', 'viewed', 'partially_approved')
                 and l.estimate_final_at is null and l.closed_at is null
    union all select 'setup_to_closed', who, d, days from m_setup
    union all select 'setup_to_closed', l.who, l.setup_date, null from live l
               where l.setup_date is not null and l.setup_date < today and l.setup_closed_at is null
  ),
  speed as (
    select who, k,
           percentile_cont(0.5) within group (order by days) filter (where d > today - 60 and days is not null)  now_med,
           count(*) filter (where d > today - 60 and days is not null)                       now_n,
           percentile_cont(0.5) within group (order by days) filter (where d <= today - 60 and d > today - 120) prev_med,
           count(*) filter (where d <= today - 60 and d > today - 120 and days is not null)  prev_n,
           count(*) filter (where days is null)                                              open_n
      from metric where who is not null group by who, k
  ),

  -- money ---------------------------------------------------------------
  approved_val as (   -- the approved, priced value of each property's latest estimate
    select distinct on (es.pid) es.pid,
           (select coalesce(sum((coalesce(ei.material_cost, 0) + coalesce(ei.labour_cost, 0)) * greatest(coalesce(ei.qty, 1), 1)), 0)
              from estimate_items ei where ei.estimate_id = es.id and ei.status = 'approved' and ei.cost_type = 'priced') v
      from estimates es order by es.pid, es.created_at desc
  ),
  has_inv as (
    select distinct li.pid from landlord_invoices li where li.status in ('sent', 'paid', 'overdue') and exists (select 1 from landlord_invoice_items ii where ii.invoice_id = li.id)
  ),

  -- vendors -------------------------------------------------------------
  vi as (
    select w.vendor_id, i.*, w.issued_at, w.pid
      from work_order_items i join work_orders w on w.id = i.work_order_id join live l on l.pid = w.pid
     where w.vendor_id is not null and coalesce(i.vendor_closed_at, w.issued_at, i.created_at) > now() - interval '60 days'
  ),
  noshow as (   -- setup days in the window: was each assigned vendor with work there that day?
    select w.vendor_id, count(distinct l.pid) chances,
           count(distinct l.pid) filter (where not exists (
             select 1 from vendor_attendance a where a.vendor_id = w.vendor_id and a.pid = l.pid and a.punch_type = 'in'
              and (a.punched_at at time zone 'Asia/Kolkata')::date = l.setup_date)) missed
      from live l join work_orders w on w.pid = l.pid and w.vendor_id is not null
     where l.setup_date between today - 60 and today - 1
       and not vendor_on_leave(w.vendor_id, l.setup_date)   -- a day on approved leave was never a chance
     group by w.vendor_id
  )

  select jsonb_build_object(
    'owners', coalesce((select jsonb_object_agg(pid, who) from live where who is not null), '{}'),

    'people', coalesce((select jsonb_agg(jsonb_build_object(
        'email', e.who,
        'verify', (select count(*) from work_order_items i join work_orders w on w.id = i.work_order_id join act l on l.pid = w.pid
                    where l.who = e.who and i.status = 'vendor_closed'),
        'verify_oldest', (select min(i.vendor_closed_at) from work_order_items i join work_orders w on w.id = i.work_order_id join act l on l.pid = w.pid
                    where l.who = e.who and i.status = 'vendor_closed'),
        'last_active', greatest(
            (select max(last_sign_in_at) from auth.users u where lower(u.email) = e.who),
            (select last_seen_at from home_seen h where h.user_email = e.who),
            (select max(changed_at) from property_journey j where lower(j.changed_by) = e.who),
            (select max(created_at) from inspections i where lower(i.owner_email) = e.who),
            (select max(created_at) from property_payments pp where lower(pp.created_by) = e.who))))
      from (select distinct who from live where who like '%@flent.in') e), '[]'),

    'speed', coalesce((select jsonb_agg(jsonb_build_object('email', who, 'k', k, 'now', now_med, 'now_n', now_n, 'prev', prev_med, 'prev_n', prev_n, 'open_n', open_n))
                         from speed where who like '%@flent.in'), '[]'),

    'money', jsonb_build_object(
      'with_landlords', (select jsonb_build_object('value', coalesce(sum(s.total), 0), 'n', count(*))
                           from (select distinct on (s.pid) s.* from sent s order by s.pid, s.sent_at desc nulls last) s
                           join act l on l.pid = s.pid
                          where s.status in ('sent', 'viewed', 'partially_approved') and l.estimate_final_at is null and l.closed_at is null
                            and s.sent_at > now() - interval '60 days'),
      'not_invoiced', (select jsonb_build_object('value', coalesce(sum(a.v), 0), 'n', count(*))
                         from act l join approved_val a on a.pid = l.pid
                        where l.estimate_final_at is not null and l.closed_at is null and a.v > 0
                          and not exists (select 1 from has_inv h where h.pid = l.pid)),
      'closed_no_invoice', (select jsonb_build_object('value', coalesce(sum(a.v), 0), 'n', count(*))
                              from act l left join approved_val a on a.pid = l.pid
                             where l.no_invoice_reason is not null and l.closed_at > now() - interval '30 days')),

    'exceptions', jsonb_build_array(
      jsonb_build_object('key', 'exploratory_unassigned', 'sev', 'red', 'title', 'Exploratory visits with nobody from the team',
        'n', (select count(*) from stage_exploratory x where x.status in ('new_request', 'visit_scheduled') and x.archived_at is null
               and x.property_name !~* '^\s*\[test\]' and (x.visit_date >= today or x.created_at > now() - interval '2 days')
               and not exists (select 1 from exploratory_assignments a where a.request_id = x.id)),
        'items', coalesce((select jsonb_agg(jsonb_build_object('pid', null, 'name', x.property_name, 'who', null, 'request_id', x.id,
                   'line', coalesce(to_char(x.visit_date, 'Dy DD Mon') || coalesce(' ' || to_char(x.visit_time, 'HH12:MI am'), ''), 'no slot yet')
                           || coalesce(' · ' || x.configuration, '')) order by x.visit_date nulls last)
                 from stage_exploratory x where x.status in ('new_request', 'visit_scheduled') and x.archived_at is null
                  and x.property_name !~* '^\s*\[test\]' and (x.visit_date >= today or x.created_at > now() - interval '2 days')
                  and not exists (select 1 from exploratory_assignments a where a.request_id = x.id)), '[]')),
      jsonb_build_object('key', 'closed_no_invoice', 'sev', 'red', 'title', 'Closed without a landlord invoice',
        'n', (select count(*) from act where no_invoice_reason is not null and closed_at > now() - interval '30 days'),
        'items', coalesce((select jsonb_agg(jsonb_build_object('pid', pid, 'name', nm, 'who', who,
                   'line', initcap(replace(no_invoice_reason, '_', ' ')) || coalesce(' — ' || no_invoice_note, '')) order by closed_at desc)
                 from act where no_invoice_reason is not null and closed_at > now() - interval '30 days'), '[]')),
      jsonb_build_object('key', 'verify_waiting', 'sev', 'red', 'title', 'Vendor work waiting over 3 days for verification',
        'n', (select count(distinct w.id) from work_order_items i join work_orders w on w.id = i.work_order_id join act l on l.pid = w.pid
               where i.status = 'vendor_closed' and i.vendor_closed_at < now() - interval '3 days'),
        'items', coalesce((select jsonb_agg(x order by x->>'since') from (
                   select jsonb_build_object('pid', l.pid, 'name', l.nm, 'who', l.who,
                          'line', coalesce(max(w.vendor_name), 'Vendor') || ' · ' || count(*) || ' item' || case when count(*) = 1 then '' else 's' end,
                          'since', min(i.vendor_closed_at)) x
                     from work_order_items i join work_orders w on w.id = i.work_order_id join act l on l.pid = w.pid
                    where i.status = 'vendor_closed' and i.vendor_closed_at < now() - interval '3 days'
                    group by w.id, l.pid, l.nm, l.who) z), '[]')),
      jsonb_build_object('key', 'never_opened', 'sev', 'amber', 'title', 'Estimates sent but never opened (3+ days)',
        'n', (select count(*) from (select distinct on (s.pid) s.* from sent s order by s.pid, s.sent_at desc nulls last) s join act l on l.pid = s.pid
               where s.status = 'sent' and s.sent_at < now() - interval '3 days' and s.sent_at > now() - interval '60 days' and l.closed_at is null),
        'items', coalesce((select jsonb_agg(jsonb_build_object('pid', l.pid, 'name', l.nm, 'who', l.who, 'line', 'sent ' || to_char(s.sent_at, 'DD Mon'), 'since', s.sent_at))
                 from (select distinct on (s.pid) s.* from sent s order by s.pid, s.sent_at desc nulls last) s join act l on l.pid = s.pid
                where s.status = 'sent' and s.sent_at < now() - interval '3 days' and s.sent_at > now() - interval '60 days' and l.closed_at is null), '[]')),
      jsonb_build_object('key', 'utilities_stale', 'sev', 'amber', 'title', 'Utilities requested 10+ days ago, never registered',
        'n', (select count(*) from act l where l.closed_at is null and (
               (l.wifi_requested_at < now() - interval '10 days' and coalesce(l.wifi_plan_months, 1) <> 0
                 and not exists (select 1 from property_utilities u where u.pid = l.pid and u.utility_type = 'wifi' and u.status = 'active'))
            or (l.ro_requested_at < now() - interval '10 days' and coalesce(l.ro_plan_months, 1) <> 0
                 and not exists (select 1 from property_utilities u where u.pid = l.pid and u.utility_type = 'water_purifier' and u.status = 'active')))),
        'items', '[]'::jsonb),
      jsonb_build_object('key', 'attendance_flags', 'sev', 'amber', 'title', 'Punches at an unknown or unassigned PID (7 days)',
        'n', (select count(*) from vendor_attendance a where a.pid_flag is not null and a.punched_at > now() - interval '7 days'),
        'items', coalesce((select jsonb_agg(jsonb_build_object('pid', a.pid, 'name', coalesce(v.full_name, 'Vendor'), 'who', null,
                   'line', replace(a.pid_flag, '_', ' ') || ' · ' || to_char(a.punched_at at time zone 'Asia/Kolkata', 'DD Mon HH12:MI am'), 'since', a.punched_at) order by a.punched_at desc)
                 from vendor_attendance a left join vendors v on v.id = a.vendor_id
                where a.pid_flag is not null and a.punched_at > now() - interval '7 days'), '[]')),
      jsonb_build_object('key', 'empty_invoices', 'sev', 'grey', 'title', 'Empty draft landlord invoices',
        'n', (select count(*) from landlord_invoices li where not exists (select 1 from landlord_invoice_items ii where ii.invoice_id = li.id)),
        'items', '[]'::jsonb)),

    -- exploratory: raised → visited → decided → approved → set up, last 90 days,
    -- and whose calls (Go / No-go, in Pulse or Stage) matched supply's decision
    'funnel', (
      with sdone as materialized (select distinct pid, exploratory_building_key(name) k from stage_dates where kind in ('setup', 'revamp') and state = 'actual'),
      x as (
        select e.*, (select min(nullif(v->>'date', '')::date) from jsonb_array_elements(e.visits) v) stage_visit,
               (select min(l.visited_at)::date from exploratory_logs l where l.request_id = e.id and l.submitted_at is not null) pulse_visit,
               lk.pid linked, exploratory_building_key(e.property_name) bk
          from stage_exploratory e left join exploratory_links lk on lk.request_id = e.id
         where e.created_at > now() - interval '90 days' and e.archived_at is null and coalesce(e.property_name, '') !~* '^\s*\[test\]'
      ), y as (
        select x.*, coalesce(least(x.stage_visit, x.pulse_visit), x.stage_visit, x.pulse_visit) visited,
               x.status in ('approved', 'rejected', 'converted') decided, x.status in ('approved', 'converted') approved,
               -- set up: Pulse marked setup closed, or Stage recorded the setup as done
               -- (by the linked PID, or by the building when nothing is linked)
               (exists (select 1 from properties p where p.pid = x.linked and p.setup_closed_at is not null)
                or exists (select 1 from sdone where sdone.pid = x.linked
                            or (x.bk is not null and sdone.k is not null and (sdone.k like x.bk || '%' or x.bk like sdone.k || '%')))) set_up
          from x
      )
      select jsonb_build_object(
        'raised', count(*), 'visited', count(*) filter (where visited is not null), 'decided', count(*) filter (where decided),
        'approved', count(*) filter (where approved), 'set_up', count(*) filter (where set_up),
        'raise_to_visit', percentile_cont(0.5) within group (order by (visited - created_at::date)) filter (where visited is not null and visited >= created_at::date),
        'visit_to_decision', percentile_cont(0.5) within group (order by (stage_updated_at::date - visited)) filter (where decided and visited is not null and stage_updated_at::date >= visited))
        from y),
    'calls', coalesce((
      with v as (   -- every verdict a person gave: Pulse logs, and Stage visits they recorded
        select lower(l.author) who, l.request_id id, case l.verdict when 'go' then 'go' when 'no_go' then 'no_go' end verdict
          from exploratory_logs l where l.submitted_at is not null
        union
        select lower(vv->>'by'), e.id, case when vv->>'outcome' ~* 'accept' then 'go' when vv->>'outcome' ~* 'reject' then 'no_go' end
          from stage_exploratory e cross join jsonb_array_elements(e.visits) vv where vv->>'by' is not null
      ), j as (
        select v.who, v.id, v.verdict, e.status, e.property_name from v join stage_exploratory e on e.id = v.id
         where v.verdict is not null and e.status in ('approved', 'rejected', 'converted') and v.who like '%@flent.in'
      )
      select jsonb_agg(jsonb_build_object('email', who, 'n', n, 'match', m, 'misses', misses) order by n desc)
        from (select who, count(*) n,
                     count(*) filter (where (verdict = 'go') = (status in ('approved', 'converted'))) m,
                     jsonb_agg(jsonb_build_object('name', property_name, 'said', verdict, 'supply', status))
                       filter (where (verdict = 'go') <> (status in ('approved', 'converted'))) misses
                from j group by who) z), '[]'),

    'vendors', coalesce((select jsonb_agg(x order by (x->>'items')::int desc) from (
        select jsonb_build_object(
          'id', v.id, 'name', coalesce(v.full_name, 'Vendor'), 'trade', v.trade,
          'items', count(vi.id),
          'closed', count(vi.id) filter (where vi.vendor_closed_at is not null),
          'sent_back', count(vi.id) filter (where coalesce(vi.dispute_count, 0) > 0),
          'days_to_close', percentile_cont(0.5) within group (order by extract(epoch from vi.vendor_closed_at - vi.issued_at) / 86400)
                             filter (where vi.vendor_closed_at is not null and vi.issued_at is not null and vi.vendor_closed_at >= vi.issued_at),
          'noshow_chances', coalesce(max(ns.chances), 0), 'noshow_missed', coalesce(max(ns.missed), 0)) x
          from vendors v join vi on vi.vendor_id = v.id left join noshow ns on ns.vendor_id = v.id
         group by v.id, v.full_name, v.trade) z), '[]')
  ) into out;

  return out;
end
$$;

revoke all on function public.home_team() from public, anon;
grant execute on function public.home_team() to authenticated;

commit;
