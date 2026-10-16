-- Home as a work queue: the bulk actions the table needs.
--
-- Zendesk and HubSpot let you select rows and assign them. Pulse never had a
-- way to set properties.assigned_to at all (it is null on every row), so
-- "Mine" could only ever mean "I did the first inspection". These three RPCs
-- are the write path for the queue's bulk bar. Staff only; anon never.

begin;

-- Who can things be assigned to. Pulse has no users table the client may
-- read, so the team is everyone who has ever owned, been assigned, inspected
-- or moved a property — plus the caller, who is always a valid target.
create or replace function public.team_members()
returns table (email text, properties int)
language sql
stable
security definer
set search_path = public
as $$
  with people as (
    select lower(owner_email) as e from properties where owner_email is not null
    union select lower(assigned_to) from properties where assigned_to is not null
    union select lower(owner_email) from inspections where owner_email is not null
    union select lower(changed_by) from property_journey where changed_by like '%@%'
    union select lower(auth.jwt() ->> 'email') where auth.jwt() ->> 'email' is not null
  )
  select p.e,
         (select count(*)::int from properties x
           where x.deleted_at is null and x.source is distinct from 'payments_backfill'
             and (lower(x.owner_email) = p.e or lower(x.assigned_to) = p.e))
    from people p
   where p.e is not null and p.e <> '' and p.e <> 'system'
   order by 2 desc, 1
$$;

-- Assign (or unassign with null) a set of properties. Returns how many changed.
create or replace function public.property_assign(p_pids text[], p_email text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  update properties
     set assigned_to = nullif(lower(btrim(p_email)), '')
   where pid = any(p_pids)
     and deleted_at is null;
  get diagnostics n = row_count;
  insert into property_journey (pid, stage, changed_by, notes)
  select pid, coalesce(stage, 'legacy'), lower(auth.jwt() ->> 'email'),
         case when nullif(lower(btrim(p_email)), '') is null then 'unassigned' else 'assigned to ' || lower(btrim(p_email)) end
    from properties where pid = any(p_pids) and deleted_at is null;
  return n;
end
$$;

-- Set (or clear with null) the planned T-Day on a set of properties.
create or replace function public.property_set_handover(p_pids text[], p_date date)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  update properties set handover_date = p_date where pid = any(p_pids) and deleted_at is null;
  get diagnostics n = row_count;
  return n;
end
$$;

revoke all on function public.team_members() from public, anon;
revoke all on function public.property_assign(text[], text) from public, anon;
revoke all on function public.property_set_handover(text[], date) from public, anon;
grant execute on function public.team_members() to authenticated;
grant execute on function public.property_assign(text[], text) to authenticated;
grant execute on function public.property_set_handover(text[], date) to authenticated;

commit;
