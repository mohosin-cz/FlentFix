-- Assets issued to vendors: tools, devices, uniform, safety kit.
--
-- An asset row is the item, not the loan. It is created once when the item is
-- logged and then carries whoever currently holds it, so a drill that moves
-- between three vendors is one row with a history of movements, not three
-- rows nobody can reconcile.
--
-- vendor_id is nullable on purpose: an item can sit in stores unassigned, and
-- a vendor being deleted must not take the asset with it — the item still
-- exists and still needs accounting for. Hence `on delete set null` rather
-- than cascade.

create table if not exists public.vendor_assets (
  id             uuid primary key default gen_random_uuid(),
  asset_tag      text,                       -- internal sticker/tag
  name           text not null,              -- 'Cordless drill'
  category       text not null default 'Other',
  make           text,
  model          text,
  serial_no      text,
  condition      text not null default 'good' check (condition in ('new','good','fair','poor')),
  purchase_date  date,
  value          numeric,

  vendor_id      uuid references public.vendors(id) on delete set null,
  assigned_email text,          -- what was typed at assignment, kept for audit
  assigned_at    timestamptz,
  assigned_by    text,

  status         text not null default 'in_stores'
                 check (status in ('in_stores','assigned','returned','lost','damaged')),
  returned_at    timestamptz,
  return_note    text,

  notes          text,
  created_at     timestamptz not null default now(),
  created_by     text,
  updated_at     timestamptz not null default now()
);

create index if not exists vendor_assets_vendor_idx on public.vendor_assets(vendor_id, assigned_at desc);
create index if not exists vendor_assets_status_idx on public.vendor_assets(status);

-- A serial number identifies one physical thing. Logging it twice is a
-- mistake, and it is the mistake that makes an asset register useless.
-- Partial, so any number of rows may have no serial at all.
create unique index if not exists vendor_assets_serial_uniq
  on public.vendor_assets (lower(btrim(serial_no)))
  where serial_no is not null and btrim(serial_no) <> '';

-- Same for the internal tag.
create unique index if not exists vendor_assets_tag_uniq
  on public.vendor_assets (lower(btrim(asset_tag)))
  where asset_tag is not null and btrim(asset_tag) <> '';

create or replace function public.vendor_assets_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_vendor_assets_touch on public.vendor_assets;
create trigger trg_vendor_assets_touch
  before update on public.vendor_assets
  for each row execute function public.vendor_assets_touch();

-- ── Movement history ────────────────────────────────────────────────────────
-- Every assignment, return, loss. Written by the app alongside the status
-- change so "who had this in March" is answerable.
create table if not exists public.vendor_asset_events (
  id         uuid primary key default gen_random_uuid(),
  asset_id   uuid not null references public.vendor_assets(id) on delete cascade,
  vendor_id  uuid references public.vendors(id) on delete set null,
  action     text not null check (action in ('logged','assigned','returned','lost','damaged','updated')),
  note       text,
  actor      text,
  created_at timestamptz not null default now()
);

create index if not exists vendor_asset_events_asset_idx on public.vendor_asset_events(asset_id, created_at desc);

-- ── Access: authenticated staff only ────────────────────────────────────────
-- anon has no business here, and Supabase grants it access to new tables by
-- default, so it is revoked explicitly rather than relying on `from public`.
alter table public.vendor_assets       enable row level security;
alter table public.vendor_asset_events enable row level security;

revoke all on public.vendor_assets       from public;
revoke all on public.vendor_assets       from anon;
revoke all on public.vendor_asset_events from public;
revoke all on public.vendor_asset_events from anon;

grant select, insert, update, delete on public.vendor_assets       to authenticated;
grant select, insert                 on public.vendor_asset_events to authenticated;

drop policy if exists "staff manage assets" on public.vendor_assets;
create policy "staff manage assets" on public.vendor_assets
  for all to authenticated using (true) with check (true);

drop policy if exists "staff read asset events" on public.vendor_asset_events;
create policy "staff read asset events" on public.vendor_asset_events
  for select to authenticated using (true);

drop policy if exists "staff write asset events" on public.vendor_asset_events;
create policy "staff write asset events" on public.vendor_asset_events
  for insert to authenticated with check (true);
