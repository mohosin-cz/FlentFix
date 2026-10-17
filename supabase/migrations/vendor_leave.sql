-- Vendor leave: vendors ask on /attend, mohosin / shanafil / himanshu decide in
-- Vendor management → Leave, and approved leave flows into attendance, the
-- no-show checks and payroll.
--
-- The rules (told 2026-10-18):
--   paid       15 days a leave year, the year counted from each vendor's
--              date of joining (anniversary to anniversary, no carry-over)
--   sick       unlimited, paid, never touches the 15
--   emergency  decided case by case: the approver picks whether it comes out
--              of the 15, is paid without counting, or is unpaid
--   national holidays are days off for everyone, so a leave that spans one
--   does not spend a day on it; nor on the weekly off (Sunday — nobody punches
--   on Sundays). Both live in tables, not in code.
--
-- Leave beyond the balance is approved as unpaid: the first days of the leave
-- are paid while the balance lasts, the rest unpaid, and payroll takes the
-- unpaid ones off its 30-day pro-rate.
--
-- Vendors are anonymous (token sessions, see attend_session), so everything
-- they touch goes through token RPCs. Staff read the tables directly and
-- write through RPCs that check the approver list.

begin;

-- ── rules ──────────────────────────────────────────────────────────────────
create table if not exists public.vendor_leave_policy (
  id            int primary key default 1 check (id = 1),
  paid_per_year numeric not null default 15,
  weekly_off    int[]   not null default '{0}',   -- extract(dow): 0 = Sunday
  updated_at    timestamptz not null default now(),
  updated_by    text
);
insert into public.vendor_leave_policy (id) values (1) on conflict do nothing;

create table if not exists public.vendor_holidays (
  day        date primary key,
  name       text not null,
  kind       text not null default 'national' check (kind in ('national', 'festival', 'company')),
  created_by text,
  created_at timestamptz not null default now()
);
insert into public.vendor_holidays (day, name, kind) values
  ('2026-01-26', 'Republic Day', 'national'),
  ('2026-08-15', 'Independence Day', 'national'),
  ('2026-10-02', 'Gandhi Jayanti', 'national'),
  ('2027-01-26', 'Republic Day', 'national'),
  ('2027-08-15', 'Independence Day', 'national'),
  ('2027-10-02', 'Gandhi Jayanti', 'national')
on conflict do nothing;

-- ── requests ───────────────────────────────────────────────────────────────
create table if not exists public.vendor_leaves (
  id             uuid primary key default gen_random_uuid(),
  vendor_id      uuid not null references public.vendors(id) on delete cascade,
  kind           text not null check (kind in ('paid', 'sick', 'emergency')),
  start_date     date not null,
  end_date       date not null,
  half           text check (half in ('first', 'second')),
  reason         text,
  status         text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled')),
  days           numeric not null default 0,      -- working days covered (Sundays, holidays excluded)
  paid_days      numeric not null default 0,
  unpaid_days    numeric not null default 0,
  counts_balance boolean not null default true,   -- whether paid_days come out of the 15
  source         text not null default 'portal' check (source in ('portal', 'staff')),
  created_by     text,
  created_at     timestamptz not null default now(),
  decided_by     text,
  decided_at     timestamptz,
  decision_note  text,
  cancelled_by   text,
  cancelled_at   timestamptz,
  check (end_date >= start_date),
  check (half is null or start_date = end_date)
);
create index if not exists vendor_leaves_vendor_idx on public.vendor_leaves (vendor_id, start_date);
create index if not exists vendor_leaves_status_idx on public.vendor_leaves (status, start_date);

alter table public.vendor_leave_policy enable row level security;
alter table public.vendor_holidays     enable row level security;
alter table public.vendor_leaves       enable row level security;
drop policy if exists "staff read" on public.vendor_leave_policy;
drop policy if exists "staff read" on public.vendor_holidays;
drop policy if exists "staff read" on public.vendor_leaves;
create policy "staff read" on public.vendor_leave_policy for select to authenticated using (true);
create policy "staff read" on public.vendor_holidays     for select to authenticated using (true);
create policy "staff read" on public.vendor_leaves       for select to authenticated using (true);

do $$ begin
  alter publication supabase_realtime add table public.vendor_leaves;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- ── who decides ────────────────────────────────────────────────────────────
create or replace function public.leave_approvers()
returns text[] language sql immutable as $$
  select array['mohosin@flent.in', 'shanafil@flent.in', 'himanshu@flent.in']
