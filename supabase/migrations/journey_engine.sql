-- Branch A · feat/journey-engine
--
-- One function answers, for any property: what stage, blocked on whom, how
-- long, what next. Home, notifications, the property page and the digest all
-- read it. Nothing here is stored — every stage is derived from evidence that
-- already exists (estimates.sent_at, the newest dispute, work_orders.*) so it
-- cannot go stale when someone edits a row in the SQL editor or the portals.
--
-- Also settles the two §6 prerequisites the user decided on:
--   · handover gets real columns (handover_date, handover_done_at)
--   · ownership: whoever creates a property owns it. properties.owner_email
--     was null on every row; the inspection rows carry it. Backfilled from
--     the earliest inspection per pid, and defaulted from the JWT on insert
--     from now on (BEFORE INSERT only — the upsert in InspectionMode takes
--     the UPDATE path for existing rows, so this never overwrites).
--
-- Paste the whole file into the SQL editor. The last statement prints the
-- stage distribution for VERIFY.

begin;

-- ---------------------------------------------------------------------------
-- 1 · Handover / T-Day (stage 19) — it was in the process and not the schema.
-- ---------------------------------------------------------------------------
alter table public.properties
  add column if not exists handover_date    date,
  add column if not exists handover_done_at timestamptz;

comment on column public.properties.handover_date    is 'Planned T-Day. Set by setup ops once the work is verified.';
comment on column public.properties.handover_done_at is 'When the keys actually went over. Null until it happened.';

-- ---------------------------------------------------------------------------
-- 2 · Ownership
-- ---------------------------------------------------------------------------
create or replace function public.properties_default_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_email is null then
    new.owner_email := nullif(lower(coalesce(auth.jwt() ->> 'email', '')), '');
  end if;
  return new;
end
$$;

drop trigger if exists trg_properties_default_owner on public.properties;
create trigger trg_properties_default_owner
  before insert on public.properties
  for each row execute function public.properties_default_owner();

-- One-off backfill: the person who did the first inspection created the
-- property. Only fills nulls; never overwrites a value someone set by hand.
update public.properties p
   set owner_email = i.owner_email
  from (
    select distinct on (pid) pid, lower(owner_email) as owner_email
      from public.inspections
     where owner_email is not null and pid is not null
     order by pid, created_at asc
  ) i
 where p.pid = i.pid
   and p.owner_email is null;

-- Second pass: older inspections carry no owner_email, but the journey log
-- records who moved the property forward first. 'system' is not a person.
update public.properties p
   set owner_email = j.changed_by
  from (
    select distinct on (pid) pid, lower(changed_by) as changed_by
      from public.property_journey
     where changed_by is not null and changed_by <> 'system' and changed_by like '%@%'
     order by pid, changed_at asc
  ) j
 where p.pid = j.pid
   and p.owner_email is null;

-- ---------------------------------------------------------------------------
-- 3 · Indexes the engine leans on. Everything joins by pid text.
-- ---------------------------------------------------------------------------
create index if not exists properties_live_pid_idx     on public.properties (pid) where deleted_at is null;
create index if not exists inspections_pid_created_idx on public.inspections (pid, created_at desc);
create index if not exists estimates_pid_created_idx   on public.estimates (pid, created_at desc);
create index if not exists estimate_items_estimate_idx on public.estimate_items (estimate_id);
create index if not exists estimate_disputes_est_idx   on public.estimate_disputes (estimate_id, created_at desc);
create index if not exists estimate_events_est_idx     on public.estimate_events (estimate_id, event_type);
create index if not exists work_orders_pid_idx         on public.work_orders (pid);
create index if not exists work_order_items_wo_idx     on public.work_order_items (work_order_id);
create index if not exists landlord_invoices_pid_idx   on public.landlord_invoices (pid, created_at desc);

