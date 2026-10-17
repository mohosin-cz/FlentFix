-- Home, tailored: "My desk" for the person signed in.
--
-- One read — home_desk(p_since, p_as) — returns every panel above the work
-- queue for that person's properties (owner_email or assigned_to). Nothing is
-- estimated: every number is a count or a date read from the tables below.
--
--   since       what changed on my properties since I last opened Home
--               (home_seen.prev_seen_at, passed in): landlord approvals /
--               questions / opens (estimate_events), vendor closes
--               (work_order_items), payments logged (property_payments),
--               journey moves by someone else (property_journey)
--   verify      vendor-closed items waiting on me, by work order
--   estimates   estimates with the landlord: sent, opens, last open, lines approved
--   renewals    WiFi / RO due in the next 14 days: start_date (or the last
--               recharge marked here) stepped by billing_cycle
--   drafts      inspections I started and have not submitted (last 30 days)
--   week        setups, handovers and work-order close-by dates, next 7 days
--   today       setups and handovers today/tomorrow, with vendor arrivals
--   noshow      setup day, after 11:00 IST, assigned vendors with open work
--               who have not punched in at this PID today
--   pins        my pinned properties, notes, reminders
--
-- Admins (pulse_admins()) may pass p_as to see someone else's desk.
-- Also: home_pins + home_pin_set/home_pin_remove, utility_mark_recharged.

begin;

-- ── who is an admin ───────────────────────────────────────────────────────
create or replace function public.pulse_admins()
returns text[] language sql immutable as $$ select array['mohosin@flent.in'] $$;

create or replace function public.pulse_is_admin()
returns boolean language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = any(pulse_admins())
$$;

-- ── pins, notes, reminders ────────────────────────────────────────────────
create table if not exists public.home_pins (
  user_email text not null,
  pid        text not null,
  note       text,
  remind_at  timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_email, pid)
);
alter table public.home_pins enable row level security;
revoke all on public.home_pins from public, anon;
grant select on public.home_pins to authenticated;
drop policy if exists "own pins" on public.home_pins;
create policy "own pins" on public.home_pins for select to authenticated
  using (user_email = lower(coalesce(auth.jwt() ->> 'email', '')));

create or replace function public.home_pin_set(p_pid text, p_note text default null, p_remind_at timestamptz default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare me text := nullif(lower(coalesce(auth.jwt() ->> 'email', '')), '');
begin
  if me is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from properties where pid = p_pid and deleted_at is null) then raise exception 'No such property'; end if;
  insert into home_pins (user_email, pid, note, remind_at)
  values (me, p_pid, nullif(btrim(p_note), ''), p_remind_at)
  on conflict (user_email, pid) do update
     set note = nullif(btrim(excluded.note), ''), remind_at = excluded.remind_at, updated_at = now();
end
$$;

