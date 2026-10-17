-- Exploratory pipeline: supply's exploratory requests from Flent-Stage, in Pulse.
--
-- Supply raises a property for an exploratory visit in Stage (details,
-- landlord, a visit slot); after the visit the findings and the decision
-- (approve / reject) are recorded there too. Pulse mirrors all of it
-- (scripts/stage-sync.py, read-only on Stage) and adds what setup ops needs:
--
--   stage_exploratory          mirror of Stage's requests, each with its visits
--   exploratory_assignments    who from setup ops does the visit — assigned in
--                              Pulse by an admin; Stage's own "assigned
--                              inspector" is shown beside it
--   exploratory_links          request → the Pulse property it became
--
--   exploratory_list(p_tab)    the inbox / approved / rejected / all, with the
--                              assignee's other commitments that day, and
--                              "seen before" (same building or landlord phone
--                              on an earlier request) with reason tags
--   exploratory_assign(id, email) · exploratory_link(id, pid) · exploratory_unlink(id)
--   exploratory_for_property(pid)  the linked request (the head start), or
--                                  likely matches when none is linked
--   stage_exploratory_ingest(jsonb) CLI only; replaces the mirror and raises
--                              alerts for new unassigned requests
-- Staff only. Landlord contact details stay staff-side.

begin;

create table if not exists public.stage_exploratory (
  id            uuid primary key,             -- Stage's request id
  property_name text,
  address       text,
  maps_link     text,
  property_type text,
  configuration text,
  furnishing    text,
  owner_name    text,
  owner_phone   text,
  owner_email   text,
  status        text,                         -- new_request · visit_scheduled · inspection_done · under_review · approved · rejected · converted
  notes         text,
  visit_date    date,
  visit_time    time,
  visit_time_end time,
  reschedule_reason text,
  ppid_no       text,
  requester     text,
  stage_inspector text,                       -- email of Stage's assigned inspector
  created_at    timestamptz,
  archived_at   timestamptz,
  visits        jsonb not null default '[]',  -- [{date, time, outcome, notes, observations, capex, report_url, attachments, non_retain}]
  synced_at     timestamptz not null default now()
);
create index if not exists stage_exploratory_visit_idx on public.stage_exploratory (visit_date);

create table if not exists public.exploratory_assignments (
  request_id  uuid primary key,
  assignee    text not null,
  assigned_by text not null,
  assigned_at timestamptz not null default now()
);
create table if not exists public.exploratory_links (
  request_id uuid primary key,
  pid        text not null,
  linked_by  text not null,
  linked_at  timestamptz not null default now()
);
create unique index if not exists exploratory_links_pid_idx on public.exploratory_links (pid);

alter table public.stage_exploratory enable row level security;
alter table public.exploratory_assignments enable row level security;
alter table public.exploratory_links enable row level security;
revoke all on public.stage_exploratory, public.exploratory_assignments, public.exploratory_links from public, anon, authenticated;

-- "Sharieff Regalia, Bellandur 3BHK" → "sharieffregalia": the building, for "seen before"
create or replace function public.exploratory_building_key(p text)
returns text language sql immutable as $$
  select nullif(regexp_replace(lower(regexp_replace(split_part(coalesce(p, ''), ',', 1),
           '\m(\d\s*bhk|\d\s*b\s*\d\s*b|bhk|apartments?|apts?|residency|independent|house|villa|duplex|flat|floor|\d+(st|nd|rd|th)?)\M', '', 'gi')),
           '[^a-z]', '', 'g'), '')
$$;
create or replace function public.phone_key(p text)
returns text language sql immutable as $$ select nullif(right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10), '') $$;

-- Why it was turned down, from the findings text. Rough tags for counting;
-- the full findings are always shown next to them.
create or replace function public.exploratory_reason_tags(p text)
returns text[] language sql immutable as $$
  select array_remove(array[
    case when p ~* 'seepage|leak|damp|moist|water (falling|entering)' then 'Seepage / water' end,
    case when p ~* 'furniture|wardrobe|laminat|sofa|bed\M' then 'Furniture' end,
    case when p ~* 'light|ventilat|dark|window' then 'Light & ventilation' end,
    case when p ~* 'crack|structur|ceiling|plaster|wall' then 'Walls & structure' end,
    case when p ~* 'bathroom|plumb|tap|drain|toilet' then 'Bathrooms & plumbing' end,
    case when p ~* 'wiring|electric|switch' then 'Electrical' end,
    case when p ~* 'capex|expens|cost|budget|lakh|\ml\M' then 'High capex' end,
    case when p ~* 'landlord|owner|rent|terms|negotiat|agree' then 'Landlord / terms' end,
    case when p ~* 'location|access|road|parking|lift|stairs' then 'Location & access' end,
    case when p ~* 'kitchen|chimney|fridge|appliance' then 'Kitchen & appliances' end
  ], null)