$$;

create or replace function public.leave_me()
returns text language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function public.leave_can_decide()
returns boolean language sql stable as $$
  select leave_me() = any(leave_approvers())
$$;

-- ── counting ───────────────────────────────────────────────────────────────
-- The working days a stretch covers: not the weekly off, not a holiday.
-- A half day is one date worth 0.5.
create or replace function public.vendor_leave_workdays(p_start date, p_end date, p_half text default null)
returns table (day date, amount numeric)
language sql stable set search_path = public as $$
  select d::date, case when p_half is not null then 0.5 else 1 end::numeric
    from generate_series(p_start, p_end, interval '1 day') d
   where extract(dow from d)::int <> all(coalesce((select weekly_off from vendor_leave_policy where id = 1), '{}'::int[]))
     and not exists (select 1 from vendor_holidays h where h.day = d::date)
$$;

-- The leave year a date falls in, anniversary to anniversary from joining.
create or replace function public.vendor_leave_year(p_vendor uuid, p_on date)
returns table (year_start date, year_end date, joined date)
language plpgsql stable set search_path = public as $$
declare anchor date; n int; ys date;
begin
  select coalesce(v.date_of_joining, v.submitted_at::date, p_on) into anchor from vendors v where v.id = p_vendor;
  anchor := coalesce(anchor, p_on);
  if p_on < anchor then ys := anchor;
  else
    n := extract(year from age(p_on, anchor))::int;
    ys := (anchor + make_interval(years => n))::date;
  end if;
  return query select ys, (ys + interval '1 year' - interval '1 day')::date, anchor;
end $$;

create or replace function public.vendor_leave_balance(p_vendor uuid, p_on date default null)
returns jsonb
language plpgsql stable set search_path = public as $$
declare
  on_day date := coalesce(p_on, (now() at time zone 'Asia/Kolkata')::date);
  y record; allow numeric; out jsonb;
begin
  select * into y from vendor_leave_year(p_vendor, on_day);
  select paid_per_year into allow from vendor_leave_policy where id = 1;
  select jsonb_build_object(
    'year_start', y.year_start, 'year_end', y.year_end, 'joined', y.joined,
    'allowance', allow,
    'used',      coalesce(sum(l.paid_days)   filter (where l.status = 'approved' and l.counts_balance), 0),
    'pending',   coalesce(sum(l.days)        filter (where l.status = 'pending' and l.kind <> 'sick'), 0),
    'sick',      coalesce(sum(l.days)        filter (where l.status = 'approved' and l.kind = 'sick'), 0),
    'unpaid',    coalesce(sum(l.unpaid_days) filter (where l.status = 'approved'), 0),
    'left',      allow - coalesce(sum(l.paid_days) filter (where l.status = 'approved' and l.counts_balance), 0)
  ) into out
  from vendor_leaves l
  where l.vendor_id = p_vendor and l.start_date between y.year_start and y.year_end;
  return out;
end $$;

-- Every leave day in a window, with whether it is paid. Paid days are the
-- first ones of a leave, in date order, until paid_days runs out.
create or replace function public.vendor_leave_day_rows(p_from date, p_to date, p_vendor uuid default null)
returns table (leave_id uuid, vendor_id uuid, day date, amount numeric, paid boolean, kind text, status text, half text)
language sql stable set search_path = public as $$
  select x.id, x.vendor_id, x.day, x.amount,
         case when x.status = 'approved' then x.cum <= x.paid_days else null end,
         x.kind, x.status, x.half
    from (select l.id, l.vendor_id, l.kind, l.status, l.half, l.paid_days, w.day, w.amount,
                 sum(w.amount) over (partition by l.id order by w.day) cum
            from vendor_leaves l
            cross join lateral vendor_leave_workdays(l.start_date, l.end_date, l.half) w
           where l.status in ('approved', 'pending')
             and l.start_date <= p_to and l.end_date >= p_from
             and (p_vendor is null or l.vendor_id = p_vendor)) x
   where x.day between p_from and p_to
$$;

-- On approved leave that day (used by the no-show checks on Home).
create or replace function public.vendor_on_leave(p_vendor uuid, p_day date)
returns boolean language sql stable set search_path = public as $$
  select exists (select 1 from vendor_leaves l where l.vendor_id = p_vendor and l.status = 'approved'
                  and p_day between l.start_date and l.end_date)
$$;