-- ---------------------------------------------------------------------------
-- 4 · Thresholds. Every "how many days is too long" lives here and nowhere
--     else. Branch E (alerts) reads the same object so Home and the bell can
--     never disagree about what "overdue" means.
-- ---------------------------------------------------------------------------
create or replace function public.journey_thresholds()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'onboarded_days',          7,  -- property created, nobody has started an inspection
    'inspection_draft_days',   3,  -- inspection started, never ended
    'estimate_not_created_days', 2,-- inspection done, no estimate yet
    'estimate_draft_days',     3,  -- estimate exists, never sent
    'estimate_unopened_days',  5,  -- sent, landlord has not opened the link
    'landlord_silent_days',    7,  -- opened, no decision on any item
    'query_reply_days',        1,  -- landlord asked something, we have not answered
    'work_order_pending_days', 3,  -- landlord approved, no work order raised
    'wo_unassigned_days',      2,  -- work order with no vendor
    'wo_unscheduled_days',     3,  -- vendor assigned, no date
    'scheduled_soon_days',     2,  -- "soon" window before an execution day
    'qc_pending_days',         2,  -- vendor says done, nobody has verified
    'dispute_days',            3,  -- an item sent back to the vendor
    'handover_unknown_days',   3,  -- all verified, no T-Day set
    'handover_soon_days',      3,  -- "soon" window before T-Day
    'invoice_draft_days',      3,  -- invoice drafted, not sent
    'work_day_minutes',      480   -- task_catalogue minutes → expected days on site
  )
$$;

-- ---------------------------------------------------------------------------
-- 5 · One thread. The engine builds a list of these per property.
--     urgency: overdue · today · soon · waiting · done
--       setup_ops threads are 'today' until they pass their limit, then
--       'overdue'. Landlord / vendor threads are 'waiting', then 'overdue'.
--       A caller can force 'soon' / 'done' for date-driven threads.
-- ---------------------------------------------------------------------------
create or replace function public.journey_thread(
  p_code text, p_label text, p_blocked text, p_since timestamptz,
  p_action text, p_route text, p_limit_days int, p_urgency text default null)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'code',              p_code,
    'stage_no',          case p_code
                           when 'onboarded'                  then 1
                           when 'inspection_in_progress'     then 2
                           when 'estimate_not_created'       then 4
                           when 'estimate_draft'             then 5
                           when 'estimate_sent'              then 6
                           when 'estimate_viewed'            then 7
                           when 'landlord_queried'           then 8
                           when 'landlord_partially_decided' then 9
                           when 'work_order_pending'         then 10
                           when 'wo_unassigned'              then 11
                           when 'wo_unscheduled'             then 12
                           when 'wo_scheduled'               then 13
                           when 'execution_day'              then 14
                           when 'in_progress'                then 15
                           when 'qc_pending'                 then 16
                           when 'disputed'                   then 17
                           when 'handover_unknown'           then 18
                           when 'handover_scheduled'         then 19
                           when 'handover_today'             then 19
                           when 'handover_overdue'           then 19
                           when 'handover_done'              then 19
                           when 'invoice_draft'              then 20
                           when 'invoiced'                   then 21
                           when 'archived'                   then 99
                           else 0 end,
    'label',             p_label,
    'blocked_on',        p_blocked,
    'since',             p_since,
    'age_days',          a.age,
    'next_action_label', p_action,
    'next_action_route', p_route,
    'urgency', coalesce(p_urgency,
      case
        when p_blocked = 'none'                              then 'waiting'
        when p_limit_days is not null and a.age > p_limit_days then 'overdue'
        when p_blocked = 'setup_ops'                         then 'today'
        else 'waiting'
      end))
  from (select greatest(0, floor(extract(epoch from (now() - coalesce(p_since, now()))) / 86400))::int as age) a
$$;