$$;

-- ── load from Stage (CLI only) ────────────────────────────────────────────
create or replace function public.stage_exploratory_ingest(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare n int; fresh int;
begin
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'p_rows must be a JSON array'; end if;
  create temp table _old on commit drop as select id from stage_exploratory;
  delete from stage_exploratory;
  insert into stage_exploratory (id, property_name, address, maps_link, property_type, configuration, furnishing, owner_name, owner_phone,
                                 owner_email, status, notes, visit_date, visit_time, visit_time_end, reschedule_reason, ppid_no, requester,
                                 stage_inspector, created_at, archived_at, visits, synced_at)
  select (r->>'id')::uuid, r->>'property_name', r->>'address', r->>'maps_link', r->>'property_type', r->>'configuration', r->>'furnishing_status',
         r->>'owner_name', r->>'owner_phone', r->>'owner_email', r->>'status', r->>'notes',
         nullif(r->>'visit_date', '')::date, nullif(r->>'visit_time', '')::time, nullif(r->>'visit_time_end', '')::time,
         r->>'last_reschedule_reason', nullif(btrim(r->>'ppid_no'), ''), coalesce(r->>'requester_name', r->>'raised_by'),
         lower(r->>'inspector_email'), (r->>'created_at')::timestamptz, nullif(r->>'archived_at', '')::timestamptz,
         coalesce(r->'visits', '[]'), now()
    from jsonb_array_elements(p_rows) r;
  get diagnostics n = row_count;

  -- a new request nobody in setup ops has been given yet: tell the admins
  insert into notifications (user_email, kind, pid, title, body, route, dedupe_key)
  select a, 'exploratory_new', null,
         'New exploratory: ' || coalesce(e.property_name, 'property') || coalesce(' · ' || e.configuration, ''),
         coalesce('Visit ' || to_char(e.visit_date, 'Dy DD Mon') || coalesce(' ' || to_char(e.visit_time, 'HH12:MI am'), ''), 'No visit slot yet')
           || ' · assign someone from the team',
         '/pipeline?r=' || e.id, 'exploratory_new:' || e.id
    from stage_exploratory e cross join unnest(pulse_admins()) a
   where e.status in ('new_request', 'visit_scheduled') and e.archived_at is null
     and e.property_name !~* '^\s*\[test\]'
     -- only live ones: a visit today or later, or raised in the last two days
     and (e.visit_date >= current_date or e.created_at > now() - interval '2 days')
     and not exists (select 1 from exploratory_assignments x where x.request_id = e.id)
     and not exists (select 1 from notifications nn where nn.dedupe_key = 'exploratory_new:' || e.id and nn.user_email = a);
  get diagnostics fresh = row_count;

  insert into stage_sync_runs (rows_in, note) values (n, 'exploratory');
  return jsonb_build_object('requests', n, 'alerts', fresh);
end
$$;
revoke all on function public.stage_exploratory_ingest(jsonb) from public, anon, authenticated;

-- ── the list ──────────────────────────────────────────────────────────────
create or replace function public.exploratory_list(p_tab text default 'inbox')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare out jsonb;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;

  with e as (
    select x.*, a.assignee, a.assigned_by, a.assigned_at, l.pid linked_pid,
           exploratory_building_key(x.property_name) bkey, phone_key(x.owner_phone) pkey,
           (select v from jsonb_array_elements(x.visits) v order by (v->>'date') desc nulls last, (v->>'created_at') desc nulls last limit 1) last_visit
      from stage_exploratory x
      left join exploratory_assignments a on a.request_id = x.id
      left join exploratory_links l on l.request_id = x.id
     where x.archived_at is null and coalesce(x.property_name, '') !~* '^\s*\[test\]'
  ),
  pick as (
    select * from e where case p_tab
      when 'inbox'    then status in ('new_request', 'visit_scheduled', 'inspection_done', 'under_review')
      when 'approved' then status in ('approved', 'converted')
      when 'rejected' then status = 'rejected'
      else true end
  )
  select jsonb_build_object(
    'synced_at', (select max(synced_at) from stage_exploratory),
    'counts', (select jsonb_build_object(
        'inbox', count(*) filter (where status in ('new_request', 'visit_scheduled', 'inspection_done', 'under_review')),
        'unassigned', count(*) filter (where status in ('new_request', 'visit_scheduled') and assignee is null),
        'approved', count(*) filter (where status in ('approved', 'converted')),
        'unlinked', count(*) filter (where status in ('approved', 'converted') and linked_pid is null),
        'rejected', count(*) filter (where status = 'rejected'),
        'all', count(*)) from e),
    'reasons', (select coalesce(jsonb_agg(jsonb_build_object('tag', t, 'n', c) order by c desc), '[]') from (
        select t, count(*) c from e cross join unnest(exploratory_reason_tags(
          coalesce(e.last_visit->>'observations', '') || ' ' || coalesce(e.last_visit->>'notes', '') || ' ' || coalesce(e.notes, ''))) t
         where e.status = 'rejected' group by t) z),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.property_name, 'address', p.address, 'maps_link', p.maps_link, 'type', p.property_type,
        'config', p.configuration, 'furnishing', p.furnishing, 'status', p.status, 'notes', p.notes,
        'owner_name', p.owner_name, 'owner_phone', p.owner_phone, 'owner_email', p.owner_email,
        'visit_date', p.visit_date, 'visit_time', p.visit_time, 'visit_time_end', p.visit_time_end, 'reschedule_reason', p.reschedule_reason,
        'requester', p.requester, 'created_at', p.created_at,
        -- still "new" or "scheduled" in Stage although the visit date has passed
        'stale', p.status in ('new_request', 'visit_scheduled') and p.visit_date < current_date,
        'stage_inspector', p.stage_inspector, 'assignee', p.assignee, 'assigned_by', p.assigned_by, 'assigned_at', p.assigned_at,
        'linked_pid', p.linked_pid, 'visits', p.visits, 'last_visit', p.last_visit,
        'tags', exploratory_reason_tags(coalesce(p.last_visit->>'observations', '') || ' ' || coalesce(p.last_visit->>'notes', '') || ' ' || coalesce(p.notes, '')),
        -- earlier requests for the same building or the same landlord phone
        'seen_before', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'name', o.property_name, 'status', o.status,
                                    'date', coalesce(o.visit_date, o.created_at::date), 'why', case when o.bkey = p.bkey then 'same building' else 'same landlord' end,
                                    'tags', exploratory_reason_tags(coalesce(o.last_visit->>'observations', '') || ' ' || coalesce(o.last_visit->>'notes', '')))
                                    order by o.created_at desc), '[]')
                          from e o where o.id <> p.id and o.created_at < p.created_at
                            and ((p.bkey is not null and o.bkey = p.bkey) or (p.pkey is not null and o.pkey = p.pkey))),
        -- what the assignee already has that day: other visits and setups
        'day_load', case when p.visit_date is not null then (
            select coalesce(jsonb_agg(jsonb_build_object('who', w.who, 'what', w.what, 'at', w.at)), '[]') from (
              select coalesce(o.assignee, o.stage_inspector) who, 'Exploratory · ' || o.property_name what, to_char(o.visit_time, 'HH12:MI am') at
                from e o where o.id <> p.id and o.visit_date = p.visit_date and coalesce(o.assignee, o.stage_inspector) is not null
                 and o.status in ('new_request', 'visit_scheduled')
              union all
              select lower(coalesce(nullif(btrim(pr.assigned_to), ''), pr.owner_email)), 'Setup · ' || pr.pid || ' ' || coalesce(pr.name, ''), null
                from properties pr where pr.deleted_at is null and pr.setup_date = p.visit_date
              union all
              select lower(coalesce(nullif(btrim(pr.assigned_to), ''), pr.owner_email)), 'Handover · ' || pr.pid || ' ' || coalesce(pr.name, ''), null
                from properties pr where pr.deleted_at is null and pr.handover_date = p.visit_date and pr.handover_done_at is null
            ) w where w.who is not null) end
      ) order by
        case p.status when 'new_request' then 0 when 'visit_scheduled' then 1 when 'inspection_done' then 2 when 'under_review' then 3 else 4 end,
        case when p_tab = 'inbox' then p.visit_date end asc nulls last,
        p.created_at desc) from pick p), '[]')
  ) into out;
  return out;
