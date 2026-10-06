-- ════════════════════════════════════════════════════════════════════════════
-- RENAME_PID — stop a dead PID's leftovers blocking a rename onto it.
--
-- rename_pid() moves a PID across every table that has a pid column. It asked
-- one question first — does `properties` already have this PID — and four
-- tables constrain pid uniquely: properties, properties_archive,
-- property_access and quick_notes. So a PID whose property had been
-- permanently deleted, but whose quick note had not, passed the check and then
-- died halfway through the loop with
--
--   duplicate key value violates unique constraint "quick_notes_pid_unique"
--
-- raised from inside the function and shown to staff exactly like that. The
-- rename is not transactional from the caller's point of view either: tables
-- earlier in the loop had already moved.
--
-- The destination's leftovers are provably orphans — the function has just
-- established that no property holds that PID — so they are cleared first, in
-- every table that constrains pid uniquely, found by catalogue rather than by
-- name so a table added later is covered without anybody remembering to.
--
-- Cleared, and said out loud: each deletion is returned as its own row, so the
-- summary the staff member reads after a rename names what was removed instead
-- of quietly dropping it.
--
-- This function previously existed only in the database. It is here now
-- because that is why nobody could see what it did.
-- Repo source of truth; applied via Supabase migration tooling.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.rename_pid(old_pid text, new_pid text)
returns table(tbl text, rows_updated integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare r record; n int;
begin
  if coalesce(trim(new_pid), '') = '' then raise exception 'New PID is empty'; end if;
  if not exists (select 1 from properties where pid = old_pid) then
    raise exception 'No property with PID %', old_pid; end if;
  -- Deliberately not filtered by deleted_at: a soft-deleted property still
  -- holds its PID, and a rename onto it would fail at the constraint anyway.
  if exists (select 1 from properties where pid = new_pid) then
    raise exception 'PID % already exists — choose another', new_pid; end if;

  -- Orphans at the destination, in anything that constrains pid uniquely.
  for r in
    select distinct c.relname as table_name
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_namespace ns on ns.oid = c.relnamespace and ns.nspname = 'public'
     where con.contype in ('u', 'p')
       and c.relname <> 'properties'
       and (select array_agg(a.attname::text)
              from unnest(con.conkey) k
              join pg_attribute a on a.attrelid = c.oid and a.attnum = k) = array['pid']
  loop
    execute format('delete from %I where pid = %L', r.table_name, new_pid);
    get diagnostics n = row_count;
    if n > 0 then
      tbl := r.table_name || ' (orphan cleared)';
      rows_updated := n;
      return next;
    end if;
  end loop;

  for r in select distinct c.table_name
             from information_schema.columns c
             join information_schema.tables t
               on t.table_name = c.table_name and t.table_schema = 'public'
              and t.table_type = 'BASE TABLE'
            where c.table_schema = 'public' and c.column_name = 'pid'
  loop
    execute format('update %I set pid = %L where pid = %L', r.table_name, new_pid, old_pid);
    get diagnostics n = row_count;
    tbl := r.table_name; rows_updated := n; return next;
  end loop;
end $function$;

grant execute on function public.rename_pid(text, text) to authenticated;
