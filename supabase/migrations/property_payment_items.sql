-- ════════════════════════════════════════════════════════════════════════════
-- What a payment was actually made up of.
--
-- Until now a payment was one description and one number, so "12 door handles
-- at ₹450" went in as "Door handles · ₹5,400" and both the 12 and the 450 were
-- gone the moment it saved. You could not answer what a handle costs, whether
-- the second shop was dearer, or how many of anything the property has had.
--
-- A payment keeps its total — `property_payments.amount` is still the number
-- that matters and every existing figure on every page still reads it. This
-- table is the detail underneath, and it is optional: a payment with no rows
-- here behaves exactly as it did before, which is what all ~2,000 imported
-- rows do.
--
-- `amount` is stored rather than always computed from quantity × rate, because
-- a line can be a lump sum with no quantity at all ("site cleaning, ₹2,000"),
-- and because a rate of ₹33.333 × 3 should bill the ₹100 on the invoice rather
-- than ₹99.999.
--
-- The lines are allowed NOT to add up to the payment total. Discounts, round
-- figures and "take ₹200 off" are real, and a system that refuses to store the
-- invoice as it was written just gets worked around. The UI shows the
-- difference instead of hiding it.
--
-- Repo source of truth; applied via Supabase migration tooling.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.property_payment_items (
  id          uuid        primary key default gen_random_uuid(),
  payment_id  uuid        not null references public.property_payments(id) on delete cascade,
  -- the order they were written on the invoice; people read an invoice in order
  position    int         not null default 0,
  description text,
  quantity    numeric(14,3),
  unit        text,                        -- free text, like trade: a new one needs no migration
  unit_rate   numeric(14,2),
  amount      numeric(14,2) not null,
  -- Only when the payment itself is 'Both'. With it, the material/labour split
  -- of a mixed invoice is arithmetic rather than something somebody types in
  -- twice and gets wrong.
  kind        text        check (kind is null or kind in ('Material', 'Labour')),
  created_at  timestamptz not null default now()
);

create index if not exists idx_ppi_payment on public.property_payment_items(payment_id, position);

alter table public.property_payment_items enable row level security;
drop policy if exists "authenticated full access" on public.property_payment_items;
create policy "authenticated full access" on public.property_payment_items
  for all to authenticated using (true) with check (true);

-- Supabase's default privileges hand every new table to anon, and RLS then
-- returns it no rows — which is safe but is not what the rest of this family
-- does. property_payments, property_payment_bills and payment_payees all
-- refuse anon at the grant, so an unauthenticated caller cannot even confirm
-- the table is there. Matching them, rather than leaving one table in the
-- family answering a question the others decline.
revoke all on public.property_payment_items from anon;
