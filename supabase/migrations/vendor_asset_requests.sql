-- Vendor asset requests: ask → approve → order → receive → deploy → log.
--
-- The vendor asks for something on a public link, staff approve or deny, and
-- an approved request then carries a live status the vendor can watch. Once
-- it is deployed the vendor fills in the real details of the thing they were
-- handed — serial, registration, whatever the item happens to have — and that
-- creates the row in vendor_assets.
--
-- Anything can be requested: a vehicle, a backpack, a drill. The item is free
-- text plus a category, and the details captured at the end are a jsonb bag
-- rather than columns, because a vehicle has a registration and a chassis
-- number while a backpack has neither and inventing null columns for both
-- would make the form lie about what matters.

create table if not exists public.vendor_asset_requests (
  id              uuid primary key default gen_random_uuid(),

  vendor_id       uuid not null references public.vendors(id) on delete cascade,
  requested_email text not null,          -- what they typed, kept for audit

  item_name       text not null,          -- 'Two-wheeler', 'Backpack'
  category        text not null default 'Other',
  quantity        int  not null default 1 check (quantity > 0),
  reason          text,

  -- requested → denied
  --           → pending_order → received → deployed → logged
  status          text not null default 'requested'
                  check (status in ('requested','denied','pending_order','received','deployed','logged')),

  decided_by      text,
  decided_at      timestamptz,
  deny_reason     text,

  ordered_at      timestamptz,
  received_at     timestamptz,
  deployed_at     timestamptz,

  asset_id        uuid references public.vendor_assets(id) on delete set null,
  logged_at       timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists vendor_asset_requests_vendor_idx on public.vendor_asset_requests(vendor_id, created_at desc);
create index if not exists vendor_asset_requests_status_idx on public.vendor_asset_requests(status);

create or replace function public.vendor_asset_requests_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_vendor_asset_requests_touch on public.vendor_asset_requests;
create trigger trg_vendor_asset_requests_touch
  before update on public.vendor_asset_requests
  for each row execute function public.vendor_asset_requests_touch();

-- Details captured by the vendor at deployment. Free-form because a vehicle
-- and a backpack have nothing in common worth a shared column.
alter table public.vendor_assets
  add column if not exists details jsonb,
  add column if not exists request_id uuid references public.vendor_asset_requests(id) on delete set null;

-- ── Access ──────────────────────────────────────────────────────────────────
-- Staff read and manage directly. The vendor side is anon and goes only
-- through the SECURITY DEFINER RPCs below, which is why there is no anon
-- policy on the table itself.
alter table public.vendor_asset_requests enable row level security;

revoke all on public.vendor_asset_requests from public;
revoke all on public.vendor_asset_requests from anon;
grant select, insert, update, delete on public.vendor_asset_requests to authenticated;

drop policy if exists "staff manage asset requests" on public.vendor_asset_requests;
create policy "staff manage asset requests" on public.vendor_asset_requests
  for all to authenticated using (true) with check (true);

-- ── Vendor side ─────────────────────────────────────────────────────────────
-- Identify by the email given at onboarding. Only on-roll vendors, and only
-- one match: that address is not unique in vendors, so an ambiguous email is
-- refused rather than resolved to whoever happens to come back first.
create or replace function public.asset_request_whoami(p_email text)
returns table (vendor_id uuid, full_name text, vendor_code text, trade text)
language plpgsql security definer set search_path = public, extensions
as $$
declare n int;
begin
  select count(*) into n from public.vendors
   where lower(btrim(email)) = lower(btrim(p_email)) and status = 'approved';
  if n = 0 then raise exception 'No on-roll vendor found for that email'; end if;
  if n > 1 then raise exception 'That email is on more than one vendor record — ask the office to sort it out'; end if;
  return query
    select v.id, v.full_name, v.vendor_code, v.trade from public.vendors v
     where lower(btrim(v.email)) = lower(btrim(p_email)) and v.status = 'approved';
end $$;

-- Everything this vendor has asked for, newest first.
create or replace function public.asset_request_list(p_email text)
returns table (
  id uuid, item_name text, category text, quantity int, reason text,
  status text, deny_reason text, created_at timestamptz,
  decided_at timestamptz, received_at timestamptz, deployed_at timestamptz,
  asset_id uuid
)
language plpgsql security definer set search_path = public, extensions
as $$
declare v uuid;
begin
  select w.vendor_id into v from public.asset_request_whoami(p_email) w;
  return query
    select r.id, r.item_name, r.category, r.quantity, r.reason,
           r.status, r.deny_reason, r.created_at,
           r.decided_at, r.received_at, r.deployed_at, r.asset_id
      from public.vendor_asset_requests r
     where r.vendor_id = v
     order by r.created_at desc;
end $$;

create or replace function public.asset_request_create(
  p_email text, p_item_name text, p_category text, p_quantity int, p_reason text)
returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare v uuid; new_id uuid; open_count int;
begin
  select w.vendor_id into v from public.asset_request_whoami(p_email) w;
  if btrim(coalesce(p_item_name,'')) = '' then raise exception 'Say what you need'; end if;

  -- A cap on requests still in flight, so a stuck queue cannot be flooded
  -- from a link that anyone holding it can open.
  select count(*) into open_count from public.vendor_asset_requests
   where vendor_id = v and status in ('requested','pending_order','received','deployed');
  if open_count >= 10 then
    raise exception 'You already have 10 open requests — wait for those to be dealt with';
  end if;

  insert into public.vendor_asset_requests(vendor_id, requested_email, item_name, category, quantity, reason)
  values (v, btrim(p_email), btrim(p_item_name), coalesce(nullif(btrim(p_category),''),'Other'),
          greatest(coalesce(p_quantity,1),1), nullif(btrim(coalesce(p_reason,'')),''))
  returning id into new_id;
  return new_id;
end $$;

-- Once deployed, the vendor records what they actually received. This is what
-- creates the asset row and puts it on their profile.
create or replace function public.asset_request_log_item(
  p_email text, p_request_id uuid, p_serial text, p_details jsonb)
returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare v uuid; r public.vendor_asset_requests; new_asset uuid;
begin
  select w.vendor_id into v from public.asset_request_whoami(p_email) w;

  select * into r from public.vendor_asset_requests
   where id = p_request_id and vendor_id = v;
  if r.id is null then raise exception 'Request not found'; end if;
  if r.status <> 'deployed' then
    raise exception 'This item is not marked deployed yet — you can log it once it has been handed over';
  end if;

  insert into public.vendor_assets(
    name, category, serial_no, details, request_id,
    vendor_id, assigned_email, assigned_at, assigned_by, status, created_by)
  values (
    r.item_name, r.category, nullif(btrim(coalesce(p_serial,'')),''), p_details, r.id,
    v, r.requested_email, now(), 'vendor', 'assigned', 'vendor')
  returning id into new_asset;

  update public.vendor_asset_requests
     set status = 'logged', asset_id = new_asset, logged_at = now()
   where id = r.id;

  insert into public.vendor_asset_events(asset_id, vendor_id, action, note, actor)
  values (new_asset, v, 'logged', 'Logged by vendor from request', r.requested_email);

  return new_asset;
end $$;

grant execute on function public.asset_request_whoami(text)                        to anon, authenticated;
grant execute on function public.asset_request_list(text)                          to anon, authenticated;
grant execute on function public.asset_request_create(text, text, text, int, text) to anon, authenticated;
grant execute on function public.asset_request_log_item(text, uuid, text, jsonb)   to anon, authenticated;
