-- Pulse suggests a PID for an exploratory request; it never decides one.
--
-- "8th main" (Koramangala) was auto-linked to PID 213 (4th Main, HSR) because
-- both building names reduce to "main…". Properties share names, so a PID is
-- only ever what a person links (exploratory record, starting an inspection,
-- or confirming a suggestion on the property page).
--
--  1. exploratory_autolink() no longer links anything (the Stage ingest still
--     calls it; it returns 0).
--  2. The 7 links it made are removed — they come back as suggestions.
--  3. explore_ledger: pid = the linked PID only; name/Stage matches are
--     returned as suggested_pid / suggested_source / suggested_name.
--  4. explore_journey_state: the "create PID X" step reads as a suggestion,
--     and its link no longer pre-fills Stage's PID into the inspection form.
--  5. home_team / home_explore_funnel: "set up" counts by linked PID only.

create or replace function public.exploratory_autolink()
returns int language sql stable as $$ select 0 $$;
revoke all on function public.exploratory_autolink() from public, anon, authenticated;

delete from public.exploratory_links where linked_by = 'auto';

CREATE OR REPLACE FUNCTION public.explore_ledger(p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare out jsonb;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;

  -- candidate PIDs by building: keys under 6 letters ("a", "pid", "hsr") say
  -- nothing about the building, so they never match
  with pk as materialized (
    select p.pid, p.name, exploratory_building_key(p.name) k, substring(p.name from '(\d)\s*BHK')::int beds
      from properties p where p.deleted_at is null and length(exploratory_building_key(p.name)) >= 6
  ),
  sk as materialized (
    select sd.pid, min(sd.name) name, exploratory_building_key(min(sd.name)) k, substring(min(sd.name) from '(\d)\s*BHK')::int beds
      from stage_dates sd group by sd.pid having length(exploratory_building_key(min(sd.name))) >= 6
  ),
  x as (
    select e.*, exploratory_building_key(e.property_name) bk,
           a.assignee, l.pid linked,
           (select lg from exploratory_logs lg where lg.request_id = e.id and lg.submitted_at is not null order by lg.submitted_at desc limit 1) lg,
           (select min(nullif(v->>'date', '')::date) from jsonb_array_elements(e.visits) v) stage_visit
      from stage_exploratory e
      left join exploratory_assignments a on a.request_id = e.id
      left join exploratory_links l on l.request_id = e.id
     where e.archived_at is null and coalesce(e.property_name, '') !~* '^\s*\[test\]'
  ),
  -- a building match only counts for an accepted request, and only when the
  -- bedroom count agrees where both sides say it (a 4B4B isn't the 3BHK unit)
  m as (
    select x.*, substring(x.configuration from '^(\d)')::int req_beds,
           x.status in ('approved', 'converted') and x.bk is not null and length(x.bk) >= 6 can_match
      from x
  ),
  y as (
    select m.*,
           coalesce(m.stage_visit, (m.lg).visited_at::date) visited_on,
           -- The PID is only ever the one a person linked. A building-name
           -- match is offered as a suggestion, never used as the PID: names
           -- repeat ("8th main" matched 4th Main HSR).
           m.linked pid,
           case when m.linked is not null then 'pulse' end pid_source,
           case when m.linked is null and m.can_match then coalesce(
             (select min(sk.pid) from sk where (sk.k like m.bk || '%' or m.bk like sk.k || '%') and (sk.beds is null or m.req_beds is null or sk.beds = m.req_beds)),
             (select min(pk.pid) from pk where (pk.k like m.bk || '%' or m.bk like pk.k || '%') and (pk.beds is null or m.req_beds is null or pk.beds = m.req_beds))) end suggested_pid,
           case when m.linked is null and m.can_match then
             case when exists (select 1 from sk where (sk.k like m.bk || '%' or m.bk like sk.k || '%') and (sk.beds is null or m.req_beds is null or sk.beds = m.req_beds)) then 'stage'
                  when exists (select 1 from pk where (pk.k like m.bk || '%' or m.bk like pk.k || '%') and (pk.beds is null or m.req_beds is null or pk.beds = m.req_beds)) then 'name' end end suggested_source
      from m
  ),
  z as (
    select y.*, coalesce(y.visited_on, y.visit_date, y.created_at::date) on_date
      from y
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', z.id, 'name', z.property_name, 'configuration', z.configuration, 'address', z.address, 'property_type', z.property_type,
           'raised_at', z.created_at, 'visit_date', coalesce(z.visited_on, z.visit_date), 'visited', z.visited_on is not null
              or z.status in ('inspection_done', 'under_review', 'approved', 'rejected', 'converted'),
           'visitor', lower(coalesce(z.assignee, (z.lg).author, z.stage_inspector)),
           'verdict', coalesce((z.lg).verdict,
              (select case when v->>'outcome' ~* 'accept' then 'go' when v->>'outcome' ~* 'reject' then 'no_go' end
                 from jsonb_array_elements(z.visits) v where v->>'outcome' is not null order by v->>'date' desc limit 1)),
           'status', z.status,
           'outcome', case when z.status in ('approved', 'converted') then 'accepted' when z.status = 'rejected' then 'rejected'
                           when z.status in ('inspection_done', 'under_review') then 'deciding' else 'not_visited' end,
           'decided_at', case when z.status in ('approved', 'converted', 'rejected') then z.stage_updated_at end,
           'pid', z.pid, 'pid_source', z.pid_source,
           'suggested_pid', z.suggested_pid, 'suggested_source', z.suggested_source,
           'suggested_name', coalesce((select p.name from properties p where p.pid = z.suggested_pid and p.deleted_at is null), (select min(sd.name) from stage_dates sd where sd.pid = z.suggested_pid)),
           'pid_name', (select p.name from properties p where p.pid = z.pid and p.deleted_at is null),
           'inspected', exists (select 1 from inspections i where i.pid = z.pid),
           'on_date', z.on_date
         ) order by z.on_date desc nulls last), '[]'::jsonb)
    into out
    from z
   where (p_from is null or z.on_date >= p_from) and (p_to is null or z.on_date <= p_to);
  return out;
