-- Email-OTP auth for the vendor attendance page.
-- Custom OTP (vendors stay ANONYMOUS — deliberately NOT Supabase Auth, which
-- would grant them the `authenticated` role and expose all vendor PII).
-- Applied to the project via the Supabase migration tooling; repo source of truth.

create extension if not exists pgcrypto with schema extensions;

-- ── OTP challenges ──────────────────────────────────────────────────────────
create table if not exists public.attend_otp (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  vendor_id   uuid not null references public.vendors(id) on delete cascade,
  code_hash   text not null,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  attempts    int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists attend_otp_email_idx on public.attend_otp(email, created_at desc);
alter table public.attend_otp enable row level security;   -- no policies: only SECURITY DEFINER fns touch it

-- ── issued sessions (12h) ───────────────────────────────────────────────────
create table if not exists public.attend_session (
  token      text primary key,
  vendor_id  uuid not null references public.vendors(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.attend_session enable row level security;

-- ── create an OTP (called by the Edge Function via service_role) ────────────
create or replace function public.attend_create_otp(p_email text, p_code text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare v public.vendors; recent int;
begin
  select * into v from public.vendors
   where email is not null and lower(email) = lower(btrim(p_email)) and status = 'approved'
   limit 1;
  if v.id is null then raise exception 'No approved vendor found with that email'; end if;

  select count(*) into recent from public.attend_otp
   where email = lower(btrim(p_email)) and created_at > now() - interval '45 seconds';
  if recent > 0 then raise exception 'A code was just sent — wait a moment before requesting another'; end if;

  update public.attend_otp set consumed_at = now()
   where email = lower(btrim(p_email)) and consumed_at is null;

  insert into public.attend_otp(email, vendor_id, code_hash, expires_at)
   values (lower(btrim(p_email)), v.id, crypt(p_code, gen_salt('bf')), now() + interval '10 minutes');
end $$;

-- ── verify an OTP → issue a session token ───────────────────────────────────
create or replace function public.attend_verify_otp(p_email text, p_code text)
returns table (token text, full_name text, trade text, pod text, checked_in boolean, last_punch_at timestamptz)
language plpgsql security definer set search_path = public, extensions
as $$
declare o public.attend_otp; v public.vendors; last public.vendor_attendance; t text;
begin
  select * into o from public.attend_otp
   where email = lower(btrim(p_email)) and consumed_at is null and expires_at > now()
   order by created_at desc limit 1;
  if o.id is null then raise exception 'No active code — request a new one'; end if;
  if o.attempts >= 5 then raise exception 'Too many attempts — request a new code'; end if;
  update public.attend_otp set attempts = attempts + 1 where id = o.id;

  if o.code_hash <> crypt(p_code, o.code_hash) then raise exception 'Incorrect code'; end if;

  update public.attend_otp set consumed_at = now() where id = o.id;
  select * into v from public.vendors where id = o.vendor_id;
  t := encode(gen_random_bytes(24), 'hex');
  insert into public.attend_session(token, vendor_id, expires_at) values (t, v.id, now() + interval '12 hours');
  select * into last from public.vendor_attendance where vendor_attendance.vendor_id = v.id order by punched_at desc limit 1;
  return query select t, v.full_name, v.trade, v.pod, coalesce(last.punch_type = 'in', false), last.punched_at;
end $$;

-- ── resume a session on page reload ─────────────────────────────────────────
create or replace function public.attend_session_info(p_token text)
returns table (full_name text, trade text, pod text, checked_in boolean, last_punch_at timestamptz)
language plpgsql security definer set search_path = public, extensions
as $$
declare s public.attend_session; v public.vendors; last public.vendor_attendance;
begin
  select * into s from public.attend_session where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Session expired — sign in again'; end if;
  select * into v from public.vendors where id = s.vendor_id;
  select * into last from public.vendor_attendance where vendor_attendance.vendor_id = v.id order by punched_at desc limit 1;
  return query select v.full_name, v.trade, v.pod, coalesce(last.punch_type = 'in', false), last.punched_at;
end $$;

-- ── replace code+phone punch with a token-based one ─────────────────────────
drop function if exists public.attend_lookup(text, text);
drop function if exists public.attend_punch(text, text, text, text, numeric, numeric, numeric);

create or replace function public.attend_punch(p_token text, p_type text, p_pid text, p_lat numeric, p_lng numeric, p_accuracy numeric)
returns public.vendor_attendance
language plpgsql security definer set search_path = public, extensions
as $$
declare s public.attend_session; v public.vendors; last public.vendor_attendance; r public.vendor_attendance;
begin
  if p_type not in ('in','out') then raise exception 'Invalid punch type'; end if;
  select * into s from public.attend_session where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Session expired — sign in again'; end if;
  select * into v from public.vendors where id = s.vendor_id;
  select * into last from public.vendor_attendance where vendor_attendance.vendor_id = v.id order by punched_at desc limit 1;
  if p_type = 'in'  and last.punch_type = 'in' then raise exception 'Already checked in — check out first'; end if;
  if p_type = 'out' and (last.id is null or last.punch_type = 'out') then raise exception 'Not checked in yet'; end if;
  insert into public.vendor_attendance(vendor_id, punch_type, pid, pod, lat, lng, accuracy, source)
   values (v.id, p_type, nullif(btrim(coalesce(p_pid,'')), ''), v.pod, p_lat, p_lng, p_accuracy, 'self')
   returning * into r;
  return r;
end $$;

revoke all on function public.attend_create_otp(text, text) from public;
grant execute on function public.attend_create_otp(text, text) to service_role;
grant execute on function public.attend_verify_otp(text, text) to anon, authenticated;
grant execute on function public.attend_session_info(text)     to anon, authenticated;
grant execute on function public.attend_punch(text, text, text, numeric, numeric, numeric) to anon, authenticated;