-- ---------------------------------------------------------------------------
-- 6 · The engine
-- ---------------------------------------------------------------------------
drop function if exists public.property_journey_state(text);
create or replace function public.property_journey_state(p_scope text default 'me')
returns table (
  pid               text,
  property_name     text,
  owner_email       text,
  stage_code        text,
  stage_label       text,
  blocked_on        text,         -- setup_ops · landlord · vendor · none
  since             timestamptz,
  age_days          int,
  next_action_label text,
  next_action_route text,
  urgency           text,         -- overdue · today · soon · waiting · done
  open_threads      jsonb         -- every open thread, headline first
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_me     text  := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_scope  text  := lower(coalesce(p_scope, 'me'));
  t        jsonb := public.journey_thresholds();
  r        record;
  th       jsonb;
  best     jsonb;
  r_prop   text;
  r_wo     text;
  r_est    text;
  r_inv    text;
  decided  boolean;
  partial  boolean;
  since_decided timestamptz;
begin
  -- 'me' = the caller. 'all' = the team. Anything else is treated as an
  -- email, so staff can look at a colleague's queue and the SQL editor (which
  -- has no JWT) can still exercise the function.
  if v_scope = 'me' then
    if v_me = '' then return; end if;
  elsif v_scope <> 'all' then
    v_me := v_scope;
    v_scope := 'me';
  end if;

  for r in
    with insp_owner as (
      -- the first inspector is the creator; used only where properties.owner_email is still null
      select distinct on (i.pid) i.pid, lower(i.owner_email) as e
        from inspections i
       where i.owner_email is not null and i.pid is not null
       order by i.pid, i.created_at asc
    ),
    journey_owner as (
      -- and failing that, whoever first moved the property along
      select distinct on (j.pid) j.pid, lower(j.changed_by) as e
        from property_journey j
       where j.changed_by is not null and j.changed_by <> 'system' and j.changed_by like '%@%'
       order by j.pid, j.changed_at asc
    ),
    base as (
      select p.pid, p.name, p.created_at, p.archived_at,
             p.handover_date, p.handover_done_at,
             coalesce(lower(p.owner_email), io.e, jo.e) as owner,
             lower(p.assigned_to)                       as assignee
        from properties p
        left join insp_owner    io on io.pid = p.pid
        left join journey_owner jo on jo.pid = p.pid
       where p.deleted_at is null
         and p.source is distinct from 'payments_backfill'
         and (v_scope = 'all'
              or coalesce(lower(p.owner_email), io.e, jo.e) = v_me
              or lower(p.assigned_to) = v_me)
    ),
    insp as (
      select b.pid,
             count(i.*)                                                       as n,
             count(i.*) filter (where i.status in ('completed','legacy'))     as n_done,
             count(i.*) filter (where i.status not in ('completed','legacy','draft')) as n_odd,
             max(i.created_at) filter (where i.status in ('completed','legacy')) as done_at,
             max(i.created_at)                                                as latest_at,
             (array_agg(i.id order by (i.status in ('completed','legacy')) desc, i.created_at desc))[1] as latest_id
        from base b join inspections i on i.pid = b.pid
       group by b.pid
    ),
    est as (
      select distinct on (e.pid)
             e.pid, e.id, e.status, e.sent_at, e.first_viewed_at, e.approved_at,
             e.created_at, coalesce(e.updated_at, e.created_at) as updated_at, e.inspection_id
        from base b join estimates e on e.pid = b.pid
       order by e.pid, e.created_at desc
    ),
    est_items as (
      select ei.estimate_id,
             count(*) filter (where ei.status = 'pending')  as n_pending,
             count(*) filter (where ei.status = 'approved') as n_approved,
             count(*) filter (where ei.status = 'disputed') as n_disputed
        from est join estimate_items ei on ei.estimate_id = est.id
       group by ei.estimate_id
    ),
    est_disp as (
      select distinct on (d.estimate_id) d.estimate_id, d.author_type, d.created_at
        from est join estimate_disputes d on d.estimate_id = est.id
       order by d.estimate_id, d.created_at desc
    ),
    est_decided as (
      select ev.estimate_id, max(ev.created_at) as at
        from est join estimate_events ev on ev.estimate_id = est.id
       where ev.event_type in ('item_approved','approved','partially_approved')
       group by ev.estimate_id
    ),
    est_sent as (
      -- estimates.sent_at arrived after many estimates had already gone out, so
      -- it is null on rows whose status says 'viewed' or 'approved'. The
      -- earliest surviving evidence of the send wins.
      select est.id as estimate_id,
             least(est.sent_at,
                   (select min(ev.created_at) from estimate_events ev
                     where ev.estimate_id = est.id and ev.event_type = 'sent'),
                   (select min(v.sent_at) from estimate_versions v
                     where v.estimate_id = est.id),
                   est.first_viewed_at) as at
        from est
    ),
    wo as (
      select w.pid, w.id, w.status, w.vendor_id, w.scheduled_start, w.scheduled_end,
             w.created_at, w.updated_at, w.issued_at, w.vendor_completed_at, w.verified_at,
             count(wi.*) filter (where wi.status = 'disputed') as n_disputed,
             -- expected days on site from the catalogue minutes; scheduled_end wins when set
             coalesce(w.scheduled_end,
                      w.scheduled_start
                      + greatest(1, ceil(coalesce(sum(wi.minutes) filter (where wi.included), 0)
                                         / (t->>'work_day_minutes')::numeric))::int) as expected_end
        from base b
        join work_orders w on w.pid = b.pid
        left join work_order_items wi on wi.work_order_id = w.id
       group by w.id, w.pid, w.status, w.vendor_id, w.scheduled_start, w.scheduled_end,
                w.created_at, w.updated_at, w.issued_at, w.vendor_completed_at, w.verified_at
    ),
    wo_agg as (
      select pid,
             count(*)                                                                  as n,
             count(*) filter (where status = 'verified')                               as n_verified,
             count(*) filter (where n_disputed > 0)                                    as n_disputed,
             count(*) filter (where status = 'vendor_completed')                       as n_qc,
             count(*) filter (where status = 'in_progress'
                              or (status = 'assigned' and scheduled_start < current_date)) as n_running,
             count(*) filter (where status = 'assigned' and scheduled_start = current_date) as n_today,
             count(*) filter (where status in ('assigned','draft') and scheduled_start > current_date) as n_future,
             count(*) filter (where status not in ('verified','vendor_completed')
                              and vendor_id is not null and scheduled_start is null)  as n_unscheduled,
             count(*) filter (where status not in ('verified','vendor_completed')
                              and vendor_id is null)                                  as n_unassigned,
             max(updated_at)        filter (where n_disputed > 0)                      as disputed_since,
             max(vendor_completed_at) filter (where status = 'vendor_completed')       as qc_since,
             max(updated_at)        filter (where status = 'in_progress'
                                            or (status = 'assigned' and scheduled_start < current_date)) as running_since,
             min(expected_end)      filter (where status = 'in_progress'
                                            or (status = 'assigned' and scheduled_start < current_date)) as running_expected_end,
             min(scheduled_start)   filter (where status in ('assigned','draft') and scheduled_start > current_date) as next_start,
             min(coalesce(issued_at, created_at)) filter (where status in ('assigned','draft') and scheduled_start > current_date) as future_since,
             min(coalesce(issued_at, updated_at)) filter (where status not in ('verified','vendor_completed')
                                                          and vendor_id is not null and scheduled_start is null) as unscheduled_since,
             min(created_at)        filter (where status not in ('verified','vendor_completed')
                                            and vendor_id is null)                    as unassigned_since,
             max(verified_at)                                                          as verified_at
        from wo
       group by pid
    ),
    inv as (
      select distinct on (li.pid) li.pid, li.id, li.status, li.inspection_id,
             li.created_at, coalesce(li.updated_at, li.created_at) as updated_at
        from base b join landlord_invoices li on li.pid = b.pid
       order by li.pid, li.created_at desc
    )
    select b.*,
           i.n as insp_n, i.n_done as insp_done, i.n_odd as insp_odd, i.done_at as insp_done_at,
           i.latest_at as insp_latest_at, i.latest_id as insp_latest_id,
           e.id as est_id, e.status as est_status, e.sent_at as est_sent_at,
           e.first_viewed_at as est_viewed_at, e.approved_at as est_approved_at,
           e.created_at as est_created_at, e.updated_at as est_updated_at, e.inspection_id as est_insp_id,
           coalesce(ei.n_pending, 0) as ei_pending, coalesce(ei.n_approved, 0) as ei_approved,
           coalesce(ei.n_disputed, 0) as ei_disputed,
           d.author_type as disp_author, d.created_at as disp_at,
           ed.at as decided_at,
           (e.status is distinct from 'draft' or es.at is not null) as est_is_sent,
           coalesce(es.at, e.updated_at) as est_sent_since,
           coalesce(w.n, 0) as wo_n, coalesce(w.n_verified, 0) as wo_verified,
           coalesce(w.n_disputed, 0) as wo_disputed, coalesce(w.n_qc, 0) as wo_qc,
           coalesce(w.n_running, 0) as wo_running, coalesce(w.n_today, 0) as wo_today,
           coalesce(w.n_future, 0) as wo_future, coalesce(w.n_unscheduled, 0) as wo_unscheduled,
           coalesce(w.n_unassigned, 0) as wo_unassigned,
           w.disputed_since, w.qc_since, w.running_since, w.running_expected_end,
           w.next_start, w.future_since, w.unscheduled_since, w.unassigned_since,
           w.verified_at as wo_verified_at,
           li.id as inv_id, li.status as inv_status, li.inspection_id as inv_insp_id,
           li.created_at as inv_created_at, li.updated_at as inv_updated_at
      from base b
      left join insp        i  on i.pid = b.pid
      left join est         e  on e.pid = b.pid
      left join est_items   ei on ei.estimate_id = e.id
      left join est_disp    d  on d.estimate_id = e.id
      left join est_decided ed on ed.estimate_id = e.id
      left join est_sent    es on es.estimate_id = e.id
      left join wo_agg      w  on w.pid = b.pid
      left join inv         li on li.pid = b.pid
     order by b.pid
  loop
    th     := '[]'::jsonb;
    r_prop := '/properties/' || r.pid;
    r_wo   := r_prop || '/work-orders';
    r_est  := case when r.est_id is not null then '/estimate/' || r.est_id else r_prop || '/estimates' end;
    r_inv  := '/invoice/' || coalesce(r.inv_insp_id, r.est_insp_id, r.insp_latest_id);

    -- Archived properties are out of the game; say so and move on.
    if r.archived_at is not null then
      th := th || public.journey_thread('archived', 'Archived', 'none', r.archived_at,
                                        'Nothing to do', r_prop, null, 'done');
    else

      -- 20 · Invoice. A draft invoice is not "invoiced" — all 27 on file were drafts.
      if r.inv_id is not null then
        if r.inv_status = 'draft' then
          th := th || public.journey_thread('invoice_draft', 'Invoice drafted, not sent', 'setup_ops',
                 r.inv_updated_at, 'Send invoice', r_inv, (t->>'invoice_draft_days')::int);
        else
          th := th || public.journey_thread('invoiced', 'Invoiced', 'none',
                 r.inv_created_at, 'Done', r_inv, null, 'done');
        end if;
      end if;

      -- 19 · Handover. Real columns now; nothing is inferred.
      if r.handover_done_at is not null then
        if r.inv_id is null then
          th := th || public.journey_thread('handover_done', 'Handed over, no invoice', 'setup_ops',
                 r.handover_done_at, 'Create invoice', r_inv, (t->>'invoice_draft_days')::int);
        end if;
      elsif r.handover_date is not null then
        if r.handover_date < current_date then
          th := th || public.journey_thread('handover_overdue', 'T-Day passed, handover not recorded', 'setup_ops',
                 r.handover_date::timestamptz, 'Record handover', r_prop, null, 'overdue');
        elsif r.handover_date = current_date then
          th := th || public.journey_thread('handover_today', 'T-Day is today', 'setup_ops',
                 r.handover_date::timestamptz, 'Record handover', r_prop, null, 'today');
        else
          th := th || public.journey_thread('handover_scheduled', 'T-Day ' || to_char(r.handover_date, 'DD Mon'), 'none',
                 r.handover_date::timestamptz, 'Handover on ' || to_char(r.handover_date, 'DD Mon'), r_prop, null,
                 case when r.handover_date - current_date <= (t->>'handover_soon_days')::int then 'soon' else 'waiting' end);
        end if;
      end if;

      -- 10–18 · Work orders. A property can have several; every open state is a thread.
      if r.wo_n > 0 then
        if r.wo_disputed > 0 then
          th := th || public.journey_thread('disputed', r.wo_disputed || ' work order' || case when r.wo_disputed > 1 then 's' else '' end || ' with disputed items', 'vendor',
                 r.disputed_since, 'Vendor to fix disputed items', r_wo, (t->>'dispute_days')::int);
        end if;
        if r.wo_qc > 0 then
          th := th || public.journey_thread('qc_pending', 'Vendor finished, QC pending', 'setup_ops',
                 r.qc_since, 'Verify completed work', r_wo, (t->>'qc_pending_days')::int);
        end if;
        if r.wo_running > 0 then
          th := th || public.journey_thread('in_progress', 'Work in progress', 'vendor',
                 r.running_since, 'Vendor executing', r_wo, null,
                 case when r.running_expected_end < current_date then 'overdue' else 'waiting' end);
        end if;
        if r.wo_today > 0 then
          th := th || public.journey_thread('execution_day', 'Execution day', 'vendor',
                 r.next_start::timestamptz, 'Vendor on site today', r_wo, null, 'today');
        end if;
        if r.wo_future > 0 then
          th := th || public.journey_thread('wo_scheduled', 'Scheduled for ' || to_char(r.next_start, 'DD Mon'), 'vendor',
                 r.future_since, 'Vendor due ' || to_char(r.next_start, 'DD Mon'), r_wo, null,
                 case when r.next_start - current_date <= (t->>'scheduled_soon_days')::int then 'soon' else 'waiting' end);
        end if;
        if r.wo_unscheduled > 0 then
          th := th || public.journey_thread('wo_unscheduled', 'Vendor assigned, no date', 'setup_ops',
                 r.unscheduled_since, 'Schedule the work', r_wo, (t->>'wo_unscheduled_days')::int);
        end if;
        if r.wo_unassigned > 0 then
          th := th || public.journey_thread('wo_unassigned', 'Work order has no vendor', 'setup_ops',
                 r.unassigned_since, 'Assign a vendor', r_wo, (t->>'wo_unassigned_days')::int);
        end if;
        -- 18 → 19 · everything verified and no handover on the books
        if r.wo_verified = r.wo_n and r.handover_date is null and r.handover_done_at is null and r.inv_id is null then
          th := th || public.journey_thread('handover_unknown', 'All work verified, no T-Day set', 'setup_ops',
                 r.wo_verified_at, 'Set handover date', r_prop, (t->>'handover_unknown_days')::int);
        end if;
      end if;

      -- 5–10 · Estimate. An invoice is downstream of all of this: once one
      -- exists the estimate step is over, whether it was done or skipped.
      -- Four properties on file were worked and invoiced with no estimate at
      -- all; telling someone to create one now would be wrong.
      if r.inv_id is not null then
        null;
      elsif r.est_id is not null then
        decided := r.ei_approved > 0 or r.est_status in ('approved','partially_approved');
        partial := decided and r.ei_pending > 0;
        since_decided := coalesce(r.est_approved_at, r.decided_at, r.est_updated_at);

        if not r.est_is_sent then
          th := th || public.journey_thread('estimate_draft', 'Estimate drafted, not sent', 'setup_ops',
                 r.est_updated_at, 'Send estimate', r_est, (t->>'estimate_draft_days')::int);
        else
          -- 8 · the landlord asked something and the newest word is theirs
          if r.disp_author = 'landlord' and r.ei_disputed > 0 then
            th := th || public.journey_thread('landlord_queried', 'Landlord query waiting for a reply', 'setup_ops',
                   r.disp_at, 'Answer the landlord', r_est, (t->>'query_reply_days')::int);
          end if;

          if decided then
            -- 9/10 · decided; the actionable half is "raise the work order"
            if r.wo_n = 0 then
              th := th || public.journey_thread('work_order_pending', 'Landlord approved, no work order', 'setup_ops',
                     since_decided, 'Create work order', r_wo, (t->>'work_order_pending_days')::int);
            end if;
            if partial then
              th := th || public.journey_thread('landlord_partially_decided', r.ei_pending || ' items still with the landlord', 'landlord',
                     since_decided, 'Chase landlord on remaining items', r_est, (t->>'landlord_silent_days')::int);
            end if;
          elsif r.est_viewed_at is not null or r.est_status = 'viewed' then
            th := th || public.journey_thread('estimate_viewed', 'Estimate opened, no decision', 'landlord',
                   coalesce(r.est_viewed_at, r.est_updated_at), 'Chase landlord for a decision', r_est, (t->>'landlord_silent_days')::int);
          else
            th := th || public.journey_thread('estimate_sent', 'Estimate sent, not opened', 'landlord',
                   r.est_sent_since, 'Chase landlord to open it', r_est, (t->>'estimate_unopened_days')::int);
          end if;
        end if;

      -- 1–4 · No estimate yet: where is the inspection?
      elsif r.insp_done > 0 then
        th := th || public.journey_thread('estimate_not_created', 'Inspection done, no estimate', 'setup_ops',
               r.insp_done_at, 'Create estimate', r_prop || '/estimates', (t->>'estimate_not_created_days')::int);
      elsif coalesce(r.insp_n, 0) > 0 and r.insp_odd = 0 then
        th := th || public.journey_thread('inspection_in_progress', 'Inspection started, not ended', 'setup_ops',
               r.insp_latest_at, 'Finish inspection', r_prop, (t->>'inspection_draft_days')::int);
      elsif coalesce(r.insp_n, 0) = 0 then
        th := th || public.journey_thread('onboarded', 'Onboarded, no inspection', 'setup_ops',
               r.created_at, 'Start inspection', r_prop, (t->>'onboarded_days')::int);
      end if;

      -- Silence is a defect: anything the rules could not place says so.
      if coalesce(r.insp_odd, 0) > 0 and r.est_id is null and r.inv_id is null and r.insp_done = 0 then
        th := th || jsonb_build_array(public.journey_thread('unclassified', 'Inspection in an unknown status', 'setup_ops',
               r.insp_latest_at, 'Check inspection', r_prop || '/raw', null, 'today')
               || jsonb_build_object('reason', 'inspections.status not in draft/completed/legacy'));
      end if;
      if jsonb_array_length(th) = 0 then
        th := jsonb_build_array(public.journey_thread('unclassified', 'No rule matched', 'setup_ops',
               r.created_at, 'Look at the property', r_prop, null, 'today')
               || jsonb_build_object('reason', 'no evidence matched any stage'));
      end if;
    end if;

    -- Headline: the most urgent thing, then what this person can act on, then
    -- the earliest open step in the journey (it is what blocks the rest), then
    -- the oldest. Fully ordered, so the headline cannot flip between reloads.
    select x.v into best
      from jsonb_array_elements(th) as x(v)
     order by case x.v->>'urgency'
                when 'overdue' then 0 when 'today' then 1 when 'soon' then 2
                when 'waiting' then 3 else 4 end,
              case when x.v->>'blocked_on' = 'setup_ops' then 0 else 1 end,
              (x.v->>'stage_no')::int,
              (x.v->>'age_days')::int desc,
              x.v->>'code'
     limit 1;

    pid               := r.pid;
    property_name     := r.name;
    owner_email       := r.owner;
    stage_code        := best->>'code';
    stage_label       := best->>'label';
    blocked_on        := best->>'blocked_on';
    since             := (best->>'since')::timestamptz;
    age_days          := (best->>'age_days')::int;
    next_action_label := best->>'next_action_label';
    next_action_route := best->>'next_action_route';
    urgency           := best->>'urgency';
    open_threads      := (select jsonb_agg(x.v order by (x.v = best) desc,
                                 case x.v->>'urgency' when 'overdue' then 0 when 'today' then 1
                                                      when 'soon' then 2 when 'waiting' then 3 else 4 end,
                                 (x.v->>'stage_no')::int)
                            from jsonb_array_elements(th) as x(v));
    return next;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 7 · Badge numbers without fetching rows
