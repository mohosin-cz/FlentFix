-- An inspection always has a property.
--
-- Only InspectionMode's save creates the property; finishing from the indoor,
-- outdoor or appliances screen saved the inspection with no property behind it
-- (PID 265, 2026-10-23): no journey, no next step, on nobody's load. This makes
-- the database do it for every save path, including saves replayed from a
-- phone's offline queue. Insert only — an existing property (live or in the
-- bin) is left exactly as it is. The name is Stage's for that PID when it has
-- one, else the PID itself.

create or replace function public.inspection_ensures_property()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.pid is null or btrim(new.pid) = '' then return new; end if;
  insert into properties (pid, name, type, address, landlord, owner_email)
  values (new.pid,
          coalesce((select min(sd.name) from stage_dates sd where sd.pid = new.pid), new.pid),
          coalesce(nullif(new.house_type, ''), 'independent_home'), '', '',
          lower(nullif(btrim(coalesce(new.owner_email, '')), '')))
  on conflict (pid) do nothing;
  return new;
end $$;

drop trigger if exists trg_inspection_ensures_property on public.inspections;
create trigger trg_inspection_ensures_property after insert on public.inspections
  for each row execute function public.inspection_ensures_property();

-- PID 265: inspected 2026-10-23 with no property created
insert into properties (pid, name, type, address, landlord, owner_email)
values ('265', 'Srinivasa Vaibhav 3BHK', 'apartment', '', '', 'mohosin@flent.in')
on conflict (pid) do nothing;
select property_dates_from_stage();
