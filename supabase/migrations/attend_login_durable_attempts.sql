-- Vendor portal login: record failures durably, and stop overloading the name.
--
-- Two defects, both invisible until somebody rang up unable to sign in.
--
-- 1. Every failure path inserted a row into attend_login_attempts and then
--    raised. A raise aborts the transaction, and the insert went back with it —
--    so no failed attempt was ever recorded. The fifteen-minute lockout counted
--    rows that never committed, which made the brute-force guard dead code, and
--    a vendor reporting "it will not let me in" left no trace to look at.
--    Failures are now returned as a value, so the log commits.
--
-- 2. attend_login(text) and attend_login(text, text DEFAULT NULL) both existed,
--    so calling with the email alone was ambiguous and PostgREST refused it
--    (PGRST203). That is the path the client falls back to when the password
--    function is missing, so the safety net could never have caught anything.
--    One function now, with the password optional.

drop function if exists public.attend_login(text);
drop function if exists public.attend_login(text, text);

create function public.attend_login(p_email text, p_password text default null)
returns table (
  token          text,
  full_name      text,
  trade          text,
  pod            text,
  checked_in     boolean,
  last_punch_at  timestamptz,
  needs_password boolean,
  error          text
)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v       public.vendors;
  last    public.vendor_attendance;
  t       text;
  e       text := lower(btrim(p_email));
  recent  int;
  n_match int;
  fail    text;
begin
  select count(*) into recent from public.attend_login_attempts
   where attend_login_attempts.email = e
     and not attend_login_attempts.ok
     and attend_login_attempts.at > now() - interval '15 minutes';

  if recent >= 5 then
    return query select null::text, null::text, null::text, null::text,
                        null::boolean, null::timestamptz, null::boolean,
                        'Too many attempts — wait fifteen minutes and try again'::text;
    return;
  end if;

  select count(*) into n_match from public.vendors
   where vendors.email is not null and lower(vendors.email) = e
     and vendors.status = 'approved';

  if p_password is not null and btrim(p_password) <> '' then
    select * into v from public.vendors
     where vendors.email is not null and lower(vendors.email) = e
       and vendors.status = 'approved' and vendors.portal_password_hash is not null
       and vendors.portal_password_hash = extensions.crypt(btrim(p_password), vendors.portal_password_hash)
     limit 1;
    if v.id is null then fail := 'Email or password not recognised'; end if;
  elsif n_match > 1 then
    -- Two people can share an inbox, but not a password, so the password is
    -- also what tells them apart rather than the email quietly picking one.
    fail := 'This email needs a password — ask the office for yours';
  else
    select * into v from public.vendors
     where vendors.email is not null and lower(vendors.email) = e
       and vendors.status = 'approved' and vendors.portal_password_hash is null
     limit 1;
    if v.id is null then
      fail := case when n_match = 1
                   then 'This account now needs a password — ask the office for yours'
                   else 'Email or password not recognised' end;
    end if;
  end if;

  if fail is not null then
    insert into public.attend_login_attempts(email, ok) values (e, false);
    return query select null::text, null::text, null::text, null::text,
                        null::boolean, null::timestamptz, null::boolean, fail;
    return;
  end if;

  insert into public.attend_login_attempts(email, ok) values (e, true);
  update public.vendors set portal_last_login_at = now() where vendors.id = v.id;

  t := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.attend_session(token, vendor_id, expires_at)
  values (t, v.id, now() + interval '30 days');

  select * into last from public.vendor_attendance
   where vendor_attendance.vendor_id = v.id
   order by vendor_attendance.punched_at desc limit 1;

  return query select t, v.full_name, v.trade, v.pod,
                      coalesce(last.punch_type = 'in', false), last.punched_at,
                      (v.portal_password_hash is not null), null::text;
end
$function$;

grant execute on function public.attend_login(text, text) to anon, authenticated, service_role;