-- What a stretch would cost and what it runs into. One answer for the phone
-- (while they pick dates) and the desk (while someone decides).
create or replace function public.vendor_leave_quote(p_vendor uuid, p_kind text, p_start date, p_end date,
                                                     p_half text default null, p_exclude uuid default null)
returns jsonb
language plpgsql stable set search_path = public as $$
declare
  n numeric; bal jsonb; lft numeric; v record;
begin
  select * into v from vendors where id = p_vendor;
  select coalesce(sum(amount), 0) into n from vendor_leave_workdays(p_start, p_end, p_half);
  bal := vendor_leave_balance(p_vendor, p_start);
  lft := greatest((bal ->> 'left')::numeric, 0);
  return jsonb_build_object(
    'days', n,
    'calendar_days', p_end - p_start + 1,
    'paid',   case when p_kind = 'paid' then least(n, lft) when p_kind = 'sick' then n else null end,
    'unpaid', case when p_kind = 'paid' then greatest(n - lft, 0) when p_kind = 'sick' then 0 else null end,
    'balance', bal,
    'skipped', coalesce((select jsonb_agg(jsonb_build_object('day', d::date,
                          'why', coalesce((select h.name from vendor_holidays h where h.day = d::date), 'Sunday')) order by d)
                           from generate_series(p_start, p_end, interval '1 day') d
                          where not exists (select 1 from vendor_leave_workdays(d::date, d::date) w)), '[]'),
    'overlaps', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'start', l.start_date, 'end', l.end_date, 'status', l.status, 'kind', l.kind))
                            from vendor_leaves l where l.vendor_id = p_vendor and l.status in ('pending', 'approved')
                             and l.start_date <= p_end and l.end_date >= p_start and l.id is distinct from p_exclude), '[]'),
    -- work they are booked on in that stretch: a work order's scheduled days,
    -- or the setup day of a property where their work is still open
    'clashes', coalesce((select jsonb_agg(c order by c ->> 'day') from (
        select distinct jsonb_build_object('pid', w.pid, 'day', greatest(w.scheduled_start, p_start), 'trade', w.trade,
                                           'what', 'work order ' || to_char(w.scheduled_start, 'DD Mon')
                                                   || case when coalesce(w.scheduled_end, w.scheduled_start) > w.scheduled_start
                                                           then '–' || to_char(w.scheduled_end, 'DD Mon') else '' end) c
          from work_orders w
         where w.vendor_id = p_vendor and w.status not in ('verified', 'cancelled')
           and w.scheduled_start is not null
           and w.scheduled_start <= p_end and coalesce(w.scheduled_end, w.scheduled_start) >= p_start
        union
        select distinct jsonb_build_object('pid', p.pid, 'day', p.setup_date, 'trade', w.trade, 'what', 'setup day')
          from properties p join work_orders w on w.pid = p.pid and w.vendor_id = p_vendor
         where p.setup_date between p_start and p_end and p.setup_closed_at is null
           and exists (select 1 from work_order_items i where i.work_order_id = w.id and i.status in ('pending', 'disputed'))
      ) s), '[]'),
    -- who could cover: same trade, not off on any of those days
    'cover', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.full_name) order by o.full_name)
                         from vendors o
                        where o.status = 'approved' and o.exited_at is null and o.archived_at is null
                          and o.id <> p_vendor and o.trade = v.trade
                          and not exists (select 1 from vendor_leaves l where l.vendor_id = o.id and l.status in ('approved', 'pending')
                                           and l.start_date <= p_end and l.end_date >= p_start)), '[]')
  );
end $$;

-- Shared check-and-insert for the vendor's own request and staff recording one.
create or replace function public.vendor_leave_validate(p_vendor uuid, p_kind text, p_start date, p_end date, p_half text,
                                                        p_reason text, p_staff boolean, p_exclude uuid default null)
