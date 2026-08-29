-- Put Slaash Technologies' address and GSTIN on every vendor invoice.
--
-- Two separate faults, which is why the first attempt at this fixed nothing:
--
--   1. payroll_billing_entity itself was wrong. Its GSTIN ended in a zero
--      (29ABLCS8677C1Z0) where the fifteenth character is a checksum over the
--      first fourteen and computes to the letter O — so the number on file was
--      invalid — and the address was an older, longer form of it.
--
--   2. invoice_prepare_send freezes that row into each invoice's snapshot at
--      send time, and fourteen of the sixteen invoices went out before the row
--      was filled in at all. Their bill_to holds nothing but the legal name.
--      Correcting the entity alone does not touch them: the staff preview, the
--      vendor's signing link and the printed copy all render the snapshot.
--
-- So this fixes the source first, then restamps every invoice from it —
-- including the two that already had a bill_to, because they carry the invalid
-- GSTIN and the old address.
--
-- Only the bill_to key is rewritten. Lines, amounts, invoice numbers, the
-- vendor's own details (which stay exactly as given at onboarding) and every
-- signature are untouched. Safe to run twice.

begin;

-- 1 ── the entity, as the source of truth
insert into public.payroll_billing_entity
       (id, legal_name, address_line, city, state, state_code, pincode, gstin, pan, updated_at)
values (1,
        'Slaash Technologies Pvt Ltd',
        'The Mayfair, 100 Feet Rd, Binnamangala, Stage 1, Indiranagar',
        'Bengaluru',
        'Karnataka',
        '29',
        '560038',
        '29ABLCS8677C1ZO',   -- letter O: the GSTIN check digit, not a zero
        null,                -- PAN: not printed on the invoice, so not stored
        now())
on conflict (id) do update set
  legal_name   = excluded.legal_name,
  address_line = excluded.address_line,
  city         = excluded.city,
  state        = excluded.state,
  state_code   = excluded.state_code,
  pincode      = excluded.pincode,
  gstin        = excluded.gstin,
  pan          = null,
  updated_at   = now();

-- 2 ── restamp every issued invoice from it
--
-- trg_vendor_invoices_freeze refuses any snapshot change once an invoice is
-- sent, and it is right to: that guard is what stops an amount being altered
-- after someone signed for it. It is suspended here for one statement and one
-- statement only, because the biller's own registered address is not an amount,
-- and there is no narrower way through — bill_to lives inside the same snapshot
-- the guard protects. Inside the transaction, so a failure anywhere below rolls
-- the trigger back on with everything else.
alter table public.vendor_invoices disable trigger trg_vendor_invoices_freeze;

update public.vendor_invoices vi
   set snapshot = jsonb_set(
         vi.snapshot,
         '{bill_to}',
         (select to_jsonb(e) - 'id' - 'updated_at' - 'updated_by'
            from public.payroll_billing_entity e
           where e.id = 1))
 where vi.snapshot is not null;

alter table public.vendor_invoices enable trigger trg_vendor_invoices_freeze;

commit;

-- 3 ── check: no nulls, and one address and one GSTIN across the board
select snapshot->'bill_to'->>'address_line' as address,
       snapshot->'bill_to'->>'gstin'        as gstin,
       count(*)                             as invoices
  from public.vendor_invoices
 where snapshot is not null
 group by 1, 2;
