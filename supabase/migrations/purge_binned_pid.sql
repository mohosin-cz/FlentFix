-- "Delete forever" from the bin, done in the database in one go.
--
-- The client used to delete the inspections and the property row only. Any
-- property with an estimate failed: estimate_items point at the inspection's
-- lines (estimate_items_line_item_id_fkey), and a sent or final estimate is
-- protected on purpose (guard_estimate_delete, estimate_final_lock). This
-- removes the whole tree in order, for a property that is in the bin only.
--
-- Kept: property_payments (the money ledger, imported from the books). A
-- payment that pointed at a work order keeps its row; work_order_id goes null.

create or replace function public.purge_binned_pid(p_pid text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me    text := nullif(lower(coalesce(auth.jwt() ->> 'email', '')), '');
  v     text := btrim(coalesce(p_pid, ''));
  insp  uuid[];
  ests  uuid[];
  n_est int; n_insp int; n_wo int; n_inv int;
begin
  if me is null or me !~ '@flent\.in$' then raise exception 'Only Flent staff can delete from the bin'; end if;
  if v = '' then raise exception 'No PID given'; end if;
  -- Never a live property: it has to be deleted (in the bin) first.
  if exists (select 1 from properties where pid = v and deleted_at is null) then
    raise exception 'PID % is not in the bin — move it to the bin before deleting it forever', v;
  end if;

  -- Lets the estimate guards stand aside for this transaction only.
  perform set_config('pulse.purging', v, true);

  select coalesce(array_agg(id), '{}') into insp from inspections where pid = v;
  select coalesce(array_agg(id), '{}') into ests from estimates where pid = v or inspection_id = any(insp);
  n_est := cardinality(ests); n_insp := cardinality(insp);

  -- invoices (landlord, tax, legacy); their own lines cascade
  with d as (delete from landlord_invoices where pid = v or inspection_id = any(insp) returning 1) select count(*) into n_inv from d;
  delete from tax_invoices where pid = v or estimate_id = any(ests);
  delete from invoices where estimate_id = any(ests);

  -- work orders; items and actuals cascade, payments keep their row
  with d as (delete from work_orders where pid = v or inspection_id = any(insp) returning 1) select count(*) into n_wo from d;

  -- estimates: lines first (their audit trigger writes activity), then the rest
  delete from estimate_version_items where version_id in (select id from estimate_versions where estimate_id = any(ests));
  delete from estimate_versions where estimate_id = any(ests);
  delete from estimate_items where estimate_id = any(ests);
  delete from estimate_activity where estimate_id = any(ests);
  delete from estimate_access_attempts where estimate_id = any(ests);
  delete from estimates where id = any(ests);

  -- inspections; line items and media cascade
  delete from inspections where id = any(insp);

  delete from properties where pid = v;
  delete from properties_bin where pid = v;
  delete from quick_notes where pid = v;

  return jsonb_build_object('pid', v, 'estimates', n_est, 'inspections', n_insp, 'work_orders', n_wo, 'invoices', n_inv);
end $$;

revoke all on function public.purge_binned_pid(text) from public, anon;
grant execute on function public.purge_binned_pid(text) to authenticated;

-- The guards honour pulse.purging (set only inside purge_binned_pid).
create or replace function public.guard_estimate_delete()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('pulse.purging', true), '') <> '' then return old; end if;
  if old.sent_at is not null or exists(select 1 from estimate_items where estimate_id=old.id) then
    raise exception 'Estimate % (pid %) has items or was sent - deletion blocked', old.id, old.pid;
  end if;
  return old;
end $$;

create or replace function public.estimate_items_final_lock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('pulse.purging', true), '') <> '' then return coalesce(new, old); end if;
  if estimate_from_api() and estimate_is_final(coalesce(new.estimate_id, old.estimate_id)) then
    raise exception 'This estimate is marked final — it can no longer be changed'
      using errcode = 'P0001', hint = 'estimate_final';
  end if;
  return coalesce(new, old);
end $$;