returns numeric
language plpgsql stable set search_path = public as $$
declare today date := (now() at time zone 'Asia/Kolkata')::date; n numeric;
begin
  if p_kind not in ('paid', 'sick', 'emergency') then raise exception 'Pick the kind of leave'; end if;
  if p_start is null or p_end is null then raise exception 'Pick the days'; end if;
  if p_end < p_start then raise exception 'The last day is before the first'; end if;
  if p_half is not null and p_half not in ('first', 'second') then raise exception 'Unknown half day'; end if;
  if p_half is not null and p_start <> p_end then raise exception 'A half day is a single day'; end if;
  if p_end - p_start > 30 then raise exception 'That is more than a month — talk to the office'; end if;
  if not p_staff then
    if p_kind = 'paid' and p_start < today then raise exception 'Paid leave can only be asked for today or later'; end if;
    if p_start < today - 7 then raise exception 'That is more than a week ago — talk to the office'; end if;
    if p_start > today + 120 then raise exception 'That is too far ahead — ask closer to the time'; end if;
  end if;
  if p_kind = 'emergency' and coalesce(btrim(p_reason), '') = '' then raise exception 'Say what the emergency is'; end if;
  select coalesce(sum(amount), 0) into n from vendor_leave_workdays(p_start, p_end, p_half);
  if n = 0 then raise exception 'Those days are already off (Sunday or a holiday)'; end if;
  if exists (select 1 from vendor_leaves l where l.vendor_id = p_vendor and l.status in ('pending', 'approved')
              and l.start_date <= p_end and l.end_date >= p_start and l.id is distinct from p_exclude) then
    raise exception 'You already have leave on some of these days';
  end if;
  return n;
end $$;

-- Split a leave into paid and unpaid, and say whether it spends balance.
-- mode: 'auto' (paid → balance then unpaid; sick → free), 'balance', 'free', 'unpaid'
create or replace function public.vendor_leave_settle(p_id uuid, p_mode text)
returns void
language plpgsql set search_path = public as $$
declare l record; n numeric; lft numeric; m text;
begin
  select * into l from vendor_leaves where id = p_id for update;
  select coalesce(sum(amount), 0) into n from vendor_leave_workdays(l.start_date, l.end_date, l.half);
  m := coalesce(nullif(p_mode, ''), 'auto');
  if m = 'auto' then
    m := case l.kind when 'sick' then 'free' when 'paid' then 'balance' else null end;
    if m is null then raise exception 'Emergency leave: choose from balance, paid without counting, or unpaid'; end if;
  end if;
  if m not in ('balance', 'free', 'unpaid') then raise exception 'Unknown way to approve'; end if;
  -- balance left, not counting this leave itself
  lft := greatest((vendor_leave_balance(l.vendor_id, l.start_date) ->> 'left')::numeric
                  + case when l.status = 'approved' and l.counts_balance then l.paid_days else 0 end, 0);
  update vendor_leaves set
    days = n,
    paid_days      = case m when 'balance' then least(n, lft) when 'free' then n else 0 end,
    unpaid_days    = case m when 'balance' then greatest(n - lft, 0) when 'free' then 0 else n end,
    counts_balance = (m = 'balance')
  where id = p_id;
end $$;

create or replace function public.vendor_leave_notify(p_id uuid, p_title text)
returns void
language sql set search_path = public as $$
  insert into notifications (user_email, kind, pid, title, body, route, dedupe_key)
  select a, 'vendor_leave', null, p_title,
         concat_ws(' · ', case when l.start_date = l.end_date then to_char(l.start_date, 'Dy DD Mon')
                               else to_char(l.start_date, 'Dy DD Mon') || ' – ' || to_char(l.end_date, 'Dy DD Mon') end,
                   case l.kind when 'paid' then 'paid leave' when 'sick' then 'sick' else 'emergency' end,
                   nullif(left(coalesce(l.reason, ''), 80), '')),
         '/vendors?tab=leave', 'vendor_leave:' || l.id || ':' || l.status || ':' || extract(epoch from now())::bigint
    from vendor_leaves l cross join unnest(leave_approvers()) a
   where l.id = p_id
  on conflict do nothing
$$;

-- ── the vendor's side (token) ──────────────────────────────────────────────
create or replace function public.attend_leave_session(p_token text)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  select vendor_id into v from attend_session where token = p_token and expires_at > now();
  if v is null then raise exception 'Session expired — sign in again'; end if;
  return v;
end $$;

