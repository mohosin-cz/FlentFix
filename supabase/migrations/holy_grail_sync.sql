-- Holy Grail → Pulse: property name, units, Google Maps link, landlord name.
-- Nothing else is taken from the sheet.
--
-- How it flows:
--   · For now the sheet arrives as an evening CSV export of the Properties
--     tab. scripts/holy-grail-import.py turns it into one SQL file that calls
--     holy_grail_ingest() with PID + those four columns; it is applied from
--     the CLI. That keeps a copy per PID (sheet_properties) and updates the
--     matching Pulse properties. (A scheduled sync is parked until someone
--     with Supabase admin access can deploy it.)
--   · When a Pulse user creates a PID, a trigger looks it up in that copy
--     and fills the four fields straight away — no waiting for the next sync.
--   · The landlord invoice starts with the property's landlord name.
--
-- The sheet is the source: a filled sheet cell replaces Pulse's value; an
-- empty one never blanks it.

begin;

alter table public.properties
  add column if not exists landlord_name   text,
  add column if not exists units           text,
  add column if not exists maps_url        text,
  add column if not exists sheet_synced_at timestamptz;

create table if not exists public.sheet_properties (
  pid           text primary key,
  property_name text,
  units         text,
  maps_url      text,
  landlord_name text,
  first_seen_at timestamptz not null default now(),
  synced_at     timestamptz not null default now()
);

create table if not exists public.sheet_sync_runs (
  id                 bigserial primary key,
  ran_at             timestamptz not null default now(),
  rows_received      int not null default 0,
  rows_new           int not null default 0,   -- PIDs seen in the sheet for the first time
  properties_updated int not null default 0,   -- Pulse properties whose details changed
  skipped            jsonb not null default '[]'
);

alter table public.sheet_properties enable row level security;
alter table public.sheet_sync_runs  enable row level security;
revoke all on public.sheet_properties from public, anon;
revoke all on public.sheet_sync_runs  from public, anon;
grant select on public.sheet_properties to authenticated;
grant select on public.sheet_sync_runs  to authenticated;
drop policy if exists "staff read sheet copy" on public.sheet_properties;
create policy "staff read sheet copy" on public.sheet_properties for select to authenticated using (true);
drop policy if exists "staff read sync runs" on public.sheet_sync_runs;
create policy "staff read sync runs" on public.sheet_sync_runs for select to authenticated using (true);

-- A Pulse name is a placeholder when it is empty, the PID itself, or "PID <n>"
-- (InspectionMode creates — and re-upserts — the row with name = pid).
create or replace function public.is_placeholder_name(p_name text, p_pid text)
returns boolean language sql immutable as $$
  select p_name is null or btrim(p_name) = '' or btrim(p_name) = p_pid or lower(btrim(p_name)) = 'pid ' || lower(p_pid)
$$;

-- ── Fill a property from the sheet copy as it is created (or re-upserted) ──
create or replace function public.properties_fill_from_sheet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare s sheet_properties%rowtype;
begin
  select * into s from sheet_properties where pid = new.pid;
  if not found then return new; end if;
  -- the sheet's name beats a placeholder; it never replaces a real name typed in Pulse here
  if is_placeholder_name(new.name, new.pid) and s.property_name is not null then new.name := s.property_name; end if;
  new.units         := coalesce(s.units, new.units);
  new.maps_url      := coalesce(s.maps_url, new.maps_url);
  new.landlord_name := coalesce(s.landlord_name, new.landlord_name);
  return new;
end
$$;

drop trigger if exists trg_properties_fill_from_sheet on public.properties;
create trigger trg_properties_fill_from_sheet
  before insert or update of pid, name on public.properties
  for each row execute function public.properties_fill_from_sheet();

-- ── The ingest — run from the CLI with a generated file; nobody else may call it ─
create or replace function public.holy_grail_ingest(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r        jsonb;
  v_pid    text;
  n_in     int := 0;
  n_new    int := 0;
  n_props  int := 0;
  v_skip   jsonb := '[]'::jsonb;
  v_ins    boolean;
  clean    constant text := '^\s*(|-|na|n/a|nil|none|tbd)\s*$';
begin
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'p_rows must be a JSON array'; end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    n_in := n_in + 1;
    v_pid := btrim(r ->> 'pid');
    if v_pid is null or v_pid ~* clean then
      v_skip := v_skip || jsonb_build_object('row', n_in, 'reason', 'no PID');
      continue;
    end if;
    insert into sheet_properties as s (pid, property_name, units, maps_url, landlord_name, synced_at)
    values (v_pid,
            case when r->>'property_name' ~* clean then null else btrim(r->>'property_name') end,
            case when r->>'units'         ~* clean then null else btrim(r->>'units') end,
            case when r->>'maps_url'      ~* clean then null else btrim(r->>'maps_url') end,
            case when r->>'landlord_name' ~* clean then null else btrim(r->>'landlord_name') end,
            now())
    on conflict (pid) do update set
      property_name = excluded.property_name, units = excluded.units,
      maps_url = excluded.maps_url, landlord_name = excluded.landlord_name, synced_at = now()
    returning (xmax = 0) into v_ins;
    if v_ins then n_new := n_new + 1; end if;
  end loop;

  -- Existing Pulse properties: sheet value wins when it has one.
  with upd as (
    update properties p
       set name            = coalesce(s.property_name, p.name),
           units           = coalesce(s.units, p.units),
           maps_url        = coalesce(s.maps_url, p.maps_url),
           landlord_name   = coalesce(s.landlord_name, p.landlord_name),
           sheet_synced_at = now()
      from sheet_properties s
     where s.pid = p.pid
       and p.deleted_at is null
       and (p.name          is distinct from coalesce(s.property_name, p.name)
         or p.units         is distinct from coalesce(s.units, p.units)
         or p.maps_url      is distinct from coalesce(s.maps_url, p.maps_url)
         or p.landlord_name is distinct from coalesce(s.landlord_name, p.landlord_name))
    returning 1)
  select count(*) into n_props from upd;

  insert into sheet_sync_runs (rows_received, rows_new, properties_updated, skipped)
  values (n_in, n_new, n_props, v_skip);

  return jsonb_build_object('received', n_in, 'new', n_new, 'properties_updated', n_props, 'skipped', jsonb_array_length(v_skip));
end
$$;

revoke all on function public.holy_grail_ingest(jsonb) from public, anon, authenticated;
revoke all on function public.properties_fill_from_sheet() from public, anon, authenticated;

commit;
