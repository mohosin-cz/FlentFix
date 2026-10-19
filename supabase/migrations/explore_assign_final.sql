-- Assigning an exploratory visit is final — the assignee no longer has to
-- confirm before it counts (told 2026-10-19). They see the visit, its details
-- and what supply wants straight away; "can't make it" still exists as an
-- escape, but nothing waits on it.
--
-- Same functions as in explore_journey.sql (kept in step), plus a backfill so
-- visits already assigned stop showing "confirm the visit".

begin;

create or replace function public.exploratory_assign(p_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare me text := lower(coalesce(auth.jwt() ->> 'email', '')); e stage_exploratory%rowtype; who text := nullif(lower(btrim(p_email)), '');
begin
  if not pulse_is_admin() then raise exception 'Only an admin can assign exploratory visits'; end if;
  select * into e from stage_exploratory where id = p_id;
  if not found then raise exception 'No such request'; end if;
  insert into exploratory_assignments (request_id, assignee, assigned_by, assigned_at)
  values (p_id, who, me, now())
  on conflict (request_id) do update
     set assignee = excluded.assignee, assigned_by = excluded.assigned_by, assigned_at = now(),
         -- assigning is final: nobody has to confirm before it counts
         confirmed_at = case when excluded.assignee is not null then now() end, stage_conflict = null,
         declined_by = case when excluded.assignee is null then exploratory_assignments.declined_by end,
         declined_at = case when excluded.assignee is null then exploratory_assignments.declined_at end,
         decline_reason = case when excluded.assignee is null then exploratory_assignments.decline_reason end;
  if who is not null and who <> me then
    insert into notifications (user_email, kind, pid, title, body, route, dedupe_key)
    values (who, 'exploratory_assigned', null, 'Exploratory visit: ' || coalesce(e.property_name, 'property'),
            explore_slot_text(e.visit_date, e.visit_time) || ' · you’re going (assigned by ' || split_part(me, '@', 1) || ') · open it for the address, landlord and what supply wants',
            '/explore/' || p_id, 'exploratory_assigned:' || p_id || ':' || who || ':' || extract(epoch from now())::bigint)
    on conflict do nothing;
  end if;
  update notifications set read_at = coalesce(read_at, now())
   where dedupe_key in ('exploratory_new:' || p_id) or dedupe_key like 'exploratory_declined:' || p_id || '%';
end
$$;

create or replace function public.exploratory_resolve_conflict(p_id uuid, p_use_stage boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not pulse_is_admin() then raise exception 'Only an admin can settle this'; end if;
  if p_use_stage then
    update exploratory_assignments set assignee = nullif(stage_conflict, ''), stage_written_assignee = coalesce(stage_conflict, ''),
           stage_conflict = null, confirmed_at = case when stage_conflict is not null then now() end where request_id = p_id;
  else
    update exploratory_assignments set stage_conflict = null, stage_written_assignee = null where request_id = p_id;  -- re-push Pulse's
  end if;
end
$$;

update public.exploratory_assignments set confirmed_at = coalesce(confirmed_at, assigned_at, now())
 where assignee is not null and confirmed_at is null;

commit;