create or replace function public.attend_leave_status(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v uuid := attend_leave_session(p_token); today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  return jsonb_build_object(
    'today', today,
    'balance', vendor_leave_balance(v, today),
    'weekly_off', (select weekly_off from vendor_leave_policy where id = 1),
    'on_leave', (select jsonb_build_object('id', l.id, 'kind', l.kind, 'half', l.half, 'end', l.end_date)
                   from vendor_leaves l where l.vendor_id = v and l.status = 'approved'
                    and today between l.start_date and l.end_date limit 1),
    'holiday_today', (select name from vendor_holidays where day = today),
    'holidays', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'name', name) order by day)
                            from vendor_holidays where day between today and today + 120), '[]'),
    'leaves', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', l.id, 'kind', l.kind, 'start', l.start_date, 'end', l.end_date, 'half', l.half,
                 'reason', l.reason, 'status', l.status, 'days', l.days, 'paid_days', l.paid_days,
                 'unpaid_days', l.unpaid_days, 'counts_balance', l.counts_balance,
                 'decided_by', split_part(l.decided_by, '@', 1), 'decided_at', l.decided_at,
                 'note', l.decision_note, 'source', l.source, 'created_at', l.created_at,
                 'cancelled_by', case when l.cancelled_by is null then null when l.cancelled_by = 'vendor' then 'you' else split_part(l.cancelled_by, '@', 1) end)
                 order by l.start_date desc)
               from vendor_leaves l where l.vendor_id = v and l.end_date >= today - 400), '[]')
  );
end $$;

