-- Estimate is live until it's marked final.
--
-- Rule from the user (2026-11-21): while the estimate is being negotiated, a
-- change on the workbench shows on the landlord's page straight away — no
-- resend. Once it's marked final nothing changes (estimate_final_lock.sql
-- already refuses edits to a final estimate's lines).
--
--   1. estimate_view reads the live lines, not the sent version's snapshot.
--      Each line carries was_total: what it cost in the version last sent, so
--      the landlord page can show a revised price as  ~~₹20,000~~ ₹15,000.
--   2. Repricing a line the landlord already approved (material, labour, qty
--      or cost type) puts it back to pending: an approval always matches the
--      price the landlord saw.
--   3. sent_total follows the live offer while the estimate is open, so
--      "₹X approved of ₹Y" compares against what the landlord is looking at.
--   4. A line approved again after a reprice notifies again (the dedupe key
--      used to be per line, so the second approval was silent).
--
-- Send still exists: the first send issues the code and the Slack card; any
-- later send saves a version for the record and resets the "was" prices.

begin;

-- ── 1. the landlord page reads live lines ──────────────────────────────────
create or replace function public.estimate_view(p_token text, p_session uuid default null, p_preview boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a     record;
  est   estimates%rowtype;
  ver   estimate_versions%rowtype;
  items jsonb;
begin
  select * into a from estimate_actor(p_token, p_session);
  select * into est from estimates where id = a.estimate_id;

  if est.current_version is not null then
    select * into ver from estimate_versions v where v.estimate_id = est.id and v.version_number = est.current_version;
  end if;

  select coalesce(jsonb_agg(to_jsonb(ei) || jsonb_build_object(
           'inspection_line_items', jsonb_build_object(
             'section_name', li.section_name, 'item_score', li.item_score, 'notes', li.notes, 'availability_status', li.availability_status),
           -- what this line cost in the version last sent; null for a line added since
           'was_total', (select (coalesce(vi.material_cost, 0) + coalesce(vi.labour_cost, 0)) * coalesce(vi.qty, 1)
                           from estimate_version_items vi
                          where vi.version_id = ver.id and vi.estimate_item_id = ei.id
                          limit 1))
         order by ei.sort_order), '[]'::jsonb)
    into items
    from estimate_items ei left join inspection_line_items li on li.id = ei.line_item_id
   where ei.estimate_id = est.id;

  -- a landlord opening it counts as a view (staff and previews do not)
  if a.actor = 'landlord' and not coalesce(p_preview, false) then
    if est.first_viewed_at is null then
      update estimates set first_viewed_at = now(), status = case when status in ('sent', 'draft') then 'viewed' else status end where id = est.id;
    end if;
    insert into estimate_events (estimate_id, event_type, actor, meta) values (est.id, 'viewed', 'landlord', jsonb_build_object('email', a.email));
  end if;

  return jsonb_build_object(
    'actor', a.actor, 'email', a.email,
    'estimate', to_jsonb(est) - 'access_code_hash',
    -- the page totals the live lines (estimates.total); no snapshot total any more
    'snapshot_total', null,
    'version_snapshot_missing', false,
    'items', items,
    'disputes', coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at) from estimate_disputes d where d.estimate_id = est.id), '[]'::jsonb),
    'inspection', (select jsonb_build_object('id', i.id, 'pid', i.pid, 'house_type', i.house_type, 'inspection_date', i.inspection_date,
                                             'config', i.config, 'owner_email', i.owner_email)
                     from inspections i where i.id = est.inspection_id),
    'media', coalesce((select jsonb_object_agg(m.line_item_id, m.urls) from (
                select lm.line_item_id, jsonb_agg(lm.url) urls from line_item_media lm
                 where lm.line_item_id in (select (x->>'line_item_id')::uuid from jsonb_array_elements(items) x where x->>'line_item_id' is not null)
                 group by lm.line_item_id) m), '{}'::jsonb));
end
$$;
revoke all on function public.estimate_view(text, uuid, boolean) from public;
grant execute on function public.estimate_view(text, uuid, boolean) to anon, authenticated;

-- ── 2. repricing an approved line sends it back to pending ────────────────
create or replace function public.estimate_item_reprice_resets()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'approved'
     and (new.status is not distinct from 'approved')
     and (new.material_cost, new.labour_cost, new.qty, new.cost_type)
         is distinct from (old.material_cost, old.labour_cost, old.qty, old.cost_type) then
    new.status := 'pending';
    new.approved_at := null;
    new.approved_by_email := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_estimate_item_reprice_resets on public.estimate_items;
