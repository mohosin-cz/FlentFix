-- View-only access.
--
-- profiles.role: 'staff' (default, as before) or 'viewer'. A viewer can open
-- every page their staff status allows but cannot change anything: every
-- insert / update / delete they cause on a public table is refused by a
-- statement-level guard trigger. A trigger rather than RLS so it also holds
-- inside SECURITY DEFINER functions (milestones, estimate decisions, owner
-- changes…), which bypass RLS but still fire triggers. Storage uploads are
-- refused by restrictive policies.
--
-- Exempt (personal state written just by looking): home_seen ("since you last
-- looked") and notifications (read / dismissed).
-- Anonymous callers (landlord estimate page, vendor portal) and server jobs
-- have no viewer profile, so they are unaffected.
--
-- A table created later needs the trigger too:
--   create trigger trg_viewer_read_only before insert or update or delete on public.<t>
--     for each statement execute function public.pulse_block_viewer();

begin;

alter table public.profiles add column if not exists role text not null default 'staff';
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('staff', 'viewer'));

create or replace function public.pulse_is_viewer()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'viewer' from profiles where id = auth.uid()), false)
$$;
grant execute on function public.pulse_is_viewer() to authenticated, anon;

create or replace function public.pulse_block_viewer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if pulse_is_viewer() then
    raise exception 'You have view-only access in Pulse — this change was not saved'
      using errcode = '42501';
  end if;
  return null;
end $$;

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
            and tablename not in ('home_seen', 'notifications')
  loop
    execute format('drop trigger if exists trg_viewer_read_only on public.%I', t);
    execute format('create trigger trg_viewer_read_only before insert or update or delete on public.%I
                    for each statement execute function public.pulse_block_viewer()', t);
  end loop;
end $$;

-- a viewer can't change their own role either: profiles has the trigger above

update public.profiles set role = 'viewer' where id = 'cdb086a6-7ce6-4d25-a4a5-cce8545f639f';

commit;

-- storage: no uploads, overwrites or deletes for viewers
drop policy if exists "viewers cannot upload" on storage.objects;
create policy "viewers cannot upload" on storage.objects as restrictive for insert to authenticated with check (not public.pulse_is_viewer());
drop policy if exists "viewers cannot overwrite" on storage.objects;
create policy "viewers cannot overwrite" on storage.objects as restrictive for update to authenticated using (not public.pulse_is_viewer());
drop policy if exists "viewers cannot delete" on storage.objects;
create policy "viewers cannot delete" on storage.objects as restrictive for delete to authenticated using (not public.pulse_is_viewer());
