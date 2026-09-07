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

-- Sanity check after running:
--   select count(*) from public.landlord_invoice_items;
