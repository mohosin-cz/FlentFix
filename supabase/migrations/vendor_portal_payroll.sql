-- ════════════════════════════════════════════════════════════════════════════
-- VENDOR PORTAL — passwords, and payroll under the vendor's own profile.
--
-- Two things at once, because they depend on each other.
--
-- 1. A password per vendor. Sign-in was email only, and `limit 1` with no
--    ordering, so an address on two vendor records resolved to whichever row
--    came back first — one of those two people could not sign in as themselves
--    at all, and the other's attendance was open to whoever held the inbox.
--    A password fixes that as a side effect rather than papering over it: two
--    people may share an address, but the pair (email, password) still lands on
--    exactly one vendor. Nobody has to renumber their email for this to be safe.
--
-- 2. Payroll in the portal. The vendor signs their invoice where they already
--    log in every day, so there is no link to send, nothing to forward and
--    nothing to intercept. Past months stay there to look at, with a receipt
--    once the money has actually gone out.
--
-- Vendors remain anonymous throughout — no `authenticated` role, no table
-- grants. Everything below is SECURITY DEFINER keyed on the attend_session
-- token, which is issued only by a successful login.
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

alter table public.vendors
  add column if not exists portal_password_hash   text,
  add column if not exists portal_password_set_at timestamptz,
  add column if not exists portal_last_login_at   timestamptz;

-- Failed attempts, so a shared-inbox guess cannot be brute-forced quietly.
create table if not exists public.attend_login_attempts (
  id         bigserial primary key,
  email      text not null,
  ok         boolean not null,
  at         timestamptz not null default now()
);
create index if not exists attend_login_attempts_idx on public.attend_login_attempts(email, at desc);
alter table public.attend_login_attempts enable row level security;
revoke all on public.attend_login_attempts from public, anon;

-- ── staff: mint a password ──────────────────────────────────────────────────
-- Returned once, in the clear, and never again — only the hash is kept. Staff
-- copy it and pass it to that vendor. A lost password is reset, not recovered,
-- which is the only honest thing a hash can offer.
--
-- The alphabet leaves out O/0/I/l/1: this gets read down a phone line, and a
-- character nobody can dictate unambiguously is a support call waiting.
create or replace function public.vendor_generate_portal_password(p_vendor_id uuid)
returns text
language plpgsql security definer set search_path = public, extensions
as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  pw text := '';
  i int;
begin
  if not exists (select 1 from public.vendors where id = p_vendor_id) then
    raise exception 'Vendor not found';
  end if;

  for i in 1..8 loop
    pw := pw || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    if i = 4 then pw := pw || '-'; end if;
  end loop;

  update public.vendors
     set portal_password_hash = extensions.crypt(pw, extensions.gen_salt('bf', 10)),
         portal_password_set_at = now()
   where id = p_vendor_id;

  return pw;
end $$;

revoke execute on function public.vendor_generate_portal_password(uuid) from anon, public;
grant  execute on function public.vendor_generate_portal_password(uuid) to authenticated;

-- ── sign in ─────────────────────────────────────────────────────────────────
-- Password required once one is set, and email-only still accepted until then.
-- Seventeen people punch in on this every day; making them all wait for a
-- password to reach them by hand would stop attendance dead. Staff can see who
-- is still without one, and the moment a vendor has a password their account
-- stops accepting the email alone.
create or replace function public.attend_login(p_email text, p_password text default null)
returns table (token text, full_name text, trade text, pod text,
               checked_in boolean, last_punch_at timestamptz, needs_password boolean)
language plpgsql security definer set search_path = public, extensions
as $$
declare v public.vendors; last public.vendor_attendance; t text; recent int; n_match int;
begin
  -- five wrong tries in fifteen minutes and this address rests
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
    -- No password given: allowed only while this vendor has none set. An email
    -- on two records is refused here rather than guessed at.
    if n_match > 1 then
      insert into public.attend_login_attempts(email, ok) values (lower(btrim(p_email)), false);
      raise exception 'This email needs a password — ask the office for yours';
    end if;
    select * into v from public.vendors
     where email is not null and lower(email) = lower(btrim(p_email))
       and status = 'approved' and portal_password_hash is null
     limit 1;
    -- A password exists but was not supplied: say so plainly, since it is not
    -- a wrong-credentials case and the vendor can act on it.
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
  values (t, v.id, now() + interval '12 hours');

  select * into last from public.vendor_attendance
   where vendor_attendance.vendor_id = v.id order by punched_at desc limit 1;

  return query select t, v.full_name, v.trade, v.pod,
                      coalesce(last.punch_type = 'in', false), last.punched_at,
                      (v.portal_password_hash is not null);
