-- Vendors were being signed out every day, and it was not the browser's doing.
--
-- The token is kept in localStorage and survives a restart perfectly well. What
-- did not survive was the row behind it: every attend_session was issued with a
-- flat twelve-hour expiry, so somebody who signed in at ten in the morning was
-- expired by ten at night and typing their email again before their first punch
-- the next day. Of the 158 sessions ever issued, one was still valid.
--
-- Two changes, and the second is the one that matters.
--
-- The window becomes thirty days instead of twelve hours. On its own that would
-- only move the problem a month out — the sign-in would be rarer and would
-- arrive with no warning on some random morning.
--
-- So the window also SLIDES. attend_session_info is what the portal calls every
-- time it opens with a stored token; it now pushes the expiry back out to
-- thirty days each time it succeeds. A vendor who opens the app to punch in is
-- renewed by the act of opening it, and never signs in again. One who stops
-- working stops renewing, and their token dies a month later on its own.
--
-- That single function is the whole of the sliding mechanism because it is the
-- one call every session passes through on the way in. The other fourteen
-- attend_* functions check the expiry and are left exactly as they are: a
-- session cannot be alive in any of them without having come through here.
--
-- What this trades: a token on a vendor's phone is now good for a month of
-- inactivity rather than half a day. Nothing else about it changes — it still
-- only reaches that vendor's own attendance, and revoking one is still
--   delete from public.attend_session where vendor_id = '<id>';
-- Worth knowing separately: changing a vendor's portal password does not end
-- sessions already issued, and that was true at twelve hours too.

-- ── Issue a month, not half a day ───────────────────────────────────────────
-- Both overloads. The password one is what the portal calls; the email-only one
-- is the fallback it drops to when the password migration has not run, and a
-- session issued through the back door should not be the short one.
create or replace function public.attend_login(p_email text)
returns table(token text, full_name text, trade text, pod text, checked_in boolean, last_punch_at timestamptz)
language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
declare v public.vendors; last public.vendor_attendance; t text;
begin
  select * into v from public.vendors
   where email is not null and lower(email) = lower(btrim(p_email)) and status = 'approved'
   limit 1;
  if v.id is null then raise exception 'No approved vendor found with that email'; end if;
  t := encode(gen_random_bytes(24), 'hex');
  insert into public.attend_session(token, vendor_id, expires_at) values (t, v.id, now() + interval '30 days');
  select * into last from public.vendor_attendance where vendor_attendance.vendor_id = v.id order by punched_at desc limit 1;
  return query select t, v.full_name, v.trade, v.pod, coalesce(last.punch_type = 'in', false), last.punched_at;
end $function$;

create or replace function public.attend_login(p_email text, p_password text default null::text)
returns table(token text, full_name text, trade text, pod text, checked_in boolean, last_punch_at timestamptz, needs_password boolean)
language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
declare v public.vendors; last public.vendor_attendance; t text; recent int; n_match int;
begin
  select count(*) into recent from public.attend_login_attempts
   where email = lower(btrim(p_email)) and not ok and at > now() - interval '15 minutes';
  if recent >= 5 then
    raise exception 'Too many attempts — wait fifteen minutes and try again';
  end if;

  select count(*) into n_match from public.vendors
   where email is not null and lower(email) = lower(btrim(p_email)) and status = 'approved';

  if p_password is not null and btrim(p_password) <> '' then
    -- The password is what disambiguates a shared address: of the vendors on
    -- this email, exactly the one whose hash matches.
    select * into v from public.vendors
     where email is not null and lower(email) = lower(btrim(p_email))
       and status = 'approved' and portal_password_hash is not null
       and portal_password_hash = extensions.crypt(btrim(p_password), portal_password_hash)
     limit 1;
  else
    if n_match > 1 then
      insert into public.attend_login_attempts(email, ok) values (lower(btrim(p_email)), false);
      raise exception 'This email needs a password — ask the office for yours';
    end if;
    select * into v from public.vendors
     where email is not null and lower(email) = lower(btrim(p_email))
       and status = 'approved' and portal_password_hash is null
     limit 1;
    if v.id is null and n_match = 1 then
      insert into public.attend_login_attempts(email, ok) values (lower(btrim(p_email)), false);
      raise exception 'This account now needs a password — ask the office for yours';
    end if;
  end if;

  if v.id is null then
    insert into public.attend_login_attempts(email, ok) values (lower(btrim(p_email)), false);
    -- Deliberately not "no such email": that would confirm which addresses are
    -- on the roster to anyone poking at a public form.
    raise exception 'Email or password not recognised';
  end if;

  insert into public.attend_login_attempts(email, ok) values (lower(btrim(p_email)), true);
  update public.vendors set portal_last_login_at = now() where id = v.id;

  t := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.attend_session(token, vendor_id, expires_at)
  values (t, v.id, now() + interval '30 days');

  select * into last from public.vendor_attendance
   where vendor_attendance.vendor_id = v.id order by punched_at desc limit 1;

  return query select t, v.full_name, v.trade, v.pod,
                      coalesce(last.punch_type = 'in', false), last.punched_at,
                      (v.portal_password_hash is not null);
end $function$;

-- ── Renew it by using it ────────────────────────────────────────────────────
-- Unchanged except for the update: the expiry is checked exactly as before, and
-- a session that has already lapsed still raises rather than being revived.
create or replace function public.attend_session_info(p_token text)
returns table(full_name text, trade text, pod text, checked_in boolean, last_punch_at timestamptz)
language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
declare s public.attend_session; v public.vendors; last public.vendor_attendance;
begin
  select * into s from public.attend_session where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Session expired — sign in again'; end if;

  -- Opening the app is the renewal. Nothing else has to change: this is the one
  -- call every returning session makes before it can do anything else.
  update public.attend_session
     set expires_at = now() + interval '30 days'
   where token = p_token;

  select * into v from public.vendors where id = s.vendor_id;
  select * into last from public.vendor_attendance where vendor_attendance.vendor_id = v.id order by punched_at desc limit 1;
  return query select v.full_name, v.trade, v.pod, coalesce(last.punch_type = 'in', false), last.punched_at;
end $function$;
