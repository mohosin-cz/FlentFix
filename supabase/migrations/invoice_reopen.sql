-- Reopening an invoice that has already gone out.
--
-- Invoices are frozen once issued, and that is deliberate: a signature is a
-- claim about specific numbers, and if the numbers can move afterwards the
-- signature means nothing. But things do need correcting — a wrong PID, a
-- payout revised after the fact — and refusing outright just means the
-- correction happens somewhere the system cannot see.
--
-- So editing is allowed at every stage, and made honest rather than silent:
-- reopening archives what was issued (and whatever signature was on it) into
-- prior_versions, bumps the revision, and mints a fresh token. The old link
-- stops working. A vendor who already signed has to sign again, because what
-- they signed no longer exists.
--
-- The freeze triggers stay exactly as they were. This is the one sanctioned
-- door through them, flagged per-transaction so nothing else can wander in.

alter table public.vendor_invoices
  add column if not exists revision       int   not null default 1,
  add column if not exists prior_versions jsonb not null default '[]'::jsonb,
  add column if not exists reopened_at    timestamptz,
  add column if not exists reopen_reason  text;

-- ── let the triggers stand aside for a sanctioned reopen ────────────────────
create or replace function public.vendor_invoices_freeze()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('app.invoice_reopen', true), '') = '1' then
    return new;
  end if;
  if old.status in ('sent','viewed','signed') then
    if new.subtotal is distinct from old.subtotal
       or new.advance_recovered is distinct from old.advance_recovered
       or new.net_payable is distinct from old.net_payable
       or new.snapshot is distinct from old.snapshot
       or new.invoice_no is distinct from old.invoice_no then
      raise exception 'This invoice has already been issued — reopen it to change the amount';
    end if;
  end if;
  if old.status = 'signed' and new.status = 'draft' then
    raise exception 'A signed invoice cannot go back to draft — reopen it instead';
  end if;
  return new;
end $$;

create or replace function public.vendor_invoice_lines_freeze()
returns trigger language plpgsql as $$
declare st text; inv uuid;
begin
  if coalesce(current_setting('app.invoice_reopen', true), '') = '1' then
    return coalesce(new, old);
  end if;
  inv := coalesce(new.invoice_id, old.invoice_id);
  select status into st from public.vendor_invoices where id = inv;
  if st in ('sent','viewed','signed') then
    raise exception 'This invoice has already been issued — reopen it to change its lines';
  end if;
  return coalesce(new, old);
end $$;

-- ── reopen ──────────────────────────────────────────────────────────────────
create or replace function public.invoice_reopen(p_invoice_id uuid, p_reason text default null)
returns jsonb
language plpgsql security invoker set search_path = public, extensions
as $$
declare inv public.vendor_invoices; archived jsonb;
begin
  select * into inv from public.vendor_invoices where id = p_invoice_id;
  if inv.id is null then raise exception 'Invoice not found'; end if;
  if inv.status = 'draft' then
    return jsonb_build_object('ok', true, 'already_draft', true, 'revision', inv.revision);
  end if;

  -- Keep what was issued. Someone signed this; deleting the evidence of what
  -- they agreed to would be the actual harm here, not the edit.
  archived := jsonb_build_object(
    'revision', inv.revision,
    'invoice_no', inv.invoice_no,
    'snapshot', inv.snapshot,
    'subtotal', inv.subtotal,
    'net_payable', inv.net_payable,
    'status', inv.status,
    'sent_at', inv.sent_at,
    'signed_at', inv.signed_at,
    'signed_name', inv.signed_name,
    'signature_png', inv.signature_png,
    'signed_ip', inv.signed_ip,
    'archived_at', now()
  );

  perform set_config('app.invoice_reopen', '1', true);

  update public.vendor_invoices
     set status = 'draft',
         revision = inv.revision + 1,
         prior_versions = inv.prior_versions || archived,
         -- a new token, so the link already in someone's hands stops resolving
         token = encode(extensions.gen_random_bytes(18), 'hex'),
         snapshot = null,
         sent_at = null, sent_to = null, send_error = null, viewed_at = null,
         signed_at = null, signed_name = null, signature_png = null,
         signed_ip = null, signed_ua = null,
         reopened_at = now(), reopen_reason = nullif(btrim(coalesce(p_reason,'')),'')
   where id = p_invoice_id;

  perform set_config('app.invoice_reopen', '0', true);

  return jsonb_build_object('ok', true, 'revision', inv.revision + 1,
                            'discarded_signature', inv.signed_at is not null);
end $$;

grant execute on function public.invoice_reopen(uuid, text) to authenticated;
revoke execute on function public.invoice_reopen(uuid, text) from anon, public;
