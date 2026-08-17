-- Archive for properties.
--
-- Deliberately a separate bucket from properties_bin, not a flag on it.
-- Archiving and deleting mean different things: a binned property was a
-- mistake or is finished with and may be erased forever, while an archived
-- property is completed work you want out of the daily list but intend to
-- keep. Nothing in the archive is ever destroyed by the archive itself — the
-- only way out is Restore, or an explicit move to the bin.
--
-- Shape mirrors properties_bin so the two behave identically, including the
-- original_data snapshot, and so membership of the table (rather than a
-- column on properties) is what hides a PID from the list. That matters:
-- the properties page builds its list from inspections as well as properties,
-- so a PID can appear with no properties row at all, and a flag on that row
-- would silently fail to hide it.

create table if not exists public.properties_archive (
  pid           text primary key,
  name          text,
  type          text,
  archived_by   text,
  archived_at   timestamptz not null default now(),
  original_data jsonb
);

create index if not exists properties_archive_archived_at_idx
  on public.properties_archive (archived_at desc);

-- Kept in step with properties.deleted_at/deleted_by so anything else reading
-- the properties table directly can tell an archived unit from a live one.
alter table public.properties
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by text;

-- Authenticated staff only.
--
-- This is deliberately tighter than properties_bin, which today is readable
-- with nothing but the anon key — the whole estate list, publicly. Supabase
-- also grants anon access to new tables by default, so the revoke has to name
-- anon explicitly; revoking from public alone is not enough.
alter table public.properties_archive enable row level security;

revoke all on public.properties_archive from public;
revoke all on public.properties_archive from anon;
grant select, insert, delete on public.properties_archive to authenticated;

drop policy if exists properties_archive_staff on public.properties_archive;
create policy properties_archive_staff on public.properties_archive
  for all to authenticated
  using (true)
  with check (true);
