-- Exploratory ledger: every visit request from Stage, what happened to it,
-- and whether it became a property. Feeds the calendar's Exploratory view
-- (tally + list) and the "Accepted, ready to inspect" cards on New inspection.
--
-- Outcome is Stage's status: approved / converted = accepted, rejected =
-- rejected, inspection_done / under_review = awaiting supply's decision,
-- new_request / visit_scheduled = not visited yet.
--
-- The PID, first source that has one:
--   pulse  — the request is linked to a Pulse property (exploratory_links)
--   stage  — Stage has a PID for the same building (stage_dates names)
--   name   — a live Pulse property has the same building name (names come
--            from the Holy Grail sheet)
-- Building matches apply to accepted requests only, ignore near-empty
-- building keys, and must agree on bedrooms when both sides give them.
-- inspected = that PID has an inspection in Pulse.
--
-- Window: a request counts in [p_from, p_to] by its visit date, else the
-- date it was raised. Nulls mean no bound.

create or replace function public.explore_ledger(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare out jsonb;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;

  -- candidate PIDs by building: keys under 6 letters ("a", "pid", "hsr") say
  -- nothing about the building, so they never match
  with pk as materialized (
    select p.pid, p.name, exploratory_building_key(p.name) k, substring(p.name from '(\d)\s*BHK')::int beds
      from properties p where p.deleted_at is null and length(exploratory_building_key(p.name)) >= 6
  ),
  sk as materialized (
    select sd.pid, min(sd.name) name, exploratory_building_key(min(sd.name)) k, substring(min(sd.name) from '(\d)\s*BHK')::int beds
      from stage_dates sd group by sd.pid having length(exploratory_building_key(min(sd.name))) >= 6
  ),
  x as (
    select e.*, exploratory_building_key(e.property_name) bk,
           a.assignee, l.pid linked,
           (select lg from exploratory_logs lg where lg.request_id = e.id and lg.submitted_at is not null order by lg.submitted_at desc limit 1) lg,
           (select min(nullif(v->>'date', '')::date) from jsonb_array_elements(e.visits) v) stage_visit
      from stage_exploratory e
      left join exploratory_assignments a on a.request_id = e.id
      left join exploratory_links l on l.request_id = e.id
     where e.archived_at is null and coalesce(e.property_name, '') !~* '^\s*\[test\]'
  ),
  -- a building match only counts for an accepted request, and only when the
  -- bedroom count agrees where both sides say it (a 4B4B isn't the 3BHK unit)
  m as (
    select x.*, substring(x.configuration from '^(\d)')::int req_beds,
           x.status in ('approved', 'converted') and x.bk is not null and length(x.bk) >= 6 can_match
      from x
  ),
  y as (
    select m.*,
           coalesce(m.stage_visit, (m.lg).visited_at::date) visited_on,
           coalesce(m.linked,
             case when m.can_match then (select min(sk.pid) from sk where (sk.k like m.bk || '%' or m.bk like sk.k || '%') and (sk.beds is null or m.req_beds is null or sk.beds = m.req_beds)) end,
             case when m.can_match then (select min(pk.pid) from pk where (pk.k like m.bk || '%' or m.bk like pk.k || '%') and (pk.beds is null or m.req_beds is null or pk.beds = m.req_beds)) end) pid,
           case when m.linked is not null then 'pulse'
                when m.can_match and exists (select 1 from sk where (sk.k like m.bk || '%' or m.bk like sk.k || '%') and (sk.beds is null or m.req_beds is null or sk.beds = m.req_beds)) then 'stage'
                when m.can_match and exists (select 1 from pk where (pk.k like m.bk || '%' or m.bk like pk.k || '%') and (pk.beds is null or m.req_beds is null or pk.beds = m.req_beds)) then 'name'
           end pid_source
      from m
  ),
  z as (
    select y.*, coalesce(y.visited_on, y.visit_date, y.created_at::date) on_date
      from y
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', z.id, 'name', z.property_name, 'configuration', z.configuration, 'address', z.address, 'property_type', z.property_type,
           'raised_at', z.created_at, 'visit_date', coalesce(z.visited_on, z.visit_date), 'visited', z.visited_on is not null
              or z.status in ('inspection_done', 'under_review', 'approved', 'rejected', 'converted'),
           'visitor', lower(coalesce(z.assignee, (z.lg).author, z.stage_inspector)),
           'verdict', coalesce((z.lg).verdict,
              (select case when v->>'outcome' ~* 'accept' then 'go' when v->>'outcome' ~* 'reject' then 'no_go' end
                 from jsonb_array_elements(z.visits) v where v->>'outcome' is not null order by v->>'date' desc limit 1)),
           'status', z.status,
           'outcome', case when z.status in ('approved', 'converted') then 'accepted' when z.status = 'rejected' then 'rejected'
                           when z.status in ('inspection_done', 'under_review') then 'deciding' else 'not_visited' end,
           'decided_at', case when z.status in ('approved', 'converted', 'rejected') then z.stage_updated_at end,
           'pid', z.pid, 'pid_source', z.pid_source,
           'pid_name', (select p.name from properties p where p.pid = z.pid and p.deleted_at is null),
           'inspected', exists (select 1 from inspections i where i.pid = z.pid),
           'on_date', z.on_date
         ) order by z.on_date desc nulls last), '[]'::jsonb)
    into out
    from z
   where (p_from is null or z.on_date >= p_from) and (p_to is null or z.on_date <= p_to);
  return out;
end $$;

revoke all on function public.explore_ledger(date, date) from public, anon;
grant execute on function public.explore_ledger(date, date) to authenticated;
