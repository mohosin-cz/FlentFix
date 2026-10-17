-- Journey engine v2 — the journey as setup ops actually runs it
-- (pulse-journey-prompt.md §1–§3). Replaces the first engine's rules; keeps
-- its output columns so every screen keeps working, and adds:
--   waiting_on (now including 'supply'), setup_date, days_to_setup,
--   enrichment_missing.
--
-- Every step a property still has open is a thread; the headline is the most
-- urgent one this person can act on. Each thread now carries its own
-- overdue_by, so screens and alerts stop keeping their own copy of the rules.
--
-- Derived steps come from evidence; the six human steps come from the
-- milestone columns (journey_milestones_*.sql). Before setup, urgency counts
-- DOWN to the setup date: unplanned work orders 3 days out are overdue, three
-- weeks out merely soon.
--
-- Older properties predate the milestones. Where later evidence exists, the
-- earlier milestone is treated as passed (not as marked): work orders imply
-- the estimate went final; work orders with every item verified, plus an
-- invoice, imply setup closed. The threads say "not marked" so nobody
-- mistakes it for a tick.
--
-- An invoice on its own proves nothing: opening a property's invoice page
-- creates a draft, so a draft can exist before there is even an estimate.
-- Only an invoice with lines counts as one (25 of 28 on file were empty).
--
-- Holy Grail enrichment never blocks, never sets urgency, never becomes the
-- next action (§3) — it is a flag only.

begin;

-- ── 1 · Thresholds. Old keys kept unchanged; new keys for the new steps. ──
create or replace function public.journey_thresholds()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    -- first engine (kept; some alerts still read them)
    'onboarded_days',            7,
    'inspection_draft_days',     3,
    'estimate_not_created_days', 2,
    'estimate_draft_days',       3,
    'estimate_unopened_days',    5,
    'landlord_silent_days',      7,
    'query_reply_days',          1,
    'work_order_pending_days',   3,
    'wo_unassigned_days',        2,
    'wo_unscheduled_days',       3,
    'scheduled_soon_days',       2,
    'qc_pending_days',           2,
    'dispute_days',              3,
    'handover_unknown_days',     3,
    'handover_soon_days',        3,
    'invoice_draft_days',        3,
    'work_day_minutes',        480,
    'unopened_renotify_days',    7,
    'execution_lookahead_days',  1,
    'handover_lookahead_days',   1,
    -- v2: elapsed-time limits
    'supply_forward_days',       3,  -- estimate sent to supply, landlord hasn't decided anything yet
    'estimate_final_days',       2,  -- landlord approved everything, estimate not marked final
    'setup_date_days',           3,  -- estimate final, no setup date
    'items_to_verify_days',      2,  -- vendor closed items, nobody verified
    'setup_close_days',          1,  -- all work done, setup not marked closed
    'payments_days',             3,  -- setup closed, no spend logged
    'utility_details_days',      3,  -- setup closed, utility details incomplete
    'qc_days',                   2,  -- setup closed, QC not marked
    'handover_days',             2,  -- QC done, not handed over
    'wo_share_days',             1,  -- handed over, work order not on Slack
    'invoice_days',              3,  -- shared, no invoice
    'close_days',                7,  -- invoice exists, property not closed
    -- v2: lead times counted back from the setup date
    'utilities_lead_days',       7,  -- WiFi / RO must be booked this many days before setup
    'wo_lead_days',              3,  -- work orders raised
    'assign_lead_days',          2,  -- vendors assigned and dated
    'setup_soon_days',           2   -- "setup in N days" turns soon
  )
$$;

