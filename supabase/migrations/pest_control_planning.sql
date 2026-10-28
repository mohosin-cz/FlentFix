-- Pest control in utility planning, beside WiFi and RO.
--
-- It isn't a connection with a plan length. It is one treatment on a day,
-- booked with a pest control partner, best done while the home is empty.
-- So planning books what (general, bed bugs, termite, rodents) and when,
-- instead of 1/3/6/9/12 months. Like WiFi and RO it then has to be recorded
-- on the Utilities page (type pest_control, with the date it was done), and
-- setup can't close until it is, or it was marked not needed.
-- The Utilities record's "treat again every" drives the next-treatment countdown.
--
--   pest_treatment: what was booked, e.g. 'General, Bed bugs'; 'none' = not needed

begin;

alter table public.properties
  add column if not exists pest_requested_at timestamptz,
  add column if not exists pest_requested_by text,
  add column if not exists pest_treatment text,
  add column if not exists pest_date date;

create or replace function public.property_setup_checks(p public.properties)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'wifi', jsonb_build_object(
      'requested_at', p.wifi_requested_at, 'requested_by', p.wifi_requested_by, 'plan_months', p.wifi_plan_months,
      'not_needed', coalesce(p.wifi_plan_months = 0, false),
      'registered', exists (select 1 from property_utilities u where u.pid = p.pid and u.utility_type = 'wifi' and u.status = 'active'
                              and nullif(u.account_number, '') is not null and nullif(u.ssid, '') is not null and nullif(u.wifi_password, '') is not null)),
    'ro', jsonb_build_object(
      'requested_at', p.ro_requested_at, 'requested_by', p.ro_requested_by, 'plan_months', p.ro_plan_months,
      'not_needed', coalesce(p.ro_plan_months = 0, false),
      'registered', exists (select 1 from property_utilities u where u.pid = p.pid and u.utility_type = 'water_purifier' and u.status = 'active'
                              and nullif(u.provider, '') is not null and u.start_date is not null)),
    'pest', jsonb_build_object(
      'requested_at', p.pest_requested_at, 'requested_by', p.pest_requested_by, 'treatment', p.pest_treatment, 'date', p.pest_date,
      'not_needed', coalesce(p.pest_treatment = 'none', false),
      'registered', exists (select 1 from property_utilities u where u.pid = p.pid and u.utility_type = 'pest_control' and u.status = 'active'
                              and u.start_date is not null)),
    'payments_logged', jsonb_build_object('at', p.payments_logged_at, 'by', p.payments_logged_by))
$$;

