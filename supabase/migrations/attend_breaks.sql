-- Vendor breaks: 45-minute lunch + 15-minute snack inside a shift.
--
-- Deliberately its own table rather than new punch_type values on
-- vendor_attendance. Several RPCs decide whether a vendor is on site with
-- `last.punch_type = 'in'` over the most recent row (attend_login,
-- attend_session_info, attend_lookup), and payroll pairs in/out rows. A
-- 'lunch_start' row landing on top would read as "punched out" and would sit
-- in the middle of an in/out pair. Keeping breaks separate means none of that
-- logic changes at all.
--
-- Windows are Asia/Kolkata, not UTC: `now()` on the server is UTC and 13:00
-- IST is 07:30 UTC, so comparing raw now() would open lunch at half past six
-- in the evening.

create table if not exists public.vendor_breaks (
  id            uuid primary key default gen_random_uuid(),
  vendor_id     uuid not null references public.vendors(id) on delete cascade,
  kind          text not null check (kind in ('lunch','snack')),
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  -- the local day the break belongs to, so "once per day" survives a shift
  -- that crosses midnight UTC
  break_day     date not null default ((now() at time zone 'Asia/Kolkata')::date),
  source        text not null default 'self',
  created_at    timestamptz not null default now()
);

create index if not exists vendor_breaks_vendor_idx on public.vendor_breaks(vendor_id, started_at desc);
create index if not exists vendor_breaks_day_idx    on public.vendor_breaks(break_day desc);

-- One lunch and one snack per vendor per day.
create unique index if not exists vendor_breaks_one_per_kind_per_day
  on public.vendor_breaks(vendor_id, break_day, kind);

alter table public.vendor_breaks enable row level security;

drop policy if exists "authenticated can read breaks" on public.vendor_breaks;
create policy "authenticated can read breaks"
  on public.vendor_breaks for select to authenticated using (true);
-- Writes happen ONLY through the SECURITY DEFINER RPCs below, matching
-- vendor_attendance. No anon insert/update policy, deliberately.

revoke all on public.vendor_breaks from anon;

do $$ begin
  alter publication supabase_realtime add table public.vendor_breaks;
exception when duplicate_object then null;
end $$;

-- ── Rules in one place, so the client and the server cannot disagree ─────────
-- lunch  45 min, available from 13:00 IST
-- snack  15 min, available 16:00–18:00 IST
create or replace function public.attend_break_rules()
returns table (kind text, minutes int, from_hour int, to_hour int)
language sql immutable
as $$
  select 'lunch'::text, 45, 13, 24
  union all
  select 'snack'::text, 15, 16, 18
$$;

-- ── Today's break state for the signed-in vendor ─────────────────────────────
create or replace function public.attend_break_status(p_token text)
returns table (
  id uuid, kind text, started_at timestamptz, ended_at timestamptz,
  minutes int, is_open boolean
)
language plpgsql security definer set search_path = public, extensions
as $$
declare s public.attend_session;
begin
  select * into s from public.attend_session where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Session expired — sign in again'; end if;
  return query
    select b.id, b.kind, b.started_at, b.ended_at,
           r.minutes, (b.ended_at is null)
      from public.vendor_breaks b
      join public.attend_break_rules() r on r.kind = b.kind
     where b.vendor_id = s.vendor_id
       and b.break_day = (now() at time zone 'Asia/Kolkata')::date
     order by b.started_at;
end $$;

-- ── Start a break ────────────────────────────────────────────────────────────
create or replace function public.attend_break_start(p_token text, p_kind text)
returns public.vendor_breaks
language plpgsql security definer set search_path = public, extensions
as $$
declare
  s public.attend_session;
  last public.vendor_attendance;
  r record;
  open_break public.vendor_breaks;
  today date := (now() at time zone 'Asia/Kolkata')::date;
  hr int := extract(hour from (now() at time zone 'Asia/Kolkata'));
  out_row public.vendor_breaks;
begin
  select * into s from public.attend_session where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Session expired — sign in again'; end if;

  select * into r from public.attend_break_rules() where kind = p_kind;
  if r.kind is null then raise exception 'Unknown break type'; end if;

  -- must be on site
  select * into last from public.vendor_attendance
   where vendor_attendance.vendor_id = s.vendor_id
   order by punched_at desc limit 1;
  if last.id is null or last.punch_type <> 'in' then
    raise exception 'Punch in before taking a break';
  end if;

  if hr < r.from_hour or hr >= r.to_hour then
    if p_kind = 'lunch' then raise exception 'Lunch can be taken after 1 pm';
    else raise exception 'Snack break is between 4 pm and 6 pm'; end if;
  end if;

  select * into open_break from public.vendor_breaks
   where vendor_id = s.vendor_id and ended_at is null
   order by started_at desc limit 1;
  if open_break.id is not null then
    raise exception 'You are already on a break — end it first';
  end if;

  if exists (select 1 from public.vendor_breaks
              where vendor_id = s.vendor_id and break_day = today and kind = p_kind) then
    raise exception 'You have already taken your % break today', p_kind;
  end if;

  insert into public.vendor_breaks(vendor_id, kind, break_day)
  values (s.vendor_id, p_kind, today)
  returning * into out_row;
  return out_row;
end $$;

-- ── End the open break ───────────────────────────────────────────────────────
create or replace function public.attend_break_end(p_token text)
returns public.vendor_breaks
language plpgsql security definer set search_path = public, extensions
as $$
declare s public.attend_session; out_row public.vendor_breaks;
begin
  select * into s from public.attend_session where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Session expired — sign in again'; end if;

  update public.vendor_breaks
     set ended_at = now()
   where id = (select id from public.vendor_breaks
                where vendor_id = s.vendor_id and ended_at is null
                order by started_at desc limit 1)
  returning * into out_row;

  if out_row.id is null then raise exception 'No break is running'; end if;
  return out_row;
end $$;

grant execute on function public.attend_break_rules()               to anon, authenticated;
grant execute on function public.attend_break_status(text)          to anon, authenticated;
grant execute on function public.attend_break_start(text, text)     to anon, authenticated;
grant execute on function public.attend_break_end(text)             to anon, authenticated;