-- ── 2 · One step. Same shape as before, plus waiting_on, overdue_by, note. ──
create or replace function public.journey_step(
  p_code text, p_label text, p_waiting text, p_since timestamptz,
  p_action text, p_route text, p_limit_days int, p_urgency text default null, p_note text default null)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'code', p_code,
    'stage_no', case p_code
        when 'property_created' then 1 when 'inspection_in_progress' then 2 when 'inspection_complete' then 4
        when 'estimate_draft' then 5 when 'estimate_sent' then 6 when 'landlord_deciding' then 7 when 'landlord_queried' then 7
        when 'estimate_final_pending' then 8 when 'setup_date_pending' then 9 when 'utilities_unplanned' then 10
        when 'work_orders_unplanned' then 11 when 'wo_unassigned' then 12 when 'wo_undated' then 12
        when 'wo_awaiting_day' then 13 when 'setup_day' then 14 when 'vendors_on_site' then 15 when 'setup_in_progress' then 15
        when 'items_to_verify' then 15 when 'disputed' then 16 when 'wo_overdue' then 16 when 'setup_close_pending' then 17
        when 'payments_pending' then 17 when 'utility_details_pending' then 17 when 'qc_pending' then 20
        when 'handover_pending' then 21 when 'wo_share_pending' then 22 when 'invoice_pending' then 23
        when 'close_pending' then 24 when 'closed' then 25 when 'archived' then 99 else 0 end,
    'label', p_label,
    'blocked_on', p_waiting,                 -- kept for the screens built on v1
    'waiting_on', p_waiting,
    'since', p_since,
    'age_days', a.age,
    'limit_days', p_limit_days,
    'overdue_by', case when p_limit_days is not null and a.age > p_limit_days then a.age - p_limit_days end,
    'next_action_label', p_action,
    'next_action_route', p_route,
    'note', p_note,
    'urgency', coalesce(p_urgency,
      case when p_waiting = 'none' then 'waiting'
           when p_limit_days is not null and a.age > p_limit_days then 'overdue'
           when p_waiting = 'setup_ops' then 'today'
           else 'waiting' end))
  from (select greatest(0, floor(extract(epoch from (now() - coalesce(p_since, now()))) / 86400))::int as age) a
$$;

-- Urgency for a planning step that must be done `lead` days before setup.
create or replace function public.journey_lead_urgency(p_days_to_setup int, p_lead int)
returns text language sql immutable as $$
  select case when p_days_to_setup is null then 'soon'
              when p_days_to_setup <= p_lead then 'overdue'
              when p_days_to_setup <= p_lead + 2 then 'today'
              else 'soon' end
$$;

