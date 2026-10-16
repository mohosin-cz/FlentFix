-- Branch E · feat/journey-alerts
--
-- Pulse tells people things without being opened.
--
--   notifications        one row per (person, event). Trigger-written on the
--                        transitions a human cares about; never by the client.
--   notify_property()    the one place that decides WHO hears about a property:
--                        its owner and its assignee, nobody else.
--   journey_alerts_sweep time-based events (silent landlord, execution day
--                        tomorrow, T-Day tomorrow) that no row trigger can see.
--                        Idempotent — called from the bell on load today, can
--                        move to pg_cron later without changing a line here.
--   alert_window()       the "going wrong" list, computed LIVE from the engine.
--                        Nothing is stored, so it cannot go stale.
--   your_day_digest()    the same state shaped as a briefing, not a queue.
--
-- Dedupe is the contract: unique (user_email, dedupe_key). The same event can
-- fire its trigger twice, the sweep can run a thousand times, and a person
-- still sees it once. Dismissed rows keep their dedupe row, so a dismissed
-- event never comes back.
--
-- In-app only. No email, no push.

begin;

-- ---------------------------------------------------------------------------
-- 1 · Thresholds. journey_engine.sql owns this object; it is re-created here
--     with every existing key UNCHANGED plus the three the alerts need. There
--     is one config object, not two. Keep the keys above the line identical to
--     journey_engine.sql §4 if you edit either file.
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
    'work_day_minutes',      480,  -- task_catalogue minutes → expected days on site
    -- ── alerts (Branch E) ──────────────────────────────────────────────
    'unopened_renotify_days',  7,  -- an unopened estimate nags again every N days (one notification per N-day bucket)
    'execution_lookahead_days',1,  -- "vendor due tomorrow" fires this many days before scheduled_start
    'handover_lookahead_days', 1   -- "T-Day tomorrow" fires this many days before handover_date
  )
$$;

-- ---------------------------------------------------------------------------
-- 2 · The table
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_email   text not null,
  kind         text not null,          -- landlord_approved · landlord_queried · estimate_decided · vendor_completed · disputed_twice · estimate_unopened · execution_tomorrow · handover_tomorrow
  pid          text,
  title        text not null,
  body         text,
  route        text,
  dedupe_key   text not null,          -- stable per event; see each writer for its shape
  created_at   timestamptz not null default now(),
  read_at      timestamptz,
  dismissed_at timestamptz,
  unique (user_email, dedupe_key)      -- "never twice for the same event"
);

comment on table  public.notifications is 'In-app notifications. Trigger- and sweep-written only; the client may only set read_at / dismissed_at on its own rows.';
comment on column public.notifications.dedupe_key is 'Stable per event. unique(user_email, dedupe_key) is the never-twice guarantee; dismissed rows keep it.';

create index if not exists notifications_inbox_idx
  on public.notifications (user_email, dismissed_at, read_at, created_at desc);

alter table public.notifications enable row level security;
revoke all on public.notifications from public;
revoke all on public.notifications from anon;
revoke all on public.notifications from authenticated;
grant select on public.notifications to authenticated;
-- Column-level: a signed-in client can touch read_at and dismissed_at and
-- nothing else. The RPCs below are the intended path; this is the floor.
grant update (read_at, dismissed_at) on public.notifications to authenticated;

drop policy if exists "own rows" on public.notifications;
create policy "own rows" on public.notifications
  for select to authenticated
  using (user_email = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists "own rows mark" on public.notifications;
create policy "own rows mark" on public.notifications
  for update to authenticated
  using      (user_email = lower(coalesce(auth.jwt() ->> 'email', '')))
  with check (user_email = lower(coalesce(auth.jwt() ->> 'email', '')));

-- Realtime: the bell may subscribe to its own rows. Only when the publication
-- is a named list (it is on this project) and the table is not already in it.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and not puballtables)
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                        and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3 · Who hears about a property. Owner and assignee, lower-cased, distinct,
--     never the person who caused the event (p_skip_actor). Internal: not
--     granted to any role; trigger functions and the sweep run as the owner.
-- ---------------------------------------------------------------------------
create or replace function public.notify_property(
  p_pid text, p_kind text, p_title text, p_body text, p_route text, p_dedupe text,
  p_skip_actor boolean default true)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := nullif(lower(coalesce(auth.jwt() ->> 'email', '')), '');
  n int;