-- Book the treatment (what + day), mark it not needed ('none'), or undo (null).
create or replace function public.property_book_pest(p_pid text, p_treatment text, p_date date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := nullif(lower(coalesce(auth.jwt() ->> 'email', '')), ''); p properties%rowtype;
        v text := nullif(btrim(coalesce(p_treatment, '')), '');
begin
  if me is null then raise exception 'Sign in first'; end if;
  select * into p from properties where pid = p_pid and deleted_at is null for update;
  if not found then raise exception 'No live property %', p_pid; end if;
  if p.setup_closed_at is not null then raise exception 'Setup is closed — undo that first'; end if;
  if v is null then
    update properties set pest_requested_at = null, pest_requested_by = null, pest_treatment = null, pest_date = null where pid = p_pid;
  elsif v = 'none' then
    update properties set pest_requested_at = now(), pest_requested_by = me, pest_treatment = 'none', pest_date = null where pid = p_pid;
  else
    if p_date is null then raise exception 'Pick the treatment day'; end if;
    update properties set pest_requested_at = now(), pest_requested_by = me, pest_treatment = v, pest_date = p_date where pid = p_pid;
  end if;
  return property_milestones(p_pid);
end $$;
revoke all on function public.property_book_pest(text, text, date) from public, anon;
grant execute on function public.property_book_pest(text, text, date) to authenticated;

-- The property's history logs the booking like the WiFi / RO requests.
create or replace function public.properties_log_setup_checks()
returns trigger language plpgsql security definer set search_path = public as $$
declare me text := coalesce(nullif(lower(coalesce(auth.jwt() ->> 'email', '')), ''), 'system');
begin
  if old.wifi_requested_at is distinct from new.wifi_requested_at or old.wifi_plan_months is distinct from new.wifi_plan_months then
    insert into property_journey (pid, stage, changed_by, notes) values (new.pid, 'wifi_requested', me,
      case when new.wifi_requested_at is null then 'undone' when new.wifi_plan_months = 0 then 'not needed' else new.wifi_plan_months || '-month plan' end);
  end if;
  if old.ro_requested_at is distinct from new.ro_requested_at or old.ro_plan_months is distinct from new.ro_plan_months then
    insert into property_journey (pid, stage, changed_by, notes) values (new.pid, 'ro_requested', me,
      case when new.ro_requested_at is null then 'undone' when new.ro_plan_months = 0 then 'not needed' else new.ro_plan_months || '-month plan' end);
  end if;
  if old.pest_requested_at is distinct from new.pest_requested_at or old.pest_treatment is distinct from new.pest_treatment
     or old.pest_date is distinct from new.pest_date then
    insert into property_journey (pid, stage, changed_by, notes) values (new.pid, 'pest_booked', me,
      case when new.pest_requested_at is null then 'undone' when new.pest_treatment = 'none' then 'not needed'
           else new.pest_treatment || ' · ' || to_char(new.pest_date, 'DD Mon YYYY') end);
  end if;
  if old.payments_logged_at is distinct from new.payments_logged_at then
    insert into property_journey (pid, stage, changed_by, notes) values (new.pid, 'payments_logged', me,
      case when new.payments_logged_at is null then 'undone' else 'all payments logged' end);
  end if;
  return new;
end $$;

drop trigger if exists trg_properties_log_setup_checks on public.properties;
create trigger trg_properties_log_setup_checks
  after update of wifi_requested_at, wifi_plan_months, ro_requested_at, ro_plan_months,
                  pest_requested_at, pest_treatment, pest_date, payments_logged_at on public.properties
  for each row execute function public.properties_log_setup_checks();

-- Below: the live definitions with pest control added — setup closure,
-- the journey (planning + closure steps), the setup panel, My Desk's
-- "coming up", and the team page's stale-utilities count.

CREATE OR REPLACE FUNCTION public.property_journey_state(p_scope text DEFAULT 'me'::text)
 RETURNS TABLE(pid text, property_name text, owner_email text, stage_code text, stage_label text, blocked_on text, since timestamp with time zone, age_days integer, next_action_label text, next_action_route text, urgency text, open_threads jsonb, waiting_on text, setup_date date, days_to_setup integer, enrichment_missing boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
         and p.journey_paused_at is null   -- clean slate: paused properties raise no tasks
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
             bool_or(u.utility_type = 'pest_control' and u.status = 'active' and u.start_date is not null) pest_ok,
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
      -- an invoice counts only once it's final (sent / paid / overdue) and has lines:
      -- opening the invoice page creates a draft, and a draft isn't invoicing
      select distinct on (li.pid) li.pid, li.inspection_id, li.created_at
        from base b join landlord_invoices li on li.pid = b.pid
       where li.status in ('sent', 'paid', 'overdue')
         and exists (select 1 from landlord_invoice_items ii where ii.invoice_id = li.id)
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
           coalesce(u.wifi_ok, false) wifi_ok, coalesce(u.ro_ok, false) ro_ok, coalesce(u.pest_ok, false) pest_ok,
           b.wifi_requested_at, b.wifi_plan_months, b.ro_requested_at, b.ro_plan_months, b.pest_requested_at, b.pest_treatment, b.payments_logged_at,
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
        if exists (select 1 from landlord_invoices d where d.pid = r.pid and d.status = 'draft'
                    and exists (select 1 from landlord_invoice_items ii where ii.invoice_id = d.id)) then
          th := th || public.journey_step('invoice_pending', 'Invoice drafted, not final', 'setup_ops', r.wo_shared_at,
                 'Finish and finalise the invoice', r_inv, (t->>'invoice_days')::int);
        else
          th := th || public.journey_step('invoice_pending', 'Work order shared, no invoice', 'setup_ops', r.wo_shared_at,
                 'Create the landlord invoice', r_inv, (t->>'invoice_days')::int);
        end if;
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
      -- planning utilities = the request to the WiFi and RO partners and the pest
      -- control booking (ticks on the property page)
      if r.setup_date is not null and d >= 0 and (r.wifi_requested_at is null or r.ro_requested_at is null or r.pest_requested_at is null) then
        th := th || public.journey_step('utilities_unplanned',
               array_to_string(array_remove(array[
                 case when r.wifi_requested_at is null then 'WiFi' end,
                 case when r.ro_requested_at is null then 'RO' end,
                 case when r.pest_requested_at is null then 'pest control' end], null), ', ')
               || case when r.wifi_requested_at is null or r.ro_requested_at is null then ' not requested' else ' not booked' end,
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
          if (not r.wifi_ok and coalesce(r.wifi_plan_months, -1) <> 0) or (not r.ro_ok and coalesce(r.ro_plan_months, -1) <> 0)
             or (not r.pest_ok and r.pest_treatment is distinct from 'none') then
            th := th || public.journey_step('utility_details_pending',
                   array_to_string(array_remove(array[
                     case when not r.wifi_ok and coalesce(r.wifi_plan_months, -1) <> 0 then 'WiFi' end,
                     case when not r.ro_ok and coalesce(r.ro_plan_months, -1) <> 0 then 'RO' end,
                     case when not r.pest_ok and r.pest_treatment is distinct from 'none' then 'pest control' end], null), ', ')
                   || ' not registered',
                   'setup_ops', coalesce(r.last_item_done, r.setup_date::timestamptz),
                   'Register utility details', r_util, (t->>'utility_details_days')::int);
          end if;
          if r.payments_logged_at is not null
             and (r.wifi_ok or coalesce(r.wifi_plan_months, -1) = 0) and (r.ro_ok or coalesce(r.ro_plan_months, -1) = 0)
             and (r.pest_ok or r.pest_treatment = 'none') then
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
$function$;

CREATE OR REPLACE FUNCTION public.property_mark_milestone(p_pid text, p_key text, p_date date DEFAULT NULL::date, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me   text := nullif(lower(coalesce(auth.jwt() ->> 'email', '')), '');
  p    properties%rowtype;
  keys text[] := journey_milestone_keys();
  i    int := array_position(keys, p_key);
begin
  if me is null then raise exception 'Sign in to mark milestones'; end if;
  if i is null then raise exception 'Unknown milestone %', p_key; end if;
  select * into p from properties where pid = p_pid and deleted_at is null for update;
  if not found then raise exception 'No live property %', p_pid; end if;

  -- moving the setup date: allowed until setup is closed
  if p_key = 'setup_date' and p.setup_date is not null then
    if p_date is null then raise exception 'Pick a setup date'; end if;
    if p.setup_closed_at is not null then raise exception 'Setup is already closed — undo that first to move the date'; end if;
    update properties set setup_date = p_date, setup_date_by = me where pid = p_pid;
    return property_milestones(p_pid);
  end if;

  if journey_milestone_at(p, p_key) is not null then raise exception 'Already marked'; end if;

  -- Nothing moves past the estimate until it is marked final. (A setup date can
  -- arrive from Stage without one, so the previous-step check alone isn't enough.)
  if p_key <> 'estimate_final' and p.estimate_final_at is null then
    raise exception 'Mark the estimate final first';
  end if;

  -- And it is only final once the landlord has answered every live line.
  if p_key = 'estimate_final' then
    declare v_est uuid; v_open int;
    begin
      select id into v_est from estimates where pid = p_pid order by created_at desc limit 1;
      if v_est is null then raise exception 'There is no estimate for this property yet'; end if;
      v_open := estimate_undecided(v_est);
      if v_open > 0 then
        raise exception '% item% still need% a decision — mark each one approved or rejected on the workbench, then mark final',
          v_open, case when v_open = 1 then '' else 's' end, case when v_open = 1 then 's' else '' end;
      end if;
      update estimates set locked = true, locked_at = coalesce(locked_at, now()), locked_by = coalesce(locked_by, me) where id = v_est;
    end;
  end if;
  if i > 1 and journey_milestone_at(p, keys[i - 1]) is null then
    raise exception 'Mark "%" first', replace(keys[i - 1], '_', ' ');
  end if;

  case p_key
    when 'estimate_final' then update properties set estimate_final_at = now(), estimate_final_by = me where pid = p_pid;
    when 'setup_date'     then
      if p_date is null then raise exception 'Pick a setup date'; end if;
      update properties set setup_date = p_date, setup_date_by = me where pid = p_pid;
    when 'setup_closed'   then
      declare c jsonb := property_setup_checks(p); missing text[] := '{}';
      begin
        if p.payments_logged_at is null then missing := missing || 'confirm all payments are logged'::text; end if;
        if not (c->'wifi'->>'not_needed')::boolean and not (c->'wifi'->>'registered')::boolean then missing := missing || 'register the WiFi details'::text; end if;
        if not (c->'ro'->>'not_needed')::boolean and not (c->'ro'->>'registered')::boolean then missing := missing || 'register the RO details'::text; end if;
        if not (c->'pest'->>'not_needed')::boolean and not (c->'pest'->>'registered')::boolean then missing := missing || 'record the pest control treatment'::text; end if;
        if cardinality(missing) > 0 then
          raise exception 'Setup can''t close yet: %', array_to_string(missing, ', ');
        end if;
        update properties set setup_closed_at = now(), setup_closed_by = me where pid = p_pid;
      end;
    when 'qc_done'        then update properties set qc_done_at = now(), qc_done_by = me where pid = p_pid;
    when 'handover_done'  then update properties set handover_done_at = now(), handover_done_by = me where pid = p_pid;
    when 'wo_shared'      then update properties set wo_shared_at = now(), wo_shared_by = me where pid = p_pid;
    when 'closed'         then update properties set closed_at = coalesce(p_date::timestamptz, now()), closed_by = me,
                                                     closure_note = nullif(btrim(p_note), '') where pid = p_pid;
  end case;
  return property_milestones(p_pid);
end
$function$;

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

CREATE OR REPLACE FUNCTION public.home_desk(p_since timestamp with time zone DEFAULT NULL::timestamp with time zone, p_as text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me    text := lower(coalesce(auth.jwt() ->> 'email', ''));
  since timestamptz := coalesce(p_since, now() - interval '24 hours');
  today date := (now() at time zone 'Asia/Kolkata')::date;
  ist_hour int := extract(hour from now() at time zone 'Asia/Kolkata');
  mine  text[];
  active text[];
  out   jsonb;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_as is not null and lower(p_as) <> me then
    if not pulse_is_admin() then raise exception 'Only an admin can view someone else''s desk'; end if;
    me := lower(btrim(p_as));
    -- "since they last looked", not since the admin did
    since := coalesce((select coalesce(h.prev_seen_at, h.last_seen_at) from home_seen h where h.user_email = me),
                      now() - interval '24 hours');
  end if;

  select coalesce(array_agg(pid), '{}') into mine from properties
   where deleted_at is null and (lower(owner_email) = me or lower(assigned_to) = me)
     and pid !~* '^\s*no\s*pid\s*$';
  -- properties paused at the clean slate raise nothing here (renewals still show: tenants' WiFi/RO)
  -- only properties still being worked raise tasks: not paused, closed or archived
  select coalesce(array_agg(pid), '{}') into active from properties where pid = any(mine) and journey_paused_at is null and closed_at is null and archived_at is null;

  with names as (
    select p.pid, coalesce(nullif(btrim(p.name), ''), flent_site_name(p.pid), p.pid) as name
      from properties p where p.pid = any(active)
  ),

  -- since you last looked ------------------------------------------------
  ev as (
    select e.*, es.pid from estimate_events e join estimates es on es.id = e.estimate_id
     where es.pid = any(active) and e.created_at > since
  ),
  feed as (
    -- approvals, one line per estimate
    select 'approved' kind, pid, max(created_at) at,
           count(*) filter (where event_type = 'item_approved') n,
           bool_or(event_type in ('approved', 'partially_approved')) whole,
           string_agg(distinct coalesce(meta ->> 'email', meta ->> 'name'), ', ') who, null::text detail
      from ev where event_type in ('item_approved', 'approved', 'partially_approved')
                and lower(coalesce(meta ->> 'email', '')) <> me group by pid
    union all
    -- questions, one line each
    select 'queried', pid, created_at, 1, false, coalesce(meta ->> 'email', meta ->> 'name'), meta ->> 'query'
      from ev where event_type = 'queried' and lower(coalesce(meta ->> 'email', '')) <> me
    union all
    -- opens, one line per estimate
    select 'viewed', pid, max(created_at), count(*), false, null, null
      from ev where event_type = 'viewed' and actor = 'landlord' group by pid
    union all
    -- vendor closes, one line per work order
    -- whole = every one of them already verified
    select 'vendor_closed', w.pid, max(i.vendor_closed_at), count(*), bool_and(i.status = 'verified'), coalesce(max(v.full_name), max(w.vendor_name)), max(w.trade)
      from work_order_items i join work_orders w on w.id = i.work_order_id left join vendors v on v.id = w.vendor_id
     where w.pid = any(active) and i.vendor_closed_at > since and i.status in ('vendor_closed', 'verified')
     group by w.id, w.pid
    union all
    -- payments logged by someone else
    select 'payment', pp.pid, pp.created_at, 1, false, split_part(coalesce(pp.created_by, ''), '@', 1),
           '₹' || to_char(coalesce(pp.amount, 0), 'FM99,99,99,999') || coalesce(' to ' || nullif(btrim(pp.payee_name), ''), '')
      from property_payments pp
     where pp.pid = any(active) and pp.created_at > since and lower(coalesce(pp.created_by, '')) <> me
    union all
    -- journey moves by someone else (dates set or moved, milestones)
    select 'journey', j.pid, j.changed_at, 1, false, split_part(coalesce(j.changed_by, ''), '@', 1),
           initcap(replace(j.stage, '_', ' ')) || coalesce(' · ' || nullif(btrim(j.notes), ''), '')
      from property_journey j
     where j.pid = any(active) and j.changed_at > since and lower(coalesce(j.changed_by, '')) not in (me, 'system', '')
    union all
    -- exploratory: supply raised one (admins hear about every new request)
    select 'explore_raised', 'explore:' || x.id, x.created_at, 1, false, coalesce(x.requester, 'supply'),
           coalesce(x.property_name, 'a property') || coalesce(' · ' || x.configuration, '') || ' · ' || explore_slot_text(x.visit_date, x.visit_time)
      from stage_exploratory x
     where me = any(pulse_admins()) and x.created_at > since and x.archived_at is null and coalesce(x.property_name, '') !~* '^\s*\[test\]'
    union all
    -- exploratory: someone logged a visit (admins; n = 1 go, 2 no-go, 3 unsure)
    select 'explore_logged', 'explore:' || l.request_id, l.submitted_at,
           case l.verdict when 'go' then 1 when 'no_go' then 2 else 3 end, l.in_stage_at is not null, split_part(l.author, '@', 1), x.property_name
      from exploratory_logs l join stage_exploratory x on x.id = l.request_id
     where me = any(pulse_admins()) and l.submitted_at > since and l.author <> me
    union all
    -- exploratory: supply decided one I'm on (or any, for admins)
    select 'explore_decided', 'explore:' || x.id, x.stage_updated_at, 1, x.status = 'rejected', x.status, x.property_name
      from stage_exploratory x left join exploratory_assignments a on a.request_id = x.id
     where x.status in ('approved', 'rejected', 'converted') and x.stage_updated_at > since
       and (me = any(pulse_admins()) or lower(coalesce(a.assignee, x.stage_inspector)) = me)
  ),

  -- ready to verify --------------------------------------------------------
  vf as (
    select w.id wo_id, w.pid, coalesce(max(v.full_name), max(w.vendor_name), 'Vendor') vendor, max(w.trade) trade,
           min(i.vendor_closed_at) oldest,
           jsonb_agg(jsonb_build_object('id', i.id, 'name', coalesce(li.item_name, i.description), 'what', i.description,
                                        'area', i.area, 'note', i.vendor_note, 'closed_at', i.vendor_closed_at)
                     order by i.sort_order) items
      from work_order_items i
      join work_orders w on w.id = i.work_order_id
      left join vendors v on v.id = w.vendor_id
      left join inspection_line_items li on li.id = i.inspection_line_item_id
     where w.pid = any(active) and i.status = 'vendor_closed'
     group by w.id, w.pid
  ),

  -- estimates with the landlord -------------------------------------------
  est as (
    select distinct on (es.pid) es.id, es.pid, es.status, es.total, es.first_viewed_at,
           coalesce(es.sent_at, (select max(x.created_at) from estimate_events x where x.estimate_id = es.id and x.event_type = 'sent')) sent_at
      from estimates es
     where es.pid = any(active) and es.status in ('sent', 'viewed', 'partially_approved') and coalesce(es.locked, false) = false
       -- still undecided: the property is not marked final or closed
       and exists (select 1 from properties p where p.pid = es.pid and p.estimate_final_at is null and p.closed_at is null)
     order by es.pid, es.created_at desc
  ),
  est2 as (
    select est.*,
           (select count(*) from estimate_events x where x.estimate_id = est.id and x.event_type = 'viewed' and x.actor = 'landlord') views,
           (select max(x.created_at) from estimate_events x where x.estimate_id = est.id and x.event_type = 'viewed' and x.actor = 'landlord') last_view,
           (select count(*) from estimate_items ei where ei.estimate_id = est.id and ei.status = 'approved') approved,
           (select count(*) from estimate_items ei where ei.estimate_id = est.id
               and coalesce(ei.status, 'pending') not in ('removed', 'excluded') and ei.cost_type is distinct from 'nil') lines,
           (select count(*) from estimate_disputes d where d.estimate_id = est.id) questions
      from est
     where est.sent_at > now() - interval '60 days'   -- older ones were settled off Pulse
  ),

  -- renewals ---------------------------------------------------------------
  ren as (
    select u.id, u.pid, u.utility_type, u.provider, u.billing_amount, u.billing_cycle, u.last_recharged_on,
           utility_next_due(coalesce(u.last_recharged_on, u.start_date), u.billing_cycle) due
      from property_utilities u
     where u.pid = any(mine) and u.status = 'active' and u.utility_type in ('wifi', 'water_purifier')
       and not exists (select 1 from properties ap where ap.pid = u.pid and ap.archived_at is not null)   -- tenants' renewals continue after close, not after archive
  ),

  -- this week ----------------------------------------------------------------
  wk as (
    select p.pid, 'setup' kind, p.setup_date d from properties p where p.pid = any(active) and p.setup_date between today and today + 6
    union all
    select p.pid, 'handover', p.handover_date from properties p
     where p.pid = any(active) and p.handover_done_at is null and p.handover_date between today and today + 6
    union all
    select '·' || x.id::text, 'exploratory', x.visit_date from stage_exploratory x
      left join exploratory_assignments a on a.request_id = x.id
     where lower(coalesce(a.assignee, x.stage_inspector)) = me and x.status in ('new_request', 'visit_scheduled')
       and x.archived_at is null and x.visit_date between today and today + 6
    union all
    select w.pid, 'close_by', min(coalesce(w.scheduled_end, w.scheduled_start))::date from work_orders w
     where w.pid = any(active) and w.status not in ('verified', 'cancelled')
     group by w.pid having min(coalesce(w.scheduled_end, w.scheduled_start))::date between today and today + 6
  ),

  -- no-shows on setup day ------------------------------------------------------
  ns as (
    select p.pid, w.vendor_id, coalesce(v.full_name, max(w.vendor_name)) vendor, max(w.trade) trade, v.phone
      from properties p
      join work_orders w on w.pid = p.pid and w.vendor_id is not null
      left join vendors v on v.id = w.vendor_id
     where p.pid = any(active) and p.setup_date = today and ist_hour >= 11
       and exists (select 1 from work_order_items i where i.work_order_id = w.id and i.status in ('pending', 'disputed'))
       and not exists (select 1 from vendor_attendance a where a.vendor_id = w.vendor_id and a.pid = p.pid and a.punch_type = 'in'
                        and (a.punched_at at time zone 'Asia/Kolkata')::date = today)
       and not vendor_on_leave(w.vendor_id, today)   -- on approved leave is not a no-show
     group by p.pid, w.vendor_id, v.full_name, v.phone
  )

  select jsonb_build_object(
    'me', me,
    'is_admin', pulse_is_admin(),          -- the person looking, not the desk shown
    'since', since,
    'mine', to_jsonb(mine),

    'feed', coalesce((select jsonb_agg(jsonb_build_object('kind', f.kind, 'pid', f.pid, 'name', n.name, 'at', f.at, 'n', f.n,
                                                          'whole', f.whole, 'who', f.who, 'detail', f.detail) order by f.at desc)
                        from (select * from feed order by at desc limit 40) f left join names n on n.pid = f.pid), '[]'),

    'verify', coalesce((select jsonb_agg(jsonb_build_object('wo_id', vf.wo_id, 'pid', vf.pid, 'name', n.name, 'vendor', vf.vendor,
                                                            'trade', vf.trade, 'oldest', vf.oldest, 'items', vf.items) order by vf.oldest)
                          from vf left join names n on n.pid = vf.pid), '[]'),

    'estimates', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'pid', e.pid, 'name', n.name, 'sent_at', e.sent_at, 'total', e.total,
                                                               'views', e.views, 'last_view', e.last_view, 'approved', e.approved, 'lines', e.lines,
                                                               'questions', e.questions) order by e.sent_at nulls last)
                             from est2 e left join names n on n.pid = e.pid), '[]'),

    'renewals', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'pid', r.pid, 'name', n.name, 'type', r.utility_type,
                                                              'provider', r.provider, 'amount', r.billing_amount, 'cycle', r.billing_cycle,
                                                              'due', r.due, 'days', r.due - today, 'last_recharged_on', r.last_recharged_on) order by r.due)
                            from ren r left join names n on n.pid = r.pid where r.due is not null and r.due <= today + 14), '[]'),

    'drafts', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'pid', i.pid, 'name', coalesce(nm.name, i.pid), 'created_at', i.created_at,
                                                            'config', i.config) order by i.created_at desc)
                          from (select * from inspections i where i.status = 'draft' and lower(i.owner_email) = me
                                  and i.created_at > now() - interval '30 days' order by i.created_at desc limit 3) i
                          left join (select p.pid, coalesce(nullif(btrim(p.name), ''), p.pid) name from properties p) nm on nm.pid = i.pid), '[]'),

    'week', coalesce((select jsonb_agg(jsonb_build_object('pid', w.pid, 'name', coalesce(n.name, x.property_name), 'kind', w.kind, 'date', w.d,
                                                          'request_id', x.id) order by w.d, w.kind)
                        from wk w left join names n on n.pid = w.pid
                        left join stage_exploratory x on w.kind = 'exploratory' and '·' || x.id::text = w.pid), '[]'),

    -- my exploratory visits: today onwards, and any whose date passed with no findings yet
    'exploratory', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.property_name, 'config', x.configuration,
                               'address', x.address, 'maps_link', x.maps_link, 'owner_name', x.owner_name, 'owner_phone', x.owner_phone,
                               'date', x.visit_date, 'time', x.visit_time, 'status', x.status, 'days', x.visit_date - today,
                               'overdue', x.visit_date < today, 'notes', x.notes,
                               'pulse_assigned', a.assignee is not null, 'confirmed', a.confirmed_at is not null,
                               'draft', exists (select 1 from exploratory_logs l where l.request_id = x.id and l.author = me and l.submitted_at is null)) order by x.visit_date)
                          from stage_exploratory x left join exploratory_assignments a on a.request_id = x.id
                         where lower(coalesce(a.assignee, x.stage_inspector)) = me and x.archived_at is null
                           and x.status in ('new_request', 'visit_scheduled') and x.visit_date >= today - 14), '[]'),

    -- coming up: setups and handovers in the next 7 days, with what each needs
    'today', coalesce((select jsonb_agg(jsonb_build_object('pid', p.pid, 'name', n.name, 'kind', k.kind, 'date', k.d, 'days', k.d - today,
                                                           'qc_done', p.qc_done_at is not null,
                                                           'wifi', jsonb_build_object('requested_at', p.wifi_requested_at, 'months', p.wifi_plan_months),
                                                           'ro',   jsonb_build_object('requested_at', p.ro_requested_at, 'months', p.ro_plan_months),
                                                           'pest', jsonb_build_object('requested_at', p.pest_requested_at, 'treatment', p.pest_treatment, 'date', p.pest_date),
                                                           'panel', case when k.kind = 'setup' then property_setup_panel(p.pid) - 'history' end) order by k.d, k.kind)
                         from (select pid, 'setup' kind, setup_date d from properties
                                where pid = any(active) and setup_date between today and today + 6 and setup_closed_at is null
                               union all
                               select pid, 'handover', handover_date from properties
                                where pid = any(active) and handover_done_at is null and handover_date between today and today + 6) k
                         join properties p on p.pid = k.pid left join names n on n.pid = k.pid), '[]'),

    'noshow', coalesce((select jsonb_agg(jsonb_build_object('pid', ns.pid, 'name', n.name, 'vendor', ns.vendor, 'trade', ns.trade, 'phone', ns.phone))
                          from ns left join names n on n.pid = ns.pid), '[]'),

    'pins', coalesce((select jsonb_agg(jsonb_build_object('pid', hp.pid, 'name', coalesce(nullif(btrim(p.name), ''), hp.pid), 'note', hp.note,
                                                          'remind_at', hp.remind_at, 'due', hp.remind_at is not null and hp.remind_at <= now())
                                       order by (hp.remind_at is not null and hp.remind_at <= now()) desc, hp.updated_at desc)
                        from home_pins hp left join properties p on p.pid = hp.pid
                       where hp.user_email = me), '[]')
  ) into out;

  return out;
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
                 and not exists (select 1 from property_utilities u where u.pid = l.pid and u.utility_type = 'water_purifier' and u.status = 'active'))
            or (l.pest_date < current_date - 10 and l.pest_treatment is distinct from 'none'
                 and not exists (select 1 from property_utilities u where u.pid = l.pid and u.utility_type = 'pest_control' and u.status = 'active')))),
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

commit;
