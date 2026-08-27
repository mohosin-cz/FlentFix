-- Files attached to an asset: its purchase invoice, and a photo of the item.
--
-- The vendor logging a deployed item can record the bill that came with it —
-- number plus a photo or PDF — and a picture of the thing itself, and staff
-- registering an asset directly can attach the same. Without this an asset
-- carries a value with nothing behind it, which is the wrong way round the
-- moment there is a warranty claim, and no record of what condition it was in
-- when it changed hands.
--
-- Both files live in vendor-docs under assets/<request-id>/. That bucket is
-- private and already accepts the anonymous inserts the vendor side needs;
-- reusing it avoids a second bucket with a second set of policies to keep in
-- step with the first.

alter table public.vendor_assets
  add column if not exists invoice_no       text,
  add column if not exists invoice_doc_path text,
  add column if not exists photo_path       text;

-- ── vendor logs the item, now with its invoice and photo ────────────────────
-- The old four-argument form is dropped rather than left alongside: adding
-- parameters creates an overload, and two functions with the same name doing
-- almost the same thing is how a caller ends up silently on the wrong one.
drop function if exists public.asset_request_log_item(text, uuid, text, jsonb);

create or replace function public.asset_request_log_item(
  p_email        text,
  p_request_id   uuid,
  p_serial       text,
  p_details      jsonb,
  p_invoice_no   text default null,
  p_invoice_path text default null,
  p_photo_path   text default null)
returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare v uuid; r public.vendor_asset_requests; new_asset uuid; prefix text;
begin
  select w.vendor_id into v from public.asset_request_whoami(p_email) w;

  select * into r from public.vendor_asset_requests
   where id = p_request_id and vendor_id = v;
  if r.id is null then raise exception 'Request not found'; end if;
  if r.status <> 'deployed' then
    raise exception 'This item is not marked deployed yet — you can log it once it has been handed over';
  end if;

  -- Only ever paths inside this request's own folder. The upload itself is
  -- anonymous, so without this a caller could point the record at any object
  -- in the bucket and have it render as their invoice or their item.
  prefix := '^assets/' || p_request_id::text || '/';
  if p_invoice_path is not null and p_invoice_path !~ prefix then
    raise exception 'Invalid invoice file';
  end if;
  if p_photo_path is not null and p_photo_path !~ prefix then
    raise exception 'Invalid photo file';
  end if;

  insert into public.vendor_assets(
    name, category, serial_no, details, request_id,
    invoice_no, invoice_doc_path, photo_path,
    vendor_id, assigned_email, assigned_at, assigned_by, status, created_by)
  values (
    r.item_name, r.category, nullif(btrim(coalesce(p_serial,'')),''), p_details, r.id,
    nullif(btrim(coalesce(p_invoice_no,'')),''), p_invoice_path, p_photo_path,
    v, r.requested_email, now(), 'vendor', 'assigned', 'vendor')
  returning id into new_asset;

  update public.vendor_asset_requests
     set status = 'logged', asset_id = new_asset, logged_at = now()
   where id = r.id;

  insert into public.vendor_asset_events(asset_id, vendor_id, action, note, actor)
  values (new_asset, v, 'logged', 'Logged by vendor from request', r.requested_email);

  return new_asset;
end $$;

grant execute on function public.asset_request_log_item(text, uuid, text, jsonb, text, text, text)
  to anon, authenticated;

-- ── let staff upload into vendor-docs too ───────────────────────────────────
-- The bucket's insert policy was written for onboarding, where the uploader is
-- always an anonymous applicant, so it grants anon and nobody else. Staff can
-- already read every object in it — they review onboarding documents — but an
-- upload from the asset form fails with "new row violates row-level security".
-- Without this the fields work on the vendor's page and silently do not on ours.
drop policy if exists "staff upload vendor docs" on storage.objects;
create policy "staff upload vendor docs" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'vendor-docs');