end
$$;

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
  if who is null then delete from exploratory_assignments where request_id = p_id; return; end if;
  insert into exploratory_assignments (request_id, assignee, assigned_by, assigned_at) values (p_id, who, me, now())
  on conflict (request_id) do update set assignee = excluded.assignee, assigned_by = excluded.assigned_by, assigned_at = now();
  -- tell the person
  if who <> me then
    insert into notifications (user_email, kind, pid, title, body, route, dedupe_key)
    values (who, 'exploratory_assigned', null, 'Exploratory visit: ' || coalesce(e.property_name, 'property'),
            coalesce(to_char(e.visit_date, 'Dy DD Mon') || coalesce(' · ' || to_char(e.visit_time, 'HH12:MI am'), ''), 'slot to be confirmed')
              || ' · assigned by ' || split_part(me, '@', 1),
            '/pipeline?r=' || p_id, 'exploratory_assigned:' || p_id || ':' || who);
  end if;
  -- the admin's "new request" alert is done with
  update notifications set read_at = coalesce(read_at, now()) where dedupe_key = 'exploratory_new:' || p_id;
end
$$;

create or replace function public.exploratory_link(p_id uuid, p_pid text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare me text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from stage_exploratory where id = p_id) then raise exception 'No such request'; end if;
  if not exists (select 1 from properties where pid = p_pid and deleted_at is null) then raise exception 'No such property'; end if;
  if exists (select 1 from exploratory_links where pid = p_pid and request_id <> p_id) then raise exception 'That property is already linked to another exploratory'; end if;
  insert into exploratory_links (request_id, pid, linked_by) values (p_id, p_pid, me)
  on conflict (request_id) do update set pid = excluded.pid, linked_by = excluded.linked_by, linked_at = now();
  insert into property_journey (pid, stage, changed_by, notes)
  select p_pid, 'exploratory_linked', me, 'from exploratory · ' || coalesce(property_name, '') || coalesce(' · visited ' || to_char(visit_date, 'DD Mon YYYY'), '')
    from stage_exploratory where id = p_id;
