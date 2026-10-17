-- Holy Grail import, wider: flat number, floor, and the street address behind
-- the map link (with its coordinates). Re-defines holy_grail_ingest() and the
-- fill-on-create trigger from holy_grail_sync.sql to carry them.
--
-- The address comes from scripts/holy-grail-import.py: the map link expanded
-- (Google's place text when it is a full address) or the pin looked up on
-- OpenStreetMap. properties.address is filled from it only where Pulse has
-- none, so an address someone typed is never overwritten.

alter table public.sheet_properties
  add column if not exists flat_no        text,
  add column if not exists floor          text,
  add column if not exists address_text   text,
  add column if not exists lat            numeric,
  add column if not exists lng            numeric,
  add column if not exists address_source text;     -- google_place · osm · google_name

alter table public.properties
  add column if not exists flat_no text,
  add column if not exists floor   text,
  add column if not exists lat     numeric,
  add column if not exists lng     numeric;

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
  if is_placeholder_name(new.name, new.pid) and s.property_name is not null then new.name := s.property_name; end if;
  new.units         := coalesce(s.units, new.units);
  new.maps_url      := coalesce(s.maps_url, new.maps_url);
  new.landlord_name := coalesce(s.landlord_name, new.landlord_name);
  new.flat_no       := coalesce(s.flat_no, new.flat_no);
  new.floor         := coalesce(s.floor, new.floor);
  new.lat           := coalesce(s.lat, new.lat);
  new.lng           := coalesce(s.lng, new.lng);
  if nullif(btrim(new.address), '') is null and s.address_text is not null then new.address := s.address_text; end if;
  return new;
end
$$;

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
    insert into sheet_properties as s (pid, property_name, units, maps_url, landlord_name, flat_no, floor,
                                       address_text, lat, lng, address_source, synced_at)
    values (v_pid,
            case when r->>'property_name' ~* clean then null else btrim(r->>'property_name') end,
            case when r->>'units'         ~* clean then null else btrim(r->>'units') end,
            case when r->>'maps_url'      ~* clean then null else btrim(r->>'maps_url') end,
            case when r->>'landlord_name' ~* clean then null else btrim(r->>'landlord_name') end,
            case when r->>'flat_no'       ~* clean then null else btrim(r->>'flat_no') end,
            case when r->>'floor'         ~* clean then null else btrim(r->>'floor') end,
            nullif(btrim(r->>'address_text'), ''),
            nullif(r->>'lat', '')::numeric, nullif(r->>'lng', '')::numeric,
            nullif(r->>'address_source', ''),
            now())
    on conflict (pid) do update set
      property_name = excluded.property_name, units = excluded.units, maps_url = excluded.maps_url,
      landlord_name = excluded.landlord_name, flat_no = excluded.flat_no, floor = excluded.floor,
      -- a run without address lookup (--no-geo) never wipes a resolved address
      address_text  = coalesce(excluded.address_text, s.address_text),
      lat           = coalesce(excluded.lat, s.lat),
      lng           = coalesce(excluded.lng, s.lng),
      address_source= coalesce(excluded.address_source, s.address_source),
      synced_at     = now()
    returning (xmax = 0) into v_ins;
    if v_ins then n_new := n_new + 1; end if;
  end loop;

  with upd as (
    update properties p
       set name            = coalesce(s.property_name, p.name),
           units           = coalesce(s.units, p.units),
           maps_url        = coalesce(s.maps_url, p.maps_url),
           landlord_name   = coalesce(s.landlord_name, p.landlord_name),
           flat_no         = coalesce(s.flat_no, p.flat_no),
           floor           = coalesce(s.floor, p.floor),
           lat             = coalesce(s.lat, p.lat),
           lng             = coalesce(s.lng, p.lng),
           address         = case when nullif(btrim(p.address), '') is null then coalesce(s.address_text, p.address) else p.address end,
           sheet_synced_at = now()
      from sheet_properties s
     where s.pid = p.pid
       and p.deleted_at is null
       and (p.name          is distinct from coalesce(s.property_name, p.name)
         or p.units         is distinct from coalesce(s.units, p.units)
         or p.maps_url      is distinct from coalesce(s.maps_url, p.maps_url)
         or p.landlord_name is distinct from coalesce(s.landlord_name, p.landlord_name)
         or p.flat_no       is distinct from coalesce(s.flat_no, p.flat_no)
         or p.floor         is distinct from coalesce(s.floor, p.floor)
         or p.lat           is distinct from coalesce(s.lat, p.lat)
         or (nullif(btrim(p.address), '') is null and s.address_text is not null))
    returning 1)
  select count(*) into n_props from upd;

  insert into sheet_sync_runs (rows_received, rows_new, properties_updated, skipped)
  values (n_in, n_new, n_props, v_skip);

  return jsonb_build_object('received', n_in, 'new', n_new, 'properties_updated', n_props, 'skipped', jsonb_array_length(v_skip));
end
$$;

revoke all on function public.holy_grail_ingest(jsonb) from public, anon, authenticated;
revoke all on function public.properties_fill_from_sheet() from public, anon, authenticated;
