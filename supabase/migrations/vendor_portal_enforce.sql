-- Make the portal password compulsory.
--
-- RUN THIS LAST. Until a vendor has a password they cannot sign in at all, and
-- these are people who punch in every morning — so issue passwords to everyone
-- first (Onroll → "Issue for all"), share them, and only then close the door.
--
-- Splitting this off from vendor_portal_credentials.sql is the whole point:
-- adding the store is harmless and can happen today; taking email-only away is
-- a decision with a queue of people standing behind it.

-- ── the password is now required ────────────────────────────────────────────
create or replace function public.attend_login(p_email text, p_password text default null)
returns table (token text, full_name text, trade text, pod text,
               checked_in boolean, last_punch_at timestamptz, needs_password boolean)
language plpgsql security definer set search_path = public, extensions
as $$
declare v public.vendors; last public.vendor_attendance; t text; recent int; n_match int;
begin
  select count(*) into recent from public.attend_login_attempts
   where email = lower(btrim(p_email)) and not ok and at > now() - interval '15 minutes';
  if recent >= 5 then
    raise exception 'Too many attempts — wait fifteen minutes and try again';
  end if;

  if p_password is null or btrim(p_password) = '' then
    insert into public.attend_login_attempts(email, ok) values (lower(btrim(p_email)), false);
    raise exception 'Enter your password — ask the office if you do not have one';
  end if;

  select count(*) into n_match from public.vendors
   where email is not null and lower(email) = lower(btrim(p_email)) and status = 'approved';

  -- The password is also what tells two people on one address apart: of the
  -- vendors on this email, exactly the one whose hash matches.
  select * into v from public.vendors
   where email is not null and lower(email) = lower(btrim(p_email))
     and status = 'approved' and portal_password_hash is not null
     and portal_password_hash = extensions.crypt(btrim(p_password), portal_password_hash)
   limit 1;

  if v.id is null then
    insert into public.attend_login_attempts(email, ok) values (lower(btrim(p_email)), false);
    -- Not "no such email": that would confirm which addresses are on the roster
    -- to anyone poking at a public form.
    raise exception 'Email or password not recognised';
  end if;

  insert into public.attend_login_attempts(email, ok) values (lower(btrim(p_email)), true);
  update public.vendors set portal_last_login_at = now() where id = v.id;

  t := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.attend_session(token, vendor_id, expires_at)
  values (t, v.id, now() + interval '12 hours');

  select * into last from public.vendor_attendance
   where vendor_attendance.vendor_id = v.id order by punched_at desc limit 1;

  return query select t, v.full_name, v.trade, v.pod,
                      coalesce(last.punch_type = 'in', false), last.punched_at, true;
end $$;

grant execute on function public.attend_login(text, text) to anon, authenticated;

-- The single-argument form is what let email-only sign-in through. Now that a
-- password is required, leaving it callable would leave the old door open.
drop function if exists public.attend_login(text);
