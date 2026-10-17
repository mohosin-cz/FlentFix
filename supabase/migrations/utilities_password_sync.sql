-- WiFi password lives in two columns. The Utilities form writes `password`;
-- the setup-closure check (property_setup_checks, journey engine) and the
-- record sheet read `wifi_password`. Records imported earlier carry both,
-- but anything entered through the form had only `password`, so a fully
-- registered WiFi read as "password missing" and setup could not close.
--
-- Keep them as one value: whichever is filled fills the other, on every
-- write, and back-fill the rows that drifted.

begin;

create or replace function public.property_utilities_sync_password()
returns trigger
language plpgsql
as $$
begin
  -- an edit to one of them wins, and is copied to the other
  if tg_op = 'UPDATE' and new.password is distinct from old.password
     and new.wifi_password is not distinct from old.wifi_password then
    new.wifi_password := new.password;
  elsif tg_op = 'UPDATE' and new.wifi_password is distinct from old.wifi_password
     and new.password is not distinct from old.password then
    new.password := new.wifi_password;
  end if;
  -- then a blank one takes the filled one
  if nullif(btrim(new.wifi_password), '') is null then new.wifi_password := nullif(btrim(new.password), ''); end if;
  if nullif(btrim(new.password), '') is null then new.password := nullif(btrim(new.wifi_password), ''); end if;
  return new;
end
$$;

drop trigger if exists trg_property_utilities_sync_password on public.property_utilities;
create trigger trg_property_utilities_sync_password
  before insert or update on public.property_utilities
  for each row execute function public.property_utilities_sync_password();

update public.property_utilities
   set wifi_password = password
 where nullif(btrim(password), '') is not null and nullif(btrim(wifi_password), '') is null;

update public.property_utilities
   set password = wifi_password
 where nullif(btrim(wifi_password), '') is not null and nullif(btrim(password), '') is null;

commit;

select count(*) filter (where nullif(password, '') is not null) password_set,
       count(*) filter (where nullif(wifi_password, '') is not null) wifi_password_set
  from public.property_utilities where utility_type = 'wifi';