create or replace function public.attend_leave_quote(p_token text, p_kind text, p_start date, p_end date, p_half text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v uuid := attend_leave_session(p_token); q jsonb;
begin
  q := vendor_leave_quote(v, p_kind, p_start, p_end, p_half);
  -- other vendors' names are not theirs to see
  return q - 'cover';
end $$;

create or replace function public.attend_leave_apply(p_token text, p_kind text, p_start date, p_end date,
                                                     p_half text default null, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v uuid := attend_leave_session(p_token); n numeric; v_id uuid; nm text;
begin
  n := vendor_leave_validate(v, p_kind, p_start, p_end, p_half, p_reason, false);
  insert into vendor_leaves (vendor_id, kind, start_date, end_date, half, reason, days, source, created_by)
  values (v, p_kind, p_start, p_end, p_half, nullif(btrim(coalesce(p_reason, '')), ''), n, 'portal', 'vendor')
  returning vendor_leaves.id into v_id;
  select full_name into nm from vendors where vendors.id = v;
  perform vendor_leave_notify(v_id, 'Leave request: ' || coalesce(nm, 'a vendor'));
  return jsonb_build_object('id', v_id, 'days', n);
end $$;

create or replace function public.attend_leave_cancel(p_token text, p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v uuid := attend_leave_session(p_token); l record; today date := (now() at time zone 'Asia/Kolkata')::date; nm text;
begin
  select * into l from vendor_leaves where id = p_id and vendor_id = v for update;
  if l.id is null then raise exception 'Not found'; end if;
  if l.status not in ('pending', 'approved') then raise exception 'This request is already closed'; end if;
  if l.status = 'approved' and l.start_date <= today then raise exception 'This leave has started — ask the office to change it'; end if;
  update vendor_leaves set status = 'cancelled', cancelled_by = 'vendor', cancelled_at = now() where id = p_id;
  if l.status = 'approved' then
    select full_name into nm from vendors where id = v;
    perform vendor_leave_notify(p_id, coalesce(nm, 'A vendor') || ' cancelled approved leave');
  end if;
end $$;

-- ── staff side ─────────────────────────────────────────────────────────────
create or replace function public.vendor_leave_decide(p_id uuid, p_approve boolean, p_mode text default 'auto', p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare l record;
begin
  if not leave_can_decide() then raise exception 'Only mohosin, shanafil or himanshu can decide leave'; end if;
  select * into l from vendor_leaves where id = p_id for update;
  if l.id is null then raise exception 'Not found'; end if;
  if l.status <> 'pending' then raise exception 'Already %', l.status; end if;
  if p_approve then
    perform vendor_leave_settle(p_id, p_mode);
    update vendor_leaves set status = 'approved', decided_by = leave_me(), decided_at = now(),
           decision_note = nullif(btrim(coalesce(p_note, '')), '') where id = p_id;
  else
    if coalesce(btrim(p_note), '') = '' then raise exception 'Say why — the vendor sees this'; end if;
    update vendor_leaves set status = 'declined', decided_by = leave_me(), decided_at = now(),
           decision_note = btrim(p_note), paid_days = 0, unpaid_days = 0 where id = p_id;
  end if;
  -- the request is dealt with: clear it from everyone's bell
  update notifications set read_at = coalesce(read_at, now())
   where kind = 'vendor_leave' and dedupe_key like 'vendor_leave:' || p_id || ':pending:%';
  return (select to_jsonb(x) from vendor_leaves x where x.id = p_id);
end $$;

-- Staff record leave someone phoned in: approved straight away, any dates.
create or replace function public.vendor_leave_record(p_vendor uuid, p_kind text, p_start date, p_end date,
                                                      p_half text default null, p_reason text default null,
                                                      p_mode text default 'auto')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare n numeric; v_id uuid;
begin
  if not leave_can_decide() then raise exception 'Only mohosin, shanafil or himanshu can record leave'; end if;
  n := vendor_leave_validate(p_vendor, p_kind, p_start, p_end, p_half, coalesce(p_reason, 'recorded by the office'), true);
  insert into vendor_leaves (vendor_id, kind, start_date, end_date, half, reason, days, source, created_by)
  values (p_vendor, p_kind, p_start, p_end, p_half, nullif(btrim(coalesce(p_reason, '')), ''), n, 'staff', leave_me())
  returning vendor_leaves.id into v_id;
  perform vendor_leave_settle(v_id, p_mode);
  update vendor_leaves set status = 'approved', decided_by = leave_me(), decided_at = now() where vendor_leaves.id = v_id;
  return (select to_jsonb(x) from vendor_leaves x where x.id = v_id);
end $$;

-- Change how an approved leave is paid (e.g. an emergency later made unpaid).
create or replace function public.vendor_leave_repay(p_id uuid, p_mode text)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not leave_can_decide() then raise exception 'Only mohosin, shanafil or himanshu can change leave'; end if;
  if not exists (select 1 from vendor_leaves where id = p_id and status = 'approved') then raise exception 'Only approved leave'; end if;
  perform vendor_leave_settle(p_id, p_mode);
  return (select to_jsonb(x) from vendor_leaves x where x.id = p_id);
end $$;

create or replace function public.vendor_leave_cancel(p_id uuid, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not leave_can_decide() then raise exception 'Only mohosin, shanafil or himanshu can cancel leave'; end if;
  update vendor_leaves set status = 'cancelled', cancelled_by = leave_me(), cancelled_at = now(),
         decision_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), decision_note)
   where id = p_id and status in ('pending', 'approved');
  if not found then raise exception 'Nothing to cancel'; end if;
end $$;

create or replace function public.vendor_holiday_set(p_day date, p_name text, p_kind text default 'festival')
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not leave_can_decide() then raise exception 'Only mohosin, shanafil or himanshu can change holidays'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'Name the holiday'; end if;
  insert into vendor_holidays (day, name, kind, created_by) values (p_day, btrim(p_name), coalesce(p_kind, 'festival'), leave_me())
  on conflict (day) do update set name = excluded.name, kind = excluded.kind;
  -- leave already approved across this day spends one day less now
  perform vendor_leave_settle(l.id, case when l.counts_balance then 'balance' when l.paid_days > 0 then 'free' else 'unpaid' end)
     from vendor_leaves l where l.status = 'approved' and p_day between l.start_date and l.end_date;
  update vendor_leaves l set days = (select coalesce(sum(amount), 0) from vendor_leave_workdays(l.start_date, l.end_date, l.half))
   where l.status = 'pending' and p_day between l.start_date and l.end_date;
end $$;

create or replace function public.vendor_holiday_remove(p_day date)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not leave_can_decide() then raise exception 'Only mohosin, shanafil or himanshu can change holidays'; end if;
  delete from vendor_holidays where day = p_day;
  perform vendor_leave_settle(l.id, case when l.counts_balance then 'balance' when l.paid_days > 0 then 'free' else 'unpaid' end)
     from vendor_leaves l where l.status = 'approved' and p_day between l.start_date and l.end_date;
  update vendor_leaves l set days = (select coalesce(sum(amount), 0) from vendor_leave_workdays(l.start_date, l.end_date, l.half))
   where l.status = 'pending' and p_day between l.start_date and l.end_date;
end $$;

create or replace function public.vendor_leave_policy_set(p_paid_per_year numeric)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not leave_can_decide() then raise exception 'Only mohosin, shanafil or himanshu can change the rules'; end if;
  if p_paid_per_year is null or p_paid_per_year < 0 or p_paid_per_year > 60 then raise exception 'Between 0 and 60 days'; end if;
  update vendor_leave_policy set paid_per_year = p_paid_per_year, updated_at = now(), updated_by = leave_me() where id = 1;
end $$;

-- Everything the Leave tab shows, in one call.
create or replace function public.vendor_leave_board(p_from date default null, p_to date default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  f date := coalesce(p_from, today);
  t date := coalesce(p_to, coalesce(p_from, today) + 13);
  m0 date := date_trunc('month', today)::date;
begin
  return jsonb_build_object(
    'today', today, 'from', f, 'to', t,
    'me', leave_me(), 'can_decide', leave_can_decide(), 'approvers', to_jsonb(leave_approvers()),
    'policy', (select to_jsonb(p) from vendor_leave_policy p where id = 1),
    'vendors', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'name', v.full_name, 'trade', v.trade, 'code', v.vendor_code,
                                                             'avatar', v.avatar_path, 'balance', vendor_leave_balance(v.id, today))
                                          order by v.full_name)
                           from vendors v where v.status = 'approved' and v.exited_at is null and v.archived_at is null), '[]'),
    'holidays', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'name', name, 'kind', kind) order by day)
                            from vendor_holidays where day >= today - 365), '[]'),
    'days', coalesce((select jsonb_agg(jsonb_build_object('leave_id', r.leave_id, 'vendor_id', r.vendor_id, 'day', r.day,
                                                          'amount', r.amount, 'paid', r.paid, 'kind', r.kind, 'status', r.status, 'half', r.half))
                        from vendor_leave_day_rows(f, t) r), '[]'),
    -- booked work in the window, for the grid's underline
    'work', coalesce((select jsonb_agg(distinct jsonb_build_object('vendor_id', w.vendor_id, 'day', d::date, 'pid', w.pid))
                        from work_orders w cross join lateral generate_series(greatest(w.scheduled_start, f), least(coalesce(w.scheduled_end, w.scheduled_start), t), interval '1 day') d
                       where w.vendor_id is not null and w.status not in ('verified', 'cancelled') and w.scheduled_start is not null
                         and w.scheduled_start <= t and coalesce(w.scheduled_end, w.scheduled_start) >= f), '[]')
             || coalesce((select jsonb_agg(distinct jsonb_build_object('vendor_id', w.vendor_id, 'day', p.setup_date, 'pid', p.pid))
                        from properties p join work_orders w on w.pid = p.pid and w.vendor_id is not null
                       where p.setup_date between f and t and p.setup_closed_at is null and p.journey_paused_at is null
                         and exists (select 1 from work_order_items i where i.work_order_id = w.id and i.status in ('pending', 'disputed'))), '[]'),
    'pending', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'vendor_id', l.vendor_id, 'kind', l.kind,
                                           'start', l.start_date, 'end', l.end_date, 'half', l.half, 'reason', l.reason,
                                           'days', l.days, 'created_at', l.created_at, 'source', l.source,
                                           'quote', vendor_leave_quote(l.vendor_id, l.kind, l.start_date, l.end_date, l.half, l.id))
                                         order by l.start_date)
                          from vendor_leaves l where l.status = 'pending'), '[]'),
    'month', jsonb_build_object('start', m0,
       'paid',   (select coalesce(sum(amount) filter (where paid), 0) from vendor_leave_day_rows(m0, (m0 + interval '1 month' - interval '1 day')::date) where status = 'approved'),
       'unpaid', (select coalesce(sum(amount) filter (where not paid), 0) from vendor_leave_day_rows(m0, (m0 + interval '1 month' - interval '1 day')::date) where status = 'approved'))
  );