create or replace function public.home_pin_remove(p_pid text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from home_pins where user_email = lower(coalesce(auth.jwt() ->> 'email', '')) and pid = p_pid
$$;

-- ── utilities: next due date, and marking a recharge paid ─────────────────
create or replace function public.utility_cycle_months(p_cycle text)
returns int language sql immutable as $$
  select case lower(btrim(coalesce(p_cycle, '')))
           when 'monthly' then 1 when 'bi-monthly' then 2 when 'quarterly' then 3
           when 'half-yearly' then 6 when 'yearly' then 12 end
$$;

-- The first due date on or after today: the base (last recharge marked in
-- Pulse, else the start date — both are payments) plus one or more cycles.
create or replace function public.utility_next_due(p_base date, p_cycle text)
returns date
language plpgsql
immutable
as $$
declare m int := utility_cycle_months(p_cycle); d date; k int := 1;
begin
  if p_base is null or m is null then return null; end if;
  -- the base is a payment (activation or a recharge), so the next one is at
  -- least a cycle later; step from the base, not from the previous step, so
  -- month ends do not drift
  d := (p_base + make_interval(months => m))::date;
  while d < current_date loop
    k := k + 1;
    d := (p_base + make_interval(months => m * k))::date;
  end loop;
  return d;
end
$$;

create or replace function public.utility_mark_recharged(p_id uuid, p_on date default current_date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  update property_utilities set last_recharged_on = coalesce(p_on, current_date), updated_at = now() where id = p_id;
  if not found then raise exception 'No such utility'; end if;
end
$$;

-- ── the desk ──────────────────────────────────────────────────────────────
create or replace function public.home_desk(p_since timestamptz default null, p_as text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me    text := lower(coalesce(auth.jwt() ->> 'email', ''));
  since timestamptz := coalesce(p_since, now() - interval '24 hours');
  today date := (now() at time zone 'Asia/Kolkata')::date;
  ist_hour int := extract(hour from now() at time zone 'Asia/Kolkata');
  mine  text[];
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

  with names as (
    select p.pid, coalesce(nullif(btrim(p.name), ''), flent_site_name(p.pid), p.pid) as name
      from properties p where p.pid = any(mine)
  ),

  -- since you last looked ------------------------------------------------
  ev as (
    select e.*, es.pid from estimate_events e join estimates es on es.id = e.estimate_id
     where es.pid = any(mine) and e.created_at > since
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
     where w.pid = any(mine) and i.vendor_closed_at > since and i.status in ('vendor_closed', 'verified')
     group by w.id, w.pid
    union all
    -- payments logged by someone else
    select 'payment', pp.pid, pp.created_at, 1, false, split_part(coalesce(pp.created_by, ''), '@', 1),
           '₹' || to_char(coalesce(pp.amount, 0), 'FM99,99,99,999') || coalesce(' to ' || nullif(btrim(pp.payee_name), ''), '')
      from property_payments pp
     where pp.pid = any(mine) and pp.created_at > since and lower(coalesce(pp.created_by, '')) <> me
    union all
    -- journey moves by someone else (dates set or moved, milestones)
    select 'journey', j.pid, j.changed_at, 1, false, split_part(coalesce(j.changed_by, ''), '@', 1),
           initcap(replace(j.stage, '_', ' ')) || coalesce(' · ' || nullif(btrim(j.notes), ''), '')
      from property_journey j
     where j.pid = any(mine) and j.changed_at > since and lower(coalesce(j.changed_by, '')) not in (me, 'system', '')
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
     where w.pid = any(mine) and i.status = 'vendor_closed'
     group by w.id, w.pid
  ),

  -- estimates with the landlord -------------------------------------------
  est as (
    select distinct on (es.pid) es.id, es.pid, es.status, es.total, es.first_viewed_at,
           coalesce(es.sent_at, (select max(x.created_at) from estimate_events x where x.estimate_id = es.id and x.event_type = 'sent')) sent_at
      from estimates es
     where es.pid = any(mine) and es.status in ('sent', 'viewed', 'partially_approved') and coalesce(es.locked, false) = false
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
  ),

  -- this week ----------------------------------------------------------------
  wk as (
    select p.pid, 'setup' kind, p.setup_date d from properties p where p.pid = any(mine) and p.setup_date between today and today + 6
    union all
    select p.pid, 'handover', p.handover_date from properties p
     where p.pid = any(mine) and p.handover_done_at is null and p.handover_date between today and today + 6
    union all
    select w.pid, 'close_by', min(coalesce(w.scheduled_end, w.scheduled_start))::date from work_orders w
     where w.pid = any(mine) and w.status not in ('verified', 'cancelled')
     group by w.pid having min(coalesce(w.scheduled_end, w.scheduled_start))::date between today and today + 6
  ),

  -- no-shows on setup day ------------------------------------------------------
  ns as (
    select p.pid, w.vendor_id, coalesce(v.full_name, max(w.vendor_name)) vendor, max(w.trade) trade, v.phone
      from properties p
      join work_orders w on w.pid = p.pid and w.vendor_id is not null
      left join vendors v on v.id = w.vendor_id
     where p.pid = any(mine) and p.setup_date = today and ist_hour >= 11
       and exists (select 1 from work_order_items i where i.work_order_id = w.id and i.status in ('pending', 'disputed'))
       and not exists (select 1 from vendor_attendance a where a.vendor_id = w.vendor_id and a.pid = p.pid and a.punch_type = 'in'
                        and (a.punched_at at time zone 'Asia/Kolkata')::date = today)
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

    'week', coalesce((select jsonb_agg(jsonb_build_object('pid', w.pid, 'name', n.name, 'kind', w.kind, 'date', w.d) order by w.d, w.kind)
                        from wk w left join names n on n.pid = w.pid), '[]'),

    'today', coalesce((select jsonb_agg(jsonb_build_object('pid', p.pid, 'name', n.name, 'kind', k.kind, 'date', k.d,
                                                           'panel', case when k.kind = 'setup' then property_setup_panel(p.pid) end) order by k.d, k.kind)
                         from (select pid, 'setup' kind, setup_date d from properties where pid = any(mine) and setup_date between today and today + 1
                               union all
                               select pid, 'handover', handover_date from properties
                                where pid = any(mine) and handover_done_at is null and handover_date between today and today + 1) k
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
$$;

revoke all on function public.pulse_is_admin() from public, anon;
revoke all on function public.home_pin_set(text, text, timestamptz) from public, anon;
revoke all on function public.home_pin_remove(text) from public, anon;
revoke all on function public.utility_mark_recharged(uuid, date) from public, anon;
revoke all on function public.home_desk(timestamptz, text) from public, anon;
grant execute on function public.pulse_is_admin() to authenticated;
grant execute on function public.home_pin_set(text, text, timestamptz) to authenticated;
grant execute on function public.home_pin_remove(text) to authenticated;
grant execute on function public.utility_mark_recharged(uuid, date) to authenticated;
grant execute on function public.home_desk(timestamptz, text) to authenticated;

commit;
