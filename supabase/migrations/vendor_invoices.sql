-- ════════════════════════════════════════════════════════════════════════════
-- VENDOR INVOICES — the signature stage between "reviewed" and "final".
--
-- A payroll month is reviewed, then each vendor is emailed a link to their own
-- invoice, raised BY them ON Slaash Technologies Pvt Ltd for the trade work
-- they did at one or more PIDs. They sign it; we hold the signed copy against
-- the payout line; only then is the month marked final.
--
-- Three things this file is careful about:
--
--   1. The link is tokenised per payout line, never resolved by email. Two
--      approved vendors currently share an email address, so an email-keyed
--      lookup would show one person the other's pay.
--   2. Gross is derived as total_payout + advance_recovered rather than
--      recomputed from fixed_pay × days. Nine legacy lines don't satisfy the
--      formula, and an invoice that doesn't reconcile to the money actually
--      transferred is worse than useless. Net always equals total_payout.
--   3. A sent invoice is frozen. Amounts and lines are editable only while
--      draft — enforced by trigger, not by convention — so a signature can
--      never end up attached to numbers that changed after the fact.
--
-- Vendors stay anonymous: they never get the `authenticated` role. Everything
-- they touch goes through the SECURITY DEFINER RPCs at the bottom.
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

-- ── who the invoice is billed to ────────────────────────────────────────────
-- One row, edited in Payroll → Settings. Kept in a table rather than hardcoded
-- so a change of registered address is not a code change.
create table if not exists public.payroll_billing_entity (
  id            int primary key default 1,
  legal_name    text not null default 'Slaash Technologies Pvt Ltd',
  address_line  text,
  city          text,
  state         text,
  state_code    text,
  pincode       text,
  gstin         text,
  cin           text,
  pan           text,
  email         text,
  phone         text,
  updated_at    timestamptz not null default now(),
  updated_by    text,
  constraint payroll_billing_entity_one_row check (id = 1)
);
insert into public.payroll_billing_entity (id) values (1) on conflict (id) do nothing;