end $$;

-- ── payroll: unpaid leave comes off the 30-day pro-rate ────────────────────
-- Same as before (live definition, 2026-10-18) plus: days_worked starts at
-- 30 minus approved unpaid leave days in the month, and the line says why.
create or replace function public.payroll_fill_month(p_period_id uuid)
returns int
language plpgsql security invoker set search_path = public
as $$
declare
  per record; rec record; last record;
  v_otdays int; v_fixed numeric; v_otamt numeric; v_earned numeric;
  v_paid numeric; v_unpaid numeric; v_days numeric;
  p_start date; p_end date; n int := 0;
begin
  select * into per from public.vendor_payroll_periods where id = p_period_id;
  if per.id is null then raise exception 'Period not found'; end if;
  p_start := per.period_month;
  p_end   := per.period_month + (coalesce(per.days_in_month, 30) - 1);

  delete from public.vendor_payouts where period_id = p_period_id;

  for rec in select * from public.vendors where status = 'approved' loop
    select p.* into last
      from public.vendor_payouts p
      join public.vendor_payroll_periods pp on pp.id = p.period_id
     where p.vendor_id = rec.id and p.period_id <> p_period_id
     order by pp.period_month desc limit 1;

    v_fixed := coalesce(rec.monthly_rate, last.fixed_pay,
                        (select monthly_rate from public.payroll_trade_rate where trade = rec.trade), 0);

    select count(distinct (punched_at at time zone 'Asia/Kolkata')::date) filter (where kind = 'overtime')
      into v_otdays
      from public.vendor_attendance
     where vendor_id = rec.id and (punched_at at time zone 'Asia/Kolkata')::date between p_start and p_end;

    select coalesce(sum(amount) filter (where paid), 0), coalesce(sum(amount) filter (where not paid), 0)
      into v_paid, v_unpaid
      from public.vendor_leave_day_rows(p_start, p_end, rec.id) where status = 'approved';

    v_days   := greatest(30 - v_unpaid, 0);
    v_otamt  := round(coalesce(v_otdays,0) * 1.25 * v_fixed / 30);
    v_earned := round(v_fixed / 30 * v_days);

    insert into public.vendor_payouts(
      period_id, vendor_id, beneficiary_name, team, cost_centre, upi_id,
      bank_account_name, bank_account_no, bank_ifsc,
      fixed_pay, allowance, days_worked, ot_days, ot_amount,
      advance_given, advance_recovered, total_payout, source, comments
    ) values (
      p_period_id, rec.id,
      coalesce(last.beneficiary_name, rec.full_name),
      coalesce(last.team, rec.pod),
      last.cost_centre,
      coalesce(last.upi_id, rec.upi_id),
      coalesce(last.bank_account_name, rec.bank_account_name),
      coalesce(last.bank_account_no, rec.bank_account_no),
      coalesce(last.bank_ifsc, rec.bank_ifsc),
      v_fixed, 0, v_days, coalesce(v_otdays,0), v_otamt,
      0, 0, v_earned + v_otamt, 'generated',
      case when v_paid + v_unpaid > 0 then
        'Leave: ' || concat_ws(', ', case when v_paid > 0 then trim_scale(v_paid)::text || ' paid' end,
                                     case when v_unpaid > 0 then trim_scale(v_unpaid)::text || ' unpaid (deducted)' end) end
    );
    n := n + 1;
  end loop;
  return n;
