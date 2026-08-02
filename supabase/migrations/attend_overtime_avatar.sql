-- Attendance upgrades: overtime vs regular, vendor avatar (public bucket),
-- and updated token-scoped RPCs. Repo source of truth.

-- ── overtime vs regular ─────────────────────────────────────────────────────
alter table public.vendor_attendance add column if not exists kind text not null default 'regular';
alter table public.vendor_attendance drop constraint if exists vendor_attendance_kind_chk;
alter table public.vendor_attendance add constraint vendor_attendance_kind_chk check (kind in ('regular','overtime'));

-- ── avatar (public bucket, uuid paths) ──────────────────────────────────────
alter table public.vendors add column if not exists avatar_path text;

insert into storage.buckets (id, name, public) values ('vendor-avatars','vendor-avatars', true)
on conflict (id) do nothing;

drop policy if exists "anon can upload vendor avatars" on storage.objects;
create policy "anon can upload vendor avatars" on storage.objects
  for insert to anon with check (bucket_id = 'vendor-avatars');
drop policy if exists "public can read vendor avatars" on storage.objects;
create policy "public can read vendor avatars" on storage.objects
  for select to public using (bucket_id = 'vendor-avatars');

-- ── token punch carries a kind, guarded per-kind ────────────────────────────
drop function if exists public.attend_punch(text, text, text, numeric, numeric, numeric);
create or replace function public.attend_punch(
  p_token text, p_type text, p_pid text, p_lat numeric, p_lng numeric, p_accuracy numeric, p_kind text default 'regular'
) returns public.vendor_attendance
language plpgsql security definer set search_path = public, extensions
as $$
declare s public.attend_session; v public.vendors; last public.vendor_attendance; r public.vendor_attendance;
begin
  if p_type not in ('in','out') then raise exception 'Invalid punch type'; end if;
  if p_kind not in ('regular','overtime') then raise exception 'Invalid punch kind'; end if;
  select * into s from public.attend_session where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Session expired — sign in again'; end if;
  select * into v from public.vendors where id = s.vendor_id;
  select * into last from public.vendor_attendance
    where vendor_attendance.vendor_id = v.id and vendor_attendance.kind = p_kind
    order by punched_at desc limit 1;
  if p_type = 'in'  and last.punch_type = 'in' then raise exception 'Already checked in — check out first'; end if;
  if p_type = 'out' and (last.id is null or last.punch_type = 'out') then raise exception 'Not checked in yet'; end if;
  insert into public.vendor_attendance(vendor_id, punch_type, pid, pod, lat, lng, accuracy, source, kind)
   values (v.id, p_type, nullif(btrim(coalesce(p_pid,'')), ''), v.pod, p_lat, p_lng, p_accuracy, 'self', p_kind)
   returning * into r;
  return r;
end $$;
grant execute on function public.attend_punch(text, text, text, numeric, numeric, numeric, text) to anon, authenticated;

-- ── history includes kind ───────────────────────────────────────────────────
drop function if exists public.attend_history(text);
create or replace function public.attend_history(p_token text)
returns table (punched_at timestamptz, punch_type text, pid text, kind text)
language plpgsql security definer set search_path = public, extensions
as $$
declare s public.attend_session;
begin
  select * into s from public.attend_session where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Session expired — sign in again'; end if;
  return query select a.punched_at, a.punch_type, a.pid, a.kind
    from public.vendor_attendance a where a.vendor_id = s.vendor_id
    order by a.punched_at desc limit 120;
end $$;
grant execute on function public.attend_history(text) to anon, authenticated;

-- ── set own avatar ──────────────────────────────────────────────────────────
create or replace function public.attend_set_avatar(p_token text, p_path text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare s public.attend_session;
begin
  select * into s from public.attend_session where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Session expired — sign in again'; end if;
  update public.vendors set avatar_path = p_path where id = s.vendor_id;
end $$;
grant execute on function public.attend_set_avatar(text, text) to anon, authenticated;

-- ── profile includes avatar_path ────────────────────────────────────────────
drop function if exists public.attend_profile(text);
create or replace function public.attend_profile(p_token text)
returns table (
  full_name text, trade text, pod text, vendor_code text, status text, avatar_path text,
  phone text, alt_phone text, email text,
  address_line text, city text, pincode text, date_of_joining date,
  aadhaar_last4 text, pan_number text,
  bank_account_name text, bank_account_last4 text, bank_ifsc text, upi_id text,
  dl_number text, dl_expiry date, submitted_at timestamptz
)
language plpgsql security definer set search_path = public, extensions
as $$
declare s public.attend_session; v public.vendors;
begin
  select * into s from public.attend_session where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Session expired — sign in again'; end if;
  select * into v from public.vendors where id = s.vendor_id;
  return query select
    v.full_name, v.trade, v.pod, v.vendor_code, v.status::text, v.avatar_path,
    v.phone, v.alt_phone, v.email,
    v.address_line, v.city, v.pincode, v.date_of_joining,
    v.aadhaar_last4, v.pan_number,
    v.bank_account_name, right(v.bank_account_no, 4), v.bank_ifsc, v.upi_id,
    v.dl_number, v.dl_expiry, v.submitted_at;
end $$;
grant execute on function public.attend_profile(text) to anon, authenticated;