-- ---------------------------------------------------------------------------
create or replace function public.property_journey_counts(p_scope text default 'me')
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total',        count(*),
    'needs_you',    count(*) filter (where blocked_on = 'setup_ops' and urgency <> 'done'),
    'overdue',      count(*) filter (where urgency = 'overdue'),
    'today',        count(*) filter (where urgency = 'today'),
    'soon',         count(*) filter (where urgency = 'soon'),
    'waiting',      count(*) filter (where blocked_on in ('landlord','vendor') and urgency <> 'done'),
    'on_landlord',  count(*) filter (where blocked_on = 'landlord'),
    'on_vendor',    count(*) filter (where blocked_on = 'vendor'),
    'done',         count(*) filter (where urgency = 'done'),
    'unclassified', count(*) filter (where stage_code = 'unclassified'),
    -- a property nobody owns is in nobody's 'me' queue; Home must say so
    'unowned',      count(*) filter (where owner_email is null)
  )
  from public.property_journey_state(p_scope)
$$;

-- ---------------------------------------------------------------------------
-- 8 · Grants. Staff only; anon never calls these.
-- ---------------------------------------------------------------------------
revoke all on function public.journey_thresholds()                        from public, anon;
revoke all on function public.journey_thread(text,text,text,timestamptz,text,text,int,text) from public, anon;
revoke all on function public.property_journey_state(text)                from public, anon;
revoke all on function public.property_journey_counts(text)               from public, anon;
grant execute on function public.journey_thresholds()                      to authenticated;
grant execute on function public.journey_thread(text,text,text,timestamptz,text,text,int,text) to authenticated;
grant execute on function public.property_journey_state(text)              to authenticated;
grant execute on function public.property_journey_counts(text)             to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY · stage distribution across the whole portfolio.
-- ---------------------------------------------------------------------------
select stage_code, blocked_on, urgency, count(*) as n,
       string_agg(pid || ' (' || age_days || 'd)', ', ' order by age_days desc) as pids
  from public.property_journey_state('all')
 group by 1, 2, 3
 order by 4 desc, 1;