end
$$;

create or replace function public.exploratory_unlink(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$ delete from exploratory_links where request_id = p_id and auth.uid() is not null $$;

-- The head start on a property: its exploratory (findings, capex, landlord,
-- who visited) — or, when none is linked yet, approved requests that look like it.
create or replace function public.exploratory_for_property(p_pid text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare p properties%rowtype; out jsonb;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into p from properties where pid = p_pid and deleted_at is null;
  if not found then return null; end if;
  select jsonb_build_object('linked', true, 'request', to_jsonb(x) || jsonb_build_object('assignee', a.assignee,
           'last_visit', (select v from jsonb_array_elements(x.visits) v order by (v->>'date') desc nulls last limit 1)))
    into out
    from exploratory_links l join stage_exploratory x on x.id = l.request_id
    left join exploratory_assignments a on a.request_id = x.id
   where l.pid = p_pid;
  if out is not null then return out; end if;
  return jsonb_build_object('linked', false, 'suggestions', coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.property_name, 'config', x.configuration, 'status', x.status,
                                        'visit_date', x.visit_date, 'who', coalesce(a.assignee, x.stage_inspector)) order by x.visit_date desc nulls last)
      from stage_exploratory x left join exploratory_assignments a on a.request_id = x.id
     where x.status in ('approved', 'converted')
       and not exists (select 1 from exploratory_links l where l.request_id = x.id)
       and exploratory_building_key(x.property_name) is not null
       and (exploratory_building_key(p.name) like exploratory_building_key(x.property_name) || '%'
         or exploratory_building_key(x.property_name) like exploratory_building_key(p.name) || '%')), '[]'));
end
$$;

revoke all on function public.exploratory_list(text) from public, anon;
revoke all on function public.exploratory_assign(uuid, text) from public, anon;
revoke all on function public.exploratory_link(uuid, text) from public, anon;
revoke all on function public.exploratory_unlink(uuid) from public, anon;
revoke all on function public.exploratory_for_property(text) from public, anon;
grant execute on function public.exploratory_list(text) to authenticated;
grant execute on function public.exploratory_assign(uuid, text) to authenticated;
grant execute on function public.exploratory_link(uuid, text) to authenticated;
grant execute on function public.exploratory_unlink(uuid) to authenticated;
grant execute on function public.exploratory_for_property(text) to authenticated;

commit;