begin
  if p_pid is null or p_dedupe is null then return 0; end if;
  insert into notifications (user_email, kind, pid, title, body, route, dedupe_key)
  select distinct r.e, p_kind, p_pid, p_title, p_body, p_route, p_dedupe
    from properties p
    cross join lateral (values (nullif(lower(p.owner_email), '')),
                               (nullif(lower(p.assigned_to), ''))) r(e)
   where p.pid = p_pid
     and p.deleted_at is null
     and r.e is not null
     and (not p_skip_actor or v_actor is null or r.e <> v_actor)
  on conflict (user_email, dedupe_key) do nothing;
  get diagnostics n = row_count;
  return n;
end
$$;
revoke all on function public.notify_property(text,text,text,text,text,text,boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4 · Row triggers. AFTER, row-level, with a WHEN clause so the function body
--     never runs for the UPDATEs that the audit / recompute triggers already
--     pay for. Every function is security definer: the landlord page writes
--     as anon and the vendor page as anon, and neither may insert here.
-- ---------------------------------------------------------------------------

-- 4a · estimate_items.status → 'approved'
--      kind landlord_approved · dedupe 'landlord_approved:<estimate_item id>'
create or replace function public.notify_estimate_item_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare e record;
begin
  select pid, id into e from estimates where id = new.estimate_id;
  if e.pid is null then return null; end if;
  perform notify_property(e.pid, 'landlord_approved',
    'Landlord approved ' || coalesce(nullif(new.item_name, ''), 'an item'),
    coalesce(nullif(new.area, '') || ' · ', '') || coalesce(nullif(new.trade, ''), ''),
    '/estimate/' || e.id,
    'landlord_approved:' || new.id);
  return null;
end
$$;
drop trigger if exists trg_notify_item_approved on public.estimate_items;
create trigger trg_notify_item_approved
  after update of status on public.estimate_items
  for each row
  when (old.status is distinct from new.status and new.status = 'approved')
  execute function public.notify_estimate_item_approved();

-- 4b · estimate_disputes INSERT by the landlord. (estimate_items.status →
--      'disputed' is set by the same flow; the dispute row carries the reason,
--      so it is the better event.)
--      kind landlord_queried · dedupe 'landlord_queried:<dispute id>'
create or replace function public.notify_landlord_queried()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare e record; iname text;
begin
  select pid, id into e from estimates where id = new.estimate_id;
  if e.pid is null then return null; end if;
  select item_name into iname from estimate_items where id = new.estimate_item_id;
  perform notify_property(e.pid, 'landlord_queried',
    'Landlord queried ' || coalesce(nullif(iname, ''), 'an item')
      || case when new.reason_tag is not null then ': ' || replace(new.reason_tag, '_', ' ') else '' end,
    left(coalesce(new.message, ''), 140),
    '/estimate/' || e.id,
    'landlord_queried:' || new.id);
  return null;
end
$$;
drop trigger if exists trg_notify_landlord_queried on public.estimate_disputes;
create trigger trg_notify_landlord_queried
  after insert on public.estimate_disputes
  for each row
  when (new.author_type = 'landlord')
  execute function public.notify_landlord_queried();

-- 4c · estimates.status → 'approved' | 'partially_approved': one summary.
--      kind estimate_decided · dedupe 'estimate_decided:<estimate id>:<status>'
create or replace function public.notify_estimate_decided()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare c record;
begin
  if new.pid is null then return null; end if;
  select count(*) filter (where status = 'approved') as a,
         count(*) filter (where status = 'disputed') as d,
         count(*) filter (where status = 'pending')  as p
    into c
    from estimate_items where estimate_id = new.id;
  perform notify_property(new.pid, 'estimate_decided',
    case when new.status = 'approved' then 'Landlord approved the estimate'
         else 'Landlord decided on part of the estimate' end,
    c.a || ' approved · ' || c.d || ' queried · ' || c.p || ' pending'
      || case when new.approved_by_name is not null then ' · ' || new.approved_by_name else '' end,
    '/estimate/' || new.id,
    'estimate_decided:' || new.id || ':' || new.status);
  return null;
end
$$;
drop trigger if exists trg_notify_estimate_decided on public.estimates;
create trigger trg_notify_estimate_decided
  after update of status on public.estimates
  for each row
  when (old.status is distinct from new.status and new.status in ('approved', 'partially_approved'))
  execute function public.notify_estimate_decided();

-- 4d · work_orders.status → 'vendor_completed'
--      kind vendor_completed · dedupe 'vendor_completed:<wo id>:<vendor_completed_at::date>'
create or replace function public.notify_vendor_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.pid is null then return null; end if;
  perform notify_property(new.pid, 'vendor_completed',
    coalesce(nullif(new.vendor_name, ''), 'Vendor') || ' marked '
      || coalesce(nullif(new.trade, ''), 'the') || ' work done at ' || new.pid,
    'Verify it before the day is out',
    '/properties/' || new.pid || '/work-orders',
    'vendor_completed:' || new.id || ':' || coalesce(new.vendor_completed_at, now())::date);
  return null;
end
$$;
drop trigger if exists trg_notify_vendor_completed on public.work_orders;
create trigger trg_notify_vendor_completed
  after update of status on public.work_orders
  for each row
  when (old.status is distinct from new.status and new.status = 'vendor_completed')
  execute function public.notify_vendor_completed();

-- 4e · work_order_items.dispute_count reaches 2 (and keeps climbing)
--      kind disputed_twice · dedupe 'disputed_twice:<item id>:<dispute_count>'
create or replace function public.notify_disputed_twice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare w record;
begin
  select pid, vendor_name, trade into w from work_orders where id = new.work_order_id;
  if w.pid is null then return null; end if;
  perform notify_property(w.pid, 'disputed_twice',
    'Disputed ' || case when new.dispute_count = 2 then 'twice' else new.dispute_count || ' times' end
      || ': ' || coalesce(nullif(new.description, ''), 'an item'),
    coalesce(nullif(w.vendor_name, ''), 'Vendor') || ' · ' || coalesce(nullif(w.trade, ''), '')
      || case when new.dispute_reason is not null then ' · ' || left(new.dispute_reason, 100) else '' end,
    '/properties/' || w.pid || '/work-orders',
    'disputed_twice:' || new.id || ':' || new.dispute_count);
  return null;
end
$$;
drop trigger if exists trg_notify_disputed_twice on public.work_order_items;
create trigger trg_notify_disputed_twice
  after update of dispute_count on public.work_order_items
  for each row
  when (new.dispute_count >= 2 and new.dispute_count > coalesce(old.dispute_count, 0))
  execute function public.notify_disputed_twice();

-- ---------------------------------------------------------------------------
-- 5 · The sweep. Time moves; rows do not. Three events only a clock can see:
--       estimate_unopened   sent, unopened ≥ estimate_unopened_days
--                           dedupe 'estimate_unopened:<estimate id>:<age_days / unopened_renotify_days>'
--       execution_tomorrow  scheduled_start = today + execution_lookahead_days
--                           dedupe 'execution_day:<wo id>:<scheduled_start>'
--       handover_tomorrow   handover_date = today + handover_lookahead_days
--                           dedupe 'handover:<pid>:<handover_date>'
--     The property universe is property_journey_state('all') so archived,
--     deleted and payments_backfill rows are excluded by the same rule the
--     engine uses. Idempotent: dedupe makes every call after the first a no-op.
--
--     Called from the bell on mount (≈35 ms for the whole portfolio). To move
--     it to pg_cron later: create extension pg_cron; then
--       select cron.schedule('journey-alerts', '0 7 * * *', $$select public.journey_alerts_sweep()$$);
--     pg_cron is AVAILABLE on this project but NOT installed; nothing here
--     schedules anything.
-- ---------------------------------------------------------------------------
create or replace function public.journey_alerts_sweep()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t      jsonb := public.journey_thresholds();
  n_est  int := 0;
  n_wo   int := 0;
  n_ho   int := 0;
  r      record;
begin
  -- a · the landlord has not opened the estimate
  for r in
    select s.pid, s.property_name, th->>'since' as since, (th->>'age_days')::int as age,
           (select e.id from estimates e where e.pid = s.pid order by e.created_at desc limit 1) as est_id
      from property_journey_state('all') s
      cross join lateral jsonb_array_elements(s.open_threads) th
     where th->>'code' = 'estimate_sent'
       and (th->>'age_days')::int >= (t->>'estimate_unopened_days')::int
  loop
    if r.est_id is null then continue; end if;
    n_est := n_est + notify_property(r.pid, 'estimate_unopened',
      'Estimate unopened for ' || r.age || ' days',
      coalesce(r.property_name, r.pid) || ' · sent ' || to_char(r.since::timestamptz, 'DD Mon') || ' · chase the landlord',
      '/estimate/' || r.est_id,
      'estimate_unopened:' || r.est_id || ':' || (r.age / greatest(1, (t->>'unopened_renotify_days')::int)),
      false);
  end loop;

  -- b · a vendor is due tomorrow (or whatever the lookahead says)
  for r in
    select w.id, w.pid, w.vendor_name, w.trade, w.scheduled_start, w.vendor_id
      from property_journey_state('all') s
      join work_orders w on w.pid = s.pid
     where w.scheduled_start = current_date + (t->>'execution_lookahead_days')::int
       and w.status in ('draft', 'assigned')
  loop
    n_wo := n_wo + notify_property(r.pid, 'execution_tomorrow',
      case when r.vendor_id is null then 'No vendor for tomorrow''s ' || coalesce(r.trade, 'work') || ' at ' || r.pid
           else coalesce(nullif(r.vendor_name, ''), 'Vendor') || ' due tomorrow: ' || coalesce(r.trade, 'work') || ' at ' || r.pid end,
      'Scheduled ' || to_char(r.scheduled_start, 'DD Mon'),
      '/properties/' || r.pid || '/work-orders',
      'execution_day:' || r.id || ':' || r.scheduled_start,
      false);
  end loop;

  -- c · T-Day is tomorrow
  for r in
    select p.pid, p.name, p.handover_date
      from property_journey_state('all') s
      join properties p on p.pid = s.pid
     where p.handover_date = current_date + (t->>'handover_lookahead_days')::int
       and p.handover_done_at is null
  loop
    n_ho := n_ho + notify_property(r.pid, 'handover_tomorrow',
      'T-Day tomorrow at ' || r.pid,
      coalesce(r.name, '') || ' · handover ' || to_char(r.handover_date, 'DD Mon'),
      '/properties/' || r.pid,
      'handover:' || r.pid || ':' || r.handover_date,
      false);
  end loop;

  return jsonb_build_object('estimate_unopened', n_est, 'execution_tomorrow', n_wo, 'handover_tomorrow', n_ho,
                            'inserted', n_est + n_wo + n_ho, 'at', now());
end
$$;

-- ---------------------------------------------------------------------------
-- 6 · Inbox RPCs. Scoped to the caller; a missing JWT sees nothing.
-- ---------------------------------------------------------------------------
create or replace function public.notifications_list(p_limit int default 100)
returns table (
  id uuid, kind text, pid text, property_name text, title text, body text, route text,
  created_at timestamptz, read_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select n.id, n.kind, n.pid, p.name, n.title, n.body, n.route, n.created_at, n.read_at
    from notifications n
    left join properties p on p.pid = n.pid
   where n.user_email = lower(coalesce(auth.jwt() ->> 'email', ''))
     and n.user_email <> ''
     and n.dismissed_at is null
   order by n.created_at desc
   limit greatest(1, least(coalesce(p_limit, 100), 500))
$$;

create or replace function public.notifications_unread_count()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
    from notifications n
   where n.user_email = lower(coalesce(auth.jwt() ->> 'email', ''))
     and n.user_email <> ''
     and n.dismissed_at is null
     and n.read_at is null
$$;

-- null p_ids = everything undismissed. Returns rows touched.
create or replace function public.notifications_mark_read(p_ids uuid[] default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_me text := nullif(lower(coalesce(auth.jwt() ->> 'email', '')), ''); n int;
begin
  if v_me is null then return 0; end if;
  update notifications
     set read_at = now()
   where user_email = v_me
     and read_at is null
     and dismissed_at is null
     and (p_ids is null or id = any(p_ids));
  get diagnostics n = row_count;
  return n;
end
$$;

create or replace function public.notifications_dismiss(p_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_me text := nullif(lower(coalesce(auth.jwt() ->> 'email', '')), ''); n int;
begin
  if v_me is null or p_ids is null then return 0; end if;
  update notifications
     set dismissed_at = now(),
         read_at = coalesce(read_at, now())
   where user_email = v_me
     and dismissed_at is null
     and id = any(p_ids);
  get diagnostics n = row_count;
  return n;
end
$$;

-- ---------------------------------------------------------------------------
-- 7 · The alert window. Things going WRONG, not merely happening. Computed
--     live from the engine; nothing stored. Five categories:
--       past_sla            setup-ops thread past its threshold (urgency overdue)
--       disputed_twice      an open disputed work-order item sent back ≥ 2 times
--       estimate_silent     landlord has the estimate and has said nothing for
--                           more than landlord_silent_days (sent, viewed, or
--                           partially decided)
--       scheduled_no_vendor a work order with a date and no vendor
--       handover_overdue    T-Day passed, handover not recorded
--     severity: critical · high · medium — worst first within a category.
-- ---------------------------------------------------------------------------
create or replace function public.alert_window(p_scope text default 'me')
returns table (
  category      text,
  pid           text,
  property_name text,
  headline      text,
  detail        text,
  age_days      int,
  overdue_by    int,
  route         text,
  severity      text
)
language sql
stable
security definer
set search_path = public
as $$
  with t as (select public.journey_thresholds() as j),
  s as (select * from public.property_journey_state(p_scope)),
  thr as (
    select s.pid, s.property_name, x.v as th
      from s cross join lateral jsonb_array_elements(s.open_threads) x(v)
  ),
  -- which threshold each stage counts against; same map Home2 carries
  lim as (
    select thr.*, (thr.th->>'age_days')::int as age,
           case thr.th->>'code'
             when 'onboarded'                  then (t.j->>'onboarded_days')::int
             when 'inspection_in_progress'     then (t.j->>'inspection_draft_days')::int
             when 'estimate_not_created'       then (t.j->>'estimate_not_created_days')::int
             when 'estimate_draft'             then (t.j->>'estimate_draft_days')::int
             when 'estimate_sent'              then (t.j->>'estimate_unopened_days')::int
             when 'estimate_viewed'            then (t.j->>'landlord_silent_days')::int
             when 'landlord_queried'           then (t.j->>'query_reply_days')::int
             when 'landlord_partially_decided' then (t.j->>'landlord_silent_days')::int
             when 'work_order_pending'         then (t.j->>'work_order_pending_days')::int
             when 'wo_unassigned'              then (t.j->>'wo_unassigned_days')::int
             when 'wo_unscheduled'             then (t.j->>'wo_unscheduled_days')::int
             when 'qc_pending'                 then (t.j->>'qc_pending_days')::int
             when 'disputed'                   then (t.j->>'dispute_days')::int
             when 'handover_unknown'           then (t.j->>'handover_unknown_days')::int
             when 'invoice_draft'              then (t.j->>'invoice_draft_days')::int
             else null end as lim
      from thr, t
  )

  -- past_sla
  select 'past_sla'                 as category,
         l.pid                      as pid,
         l.property_name            as property_name,
         l.th->>'label'             as headline,
         l.th->>'next_action_label' as detail,
         l.age                      as age_days,
         case when l.lim is not null then l.age - l.lim else null end as overdue_by,
         l.th->>'next_action_route' as route,
         case when l.lim is not null and l.age > 4 * l.lim then 'critical'
              when l.lim is not null and l.age > 2 * l.lim then 'high'
              else 'medium' end     as severity
    from lim l
   where l.th->>'urgency' = 'overdue'
     and l.th->>'blocked_on' = 'setup_ops'

  union all
  -- disputed_twice
  select 'disputed_twice', s.pid, s.property_name,
         'Disputed ' || wi.dispute_count || '×: ' || coalesce(nullif(wi.description, ''), 'item'),
         coalesce(nullif(w.vendor_name, ''), 'Vendor') || ' · ' || coalesce(w.trade, '')
           || case when wi.dispute_reason is not null then ' · ' || left(wi.dispute_reason, 80) else '' end,
         greatest(0, (current_date - coalesce(w.updated_at, w.created_at)::date))::int,
         null,
         '/properties/' || s.pid || '/work-orders',
         'critical'
    from s
    join work_orders w on w.pid = s.pid
    join work_order_items wi on wi.work_order_id = w.id
   where wi.status = 'disputed'
     and wi.dispute_count >= 2
     and exists (select 1 from jsonb_array_elements(s.open_threads) x where x->>'code' = 'disputed')

  union all
  -- estimate_silent
  select 'estimate_silent', l.pid, l.property_name,
         l.th->>'label',
         l.th->>'next_action_label',
         l.age,
         l.age - (t.j->>'landlord_silent_days')::int,
         l.th->>'next_action_route',
         case when l.age > 4 * (t.j->>'landlord_silent_days')::int then 'critical'
              when l.age > 2 * (t.j->>'landlord_silent_days')::int then 'high'
              else 'medium' end
    from lim l, t
   where l.th->>'code' in ('estimate_sent', 'estimate_viewed', 'landlord_partially_decided')
     and l.age > (t.j->>'landlord_silent_days')::int

  union all
  -- scheduled_no_vendor
  select 'scheduled_no_vendor', s.pid, s.property_name,
         coalesce(w.trade, 'Work') || ' scheduled ' || to_char(w.scheduled_start, 'DD Mon') || ', no vendor',
         case when w.scheduled_start < current_date then 'Date has passed'
              when w.scheduled_start = current_date then 'That is today'
              else 'In ' || (w.scheduled_start - current_date) || ' day' || case when w.scheduled_start - current_date = 1 then '' else 's' end end,
         greatest(0, current_date - w.created_at::date)::int,
         null,
         '/properties/' || s.pid || '/work-orders',
         case when w.scheduled_start <= current_date + 1 then 'critical' else 'high' end
    from s
    join work_orders w on w.pid = s.pid
   where w.scheduled_start is not null
     and w.vendor_id is null
     and w.status not in ('verified', 'vendor_completed')

  union all
  -- handover_overdue
  select 'handover_overdue', l.pid, l.property_name,
         l.th->>'label',
         l.th->>'next_action_label',
         l.age,
         l.age,
         l.th->>'next_action_route',
         'critical'
    from lim l
   where l.th->>'code' = 'handover_overdue'
$$;

-- ---------------------------------------------------------------------------
-- 8 · Your day. The same state as a briefing. Lists are headline rows for
--     needs_you (one per property) and threads for the rest, so a property
--     waiting on a landlord AND a vendor shows in both lanes, as on Home.
--     moved_recently uses home_seen.prev_seen_at for the caller when the scope
--     is 'me'; otherwise the last 24 hours.
-- ---------------------------------------------------------------------------
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
  st         jsonb;   -- the engine's rows, read once
  needs      jsonb; today jsonb; waiting jsonb; wrong jsonb; moved jsonb;
  n_ll       int; n_v int;
begin
  if v_scope = 'me' and v_me is not null then
    select prev_seen_at into v_baseline from home_seen where user_email = v_me;
  end if;
  v_baseline := coalesce(v_baseline, now() - interval '24 hours');

  select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) into st
    from public.property_journey_state(p_scope) s;

  select coalesce(jsonb_agg(jsonb_build_object(
           'pid', r->>'pid', 'property_name', r->>'property_name', 'label', r->>'stage_label',
           'action', r->>'next_action_label', 'route', r->>'next_action_route',
           'age_days', (r->>'age_days')::int, 'urgency', r->>'urgency')
           order by case r->>'urgency' when 'overdue' then 0 when 'today' then 1 when 'soon' then 2 else 3 end,
                    (r->>'age_days')::int desc, r->>'pid'), '[]'::jsonb)
    into needs
    from jsonb_array_elements(st) r
   where r->>'blocked_on' = 'setup_ops' and r->>'urgency' <> 'done';

  select coalesce(jsonb_agg(jsonb_build_object(
           'pid', r->>'pid', 'property_name', r->>'property_name', 'label', x->>'label',
           'action', x->>'next_action_label', 'route', x->>'next_action_route',
           'blocked_on', x->>'blocked_on')
           order by r->>'pid'), '[]'::jsonb)
    into today
    from jsonb_array_elements(st) r cross join lateral jsonb_array_elements(r->'open_threads') x
   where x->>'code' in ('execution_day', 'handover_today');

  select coalesce(jsonb_agg(jsonb_build_object(
           'pid', r->>'pid', 'property_name', r->>'property_name', 'label', x->>'label',
           'action', x->>'next_action_label', 'route', x->>'next_action_route',
           'blocked_on', x->>'blocked_on', 'age_days', (x->>'age_days')::int, 'urgency', x->>'urgency')
           order by case x->>'blocked_on' when 'landlord' then 0 else 1 end,
                    case x->>'urgency' when 'overdue' then 0 when 'soon' then 1 else 2 end,
                    (x->>'age_days')::int desc, r->>'pid'), '[]'::jsonb),
         count(*) filter (where x->>'blocked_on' = 'landlord'),
         count(*) filter (where x->>'blocked_on' = 'vendor')
    into waiting, n_ll, n_v
    from jsonb_array_elements(st) r cross join lateral jsonb_array_elements(r->'open_threads') x
   where x->>'blocked_on' in ('landlord', 'vendor') and x->>'urgency' <> 'done';

  select coalesce(jsonb_agg(jsonb_build_object(
           'category', category, 'pid', pid, 'property_name', property_name,
           'headline', headline, 'detail', detail, 'age_days', age_days,
           'overdue_by', overdue_by, 'route', route, 'severity', severity)
           order by case severity when 'critical' then 0 when 'high' then 1 else 2 end,
                    age_days desc, pid), '[]'::jsonb)
    into wrong
    from public.alert_window(p_scope);

  select coalesce(jsonb_agg(jsonb_build_object(
           'pid', r->>'pid', 'property_name', r->>'property_name', 'label', x->>'label',
           'route', x->>'next_action_route', 'blocked_on', x->>'blocked_on',
           'since', x->>'since', 'age_days', (x->>'age_days')::int)
           order by (x->>'since')::timestamptz desc), '[]'::jsonb)
    into moved
    from jsonb_array_elements(st) r cross join lateral jsonb_array_elements(r->'open_threads') x
   where (x->>'since')::timestamptz > v_baseline and x->>'urgency' <> 'done';

  return jsonb_build_object(
    'scope',        v_scope,
    'generated_at', now(),
    'baseline',     v_baseline,
    'greeting_counts', jsonb_build_object(
      'total',            jsonb_array_length(st),
      'needs_you',        jsonb_array_length(needs),
      'today',            jsonb_array_length(today),
      'waiting',          jsonb_array_length(waiting),
      'waiting_landlord', coalesce(n_ll, 0),
      'waiting_vendor',   coalesce(n_v, 0),
      'going_wrong',      jsonb_array_length(wrong),
      'moved_recently',   jsonb_array_length(moved)),
    'needs_you',      needs,
    'today',          today,
    'waiting',        waiting,
    'going_wrong',    wrong,
    'moved_recently', moved);
end
$$;

-- ---------------------------------------------------------------------------
-- 9 · Grants. Staff only; anon never calls these. notify_property stays
--     internal (revoked above, including from authenticated).
-- ---------------------------------------------------------------------------
revoke all on function public.journey_thresholds()               from public, anon;
revoke all on function public.journey_alerts_sweep()             from public, anon;
revoke all on function public.notifications_list(int)            from public, anon;
revoke all on function public.notifications_unread_count()       from public, anon;
revoke all on function public.notifications_mark_read(uuid[])    from public, anon;
revoke all on function public.notifications_dismiss(uuid[])      from public, anon;
revoke all on function public.alert_window(text)                 from public, anon;
revoke all on function public.your_day_digest(text)              from public, anon;
-- The five trg_notify_* functions keep default execute, like trg_audit_*: a
-- trigger function cannot be called directly ("can only be called as
-- trigger"), and the tables fire them for anon (landlord / vendor pages).

grant execute on function public.journey_thresholds()            to authenticated;
grant execute on function public.journey_alerts_sweep()          to authenticated;
grant execute on function public.notifications_list(int)         to authenticated;
grant execute on function public.notifications_unread_count()    to authenticated;
grant execute on function public.notifications_mark_read(uuid[]) to authenticated;
grant execute on function public.notifications_dismiss(uuid[])   to authenticated;
grant execute on function public.alert_window(text)              to authenticated;
grant execute on function public.your_day_digest(text)           to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY · what the alert window says about the whole portfolio right now.
-- ---------------------------------------------------------------------------
select category, severity, count(*) as n,
       string_agg(pid || ' (' || age_days || 'd)', ', ' order by age_days desc) as pids
  from public.alert_window('all')
 group by 1, 2
 order by 1, case severity when 'critical' then 0 when 'high' then 1 else 2 end;