end $$;

grant execute on function public.attend_login(text, text) to anon, authenticated;

-- ── the vendor's own payroll ────────────────────────────────────────────────
-- One row per month they were paid for: what they earned, whether an invoice
-- is waiting to be signed, and — once the month is closed and a reference
-- recorded — the receipt details.
--
-- Deliberately narrow. No other vendor, no rates, no cost centre, and only the
-- last four of their own account number, because this renders on a phone that
-- gets handed around.
create or replace function public.attend_payroll(p_token text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare v uuid; out jsonb;
begin
  select s.vendor_id into v from public.attend_session s
   where s.token = p_token and s.expires_at > now();
  if v is null then raise exception 'Session expired — sign in again'; end if;

  select coalesce(jsonb_agg(row order by period_month desc), '[]'::jsonb) into out
  from (
    select
      pp.period_month,
      jsonb_build_object(
        'period_month',   pp.period_month,
        'period_status',  pp.status,
        'paid',           (pp.status in ('paid','locked') or pp.locked_at is not null),
        'days_worked',    p.days_worked,
        'ot_days',        p.ot_days,
        'fixed_pay',      p.fixed_pay,
        'allowance',      p.allowance,
        'ot_amount',      p.ot_amount,
        'advance_recovered', p.advance_recovered,
        'total_payout',   p.total_payout,
        'utr',            p.utr,
        'invoice', case when i.id is null then null else jsonb_build_object(
          'id',          i.id,
          'invoice_no',  i.invoice_no,
          'status',      i.status,
          'net_payable', i.net_payable,
          'signed_at',   i.signed_at,
          'signed_name', i.signed_name,
          'signable',    (i.status in ('sent','viewed')),
          'snapshot',    case when i.status in ('sent','viewed','signed') then i.snapshot else null end,
          'signature_png', case when i.status = 'signed' then i.signature_png else null end
        ) end
      ) as row
    from public.vendor_payouts p
    join public.vendor_payroll_periods pp on pp.id = p.period_id
    left join public.vendor_invoices i on i.payout_id = p.id
   where p.vendor_id = v
  ) t;

  return out;
end $$;

grant execute on function public.attend_payroll(text) to anon, authenticated;

-- ── sign from inside the portal ─────────────────────────────────────────────
-- Same effect as signing from an emailed link, but the session proves who is
-- signing rather than possession of a token — so a forwarded link is not a way
-- in, and the ownership check is explicit.
create or replace function public.attend_invoice_sign(
  p_token text, p_invoice_id uuid, p_name text, p_signature text, p_ua text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare v uuid; inv public.vendor_invoices;
begin
  select s.vendor_id into v from public.attend_session s
   where s.token = p_token and s.expires_at > now();
  if v is null then raise exception 'Session expired — sign in again'; end if;

  select * into inv from public.vendor_invoices where id = p_invoice_id and vendor_id = v;
  if inv.id is null then raise exception 'Invoice not found'; end if;
  if inv.status = 'signed' then raise exception 'You have already signed this one'; end if;
  if inv.status not in ('sent','viewed') then
    raise exception 'This invoice is not ready to sign yet';
  end if;

  if coalesce(btrim(p_name), '') = '' then raise exception 'Please enter your name'; end if;
  if p_signature is null or p_signature !~ '^data:image/png;base64,' then
    raise exception 'Please draw your signature';
  end if;
  if length(p_signature) > 400000 then raise exception 'That signature image is too large'; end if;

  update public.vendor_invoices
     set status = 'signed', signed_at = now(),
         signed_name = btrim(p_name), signature_png = p_signature,
         signed_ip = nullif(current_setting('request.headers', true)::json->>'x-forwarded-for', ''),
         signed_ua = left(coalesce(p_ua, ''), 400)
   where id = inv.id;

  return jsonb_build_object('ok', true, 'signed_at', now());
end $$;

grant execute on function public.attend_invoice_sign(text, uuid, text, text, text) to anon, authenticated;
