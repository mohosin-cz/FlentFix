-- Vendor attendance: public punch page (/attend) + staff live board.
-- Applied to the project via the Supabase migration tooling; kept here as the
-- repo source of truth.

-- ── Event-based punches (each check-in / check-out is a row) ─────────────────
create table if not exists public.vendor_attendance (
  id         uuid primary key default gen_random_uuid(),
  vendor_id  uuid not null references public.vendors(id) on delete cascade,
  punch_type text not null check (punch_type in ('in','out')),
  punched_at timestamptz not null default now(),
  pid        text,          -- property / site the vendor is working at
  pod        text,          -- snapshot of vendor POD at punch time
  lat        numeric,
  lng        numeric,
  accuracy   numeric,
  source     text not null default 'self',
  created_at timestamptz not null default now()
);

create index if not exists vendor_attendance_vendor_idx on public.vendor_attendance(vendor_id, punched_at desc);
create index if not exists vendor_attendance_day_idx    on public.vendor_attendance(punched_at desc);

alter table public.vendor_attendance enable row level security;

drop policy if exists "authenticated can read attendance" on public.vendor_attendance;
create policy "authenticated can read attendance"
  on public.vendor_attendance for select to authenticated using (true);
-- writes happen ONLY through the SECURITY DEFINER attend_punch() RPC below;
-- there is deliberately no anon/insert policy.

-- realtime for the staff board
do $$ begin
  alter publication supabase_realtime add table public.vendor_attendance;
exception when duplicate_object then null;
end $$;

-- ── Identity check: verify code + phone against an approved vendor ───────────
create or replace function public.attend_lookup(p_code text, p_phone text)
returns table (vendor_id uuid, full_name text, trade text, pod text, checked_in boolean, last_punch_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $$
declare v public.vendors; last public.vendor_attendance;
begin
  select * into v from public.vendors
   where vendor_code is not null
     and upper(vendor_code) = upper(btrim(p_code))
     and phone = btrim(p_phone)
     and status = 'approved'
   limit 1;
  if v.id is null then
    raise exception 'No approved vendor found for that code and phone';
  end if;
  select * into last from public.vendor_attendance
   where vendor_attendance.vendor_id = v.id
   order by punched_at desc limit 1;
  return query select v.id, v.full_name, v.trade, v.pod,
    coalesce(last.punch_type = 'in', false), last.punched_at;
end $$;

-- ── Record a punch (verifies identity, guards double in/out) ────────────────
create or replace function public.attend_punch(
  p_code text, p_phone text, p_type text, p_pid text,
  p_lat numeric, p_lng numeric, p_accuracy numeric
) returns public.vendor_attendance
language plpgsql
security definer
set search_path to 'public'
as $$
declare v public.vendors; last public.vendor_attendance; r public.vendor_attendance;
begin
  if p_type not in ('in','out') then raise exception 'Invalid punch type'; end if;

  select * into v from public.vendors
   where vendor_code is not null
     and upper(vendor_code) = upper(btrim(p_code))
     and phone = btrim(p_phone)
     and status = 'approved'
   limit 1;
  if v.id is null then raise exception 'No approved vendor found for that code and phone'; end if;

  select * into last from public.vendor_attendance
   where vendor_attendance.vendor_id = v.id order by punched_at desc limit 1;

  if p_type = 'in'  and last.punch_type = 'in' then raise exception 'Already checked in — check out first'; end if;
  if p_type = 'out' and (last.id is null or last.punch_type = 'out') then raise exception 'Not checked in yet'; end if;

  insert into public.vendor_attendance(vendor_id, punch_type, pid, pod, lat, lng, accuracy, source)
  values (v.id, p_type, nullif(btrim(coalesce(p_pid,'')), ''), v.pod, p_lat, p_lng, p_accuracy, 'self')
  returning * into r;
  return r;
end $$;

-- ── Site list for the punch page (controlled exposure of active properties) ──
create or replace function public.attend_sites()
returns table (pid text, label text)
language sql
security definer
set search_path to 'public'
as $$
  select pid, coalesce(nullif(name, ''), nullif(address, ''), pid) as label
  from public.properties
  where deleted_at is null and pid is not null
  order by coalesce(name, address, pid);
$$;

grant execute on function public.attend_lookup(text, text) to anon, authenticated;
grant execute on function public.attend_punch(text, text, text, text, numeric, numeric, numeric) to anon, authenticated;
grant execute on function public.attend_sites() to anon, authenticated;
