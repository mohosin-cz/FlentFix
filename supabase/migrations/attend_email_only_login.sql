-- Product decision: drop OTP; vendors sign in to /attend by matching the email
-- they gave at onboarding (no code, no email delivery needed).
-- NOTE: weaker than OTP — anyone who knows a vendor's email can sign in as them.
-- Acceptable for low-stakes attendance; the portal shows bank masked to last 4.
-- The attend-request-otp Edge Function is now dormant (unused).

create or replace function public.attend_login(p_email text)
returns table (token text, full_name text, trade text, pod text, checked_in boolean, last_punch_at timestamptz)
language plpgsql security definer set search_path = public, extensions
as $$
declare v public.vendors; last public.vendor_attendance; t text;
begin
  select * into v from public.vendors
   where email is not null and lower(email) = lower(btrim(p_email)) and status = 'approved'
   limit 1;
  if v.id is null then raise exception 'No approved vendor found with that email'; end if;
  t := encode(gen_random_bytes(24), 'hex');
  insert into public.attend_session(token, vendor_id, expires_at) values (t, v.id, now() + interval '12 hours');
  select * into last from public.vendor_attendance where vendor_attendance.vendor_id = v.id order by punched_at desc limit 1;
  return query select t, v.full_name, v.trade, v.pod, coalesce(last.punch_type = 'in', false), last.punched_at;
end $$;
grant execute on function public.attend_login(text) to anon, authenticated;

-- remove now-unused OTP artifacts
drop function if exists public.attend_verify_otp(text, text);
drop function if exists public.attend_create_otp(text, text);
drop table if exists public.attend_otp;
