-- A line can now come from either side of the job.
--
-- wo_item_id says "a vendor did this and staff signed it off". estimate_item_id
-- says "the landlord approved this and it has a price". They are separate
-- columns rather than one polymorphic reference because they answer different
-- questions — and because a job pulled from both sources is the same work
-- counted twice, which the pull dedupes on the inspection row they share.
--
-- Both nullable: a line typed by hand or taken from the rate card came from
-- neither. ON DELETE SET NULL for the same reason wo_item_id has it — a billing
-- record outlives the job record it was drawn from.
--
-- Applied to the project on 2026-09-08.
alter table public.landlord_invoice_items
  add column if not exists estimate_item_id uuid
    references public.estimate_items(id) on delete set null;

create unique index if not exists landlord_invoice_items_estimate_item_key
  on public.landlord_invoice_items (invoice_id, estimate_item_id)
  where estimate_item_id is not null;

-- The save rewrites every line in one transaction, so it has to carry the new
-- column through or a re-pull would bill an approved estimate item twice. Body
-- is otherwise unchanged from landlord_invoice_items.sql.
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

  return query
  insert into public.landlord_invoice_items
    (invoice_id, sl_no, description, category, qty, unit, unit_price, wo_item_id, estimate_item_id)
  select p_invoice_id,
         t.ord::int,
         coalesce(t.i->>'description', ''),
         coalesce(t.i->>'category', ''),
         coalesce(nullif(t.i->>'qty', '')::numeric, 1),
         coalesce(nullif(t.i->>'unit', ''), 'job'),
         coalesce(nullif(t.i->>'unit_price', '')::numeric, 0),
         nullif(t.i->>'wo_item_id', '')::uuid,
         nullif(t.i->>'estimate_item_id', '')::uuid
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(i, ord)
  returning *;
end $$;

revoke all on function public.landlord_invoice_save(uuid, text, text, text, numeric, text, jsonb) from public;
grant execute on function public.landlord_invoice_save(uuid, text, text, text, numeric, text, jsonb) to authenticated;