end $function$;

CREATE OR REPLACE FUNCTION public.explore_journey_state()
 RETURNS TABLE(pid text, property_name text, owner_email text, stage_code text, stage_label text, blocked_on text, since timestamp with time zone, age_days integer, next_action_label text, next_action_route text, urgency text, open_threads jsonb, waiting_on text, setup_date date, days_to_setup integer, enrichment_missing boolean, is_prospect boolean, request_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare today date := (now() at time zone 'Asia/Kolkata')::date; admin text := (pulse_admins())[1];
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  return query
  -- each name is cleaned once here, not once per request (that was 100k+ regex calls)
  with pk as materialized (
    select p.pid, exploratory_building_key(p.name) k from properties p
     where p.deleted_at is null and not exists (select 1 from exploratory_links k where k.pid = p.pid)
  ),
  sk as materialized (
    select sd.pid, exploratory_building_key(min(sd.name)) k from stage_dates sd
     where not exists (select 1 from properties p where p.pid = sd.pid and p.deleted_at is null)
     group by sd.pid
  ),
  xk as materialized (
    select x.*, exploratory_building_key(x.property_name) bk from stage_exploratory x
     where x.archived_at is null and coalesce(x.property_name, '') !~* '^\s*\[test\]'
       and not exists (select 1 from explore_cleared c where c.request_id = x.id)   -- cleared at the clean slate
  ),
  base as (
    select x.*, a.assignee, a.confirmed_at, a.declined_by, a.decline_reason, a.stage_conflict,
           coalesce(a.assignee, case when a.request_id is null or a.stage_written_at is null then x.stage_inspector end) as who,
           (a.assignee is not null) as pulse_assigned,
           l.pid as linked_pid,
           (select lg from exploratory_logs lg where lg.request_id = x.id and lg.submitted_at is not null order by lg.submitted_at desc limit 1) as log,
           (select max(nullif(v->>'created_at', '')::timestamptz) from jsonb_array_elements(x.visits) v) as stage_visit_at,
           (select count(*) from pk where x.bk is not null and pk.k is not null
               and (pk.k like x.bk || '%' or x.bk like pk.k || '%'))::int as matches,
           (select min(sk.pid) from sk where x.bk is not null and sk.k is not null
               and (sk.k like x.bk || '%' or x.bk like sk.k || '%')) as stage_pid
      from xk x
      left join exploratory_assignments a on a.request_id = x.id
      left join exploratory_links l on l.request_id = x.id
     where not (x.status in ('approved', 'converted') and l.pid is not null)    -- the property carries on from here
       -- approvals that old with no link were settled outside Pulse
       and not (x.status in ('approved', 'converted') and l.pid is null and coalesce(x.stage_updated_at, x.created_at) < now() - interval '45 days')
  ),
  st as (
    select b.*,
           ((b.log).id is not null or b.stage_visit_at is not null or b.status in ('inspection_done', 'under_review')) as logged,
           explore_slot_text(b.visit_date, b.visit_time) as slot
      from base b
  ),
  th as (   -- the one open step for each prospect, plus "paste into Stage" alongside
    select s.*,
      case
        when s.status = 'rejected' then 'explore_not_taken'
        when s.status in ('approved', 'converted') and s.matches > 0 then 'explore_link'
        when s.status in ('approved', 'converted') and s.stage_pid is not null then 'explore_create_pid'
        when s.status = 'converted' then 'explore_create_pid'
        when s.status = 'approved' then 'explore_deal'
        -- Stage's status is the verdict: only its "inspection done / under review" means supply is deciding
        when s.status in ('inspection_done', 'under_review') and coalesce(s.stage_updated_at, s.created_at) < now() - interval '30 days' then 'explore_stale'
        when s.status in ('inspection_done', 'under_review') then 'explore_decision'
        -- logged in Pulse, but Stage still shows the visit as booked: the findings need to go into Stage
        when (s.log).id is not null then 'explore_paste_main'
        -- the slot passed long ago, nothing logged, nobody in Pulse on it: Stage never closed it
        when s.visit_date < today - 3 and not s.pulse_assigned then 'explore_stale'
        when s.visit_date is null then 'explore_slot'
        when s.who is null then 'explore_assign'
        when s.pulse_assigned and s.confirmed_at is null and s.visit_date >= today then 'explore_confirm'
        when s.visit_date >= today then 'explore_visit'
        else 'explore_log'
      end as code
      from st s
  ),
  t2 as (
    select t.*,
      case t.code
        when 'explore_not_taken'  then 'Not taken'
        when 'explore_create_pid' then case when t.stage_pid is not null then 'Approved — give it its PID in Pulse (Stage may have it as PID ' || t.stage_pid || ' — check before linking)' else 'Converted — create the PID in Pulse' end
        when 'explore_deal'       then 'Approved — supply closing the deal with the landlord'
        when 'explore_link'       then 'Approved — link it to its PID (a property with a similar name exists — check it is the same one)'
        when 'explore_stale'      then case when t.status in ('inspection_done', 'under_review') then 'No decision in Stage for a month' else 'Visit date passed — still open in Stage' end
        when 'explore_paste_main' then 'Logged — paste the findings into Stage'
        when 'explore_decision'   then 'Waiting on supply’s decision'
        when 'explore_slot'       then 'Waiting on supply for a visit slot'
        when 'explore_assign'     then case when t.declined_by is not null then split_part(t.declined_by, '@', 1) || ' can’t go — assign someone else · ' else 'Assign someone for the visit · ' end || t.slot
        when 'explore_confirm'    then 'Confirm the visit · ' || t.slot
        when 'explore_visit'      then 'Visit · ' || t.slot
        else 'Log the findings'
      end as label,
      case when t.code in ('explore_decision', 'explore_slot', 'explore_stale', 'explore_deal') then 'supply' when t.code = 'explore_not_taken' then null else 'setup_ops' end as blk,
      case when t.code in ('explore_assign', 'explore_stale') then admin when t.code = 'explore_not_taken' then t.who else coalesce(t.who, admin) end as owner,
      case t.code
        when 'explore_decision'   then coalesce(t.stage_updated_at, t.stage_visit_at, (t.log).submitted_at)
        when 'explore_paste_main' then (t.log).submitted_at
        when 'explore_create_pid' then coalesce(t.stage_updated_at, t.created_at)
        when 'explore_link'       then coalesce(t.stage_updated_at, t.created_at)
        when 'explore_deal'       then coalesce(t.stage_updated_at, t.created_at)
        when 'explore_stale'      then t.visit_date::timestamptz
        when 'explore_log'        then t.visit_date::timestamptz
        else t.created_at end as since_at,
      case t.code
        when 'explore_decision'   then 3
        when 'explore_create_pid' then 2
        when 'explore_link'       then 2
        when 'explore_paste_main' then 1
        -- deal closing is supply's pace, not a threshold of ours: no limit
        when 'explore_slot'       then 2
        else null end as limit_days
      from th t
  ),
  t3 as (
    select t.*,
      greatest(0, (today - (t.since_at at time zone 'Asia/Kolkata')::date))::int as age,
      case
        when t.code = 'explore_not_taken' then 'done'
        when t.code in ('explore_assign', 'explore_confirm', 'explore_visit') then
          case when t.visit_date < today then 'overdue' when t.visit_date = today then 'today' when t.visit_date = today + 1 then 'soon' else 'waiting' end
        when t.code = 'explore_log' then 'overdue'
        when t.limit_days is not null and (today - (t.since_at at time zone 'Asia/Kolkata')::date) > t.limit_days then 'overdue'
        else 'waiting' end as urg
      from t2 t
  )
  select 'explore:' || t.id::text, coalesce(t.property_name, 'Unnamed prospect') || coalesce(' · ' || t.configuration, ''),
         t.owner, t.code, 'Explore · ' || t.label, t.blk, t.since_at, t.age,
         case t.code when 'explore_assign' then 'Assign' when 'explore_confirm' then 'Confirm' when 'explore_visit' then 'Open the visit'
                     when 'explore_log' then 'Log the findings' when 'explore_create_pid' then 'Create the PID' when 'explore_link' then 'Link the PID'
                     when 'explore_paste_main' then 'Copy for Stage'
                     when 'explore_decision' then 'Open' when 'explore_slot' then 'Open' else 'Open' end,
         case when t.code in ('explore_log', 'explore_paste_main') then '/explore/' || t.id || '/log'
              when t.code = 'explore_create_pid' then '/inspections/new?explore=' || t.id   -- no PID filled in: a person types it
              else '/explore/' || t.id end,
         t.urg,
         jsonb_build_array(jsonb_build_object(
           'code', t.code, 'stage_no', 0, 'label', t.label, 'blocked_on', t.blk, 'waiting_on', t.blk, 'since', t.since_at,
           'age_days', t.age, 'limit_days', t.limit_days,
           'overdue_by', case when t.urg = 'overdue' then greatest(1, case when t.code in ('explore_log', 'explore_assign', 'explore_confirm', 'explore_visit')
                                                                         then today - t.visit_date else t.age - coalesce(t.limit_days, 0) end) end,
           'next_action_label', case t.code when 'explore_assign' then 'Assign' when 'explore_log' then 'Log the findings' when 'explore_create_pid' then 'Create the PID' when 'explore_link' then 'Link the PID' when 'explore_paste_main' then 'Copy for Stage' else 'Open' end,
           'next_action_route', case when t.code in ('explore_log', 'explore_paste_main') then '/explore/' || t.id || '/log' else '/explore/' || t.id end,
           'note', case when t.stage_conflict is not null then 'Stage says ' || split_part(t.stage_conflict, '@', 1) || ' is going' end,
           'urgency', t.urg))
         || case when (t.log).id is not null and (t.log).in_stage_at is null and t.code in ('explore_decision', 'explore_create_pid', 'explore_link', 'explore_not_taken') then
              jsonb_build_array(jsonb_build_object('code', 'explore_paste', 'stage_no', 0, 'label', 'Paste the findings into Stage',
                'blocked_on', 'setup_ops', 'waiting_on', 'setup_ops', 'since', (t.log).submitted_at, 'age_days', t.age, 'urgency', 'soon',
                'next_action_label', 'Copy for Stage', 'next_action_route', '/explore/' || t.id || '/log'))
            else '[]'::jsonb end,
         t.blk, null::date, null::int, false, true, t.id
    from t3 t;
end
$function$;

CREATE OR REPLACE FUNCTION public.home_team()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
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
    select distinct on (es.pid) es.pid, es.id eid,
           (select coalesce(sum((coalesce(ei.material_cost, 0) + coalesce(ei.labour_cost, 0)) * greatest(coalesce(ei.qty, 1), 1)), 0)
              from estimate_items ei where ei.estimate_id = es.id and ei.status = 'approved' and ei.cost_type in ('priced', 'actuals')) v
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

    -- money at risk: each bucket's total, and the properties in it (largest
    -- first) with the estimate / inspection ids the Team view links to
    'money', jsonb_build_object(
      'with_landlords', (select jsonb_build_object('value', coalesce(sum(s.total), 0), 'n', count(*),
                                  'items', coalesce(jsonb_agg(jsonb_build_object(
                                     'pid', l.pid, 'name', l.nm, 'who', l.who, 'value', s.total, 'estimate_id', s.id,
                                     'status', s.status, 'sent_at', s.sent_at, 'approved', coalesce(a.v, 0),
                                     'undecided', estimate_undecided(s.id)) order by s.total desc nulls last), '[]'::jsonb))
                           from (select distinct on (s.pid) s.* from sent s order by s.pid, s.sent_at desc nulls last) s
                           join act l on l.pid = s.pid
                           left join approved_val a on a.pid = l.pid and a.eid = s.id
                          where s.status in ('sent', 'viewed', 'partially_approved') and l.estimate_final_at is null and l.closed_at is null
                            and s.sent_at > now() - interval '60 days'),
      'not_invoiced', (select jsonb_build_object('value', coalesce(sum(a.v), 0), 'n', count(*),
                                  'items', coalesce(jsonb_agg(jsonb_build_object(
                                     'pid', l.pid, 'name', l.nm, 'who', l.who, 'value', a.v, 'estimate_id', a.eid,
                                     'final_at', l.estimate_final_at, 'setup_closed_at', l.setup_closed_at,
                                     'inspection_id', (select i.id from inspections i where i.pid = l.pid order by i.created_at desc limit 1),
                                     'draft_invoice', exists (select 1 from landlord_invoices d where d.pid = l.pid and d.status = 'draft'
                                                               and exists (select 1 from landlord_invoice_items ii where ii.invoice_id = d.id)))
                                   order by a.v desc), '[]'::jsonb))
                         from act l join approved_val a on a.pid = l.pid
                        where l.estimate_final_at is not null and l.closed_at is null and a.v > 0
                          and not exists (select 1 from has_inv h where h.pid = l.pid)),
      'closed_no_invoice', (select jsonb_build_object('value', coalesce(sum(a.v), 0), 'n', count(*),
                                  'items', coalesce(jsonb_agg(jsonb_build_object(
                                     'pid', l.pid, 'name', l.nm, 'who', l.who, 'value', coalesce(a.v, 0), 'estimate_id', a.eid,
                                     'reason', l.no_invoice_reason, 'note', l.no_invoice_note, 'closed_at', l.closed_at,
                                     'inspection_id', (select i.id from inspections i where i.pid = l.pid order by i.created_at desc limit 1))
                                   order by coalesce(a.v, 0) desc), '[]'::jsonb))
                              from live l left join approved_val a on a.pid = l.pid   -- live, not act: act drops closed properties
                             where l.no_invoice_reason is not null and l.archived_at is null and l.closed_at > now() - interval '30 days')),

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
        'n', (select count(*) from live where no_invoice_reason is not null and archived_at is null and closed_at > now() - interval '30 days'),
        'items', coalesce((select jsonb_agg(jsonb_build_object('pid', pid, 'name', nm, 'who', who,
                   'line', initcap(replace(no_invoice_reason, '_', ' ')) || coalesce(' — ' || no_invoice_note, '')) order by closed_at desc)
                 from live where no_invoice_reason is not null and archived_at is null and closed_at > now() - interval '30 days'), '[]')),
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
                or exists (select 1 from sdone where sdone.pid = x.linked)) set_up   -- linked PID only, never by name
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
$function$;

