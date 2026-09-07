-- landlord_invoice_items: the lines of a landlord invoice.
--
-- The page at /invoice/:inspectionId has been reading and writing this table
-- since it was built, but the table was never created — the inserts came back
-- as PGRST205 ("could not find the table") and the code discarded the error, so
-- every invoice has been saving as a header with no lines and a zero total. The
-- one row in landlord_invoices, INV-2026-0001, is exactly that. This creates
-- what the page has always assumed.
--
-- Columns are the ones LandlordInvoice.jsx already sanitises against, plus
-- wo_item_id.
--
-- On wo_item_id: an invoice line pulled from a work order remembers which item
-- it came from, so pulling again after more work is verified adds only what is
-- new instead of duplicating what is already billed. It is nullable because a
-- line typed by hand or taken from the rate card came from no work order, and
-- ON DELETE SET NULL because deleting a work order must not delete a line off
-- an invoice that has already gone to a landlord — the billing record outlives
-- the job record.
--
-- Prices are per unit; amount is qty × unit_price and is computed in the
-- reader, never stored, so a line can never disagree with its own arithmetic.

create table if not exists public.landlord_invoice_items (
  id           uuid primary key default gen_random_uuid(),

  invoice_id   uuid not null references public.landlord_invoices(id) on delete cascade,

  sl_no        int  not null default 1,
  description  text not null default '',
  category     text not null default '',       -- trade, mostly: Carpenter, Plumber…
  qty          numeric not null default 1,
  unit         text not null default 'job',
  unit_price   numeric not null default 0,

  -- Where this line came from, when it came from verified work.
  wo_item_id   uuid references public.work_order_items(id) on delete set null,

  created_at   timestamptz not null default now()
);

create index if not exists landlord_invoice_items_invoice_idx
  on public.landlord_invoice_items (invoice_id, sl_no);

-- One work order item bills once per invoice. The pull dedupes in the client
-- too, but two staff members on the same invoice are what a constraint is for.
create unique index if not exists landlord_invoice_items_wo_item_key
  on public.landlord_invoice_items (invoice_id, wo_item_id)
  where wo_item_id is not null;

-- ── Access ───────────────────────────────────────────────────────────────────
-- Staff do everything. anon reads, because /invoice/:inspectionId is a public
-- route and landlord_invoices is already anon-readable — a document whose
-- header renders for a reader but whose lines silently vanish is worse than
-- either answer. anon gets no write: the page creates invoices and lines on
-- first open, and only a logged-in staff member should be able to do that.
--
-- Worth revisiting: anon can currently select every landlord invoice in the
-- table, names and phone numbers included. The vendor flows solved the same
-- problem with a token-scoped security-definer RPC rather than a blanket grant,
-- and this pair should end up there too.
alter table public.landlord_invoice_items enable row level security;

revoke all on public.landlord_invoice_items from public;
revoke all on public.landlord_invoice_items from anon;
grant select on public.landlord_invoice_items to anon;
grant select, insert, update, delete on public.landlord_invoice_items to authenticated;

drop policy if exists "staff manage landlord invoice items" on public.landlord_invoice_items;
create policy "staff manage landlord invoice items" on public.landlord_invoice_items
  for all to authenticated using (true) with check (true);

drop policy if exists "anyone with the link reads landlord invoice items" on public.landlord_invoice_items;
create policy "anyone with the link reads landlord invoice items" on public.landlord_invoice_items
  for select to anon using (true);

-- ── One save, one transaction ────────────────────────────────────────────────
-- The page rewrote an invoice by deleting every line and inserting the list
-- again. Two statements and no transaction: anything that failed in between —
-- a policy, a dropped connection, one bad row — left the invoice with no lines
-- at all and the work only still on screen. The header was a third statement,
-- so a half-failed save could also leave totals describing lines that were no
-- longer there.
--
-- Totals are computed here from the lines rather than taken from the caller,
-- so a stored total cannot disagree with what the invoice prints.
--
-- security invoker on purpose: this is a convenience for one round trip, not a
-- way around the policies above.
create or replace function public.landlord_invoice_save(
  p_invoice_id       uuid,
  p_landlord_name    text,
  p_property_address text,
  p_notes            text,
  p_tax_rate         numeric,
  p_status           text,
  p_items            jsonb
)
returns setof public.landlord_invoice_items
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_subtotal numeric;
  v_tax      numeric;
begin
  select coalesce(round(sum(
           coalesce(nullif(i->>'qty', '')::numeric, 1) *
           coalesce(nullif(i->>'unit_price', '')::numeric, 0)
         )), 0)
    into v_subtotal
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i;

  v_tax := round(v_subtotal * coalesce(p_tax_rate, 0) / 100);

  update public.landlord_invoices
     set landlord_name    = p_landlord_name,
         property_address = p_property_address,
         notes            = p_notes,
         tax_rate         = coalesce(p_tax_rate, 0),
         status           = coalesce(p_status, 'draft'),
         subtotal         = v_subtotal,
         tax_amount       = v_tax,
         total            = v_subtotal + v_tax,
         updated_at       = now()
   where id = p_invoice_id;

  if not found then
    raise exception 'No invoice with id %', p_invoice_id;
  end if;

  delete from public.landlord_invoice_items where invoice_id = p_invoice_id;

  -- Row order is the order the page sent, which is the order on screen.
  return query
  insert into public.landlord_invoice_items
    (invoice_id, sl_no, description, category, qty, unit, unit_price, wo_item_id)
  select p_invoice_id,
         t.ord::int,
         coalesce(t.i->>'description', ''),
         coalesce(t.i->>'category', ''),
         coalesce(nullif(t.i->>'qty', '')::numeric, 1),
         coalesce(nullif(t.i->>'unit', ''), 'job'),
         coalesce(nullif(t.i->>'unit_price', '')::numeric, 0),
         nullif(t.i->>'wo_item_id', '')::uuid
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(i, ord)
  returning *;
end $$;

revoke all on function public.landlord_invoice_save(uuid, text, text, text, numeric, text, jsonb) from public;
grant execute on function public.landlord_invoice_save(uuid, text, text, text, numeric, text, jsonb) to authenticated;

-- Applied to the project on 2026-09-08. Verified by saving two lines, reading
-- back sl_no order and totals (2 × 750 + 1000 = 2500, +18% = 2950), then
-- saving a single line over the top and getting one row and 354 — all inside a
-- transaction that was rolled back.
--
-- Sanity check:
--   select count(*) from public.landlord_invoice_items;