-- ── the invoice ─────────────────────────────────────────────────────────────
create table if not exists public.vendor_invoices (
  id                uuid primary key default gen_random_uuid(),

  payout_id         uuid not null unique references public.vendor_payouts(id) on delete cascade,
  period_id         uuid not null references public.vendor_payroll_periods(id) on delete cascade,
  vendor_id         uuid references public.vendors(id) on delete set null,

  invoice_no        text not null unique,
  invoice_date      date not null default current_date,

  -- the whole security boundary: 144 bits, unguessable, one per payout line
  token             text not null unique,

  status            text not null default 'draft'
                    check (status in ('draft','sent','viewed','signed','void')),

  -- money. subtotal = what the vendor billed; net = what they are paid.
  subtotal          numeric not null default 0,
  advance_recovered numeric not null default 0,
  net_payable       numeric not null default 0,

  -- Everything needed to re-render this invoice exactly as signed, frozen at
  -- send. Without it, editing a vendor's address would silently rewrite an
  -- invoice somebody already put their name to.
  snapshot          jsonb,

  sent_to           text,
  sent_at           timestamptz,
  send_error        text,
  viewed_at         timestamptz,

  signed_at         timestamptz,
  signed_name       text,
  signature_png     text,          -- data: URL, size-capped in invoice_sign
  signed_ip         text,
  signed_ua         text,

  created_by        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists vendor_invoices_period_idx on public.vendor_invoices(period_id);
create index if not exists vendor_invoices_vendor_idx on public.vendor_invoices(vendor_id);
create index if not exists vendor_invoices_status_idx on public.vendor_invoices(status);

-- ── line items: one per PID the month's work is split across ────────────────
create table if not exists public.vendor_invoice_lines (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.vendor_invoices(id) on delete cascade,
  pid         text,
  description text,
  amount      numeric not null default 0,
  sort        int not null default 0
);
create index if not exists vendor_invoice_lines_inv_idx on public.vendor_invoice_lines(invoice_id, sort);

create or replace function public.vendor_invoices_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists trg_vendor_invoices_touch on public.vendor_invoices;
create trigger trg_vendor_invoices_touch before update on public.vendor_invoices
  for each row execute function public.vendor_invoices_touch();

-- ── freeze once sent ────────────────────────────────────────────────────────
-- A signature is a claim about specific numbers. If those numbers can move
-- afterwards the signature means nothing, so the database refuses rather than
-- trusting every future caller to remember.
create or replace function public.vendor_invoices_freeze()
returns trigger language plpgsql as $$
begin
  if old.status in ('sent','viewed','signed') then
    if new.subtotal is distinct from old.subtotal
       or new.advance_recovered is distinct from old.advance_recovered
       or new.net_payable is distinct from old.net_payable
       or new.snapshot is distinct from old.snapshot
       or new.invoice_no is distinct from old.invoice_no then
      raise exception 'This invoice has already been sent — void it and raise a new one to change the amount';
    end if;
  end if;
  if old.status = 'signed' and new.status = 'draft' then
    raise exception 'A signed invoice cannot go back to draft — void it instead';
  end if;
  return new;
end $$;
drop trigger if exists trg_vendor_invoices_freeze on public.vendor_invoices;
create trigger trg_vendor_invoices_freeze before update on public.vendor_invoices
  for each row execute function public.vendor_invoices_freeze();

create or replace function public.vendor_invoice_lines_freeze()
returns trigger language plpgsql as $$
declare st text; inv uuid;
begin
  inv := coalesce(new.invoice_id, old.invoice_id);
  select status into st from public.vendor_invoices where id = inv;
  if st in ('sent','viewed','signed') then
    raise exception 'This invoice has already been sent — its line items are locked';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists trg_vendor_invoice_lines_freeze on public.vendor_invoice_lines;
create trigger trg_vendor_invoice_lines_freeze
  before insert or update or delete on public.vendor_invoice_lines
  for each row execute function public.vendor_invoice_lines_freeze();

-- ── access ──────────────────────────────────────────────────────────────────
-- Staff manage directly. Vendors are anon and go only through the RPCs below,
-- so there is deliberately no anon policy — and the grant is revoked outright,
-- because `token` sitting in a readable table would hand out every link.
alter table public.payroll_billing_entity enable row level security;
alter table public.vendor_invoices        enable row level security;
alter table public.vendor_invoice_lines   enable row level security;

do $$
declare t text;
begin
  foreach t in array array['payroll_billing_entity','vendor_invoices','vendor_invoice_lines'] loop
    execute format('revoke all on public.%I from public', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists "staff manage %1$s" on public.%1$s', t);
    execute format('create policy "staff manage %1$s" on public.%1$s for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ── helpers ─────────────────────────────────────────────────────────────────
-- Indian financial year, April–March: 2026-07-01 → '26-27', 2026-01-01 → '25-26'.
create or replace function public.fin_year_label(d date)
returns text language sql immutable as $$
  select case when extract(month from d) >= 4
    then to_char(d, 'YY') || '-' || to_char(d + interval '1 year', 'YY')
    else to_char(d - interval '1 year', 'YY') || '-' || to_char(d, 'YY')
  end
$$;

-- ── generate drafts for a period ────────────────────────────────────────────
-- One invoice per payout line that hasn't got one. Idempotent: re-running adds
-- only what is missing and never touches an invoice already raised.
--
-- Each starts as a single un-assigned line for the full gross. Staff then split
-- it across PIDs; the split has to add back up before it can be sent.
create or replace function public.invoice_generate_for_period(p_period_id uuid)
returns int
language plpgsql security invoker set search_path = public, extensions
as $$
declare
  actor text := coalesce(current_setting('request.jwt.claims', true)::json->>'email', 'staff');
  per public.vendor_payroll_periods;
  rec record;
  v_gross numeric; v_no text; v_id uuid; n int := 0;
begin
  select * into per from public.vendor_payroll_periods where id = p_period_id;
  if per.id is null then raise exception 'Period not found'; end if;

  for rec in
    select p.*, v.vendor_code, v.trade
      from public.vendor_payouts p
      left join public.vendors v on v.id = p.vendor_id
     where p.period_id = p_period_id
       and not exists (select 1 from public.vendor_invoices i where i.payout_id = p.id)
  loop
    -- Derived from what is actually paid, not recomputed from rate × days:
    -- net must equal total_payout or the invoice contradicts the bank transfer.
    v_gross := coalesce(rec.total_payout, 0) + coalesce(rec.advance_recovered, 0);

    v_no := coalesce(nullif(btrim(rec.vendor_code), ''), 'NA')
            || '/' || public.fin_year_label(per.period_month)
            || '/' || to_char(per.period_month, 'MM');
    -- vendor_code is not guaranteed unique across rows; fall back to a suffix
    if exists (select 1 from public.vendor_invoices where invoice_no = v_no) then
      v_no := v_no || '-' || substr(replace(rec.id::text, '-', ''), 1, 4);
    end if;

    insert into public.vendor_invoices(
      payout_id, period_id, vendor_id, invoice_no, invoice_date, token,
      subtotal, advance_recovered, net_payable, created_by
    ) values (
      rec.id, p_period_id, rec.vendor_id, v_no,
      (per.period_month + (coalesce(per.days_in_month, 30) - 1))::date,
      encode(extensions.gen_random_bytes(18), 'hex'),
      v_gross, coalesce(rec.advance_recovered, 0), coalesce(rec.total_payout, 0), actor
    ) returning id into v_id;

    insert into public.vendor_invoice_lines(invoice_id, pid, description, amount, sort)
    values (v_id, null,
            coalesce(nullif(btrim(rec.trade), ''), 'Services') || ' — '
              || to_char(per.period_month, 'Mon YYYY'),
            v_gross, 0);

    n := n + 1;
  end loop;
  return n;
end $$;

-- ── send: freeze the snapshot, hand back what the mailer needs ──────────────
-- Called by the Edge Function (service role) just before the email goes out.
-- The snapshot is taken here, so what is emailed and what is signed are the
-- same document even if the vendor record or the billing entity changes later.
create or replace function public.invoice_prepare_send(p_invoice_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare inv public.vendor_invoices; v public.vendors; ent public.payroll_billing_entity;
        per public.vendor_payroll_periods; snap jsonb; v_lines jsonb; v_sum numeric;
begin
  select * into inv from public.vendor_invoices where id = p_invoice_id;
  if inv.id is null then raise exception 'Invoice not found'; end if;
  if inv.status = 'void' then raise exception 'This invoice has been voided'; end if;
  if inv.status = 'signed' then raise exception 'This invoice is already signed'; end if;

  select * into v   from public.vendors where id = inv.vendor_id;
  select * into ent from public.payroll_billing_entity where id = 1;
  select * into per from public.vendor_payroll_periods where id = inv.period_id;

  if v.email is null or btrim(v.email) = '' then
    raise exception 'No email address on this vendor';
  end if;

  select coalesce(sum(amount), 0) into v_sum from public.vendor_invoice_lines where invoice_id = inv.id;
  if round(v_sum, 2) <> round(inv.subtotal, 2) then
    raise exception 'The PID split adds up to % but the invoice total is % — fix the split first', v_sum, inv.subtotal;
  end if;
  if exists (select 1 from public.vendor_invoice_lines where invoice_id = inv.id and coalesce(btrim(pid), '') = '') then
    raise exception 'Every line needs a PID before this can be sent';
  end if;

  select jsonb_agg(jsonb_build_object('pid', pid, 'description', description, 'amount', amount) order by sort)
    into v_lines from public.vendor_invoice_lines where invoice_id = inv.id;

  snap := jsonb_build_object(
    'invoice_no', inv.invoice_no,
    'invoice_date', inv.invoice_date,
    'period_month', per.period_month,
    'from', jsonb_build_object(
      'name', v.full_name, 'code', v.vendor_code, 'trade', v.trade,
      'address', v.address_line, 'city', v.city, 'pincode', v.pincode,
      -- vendor PAN deliberately not carried: not required on these invoices,
      -- and a tax ID that isn't printed has no business in the snapshot
      'phone', v.phone, 'email', v.email,
      -- last 4 only: this renders on a URL that will get forwarded
      'bank_last4', right(coalesce(v.bank_account_no, ''), 4),
      'upi', v.upi_id),
    'bill_to', to_jsonb(ent) - 'id' - 'updated_at' - 'updated_by',
    'lines', coalesce(v_lines, '[]'::jsonb),
    'subtotal', inv.subtotal,
    'advance_recovered', inv.advance_recovered,
    'net_payable', inv.net_payable
  );

  update public.vendor_invoices
     set snapshot = snap, status = 'sent', sent_to = lower(btrim(v.email)),
         sent_at = now(), send_error = null
   where id = inv.id;

  return jsonb_build_object('token', inv.token, 'email', lower(btrim(v.email)),
                            'name', v.full_name, 'invoice_no', inv.invoice_no,
                            'net_payable', inv.net_payable, 'snapshot', snap);
end $$;

-- ── vendor side (anonymous, token only) ─────────────────────────────────────
-- A draft is not fetchable and a bad token is indistinguishable from a draft:
-- both raise the same thing, so this never confirms a token once existed.
create or replace function public.invoice_fetch(p_token text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare inv public.vendor_invoices;
begin
  select * into inv from public.vendor_invoices
   where token = btrim(p_token) and status in ('sent','viewed','signed');
  if inv.id is null then raise exception 'This invoice link is not valid'; end if;

  if inv.status = 'sent' then
    update public.vendor_invoices set status = 'viewed', viewed_at = now() where id = inv.id;
  end if;

  return jsonb_build_object(
    'status', case when inv.status = 'signed' then 'signed' else 'open' end,
    'invoice', inv.snapshot,
    'signed_at', inv.signed_at,
    'signed_name', inv.signed_name,
    'signature_png', case when inv.status = 'signed' then inv.signature_png else null end
  );
end $$;

create or replace function public.invoice_sign(
  p_token text, p_name text, p_signature text, p_ua text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare inv public.vendor_invoices;
begin
  select * into inv from public.vendor_invoices
   where token = btrim(p_token) and status in ('sent','viewed','signed');
  if inv.id is null then raise exception 'This invoice link is not valid'; end if;
  if inv.status = 'signed' then raise exception 'This invoice has already been signed'; end if;

  if coalesce(btrim(p_name), '') = '' then raise exception 'Please enter your name'; end if;
  if p_signature is null or p_signature !~ '^data:image/png;base64,' then
    raise exception 'Please draw your signature';
  end if;
  -- a drawn signature is a few KB; anything near this is not a signature
  if length(p_signature) > 400000 then raise exception 'That signature image is too large'; end if;

  update public.vendor_invoices
     set status = 'signed', signed_at = now(),
         signed_name = btrim(p_name), signature_png = p_signature,
         signed_ip = nullif(current_setting('request.headers', true)::json->>'x-forwarded-for', ''),
         signed_ua = left(coalesce(p_ua, ''), 400)
   where id = inv.id;

  return jsonb_build_object('ok', true, 'signed_at', now());
end $$;

grant execute on function public.fin_year_label(date)                       to authenticated;
grant execute on function public.invoice_generate_for_period(uuid)          to authenticated;
grant execute on function public.invoice_prepare_send(uuid)                 to service_role;
grant execute on function public.invoice_fetch(text)                        to anon, authenticated;
grant execute on function public.invoice_sign(text, text, text, text)       to anon, authenticated;

-- invoice_prepare_send is service-role only on purpose: it is the step that
-- freezes the document, and it should happen only as part of actually sending.
revoke execute on function public.invoice_prepare_send(uuid) from anon, authenticated, public;