CREATE OR REPLACE FUNCTION public.home_explore_funnel(p_days integer DEFAULT 90)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
  if not pulse_is_admin() then raise exception 'Only an admin can open the team view'; end if;
  if p_days not between 7 and 400 then raise exception 'Pick a window between a week and a year'; end if;
  return jsonb_build_object(
    'days', p_days,
    'funnel', (
      with sdone as materialized (select distinct pid, exploratory_building_key(name) k from stage_dates where kind in ('setup', 'revamp') and state = 'actual'),
      x as (
        select e.*, (select min(nullif(v->>'date', '')::date) from jsonb_array_elements(e.visits) v) stage_visit,
               (select min(l.visited_at)::date from exploratory_logs l where l.request_id = e.id and l.submitted_at is not null) pulse_visit,
               lk.pid linked, exploratory_building_key(e.property_name) bk
          from stage_exploratory e left join exploratory_links lk on lk.request_id = e.id
         where e.created_at > now() - make_interval(days => p_days) and e.archived_at is null and coalesce(e.property_name, '') !~* '^\s*\[test\]'
      ), y as (
        select x.*, coalesce(least(x.stage_visit, x.pulse_visit), x.stage_visit, x.pulse_visit) visited,
               x.status in ('approved', 'rejected', 'converted') decided, x.status in ('approved', 'converted') approved,
               -- set up: Pulse marked setup closed, or Stage recorded the setup as done
               -- (by the linked PID, or by the building when nothing is linked)
               (exists (select 1 from properties p where p.pid = x.linked and p.setup_closed_at is not null)
                or exists (select 1 from sdone where sdone.pid = x.linked)) set_up   -- linked PID only, never by name
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
           and e.created_at > now() - make_interval(days => p_days)
      )
      select jsonb_agg(jsonb_build_object('email', who, 'n', n, 'match', m, 'misses', misses) order by n desc)
        from (select who, count(*) n,
                     count(*) filter (where (verdict = 'go') = (status in ('approved', 'converted'))) m,
                     jsonb_agg(jsonb_build_object('name', property_name, 'said', verdict, 'supply', status))
                       filter (where (verdict = 'go') <> (status in ('approved', 'converted'))) misses
                from j group by who) z), '[]')
  );
end
$function$;
