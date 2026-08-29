-- Stamp the billing entity onto invoices that were sent before it was filled in.
--
-- invoice_prepare_send freezes `bill_to` into the snapshot from
-- payroll_billing_entity at send time, so an invoice carries whatever that row
-- held the moment it went out. The entity row was completed on 28 Aug 2026
-- 19:27 UTC; the fourteen invoices issued earlier that day carry a bill_to with
-- nothing in it but the legal name, which is why they render with no company
-- address and no GSTIN — on the staff preview and on the vendor's signing link
-- alike, since both render the same frozen snapshot.
--
-- This fills that block in from the current entity. It touches only the
-- bill_to key: lines, amounts, invoice numbers, the vendor's own details and
-- any signature are left exactly as they were. Three of the fourteen are
-- already signed and are included deliberately — an invoice without the
-- biller's GSTIN and registered address is not much use as a tax document, and
-- what those vendors agreed to (the work, and the amount) is untouched.
--
-- Idempotent: rows whose bill_to already has an address are not matched.

update public.vendor_invoices vi
   set snapshot = jsonb_set(
         vi.snapshot,
         '{bill_to}',
         (select to_jsonb(e) - 'id' - 'updated_at' - 'updated_by'
            from public.payroll_billing_entity e
           where e.id = 1))
 where vi.snapshot is not null
   and vi.snapshot->'bill_to'->>'address_line' is null;

-- Check: every issued invoice should now carry the address and GSTIN.
select status,
       count(*)                                                                as invoices,
       count(*) filter (where snapshot->'bill_to'->>'address_line' is null)    as still_missing_address,
       count(*) filter (where snapshot->'bill_to'->>'gstin' is null)           as still_missing_gstin
  from public.vendor_invoices
 where snapshot is not null
 group by status
 order by status;
