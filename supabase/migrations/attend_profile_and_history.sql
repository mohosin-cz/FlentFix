-- Vendor self-service portal: read own profile + attendance history via the
-- session token issued at OTP verify (bank account masked to last 4).
-- Applied to the project via the Supabase migration tooling; repo source of truth.

create or replace function public.attend_profile(p_token text)
returns table (
  full_name text, trade text, pod text, vendor_code text, status text,
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
    v.full_name, v.trade, v.pod, v.vendor_code, v.status::text,
    v.phone, v.alt_phone, v.email,
    v.address_line, v.city, v.pincode, v.date_of_joining,
    v.aadhaar_last4, v.pan_number,
    v.bank_account_name, right(v.bank_account_no, 4), v.bank_ifsc, v.upi_id,
    v.dl_number, v.dl_expiry, v.submitted_at;
end $$;

create or replace function public.attend_history(p_token text)
returns table (punched_at timestamptz, punch_type text, pid text)
language plpgsql security definer set search_path = public, extensions
as $$
declare s public.attend_session;
begin
  select * into s from public.attend_session where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Session expired — sign in again'; end if;
  return query select a.punched_at, a.punch_type, a.pid
    from public.vendor_attendance a
    where a.vendor_id = s.vendor_id
    order by a.punched_at desc limit 60;
end $$;

grant execute on function public.attend_profile(text) to anon, authenticated;
grant execute on function public.attend_history(text) to anon, authenticated;
