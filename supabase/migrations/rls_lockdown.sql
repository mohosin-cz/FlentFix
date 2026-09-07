-- Closing the anon key.
--
-- VITE_SUPABASE_ANON_KEY is not a secret. It is compiled into the JavaScript
-- every visitor downloads — you can grep it out of dist/assets/index-*.js — and
-- that is fine by design: the key says which app is calling, and row level
-- security decides what an unauthenticated caller may do with it. Twenty-four
-- tables here were created in the dashboard rather than through a migration and
-- never had RLS switched on, so for those the key was not an app identifier. It
-- was a working database login. A PATCH and a DELETE against landlord_invoices
-- with nothing but that key both returned 204.
--
-- Everything created through a file in this directory already had RLS. This
-- brings the rest in line.
--
-- The tables are in three groups, and the grouping IS the decision — it was
-- read off what the public routes actually touch, not guessed:
--
--   1. Staff only. No unauthenticated page reads them at all.
--   2. Public pages read them. anon keeps SELECT, loses everything else.
--   3. The landlord estimate flow writes them. anon keeps SELECT plus the one
--      verb /e/:token needs, and nothing more.
--
-- WHAT THIS DOES NOT FIX, so it is not mistaken for finished: the group 2 and 3
-- policies are unscoped. Somebody holding the anon key can still read every
-- estimate rather than the one whose token they were sent, and can still move
-- any estimate's status. Closing that means serving /e/:token through
-- token-scoped security-definer RPCs, exactly as /wo/:token and /vi/:token are
-- already served — a separate piece of work. What this migration ends is the
-- ability to rewrite or delete twenty of these tables from a browser console.
--
-- Storage buckets are governed by their own policies and are not touched here.
--
-- If a page breaks, the instant undo for one table is:
--   alter table public.<name> disable row level security;

-- ── 1. Staff only ───────────────────────────────────────────────────────────
-- Nothing on a public route reads these. tax_invoices lives behind
-- /tax-invoice/:id, which is a ProtectedRoute, and profiles is read by the
-- login page only after the sign-in call has returned — as an authenticated
-- user, not as anon.
do $$
declare t text;
begin
  foreach t in array array[
    'properties', 'properties_bin', 'property_journey', 'profiles',
    'internal_rate_card', 'rate_card', 'quick_notes', 'activity_feed',
    'inventory_usage', 'inventory_registry',
    'tax_invoices', 'tax_invoice_items', 'invoice_line_items'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('drop policy if exists "staff only" on public.%I', t);
    execute format(
      'create policy "staff only" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ── 2. Read by a public page ────────────────────────────────────────────────
-- The landlord estimate at /e/:token, the appliance report, the invoice share
-- link and the public rate card read these. They keep SELECT and lose the rest:
-- no public page has ever written to any of them as anon. /estimate/:id does
-- write line_item_media, but every link to it comes from a staff screen, so
-- that write continues as an authenticated one.
do $$
declare t text;
begin
  foreach t in array array[
    'inspections', 'inspection_line_items', 'line_item_media',
    'labour_rates', 'inventory_items',
    'estimate_versions', 'estimate_version_items'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon', t);
    execute format('grant select on public.%I to anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('drop policy if exists "staff manage" on public.%I', t);
    execute format(
      'create policy "staff manage" on public.%I for all to authenticated using (true) with check (true)', t);
    execute format('drop policy if exists "anyone with the link reads" on public.%I', t);
    execute format(
      'create policy "anyone with the link reads" on public.%I for select to anon using (true)', t);
  end loop;
end $$;

-- ── 3. Written by the landlord approving an estimate ────────────────────────
-- The one anon write path in the product. On /e/:token a landlord marks the
-- estimate viewed, approves lines, and raises disputes — two tables it updates,
-- two it inserts into. Each gets exactly its own verb: no DELETE anywhere, and
-- no INSERT on the tables it only updates, so an anonymous caller cannot invent
-- an estimate or delete one.
alter table public.estimates      enable row level security;
alter table public.estimate_items enable row level security;

revoke all on public.estimates      from public, anon;
revoke all on public.estimate_items from public, anon;
grant select, update on public.estimates      to anon;
grant select, update on public.estimate_items to anon;
grant select, insert, update, delete on public.estimates      to authenticated;
grant select, insert, update, delete on public.estimate_items to authenticated;
grant all on public.estimates      to service_role;
grant all on public.estimate_items to service_role;

drop policy if exists "staff manage" on public.estimates;
create policy "staff manage" on public.estimates
  for all to authenticated using (true) with check (true);
drop policy if exists "landlord reads" on public.estimates;
create policy "landlord reads" on public.estimates
  for select to anon using (true);
drop policy if exists "landlord approves" on public.estimates;
create policy "landlord approves" on public.estimates
  for update to anon using (true) with check (true);

drop policy if exists "staff manage" on public.estimate_items;
create policy "staff manage" on public.estimate_items
  for all to authenticated using (true) with check (true);
drop policy if exists "landlord reads" on public.estimate_items;
create policy "landlord reads" on public.estimate_items
  for select to anon using (true);
drop policy if exists "landlord approves" on public.estimate_items;
create policy "landlord approves" on public.estimate_items
  for update to anon using (true) with check (true);

-- Append-only for anon: a landlord adds to the record of what happened and
-- cannot edit or erase what is already in it.
alter table public.estimate_events   enable row level security;
alter table public.estimate_disputes enable row level security;

revoke all on public.estimate_events   from public, anon;
revoke all on public.estimate_disputes from public, anon;
grant select, insert on public.estimate_events   to anon;
grant select, insert on public.estimate_disputes to anon;
grant select, insert, update, delete on public.estimate_events   to authenticated;
grant select, insert, update, delete on public.estimate_disputes to authenticated;
grant all on public.estimate_events   to service_role;
grant all on public.estimate_disputes to service_role;

drop policy if exists "staff manage" on public.estimate_events;
create policy "staff manage" on public.estimate_events
  for all to authenticated using (true) with check (true);
drop policy if exists "landlord reads" on public.estimate_events;
create policy "landlord reads" on public.estimate_events
  for select to anon using (true);
drop policy if exists "landlord records" on public.estimate_events;
create policy "landlord records" on public.estimate_events
  for insert to anon with check (true);

drop policy if exists "staff manage" on public.estimate_disputes;
create policy "staff manage" on public.estimate_disputes
  for all to authenticated using (true) with check (true);
drop policy if exists "landlord reads" on public.estimate_disputes;
create policy "landlord reads" on public.estimate_disputes
  for select to anon using (true);
drop policy if exists "landlord raises" on public.estimate_disputes;
create policy "landlord raises" on public.estimate_disputes
  for insert to anon with check (true);

-- ── Check ───────────────────────────────────────────────────────────────────
-- Every table in public should now report rls_on = true. Anything still false
-- was created after this ran.
--
--   select c.relname, c.relrowsecurity as rls_on,
--          (select count(*) from pg_policies p
--            where p.tablename = c.relname and p.schemaname = 'public') as policies
--     from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relkind = 'r'
--    order by rls_on, c.relname;