-- ── 3 · The engine ────────────────────────────────────────────────────────
drop function if exists public.property_journey_counts(text);
drop function if exists public.property_journey_state(text);
create or replace function public.property_journey_state(p_scope text default 'me')
returns table (
  pid text, property_name text, owner_email text,
  stage_code text, stage_label text,
  blocked_on text, since timestamptz, age_days int,
  next_action_label text, next_action_route text,
  urgency text, open_threads jsonb,
  waiting_on text, setup_date date, days_to_setup int, enrichment_missing boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_me    text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_scope text := lower(coalesce(p_scope, 'me'));
  t       jsonb := public.journey_thresholds();
  r       record;
  th      jsonb;
  best    jsonb;
  d       int;           -- days to setup
  r_prop  text; r_est text; r_wo text; r_util text; r_pay text; r_inv text;
  fin_eff boolean; fin_since timestamptz; fin_note text;
  closed_eff boolean; closed_since timestamptz; closed_note text;
begin
  if v_scope = 'me' then
    if v_me = '' then return; end if;
  elsif v_scope <> 'all' then
    v_me := v_scope; v_scope := 'me';
  end if;

  for r in
    with insp_owner as (
      select distinct on (i.pid) i.pid, lower(i.owner_email) as e
        from inspections i where i.owner_email is not null and i.pid is not null
       order by i.pid, i.created_at asc
    ),
    base as (
      select p.*, coalesce(lower(p.owner_email), io.e) as owner
        from properties p left join insp_owner io on io.pid = p.pid
       where p.deleted_at is null
         and p.source is distinct from 'payments_backfill'
         and (v_scope = 'all' or coalesce(lower(p.owner_email), io.e) = v_me or lower(p.assigned_to) = v_me)
    ),
    insp as (
      select b.pid,
             count(i.*) n,
             count(i.*) filter (where i.status in ('completed','legacy')) n_done,
             max(i.created_at) filter (where i.status in ('completed','legacy')) done_at,
             max(i.created_at) latest_at,
             (array_agg(i.id order by (i.status in ('completed','legacy')) desc, i.created_at desc))[1] latest_id
        from base b join inspections i on i.pid = b.pid group by b.pid
    ),
    est as (
      select distinct on (e.pid) e.pid, e.id, e.status, e.created_at, coalesce(e.updated_at, e.created_at) updated_at,
             e.first_viewed_at, e.approved_at, e.sent_at
        from base b join estimates e on e.pid = b.pid order by e.pid, e.created_at desc
    ),
    est_sent as (
      select est.id, least(est.sent_at,
               (select min(ev.created_at) from estimate_events ev where ev.estimate_id = est.id and ev.event_type = 'sent'),
               (select min(v.sent_at) from estimate_versions v where v.estimate_id = est.id),
               est.first_viewed_at) at
        from est
    ),
    est_items as (
      select ei.estimate_id,
             count(*) filter (where ei.status = 'pending') n_pending,
             count(*) filter (where ei.status = 'approved') n_approved,
             count(*) filter (where ei.status = 'disputed') n_disputed,
             count(*) filter (where ei.status not in ('removed','excluded')) n_live
        from est join estimate_items ei on ei.estimate_id = est.id group by ei.estimate_id
    ),
    est_disp as (
      select distinct on (ds.estimate_id) ds.estimate_id, ds.author_type, ds.created_at
        from est join estimate_disputes ds on ds.estimate_id = est.id order by ds.estimate_id, ds.created_at desc
    ),
    est_last_decision as (
      select ev.estimate_id, max(ev.created_at) at from est join estimate_events ev on ev.estimate_id = est.id
       where ev.event_type in ('item_approved','approved','partially_approved','queried') group by ev.estimate_id
    ),
    wo as (
      select b.pid,
             count(distinct w.id) n,
             count(distinct w.id) filter (where w.vendor_id is null and w.status <> 'verified') n_no_vendor,
             count(distinct w.id) filter (where w.vendor_id is not null and w.status <> 'verified'
                                          and w.scheduled_end is null and w.scheduled_start is null) n_undated,
             count(wi.*) filter (where wi.status in ('pending','disputed') and coalesce(wi.included, true)) items_open,
             count(wi.*) filter (where wi.status = 'vendor_closed') items_to_verify,
             count(wi.*) filter (where wi.status = 'disputed') items_disputed,
             count(distinct w.vendor_id) filter (where w.status <> 'verified') vendors,
             min(coalesce(w.scheduled_end, w.scheduled_start)) filter (where wi.status in ('pending','disputed')
                  and coalesce(w.scheduled_end, w.scheduled_start) < current_date) overdue_since,
             min(w.created_at) first_created,
             min(w.created_at) filter (where w.vendor_id is null and w.status <> 'verified') no_vendor_since,
             max(wi.vendor_closed_at) filter (where wi.status = 'vendor_closed') to_verify_since,
             max(coalesce(wi.verified_at, wi.vendor_closed_at)) last_item_done,
             max(w.updated_at) filter (where wi.status = 'disputed') disputed_since
        from base b join work_orders w on w.pid = b.pid
        left join work_order_items wi on wi.work_order_id = w.id
       group by b.pid
    ),
    att as (
      select b.pid,
             count(distinct va.vendor_id) filter (where (va.punched_at at time zone 'Asia/Kolkata')::date = current_date) on_site_today,
             count(distinct va.vendor_id) filter (where b.setup_date is not null and (va.punched_at at time zone 'Asia/Kolkata')::date >= b.setup_date) since_setup,
             min(va.punched_at) filter (where b.setup_date is not null and (va.punched_at at time zone 'Asia/Kolkata')::date >= b.setup_date) first_in
        from base b join vendor_attendance va on va.pid = b.pid and va.punch_type = 'in'
       group by b.pid
    ),
    util as (
      select b.pid,
             bool_or(u.utility_type = 'wifi' and u.status = 'active' and nullif(u.account_number,'') is not null
                     and nullif(u.ssid,'') is not null and nullif(u.wifi_password,'') is not null) wifi_ok,
             bool_or(u.utility_type = 'water_purifier' and u.status = 'active' and nullif(u.provider,'') is not null
                     and u.start_date is not null) ro_ok,
             count(*) filter (where u.status = 'active') n_active,
             count(*) filter (where u.status = 'active' and (
                 (u.utility_type = 'wifi' and (nullif(u.account_number,'') is null or nullif(u.ssid,'') is null or nullif(u.wifi_password,'') is null))
              or (u.utility_type = 'water_purifier' and (nullif(u.provider,'') is null or u.start_date is null)))) n_incomplete
        from base b join property_utilities u on u.pid = b.pid group by b.pid
    ),
    pay as (
      select b.pid, count(*) n, max(pp.created_at) last_at,
             count(*) filter (where pp.created_at >= coalesce(b.estimate_final_at, '-infinity'::timestamptz)) n_since_final
        from base b join property_payments pp on pp.pid = b.pid group by b.pid
    ),
    inv as (
      -- an invoice counts only once it has lines: opening the invoice page creates an empty draft
      select distinct on (li.pid) li.pid, li.inspection_id, li.created_at
        from base b join landlord_invoices li on li.pid = b.pid
       where exists (select 1 from landlord_invoice_items ii where ii.invoice_id = li.id)
       order by li.pid, li.created_at desc
    )
    select b.pid, b.name, b.owner, b.created_at, b.archived_at,
           b.setup_date, b.estimate_final_at, b.setup_closed_at, b.qc_done_at, b.handover_done_at, b.wo_shared_at, b.closed_at,
           (b.landlord_name is null or b.units is null or b.maps_url is null) as enrich_missing,
           i.n insp_n, i.n_done insp_done, i.done_at insp_done_at, i.latest_at insp_latest_at, i.latest_id insp_latest_id,
           e.id est_id, e.status est_status, e.updated_at est_updated_at, e.first_viewed_at est_viewed_at, e.approved_at est_approved_at,
           (e.status is distinct from 'draft' or es.at is not null) est_is_sent, coalesce(es.at, e.updated_at) est_sent_at,
           coalesce(ei.n_pending,0) ei_pending, coalesce(ei.n_approved,0) ei_approved, coalesce(ei.n_disputed,0) ei_disputed, coalesce(ei.n_live,0) ei_live,
           dsp.author_type disp_author, dsp.created_at disp_at, eld.at est_last_decision,
           coalesce(w.n,0) wo_n, coalesce(w.n_no_vendor,0) wo_no_vendor, coalesce(w.n_undated,0) wo_undated,
           coalesce(w.items_open,0) items_open, coalesce(w.items_to_verify,0) items_to_verify, coalesce(w.items_disputed,0) items_disputed,
           coalesce(w.vendors,0) wo_vendors, w.overdue_since, w.first_created wo_first, w.no_vendor_since, w.to_verify_since,
           w.last_item_done, w.disputed_since,
           coalesce(a.on_site_today,0) on_site_today, coalesce(a.since_setup,0) on_site_since_setup, a.first_in,
           coalesce(u.n_active,0) util_n, coalesce(u.n_incomplete,0) util_incomplete,
           coalesce(u.wifi_ok, false) wifi_ok, coalesce(u.ro_ok, false) ro_ok,
           b.wifi_requested_at, b.wifi_plan_months, b.ro_requested_at, b.ro_plan_months, b.payments_logged_at,
           coalesce(pa.n,0) pay_n, coalesce(pa.n_since_final,0) pay_since_final,
           inv.inspection_id inv_insp_id, inv.created_at inv_at
      from base b
      left join insp i on i.pid = b.pid
      left join est e on e.pid = b.pid
      left join est_sent es on es.id = e.id
      left join est_items ei on ei.estimate_id = e.id
      left join est_disp dsp on dsp.estimate_id = e.id
      left join est_last_decision eld on eld.estimate_id = e.id
      left join wo w on w.pid = b.pid
      left join att a on a.pid = b.pid
      left join util u on u.pid = b.pid
      left join pay pa on pa.pid = b.pid
      left join inv on inv.pid = b.pid
     order by b.pid
  loop
    th := '[]'::jsonb;
    r_prop := '/properties/' || r.pid;
    r_est  := case when r.est_id is not null then '/estimate/' || r.est_id else r_prop || '/estimates' end;
    r_wo   := r_prop || '/work-orders';
    r_util := r_prop || '/utilities';
    r_pay  := r_prop || '/payments';
    r_inv  := case when coalesce(r.inv_insp_id, r.insp_latest_id) is not null then '/invoice/' || coalesce(r.inv_insp_id, r.insp_latest_id) else r_prop end;
    d      := case when r.setup_date is not null then r.setup_date - current_date end;

    -- has the property passed "estimate final" / "setup closed", marked or by evidence?
    fin_eff := r.estimate_final_at is not null or r.wo_n > 0;
    fin_since := coalesce(r.estimate_final_at, r.wo_first);
    fin_note := case when r.estimate_final_at is null and fin_eff then 'estimate final not marked — inferred from later work' end;
    closed_eff := r.setup_closed_at is not null
               or (r.inv_at is not null and r.wo_n > 0 and r.items_open = 0 and r.items_to_verify = 0);
    closed_since := coalesce(r.setup_closed_at, r.last_item_done, r.inv_at);
    closed_note := case when r.setup_closed_at is null and closed_eff then 'setup closed not marked — inferred: all work verified and an invoice exists' end;

    if r.archived_at is not null then
      th := th || public.journey_step('archived', 'Archived', 'none', r.archived_at, 'Nothing to do', r_prop, null, 'done');

    elsif r.closed_at is not null then
      th := th || public.journey_step('closed', 'Property closed', 'none', r.closed_at, 'Done', r_prop, null, 'done');

    elsif closed_eff then
      -- 20–24 · after setup closed (payments and utility details were checked before closing)
      if r.qc_done_at is null then
        th := th || public.journey_step('qc_pending', 'Setup closed, QC not done', 'setup_ops', closed_since,
               'Mark QC done', r_prop, (t->>'qc_days')::int, null, closed_note);
      elsif r.handover_done_at is null then
        th := th || public.journey_step('handover_pending', 'QC done, not handed over', 'setup_ops', r.qc_done_at,
               'Mark handed over', r_prop, (t->>'handover_days')::int);
      elsif r.wo_shared_at is null then
        th := th || public.journey_step('wo_share_pending', 'Handed over, work order not on Slack', 'setup_ops', r.handover_done_at,
               'Share the work order on Slack', r_wo, (t->>'wo_share_days')::int);
      elsif r.inv_at is null then
        th := th || public.journey_step('invoice_pending', 'Work order shared, no invoice', 'setup_ops', r.wo_shared_at,
               'Create the landlord invoice', r_inv, (t->>'invoice_days')::int);
      else
        th := th || public.journey_step('close_pending', 'Invoiced, property not closed', 'setup_ops', greatest(r.wo_shared_at, r.inv_at),
               'Close the property', r_prop, (t->>'close_days')::int);
      end if;

    elsif fin_eff then
      -- 9–17 · from estimate final to setup closed. Planning counts back from the
      -- setup date; work already under way shows whether or not a date is set.
      if r.setup_date is null then
        th := th || public.journey_step('setup_date_pending', 'Estimate final, no setup date', 'setup_ops', fin_since,
               'Set the setup date', r_prop, (t->>'setup_date_days')::int, null, fin_note);
      end if;
      -- planning utilities = the request to the WiFi and RO partners (a tick on the property page)
      if r.setup_date is not null and d >= 0 and (r.wifi_requested_at is null or r.ro_requested_at is null) then
        th := th || public.journey_step('utilities_unplanned',
               case when r.wifi_requested_at is null and r.ro_requested_at is null then 'WiFi and RO not requested from partners'
                    when r.wifi_requested_at is null then 'WiFi not requested from the partner'
                    else 'RO not requested from the partner' end,
               'setup_ops', fin_since, 'Request utilities', r_prop || '#utilities-request', null,
               public.journey_lead_urgency(d, (t->>'utilities_lead_days')::int));
      end if;
      if r.wo_n = 0 then
        if r.setup_date is not null then
          th := th || public.journey_step('work_orders_unplanned', 'No work orders raised', 'setup_ops', fin_since,
                 'Plan work orders', r_wo, null, public.journey_lead_urgency(d, (t->>'wo_lead_days')::int));
        end if;
      elsif r.wo_no_vendor > 0 then
        th := th || public.journey_step('wo_unassigned', r.wo_no_vendor || ' work order' || case when r.wo_no_vendor > 1 then 's' else '' end || ' with no vendor', 'setup_ops', r.no_vendor_since,
               'Assign vendors', r_wo, case when d is null then (t->>'wo_unassigned_days')::int end,
               case when d is not null then public.journey_lead_urgency(d, (t->>'assign_lead_days')::int) end);
      elsif r.wo_undated > 0 then
        th := th || public.journey_step('wo_undated', r.wo_undated || ' work order' || case when r.wo_undated > 1 then 's' else '' end || ' with no closure date', 'setup_ops', r.wo_first,
               'Set closure dates', r_wo, case when d is null then (t->>'wo_unscheduled_days')::int end,
               case when d is not null then public.journey_lead_urgency(d, (t->>'assign_lead_days')::int) end);
      end if;

      if d > 0 and r.wo_n > 0 and r.wo_no_vendor = 0 then
        th := th || public.journey_step('wo_awaiting_day', 'Setup in ' || d || ' day' || case when d = 1 then '' else 's' end, 'vendor', r.wo_first,
               'Vendors due ' || to_char(r.setup_date, 'DD Mon'), r_wo, null,
               case when d <= (t->>'setup_soon_days')::int then 'soon' else 'waiting' end);
      elsif d = 0 then
        th := th || public.journey_step('setup_day', 'Setup day · ' || r.on_site_today || ' of ' || r.wo_vendors || ' vendors punched in', 'vendor', r.setup_date::timestamptz,
               'Check who has arrived', r_wo, null, 'today');
      end if;

      if r.wo_n > 0 and (d is null or d < 0) then
        if r.items_open > 0 and r.overdue_since is not null then
          th := th || public.journey_step('wo_overdue', r.items_open || ' item' || case when r.items_open = 1 then '' else 's' end || ' still open past the closure date', 'vendor', r.overdue_since::timestamptz,
                 'Chase the vendors', r_wo, 0);
        elsif r.items_open > 0 and r.on_site_since_setup > 0 then
          th := th || public.journey_step('vendors_on_site', r.on_site_since_setup || ' vendor' || case when r.on_site_since_setup = 1 then '' else 's' end || ' on site · ' || r.items_open || ' items open', 'vendor', r.first_in,
                 'Vendors working', r_wo, null, 'waiting');
        elsif r.items_open > 0 and r.wo_no_vendor = 0 and r.wo_undated = 0 then
          th := th || public.journey_step('setup_in_progress', 'Work under way · ' || r.items_open || ' items open', 'vendor', coalesce(r.setup_date::timestamptz, r.wo_first),
                 'Vendors working', r_wo, null, 'waiting',
                 case when r.setup_date is not null and r.on_site_since_setup = 0 then 'no vendor has punched in at this PID since setup day' end);
        end if;
        if r.items_disputed > 0 then
          th := th || public.journey_step('disputed', r.items_disputed || ' item' || case when r.items_disputed = 1 then '' else 's' end || ' sent back to the vendor', 'vendor', r.disputed_since,
                 'Vendor to fix sent-back items', r_wo, (t->>'dispute_days')::int);
        end if;
        if r.items_to_verify > 0 then
          th := th || public.journey_step('items_to_verify', r.items_to_verify || ' item' || case when r.items_to_verify = 1 then '' else 's' end || ' to verify', 'setup_ops', r.to_verify_since,
                 'Verify closed items', r_wo, (t->>'items_to_verify_days')::int);
        end if;
        if r.items_open = 0 and r.items_to_verify = 0 then
          -- setup can't close until payments are confirmed logged and the utility details are registered
          if r.payments_logged_at is null then
            th := th || public.journey_step('payments_pending', 'Work done — confirm all payments are logged', 'setup_ops', coalesce(r.last_item_done, r.setup_date::timestamptz),
                   'Log payments, then confirm', r_pay, (t->>'payments_days')::int);
          end if;
          if (not r.wifi_ok and coalesce(r.wifi_plan_months, -1) <> 0) or (not r.ro_ok and coalesce(r.ro_plan_months, -1) <> 0) then
            th := th || public.journey_step('utility_details_pending',
                   case when not r.wifi_ok and coalesce(r.wifi_plan_months, -1) <> 0 and not r.ro_ok and coalesce(r.ro_plan_months, -1) <> 0 then 'WiFi and RO details not registered'
                        when not r.wifi_ok and coalesce(r.wifi_plan_months, -1) <> 0 then 'WiFi details not registered'
                        else 'RO details not registered' end,
                   'setup_ops', coalesce(r.last_item_done, r.setup_date::timestamptz),
                   'Register utility details', r_util, (t->>'utility_details_days')::int);
          end if;
          if r.payments_logged_at is not null
             and (r.wifi_ok or coalesce(r.wifi_plan_months, -1) = 0) and (r.ro_ok or coalesce(r.ro_plan_months, -1) = 0) then
            th := th || public.journey_step('setup_close_pending', 'All work done, ready to close setup', 'setup_ops', coalesce(r.last_item_done, r.setup_date::timestamptz),
                   'Mark setup closed', r_prop, (t->>'setup_close_days')::int);
          end if;
        end if;
      end if;

    elsif r.est_id is not null then
      -- 5–8 · the estimate
      if not r.est_is_sent then
        th := th || public.journey_step('estimate_draft', 'Estimate drafted, not sent', 'setup_ops', r.est_updated_at,
               'Send the estimate', r_est, (t->>'estimate_draft_days')::int);
      else
        if r.disp_author = 'landlord' and r.ei_disputed > 0 then
          th := th || public.journey_step('landlord_queried', 'Landlord query waiting for a reply', 'setup_ops', r.disp_at,
                 'Answer the landlord', r_est, (t->>'query_reply_days')::int);
        end if;
        if (r.ei_live > 0 and r.ei_pending = 0 and r.ei_disputed = 0) or r.est_status = 'approved' then
          th := th || public.journey_step('estimate_final_pending', 'Landlord approved everything, estimate not final', 'setup_ops',
                 coalesce(r.est_approved_at, r.est_last_decision, r.est_updated_at),
                 'Mark estimate final once supply confirms', r_prop, (t->>'estimate_final_days')::int);
        elsif r.ei_approved > 0 or r.ei_disputed > 0 then
          th := th || public.journey_step('landlord_deciding', r.ei_approved || ' of ' || r.ei_live || ' items approved', 'landlord',
                 coalesce(r.est_last_decision, r.est_sent_at),
                 'Supply to get the landlord to finish', r_est, (t->>'landlord_silent_days')::int);
        else
          th := th || public.journey_step('estimate_sent', 'Estimate with supply, no decision yet', 'supply', r.est_sent_at,
                 'Chase supply', r_est, (t->>'supply_forward_days')::int, null,
                 case when r.est_viewed_at is not null then 'landlord opened the link ' || to_char(r.est_viewed_at, 'DD Mon') else 'landlord has not opened the link' end);
        end if;
      end if;

    elsif coalesce(r.insp_done, 0) > 0 then
      th := th || public.journey_step('inspection_complete', 'Inspection done, no estimate', 'setup_ops', r.insp_done_at,
             'Create the estimate', r_prop || '/estimates', (t->>'estimate_not_created_days')::int);
    elsif coalesce(r.insp_n, 0) > 0 then
      th := th || public.journey_step('inspection_in_progress', 'Inspection started, not finished', 'setup_ops', r.insp_latest_at,
             'Finish the inspection', r_prop, (t->>'inspection_draft_days')::int);
    else
      th := th || public.journey_step('property_created', 'Property created, no inspection', 'setup_ops', r.created_at,
             'Start the inspection', r_prop, (t->>'onboarded_days')::int);
    end if;

    -- silence is a defect
    if jsonb_array_length(th) = 0 then
      th := jsonb_build_array(public.journey_step('unclassified', 'No rule matched', 'setup_ops', r.created_at,
             'Look at the property', r_prop, null, 'today', 'no evidence matched any stage'));
    end if;

    -- headline: most urgent, then what this person can act on, then nearest the setup date, then earliest step, then oldest
    select x.v into best
      from jsonb_array_elements(th) x(v)
     order by case x.v->>'urgency' when 'overdue' then 0 when 'today' then 1 when 'soon' then 2 when 'waiting' then 3 else 4 end,
              case when x.v->>'waiting_on' = 'setup_ops' then 0 else 1 end,
              (x.v->>'stage_no')::int,
              (x.v->>'age_days')::int desc,
              x.v->>'code'
     limit 1;

    pid := r.pid; property_name := r.name; owner_email := r.owner;
    stage_code := best->>'code'; stage_label := best->>'label';
    blocked_on := best->>'waiting_on'; waiting_on := best->>'waiting_on';
    since := (best->>'since')::timestamptz; age_days := (best->>'age_days')::int;
    next_action_label := best->>'next_action_label'; next_action_route := best->>'next_action_route';
    urgency := best->>'urgency';
    setup_date := r.setup_date; days_to_setup := d;
    enrichment_missing := r.enrich_missing;
    open_threads := (select jsonb_agg(x.v order by (x.v = best) desc,
                       case x.v->>'urgency' when 'overdue' then 0 when 'today' then 1 when 'soon' then 2 when 'waiting' then 3 else 4 end,
                       (x.v->>'stage_no')::int)
                       from jsonb_array_elements(th) x(v));
    return next;
  end loop;
end
$$;

create or replace function public.property_journey_counts(p_scope text default 'me')
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total',              count(*),
    'needs_you',          count(*) filter (where waiting_on = 'setup_ops' and urgency <> 'done'),
    'overdue',            count(*) filter (where urgency = 'overdue'),
    'today',              count(*) filter (where urgency = 'today'),
    'soon',               count(*) filter (where urgency = 'soon'),
    'waiting',            count(*) filter (where waiting_on in ('supply','landlord','vendor') and urgency <> 'done'),
    'on_supply',          count(*) filter (where waiting_on = 'supply'),
    'on_landlord',        count(*) filter (where waiting_on = 'landlord'),
    'on_vendor',          count(*) filter (where waiting_on = 'vendor'),
    'setups_this_week',   count(*) filter (where days_to_setup between 0 and 6),
    'done',               count(*) filter (where urgency = 'done'),
    'unclassified',       count(*) filter (where stage_code = 'unclassified'),
    'unowned',            count(*) filter (where owner_email is null),
    'enrichment_missing', count(*) filter (where enrichment_missing)
  )
  from public.property_journey_state(p_scope)
$$;

create index if not exists property_utilities_pid_idx on public.property_utilities (pid);

revoke all on function public.journey_thresholds() from public, anon;
revoke all on function public.journey_step(text,text,text,timestamptz,text,text,int,text,text) from public, anon;
revoke all on function public.journey_lead_urgency(int,int) from public, anon;
revoke all on function public.property_journey_state(text) from public, anon;
revoke all on function public.property_journey_counts(text) from public, anon;
grant execute on function public.journey_thresholds() to authenticated;
grant execute on function public.journey_step(text,text,text,timestamptz,text,text,int,text,text) to authenticated;
grant execute on function public.journey_lead_urgency(int,int) to authenticated;
grant execute on function public.property_journey_state(text) to authenticated;
grant execute on function public.property_journey_counts(text) to authenticated;

commit;

-- VERIFY · stage distribution
select stage_code, waiting_on, urgency, count(*) n, string_agg(pid, ', ' order by pid) pids
  from public.property_journey_state('all') group by 1, 2, 3 order by 4 desc, 1;