end $$;
grant execute on function public.payroll_fill_month(uuid) to authenticated;

-- ── grants ─────────────────────────────────────────────────────────────────
revoke all on function public.vendor_leave_validate(uuid, text, date, date, text, text, boolean, uuid) from public, anon;
revoke all on function public.vendor_leave_settle(uuid, text) from public, anon, authenticated;
revoke all on function public.vendor_leave_notify(uuid, text) from public, anon, authenticated;
revoke all on function public.vendor_leave_quote(uuid, text, date, date, text, uuid) from public, anon;
revoke all on function public.attend_leave_session(text) from public;

grant execute on function public.attend_leave_session(text) to anon, authenticated;
grant execute on function public.attend_leave_status(text) to anon, authenticated;
grant execute on function public.attend_leave_quote(text, text, date, date, text) to anon, authenticated;
grant execute on function public.attend_leave_apply(text, text, date, date, text, text) to anon, authenticated;
grant execute on function public.attend_leave_cancel(text, uuid) to anon, authenticated;

revoke all on function public.vendor_leave_decide(uuid, boolean, text, text) from public, anon;
revoke all on function public.vendor_leave_record(uuid, text, date, date, text, text, text) from public, anon;
revoke all on function public.vendor_leave_repay(uuid, text) from public, anon;
revoke all on function public.vendor_leave_cancel(uuid, text) from public, anon;
revoke all on function public.vendor_holiday_set(date, text, text) from public, anon;
revoke all on function public.vendor_holiday_remove(date) from public, anon;
revoke all on function public.vendor_leave_policy_set(numeric) from public, anon;
revoke all on function public.vendor_leave_board(date, date) from public, anon;
grant execute on function public.vendor_leave_decide(uuid, boolean, text, text) to authenticated;
grant execute on function public.vendor_leave_record(uuid, text, date, date, text, text, text) to authenticated;
grant execute on function public.vendor_leave_repay(uuid, text) to authenticated;
grant execute on function public.vendor_leave_cancel(uuid, text) to authenticated;
grant execute on function public.vendor_holiday_set(date, text, text) to authenticated;
grant execute on function public.vendor_holiday_remove(date) to authenticated;
grant execute on function public.vendor_leave_policy_set(numeric) to authenticated;
grant execute on function public.vendor_leave_board(date, date) to authenticated;
grant execute on function public.vendor_leave_quote(uuid, text, date, date, text, uuid) to authenticated;
grant execute on function public.leave_can_decide() to authenticated;

commit;