create trigger trg_estimate_item_reprice_resets
  before update of material_cost, labour_cost, qty, cost_type on public.estimate_items
  for each row execute function public.estimate_item_reprice_resets();

-- after the reset: record it and bring the estimate's status down with it
create or replace function public.estimate_item_reprice_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into estimate_events (estimate_id, event_type, actor, meta)
  values (new.estimate_id, 'item_repriced', coalesce(nullif(lower(auth.jwt() ->> 'email'), ''), 'system'),
          jsonb_build_object('item_id', new.id, 'item_name', new.item_name,
            'old_total', (coalesce(old.material_cost, 0) + coalesce(old.labour_cost, 0)) * coalesce(old.qty, 1),
            'new_total', (coalesce(new.material_cost, 0) + coalesce(new.labour_cost, 0)) * coalesce(new.qty, 1),
            'approval_cleared', old.approved_by_email));
  perform estimate_refresh_status(new.estimate_id);
  return null;
end $$;

drop trigger if exists trg_estimate_item_reprice_after on public.estimate_items;
create trigger trg_estimate_item_reprice_after
  after update of material_cost, labour_cost, qty, cost_type on public.estimate_items
  for each row when (old.status = 'approved' and new.status = 'pending')
  execute function public.estimate_item_reprice_after();

-- ── 3. sent_total follows the live offer until final ──────────────────────
-- Lines on the landlord's page: everything but removed/excluded, costed.
-- Rejected lines still count — they're on the page, struck through.
create or replace function public.recompute_estimate_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare eid uuid;
begin
  eid := coalesce(new.estimate_id, old.estimate_id);
  update estimates e set
    total = coalesce((
      select sum((coalesce(material_cost,0)+coalesce(labour_cost,0))*coalesce(qty,1))
      from estimate_items
      where estimate_id=eid and coalesce(status,'pending') not in ('removed', 'excluded', 'rejected')
        and coalesce(cost_type,'priced') in ('priced', 'actuals')),0),
    sent_total = case when e.sent_at is not null and not coalesce(e.locked, false) then coalesce((
      select sum((coalesce(material_cost,0)+coalesce(labour_cost,0))*coalesce(qty,1))
      from estimate_items
      where estimate_id=eid and coalesce(status,'pending') not in ('removed', 'excluded')
        and coalesce(cost_type,'priced') in ('priced', 'actuals')),0) else e.sent_total end
  where e.id=eid;
  return null;
end $$;

-- the stamp on send uses the same rule
create or replace function public.estimate_stamp_sent_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sent_at is not null and new.sent_at is distinct from old.sent_at then
    select coalesce(sum((coalesce(material_cost,0) + coalesce(labour_cost,0)) * coalesce(qty,1)), 0)
      into new.sent_total
      from estimate_items
     where estimate_id = new.id
       and coalesce(status, 'pending') not in ('removed','excluded')
       and coalesce(cost_type, 'priced') in ('priced','actuals');
  end if;
  return new;
end $$;

-- ── 4. a second approval after a reprice notifies again ───────────────────
create or replace function public.notify_estimate_item_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare e record;
begin
  select pid, id into e from estimates where id = new.estimate_id;
  if e.pid is null then return null; end if;
  perform notify_property(e.pid, 'landlord_approved',
    'Landlord approved ' || coalesce(nullif(new.item_name, ''), 'an item'),
    coalesce(nullif(new.area, '') || ' · ', '') || coalesce(nullif(new.trade, ''), ''),
    '/estimate/' || e.id,
    'landlord_approved:' || new.id || ':' || coalesce(extract(epoch from new.approved_at)::bigint::text, ''));
  return null;
end $$;

-- ── backfill: open, sent estimates take the live offer as sent_total ──────
update estimates e set sent_total = coalesce((
    select sum((coalesce(material_cost,0)+coalesce(labour_cost,0))*coalesce(qty,1))
      from estimate_items
     where estimate_id = e.id and coalesce(status,'pending') not in ('removed', 'excluded')
       and coalesce(cost_type,'priced') in ('priced', 'actuals')), 0)
 where e.sent_at is not null and not coalesce(e.locked, false);

commit;
