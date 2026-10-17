-- Explore: the journey starts at the first visit.
--
-- An exploratory request supply raises in Flent-Stage is a prospect in Pulse:
-- the same kind of row as a property in the journey engine, so its steps land
-- in Needs me, next moves, the bell, the Team view and a record page. When the
-- PID is created the prospect is linked and the property carries on.
--
-- Pulse reads everything from Stage and writes back exactly one thing: who is
-- going (exploratory_requests.assigned_inspector_id), pushed by
-- scripts/stage-sync.py. Findings are logged in Pulse and pasted into Stage by
-- hand for now; Pulse notices them arriving there and ticks "in Stage".
--
--   explore_journey_state()        prospect rows, same shape as property_journey_state
--   exploratory_record(id)         everything the record page shows
--   exploratory_assign / _respond / _resolve_conflict / _log_save / _link
--   exploratory_assignments_pending / _mark_written   CLI only (the sync)
--   stage_exploratory_ingest       re-defined: Stage's updated_at, conflicts,
--                                  "in Stage" detection, routes to the record
--   setup_calendar                 re-defined: tray of properties needing a
--                                  setup date (with Stage's plan), visits with
--                                  their state, clashes you have settled hidden
-- Apply after exploratory.sql and setup_calendar.sql.

begin;

-- ── tables ────────────────────────────────────────────────────────────────
alter table public.stage_exploratory add column if not exists stage_updated_at timestamptz;

alter table public.exploratory_assignments alter column assignee drop not null;
alter table public.exploratory_assignments
  add column if not exists confirmed_at           timestamptz,
  add column if not exists declined_by            text,
  add column if not exists declined_at            timestamptz,
  add column if not exists decline_reason         text,
  add column if not exists stage_written_assignee text,        -- what Pulse last wrote to Stage ('' = cleared)
  add column if not exists stage_written_at       timestamptz,
  add column if not exists stage_conflict         text,        -- Stage was changed to this person after Pulse wrote
  add column if not exists stage_write_error      text;

create table if not exists public.exploratory_logs (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null,
  author        text not null,
  visited_at    timestamptz,
  verdict       text check (verdict in ('go', 'no_go', 'unsure')),
  checks        jsonb not null default '[]',   -- [{key, label, rating: ok|fix|poor, note, photos: [url]}]
  capex_band    text,
  landlord_note text,
  retain        jsonb not null default '[]',   -- [{item, keep: bool, note}]
  notes         text,
  submitted_at  timestamptz,
  in_stage_at   timestamptz,                   -- the sync saw the findings in Stage
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists exploratory_logs_one_draft on public.exploratory_logs (request_id, author) where submitted_at is null;
create index if not exists exploratory_logs_req on public.exploratory_logs (request_id);
alter table public.exploratory_logs enable row level security;
revoke all on public.exploratory_logs from public, anon, authenticated;

create table if not exists public.setup_clash_acks (
  pid        text not null,
  stage_date date not null,
  kept_by    text not null,
  kept_at    timestamptz not null default now(),
  primary key (pid, stage_date)
);
alter table public.setup_clash_acks enable row level security;
revoke all on public.setup_clash_acks from public, anon, authenticated;

-- ── helpers ───────────────────────────────────────────────────────────────
create or replace function public.explore_slot_text(d date, t time)
returns text language sql immutable as $$
  select case when d is null then 'no slot yet'
              else to_char(d, 'Dy DD Mon') || coalesce(', ' || ltrim(to_char(t, 'HH12:MI am'), '0'), '') end
$$;

-- ── load from Stage (CLI only) — re-defined ──────────────────────────────
create or replace function public.stage_exploratory_ingest(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare n int; fresh int; conflicts int; pasted int;
begin
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'p_rows must be a JSON array'; end if;
  delete from stage_exploratory;
  insert into stage_exploratory (id, property_name, address, maps_link, property_type, configuration, furnishing, owner_name, owner_phone,
                                 owner_email, status, notes, visit_date, visit_time, visit_time_end, reschedule_reason, ppid_no, requester,
                                 stage_inspector, created_at, archived_at, visits, stage_updated_at, synced_at)
  select (r->>'id')::uuid, r->>'property_name', r->>'address', r->>'maps_link', r->>'property_type', r->>'configuration', r->>'furnishing_status',
         r->>'owner_name', r->>'owner_phone', r->>'owner_email', r->>'status', r->>'notes',
         nullif(r->>'visit_date', '')::date, nullif(r->>'visit_time', '')::time, nullif(r->>'visit_time_end', '')::time,
         r->>'last_reschedule_reason', nullif(btrim(r->>'ppid_no'), ''), coalesce(r->>'requester_name', r->>'raised_by'),
         lower(r->>'inspector_email'), (r->>'created_at')::timestamptz, nullif(r->>'archived_at', '')::timestamptz,
         coalesce(r->'visits', '[]'), nullif(r->>'updated_at', '')::timestamptz, now()
    from jsonb_array_elements(p_rows) r;
  get diagnostics n = row_count;

  -- Someone in Stage changed who is going after Pulse wrote it: flag, never overwrite.
  update exploratory_assignments a
     set stage_conflict = x.stage_inspector
    from stage_exploratory x
   where x.id = a.request_id and a.stage_written_at is not null and a.stage_conflict is null
     and coalesce(x.stage_inspector, '') <> coalesce(a.stage_written_assignee, '')
     and coalesce(x.stage_inspector, '') <> coalesce(a.assignee, '');
  get diagnostics conflicts = row_count;

  -- Findings logged in Pulse have shown up in Stage (a visit recorded there since).
  update exploratory_logs l
     set in_stage_at = now()
    from stage_exploratory x
   where x.id = l.request_id and l.submitted_at is not null and l.in_stage_at is null
     and exists (select 1 from jsonb_array_elements(x.visits) v
                  where nullif(v->>'created_at', '')::timestamptz >= l.submitted_at - interval '12 hours');
  get diagnostics pasted = row_count;

  -- a new request nobody in setup ops has been given yet: tell the admins
  insert into notifications (user_email, kind, pid, title, body, route, dedupe_key)
  select a, 'exploratory_new', null,
         'New exploratory: ' || coalesce(e.property_name, 'property') || coalesce(' · ' || e.configuration, ''),
         explore_slot_text(e.visit_date, e.visit_time) || ' · assign someone from the team',
         '/explore/' || e.id, 'exploratory_new:' || e.id
    from stage_exploratory e cross join unnest(pulse_admins()) a
   where e.status in ('new_request', 'visit_scheduled') and e.archived_at is null
     and e.property_name !~* '^\s*\[test\]'
     and (e.visit_date >= current_date or e.created_at > now() - interval '2 days')
     and coalesce((select x.assignee from exploratory_assignments x where x.request_id = e.id), e.stage_inspector) is null
     and not exists (select 1 from notifications nn where nn.dedupe_key = 'exploratory_new:' || e.id and nn.user_email = a);
  get diagnostics fresh = row_count;

  -- the evening before a visit, remind whoever is going (from 5 pm IST)
  insert into notifications (user_email, kind, pid, title, body, route, dedupe_key)
  select w.who, 'exploratory_tomorrow', null, 'Tomorrow: ' || coalesce(w.property_name, 'exploratory visit') || coalesce(' · ' || ltrim(to_char(w.visit_time, 'HH12:MI am'), '0'), ''),
         concat_ws(' · ', nullif(split_part(coalesce(w.address, ''), E'\n', 1), ''), case when w.owner_name is not null then 'landlord ' || w.owner_name end,
                   case when w.notes is not null then 'supply asks: ' || left(w.notes, 80) end),
         '/explore/' || w.id, 'exploratory_tomorrow:' || w.id || ':' || w.visit_date
    from (select x.*, lower(coalesce(a.assignee, case when a.request_id is null or a.stage_written_at is null then x.stage_inspector end)) who
            from stage_exploratory x left join exploratory_assignments a on a.request_id = x.id) w
   where w.who is not null and w.status in ('new_request', 'visit_scheduled') and w.archived_at is null
     and w.visit_date = (now() at time zone 'Asia/Kolkata')::date + 1
     and (now() at time zone 'Asia/Kolkata')::time >= time '17:00'
     and not exists (select 1 from notifications nn where nn.dedupe_key = 'exploratory_tomorrow:' || w.id || ':' || w.visit_date);

  insert into stage_sync_runs (rows_in, note) values (n, 'exploratory');
  return jsonb_build_object('requests', n, 'alerts', fresh, 'conflicts', conflicts, 'pasted', pasted, 'linked', exploratory_autolink());
end
$$;
revoke all on function public.stage_exploratory_ingest(jsonb) from public, anon, authenticated;

-- What the sync should write to Stage: assignments whose Stage copy is behind.
create or replace function public.exploratory_assignments_pending()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', a.request_id, 'email', a.assignee)), '[]')
    from exploratory_assignments a join stage_exploratory x on x.id = a.request_id
   where a.stage_conflict is null
     and coalesce(a.stage_written_assignee, '-') is distinct from coalesce(a.assignee, '')
$$;
create or replace function public.exploratory_assignments_mark_written(p jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update exploratory_assignments a
     set stage_written_assignee = coalesce(r->>'email', ''), stage_written_at = now(), stage_write_error = nullif(r->>'error', '')
    from jsonb_array_elements(p) r
   where a.request_id = (r->>'id')::uuid and nullif(r->>'error', '') is null;
  get diagnostics n = row_count;
  update exploratory_assignments a set stage_write_error = r->>'error'
    from jsonb_array_elements(p) r where a.request_id = (r->>'id')::uuid and nullif(r->>'error', '') is not null;
  return n;
end
$$;
revoke all on function public.exploratory_assignments_pending() from public, anon, authenticated;
revoke all on function public.exploratory_assignments_mark_written(jsonb) from public, anon, authenticated;


-- Approved requests whose property already exists in Pulse: link them when
-- exactly one property matches the building (and it was created around or
-- after the request). Several matches are left for a person to pick.
create or replace function public.exploratory_autolink()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  with pk as (
    select p.pid, p.created_at, exploratory_building_key(p.name) k from properties p
     where p.deleted_at is null and not exists (select 1 from exploratory_links k where k.pid = p.pid)
  ),
  xk as (
    select x.id, x.created_at, exploratory_building_key(x.property_name) bk from stage_exploratory x
     where x.status in ('approved', 'converted') and not exists (select 1 from exploratory_links k where k.request_id = x.id)
  ),
  sk as (select distinct sd.pid, exploratory_building_key(sd.name) k from stage_dates sd),
  cand as (
    select x.id, min(pk.pid) pid, count(*) c
      from xk x join pk on x.bk is not null and pk.k is not null and (pk.k like x.bk || '%' or x.bk like pk.k || '%')
       and pk.created_at >= x.created_at - interval '14 days'
     group by x.id
  ), viastage as (   -- Stage gave the building a PID that Pulse has
    select x.id, min(sk.pid) pid, count(distinct sk.pid) c
      from xk x join sk on x.bk is not null and sk.k is not null and (sk.k like x.bk || '%' or x.bk like sk.k || '%')
      join pk on pk.pid = sk.pid
     group by x.id
  ), one as (select * from cand where c = 1 union select * from viastage where c = 1 and id not in (select id from cand))
  insert into exploratory_links (request_id, pid, linked_by)
  select id, pid, 'auto' from one o
   where not exists (select 1 from one o2 where o2.pid = o.pid and o2.id <> o.id)   -- two requests, one property: leave it
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end
$$;
revoke all on function public.exploratory_autolink() from public, anon, authenticated;

-- ── actions ───────────────────────────────────────────────────────────────
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
         confirmed_at = null, stage_conflict = null,
         declined_by = case when excluded.assignee is null then exploratory_assignments.declined_by end,
         declined_at = case when excluded.assignee is null then exploratory_assignments.declined_at end,
         decline_reason = case when excluded.assignee is null then exploratory_assignments.decline_reason end;
  if who is not null and who <> me then
    insert into notifications (user_email, kind, pid, title, body, route, dedupe_key)
    values (who, 'exploratory_assigned', null, 'Exploratory visit: ' || coalesce(e.property_name, 'property'),
            explore_slot_text(e.visit_date, e.visit_time) || ' · assigned by ' || split_part(me, '@', 1) || ' · confirm you can go',
            '/explore/' || p_id, 'exploratory_assigned:' || p_id || ':' || who || ':' || extract(epoch from now())::bigint)
    on conflict do nothing;
  end if;
  update notifications set read_at = coalesce(read_at, now())
   where dedupe_key in ('exploratory_new:' || p_id) or dedupe_key like 'exploratory_declined:' || p_id || '%';
end
$$;

-- The assignee confirms, or says they can't go (back to the admins, with why).
create or replace function public.exploratory_respond(p_id uuid, p_ok boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare me text := lower(coalesce(auth.jwt() ->> 'email', '')); a exploratory_assignments%rowtype; e stage_exploratory%rowtype;
begin
  select * into a from exploratory_assignments where request_id = p_id;
  if not found or a.assignee is distinct from me then raise exception 'This visit is not assigned to you'; end if;
  select * into e from stage_exploratory where id = p_id;
  if p_ok then
    update exploratory_assignments set confirmed_at = now() where request_id = p_id;
  else
    if nullif(btrim(p_reason), '') is null then raise exception 'Say why you can''t go'; end if;
    update exploratory_assignments
       set assignee = null, confirmed_at = null, declined_by = me, declined_at = now(), decline_reason = btrim(p_reason)
     where request_id = p_id;
    insert into notifications (user_email, kind, pid, title, body, route, dedupe_key)
    select ad, 'exploratory_declined', null, split_part(me, '@', 1) || ' can''t make ' || coalesce(e.property_name, 'the visit'),
           explore_slot_text(e.visit_date, e.visit_time) || ' · “' || btrim(p_reason) || '” · assign someone else',
           '/explore/' || p_id, 'exploratory_declined:' || p_id || ':' || extract(epoch from now())::bigint
      from unnest(pulse_admins()) ad;
  end if;
end
$$;

-- Stage and Pulse disagree on who is going: pick one.
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
           stage_conflict = null, confirmed_at = null where request_id = p_id;
  else
    update exploratory_assignments set stage_conflict = null, stage_written_assignee = null where request_id = p_id;  -- re-push Pulse's
  end if;
end
$$;

-- Save the visit log (a draft as you go; p_submit sends it).
create or replace function public.exploratory_log_save(p_id uuid, p_log jsonb, p_submit boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare me text := lower(coalesce(auth.jwt() ->> 'email', '')); lid uuid; e stage_exploratory%rowtype; v text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into e from stage_exploratory where id = p_id;
  if not found then raise exception 'No such request'; end if;
  v := nullif(p_log->>'verdict', '');
  if p_submit and v is null then raise exception 'Pick a verdict: Go, No-go or Unsure'; end if;
  select id into lid from exploratory_logs where request_id = p_id and author = me and submitted_at is null;
  if lid is null then
    insert into exploratory_logs (request_id, author) values (p_id, me) returning id into lid;
  end if;
  update exploratory_logs set
    visited_at    = coalesce(nullif(p_log->>'visited_at', '')::timestamptz, visited_at, now()),
    verdict       = v,
    checks        = coalesce(p_log->'checks', checks),
    capex_band    = nullif(p_log->>'capex_band', ''),
    landlord_note = nullif(btrim(p_log->>'landlord_note'), ''),
    retain        = coalesce(p_log->'retain', retain),
    notes         = nullif(btrim(p_log->>'notes'), ''),
    submitted_at  = case when p_submit then now() else submitted_at end,
    updated_at    = now()
   where id = lid;
  if p_submit then
    insert into notifications (user_email, kind, pid, title, body, route, dedupe_key)
    select ad, 'exploratory_logged', null,
           split_part(me, '@', 1) || ' logged ' || coalesce(e.property_name, 'a visit') || ' — ' ||
             case v when 'go' then 'Go' when 'no_go' then 'No-go' else 'Unsure' end,
           coalesce(nullif(btrim(p_log->>'notes'), ''), 'findings in Pulse · to be pasted into Stage'),
           '/explore/' || p_id, 'exploratory_logged:' || lid
      from unnest(pulse_admins()) ad where ad <> me;
  end if;
  return jsonb_build_object('id', lid, 'submitted', p_submit);
end
$$;

-- Link to the Pulse property it became. p_pending: the PID is about to be
-- created (from "Create the PID"), so it need not exist yet.
create or replace function public.exploratory_link(p_id uuid, p_pid text, p_pending boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare me text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from stage_exploratory where id = p_id) then raise exception 'No such request'; end if;
  if not p_pending and not exists (select 1 from properties where pid = p_pid and deleted_at is null) then raise exception 'No such property'; end if;
  if exists (select 1 from exploratory_links where pid = p_pid and request_id <> p_id) then raise exception 'That property is already linked to another exploratory'; end if;
  insert into exploratory_links (request_id, pid, linked_by) values (p_id, p_pid, me)
  on conflict (request_id) do update set pid = excluded.pid, linked_by = excluded.linked_by, linked_at = now();
  insert into property_journey (pid, stage, changed_by, notes)
  select p_pid, 'exploratory_linked', me, 'from exploratory · ' || coalesce(property_name, '') || coalesce(' · visited ' || to_char(visit_date, 'DD Mon YYYY'), '')
    from stage_exploratory where id = p_id;
end
$$;
drop function if exists public.exploratory_link(uuid, text);

-- ── the prospects, as journey rows ────────────────────────────────────────
create or replace function public.explore_journey_state()
returns table (pid text, property_name text, owner_email text, stage_code text, stage_label text, blocked_on text,
               since timestamptz, age_days int, next_action_label text, next_action_route text, urgency text,
               open_threads jsonb, waiting_on text, setup_date date, days_to_setup int, enrichment_missing boolean,
               is_prospect boolean, request_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare today date := (now() at time zone 'Asia/Kolkata')::date; admin text := (pulse_admins())[1];
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  return query
  -- each name is cleaned once here, not once per request (that was 100k+ regex calls)
  with pk as materialized (
    select p.pid, exploratory_building_key(p.name) k from properties p
     where p.deleted_at is null and not exists (select 1 from exploratory_links k where k.pid = p.pid)
  ),
  sk as materialized (
    select sd.pid, exploratory_building_key(min(sd.name)) k from stage_dates sd
     where not exists (select 1 from properties p where p.pid = sd.pid and p.deleted_at is null)
     group by sd.pid
  ),
  xk as materialized (
    select x.*, exploratory_building_key(x.property_name) bk from stage_exploratory x
     where x.archived_at is null and coalesce(x.property_name, '') !~* '^\s*\[test\]'
       and not exists (select 1 from explore_cleared c where c.request_id = x.id)   -- cleared at the clean slate
  ),
  base as (
    select x.*, a.assignee, a.confirmed_at, a.declined_by, a.decline_reason, a.stage_conflict,
           coalesce(a.assignee, case when a.request_id is null or a.stage_written_at is null then x.stage_inspector end) as who,
           (a.assignee is not null) as pulse_assigned,
           l.pid as linked_pid,
           (select lg from exploratory_logs lg where lg.request_id = x.id and lg.submitted_at is not null order by lg.submitted_at desc limit 1) as log,
           (select max(nullif(v->>'created_at', '')::timestamptz) from jsonb_array_elements(x.visits) v) as stage_visit_at,
           (select count(*) from pk where x.bk is not null and pk.k is not null
               and (pk.k like x.bk || '%' or x.bk like pk.k || '%'))::int as matches,
           (select min(sk.pid) from sk where x.bk is not null and sk.k is not null
               and (sk.k like x.bk || '%' or x.bk like sk.k || '%')) as stage_pid
      from xk x
      left join exploratory_assignments a on a.request_id = x.id
      left join exploratory_links l on l.request_id = x.id
     where not (x.status in ('approved', 'converted') and l.pid is not null)    -- the property carries on from here
       -- approvals that old with no link were settled outside Pulse
       and not (x.status in ('approved', 'converted') and l.pid is null and coalesce(x.stage_updated_at, x.created_at) < now() - interval '45 days')
  ),
  st as (
    select b.*,
           ((b.log).id is not null or b.stage_visit_at is not null or b.status in ('inspection_done', 'under_review')) as logged,
           explore_slot_text(b.visit_date, b.visit_time) as slot
      from base b
  ),
  th as (   -- the one open step for each prospect, plus "paste into Stage" alongside
    select s.*,
      case
        when s.status = 'rejected' then 'explore_not_taken'
        when s.status in ('approved', 'converted') and s.matches > 0 then 'explore_link'
        when s.status in ('approved', 'converted') and s.stage_pid is not null then 'explore_create_pid'
        when s.status = 'converted' then 'explore_create_pid'
        when s.status = 'approved' then 'explore_deal'
        -- Stage's status is the verdict: only its "inspection done / under review" means supply is deciding
        when s.status in ('inspection_done', 'under_review') and coalesce(s.stage_updated_at, s.created_at) < now() - interval '30 days' then 'explore_stale'
        when s.status in ('inspection_done', 'under_review') then 'explore_decision'
        -- logged in Pulse, but Stage still shows the visit as booked: the findings need to go into Stage
        when (s.log).id is not null then 'explore_paste_main'
        -- the slot passed long ago, nothing logged, nobody in Pulse on it: Stage never closed it
        when s.visit_date < today - 3 and not s.pulse_assigned then 'explore_stale'
        when s.visit_date is null then 'explore_slot'
        when s.who is null then 'explore_assign'
        when s.pulse_assigned and s.confirmed_at is null and s.visit_date >= today then 'explore_confirm'
        when s.visit_date >= today then 'explore_visit'
        else 'explore_log'
      end as code
      from st s
  ),
  t2 as (
    select t.*,
      case t.code
        when 'explore_not_taken'  then 'Not taken'
        when 'explore_create_pid' then case when t.stage_pid is not null then 'Create PID ' || t.stage_pid || ' in Pulse — supply has it in Stage' else 'Converted — create the PID in Pulse' end
        when 'explore_deal'       then 'Approved — supply closing the deal with the landlord'
        when 'explore_link'       then 'Approved — link it to its PID'
        when 'explore_stale'      then case when t.status in ('inspection_done', 'under_review') then 'No decision in Stage for a month' else 'Visit date passed — still open in Stage' end
        when 'explore_paste_main' then 'Logged — paste the findings into Stage'
        when 'explore_decision'   then 'Waiting on supply’s decision'
        when 'explore_slot'       then 'Waiting on supply for a visit slot'
        when 'explore_assign'     then case when t.declined_by is not null then split_part(t.declined_by, '@', 1) || ' can’t go — assign someone else · ' else 'Assign someone for the visit · ' end || t.slot
        when 'explore_confirm'    then 'Confirm the visit · ' || t.slot
        when 'explore_visit'      then 'Visit · ' || t.slot
        else 'Log the findings'
      end as label,
      case when t.code in ('explore_decision', 'explore_slot', 'explore_stale', 'explore_deal') then 'supply' when t.code = 'explore_not_taken' then null else 'setup_ops' end as blk,
      case when t.code in ('explore_assign', 'explore_stale') then admin when t.code = 'explore_not_taken' then t.who else coalesce(t.who, admin) end as owner,
      case t.code
        when 'explore_decision'   then coalesce(t.stage_updated_at, t.stage_visit_at, (t.log).submitted_at)
        when 'explore_paste_main' then (t.log).submitted_at
        when 'explore_create_pid' then coalesce(t.stage_updated_at, t.created_at)
        when 'explore_link'       then coalesce(t.stage_updated_at, t.created_at)
        when 'explore_deal'       then coalesce(t.stage_updated_at, t.created_at)
        when 'explore_stale'      then t.visit_date::timestamptz
        when 'explore_log'        then t.visit_date::timestamptz
        else t.created_at end as since_at,
      case t.code
        when 'explore_decision'   then 3
        when 'explore_create_pid' then 2
        when 'explore_link'       then 2
        when 'explore_paste_main' then 1
        -- deal closing is supply's pace, not a threshold of ours: no limit
        when 'explore_slot'       then 2
        else null end as limit_days
      from th t
  ),
  t3 as (
    select t.*,
      greatest(0, (today - (t.since_at at time zone 'Asia/Kolkata')::date))::int as age,
      case
        when t.code = 'explore_not_taken' then 'done'
        when t.code in ('explore_assign', 'explore_confirm', 'explore_visit') then
          case when t.visit_date < today then 'overdue' when t.visit_date = today then 'today' when t.visit_date = today + 1 then 'soon' else 'waiting' end
        when t.code = 'explore_log' then 'overdue'
        when t.limit_days is not null and (today - (t.since_at at time zone 'Asia/Kolkata')::date) > t.limit_days then 'overdue'
        else 'waiting' end as urg
      from t2 t
  )
  select 'explore:' || t.id::text, coalesce(t.property_name, 'Unnamed prospect') || coalesce(' · ' || t.configuration, ''),
         t.owner, t.code, 'Explore · ' || t.label, t.blk, t.since_at, t.age,
         case t.code when 'explore_assign' then 'Assign' when 'explore_confirm' then 'Confirm' when 'explore_visit' then 'Open the visit'
                     when 'explore_log' then 'Log the findings' when 'explore_create_pid' then 'Create the PID' when 'explore_link' then 'Link the PID'
                     when 'explore_paste_main' then 'Copy for Stage'
                     when 'explore_decision' then 'Open' when 'explore_slot' then 'Open' else 'Open' end,
         case when t.code in ('explore_log', 'explore_paste_main') then '/explore/' || t.id || '/log'
              when t.code = 'explore_create_pid' then '/inspections/new?explore=' || t.id || coalesce('&pid=' || t.stage_pid, '')
              else '/explore/' || t.id end,
         t.urg,
         jsonb_build_array(jsonb_build_object(
           'code', t.code, 'stage_no', 0, 'label', t.label, 'blocked_on', t.blk, 'waiting_on', t.blk, 'since', t.since_at,
           'age_days', t.age, 'limit_days', t.limit_days,
           'overdue_by', case when t.urg = 'overdue' then greatest(1, case when t.code in ('explore_log', 'explore_assign', 'explore_confirm', 'explore_visit')
                                                                         then today - t.visit_date else t.age - coalesce(t.limit_days, 0) end) end,
           'next_action_label', case t.code when 'explore_assign' then 'Assign' when 'explore_log' then 'Log the findings' when 'explore_create_pid' then 'Create the PID' when 'explore_link' then 'Link the PID' when 'explore_paste_main' then 'Copy for Stage' else 'Open' end,
           'next_action_route', case when t.code in ('explore_log', 'explore_paste_main') then '/explore/' || t.id || '/log' else '/explore/' || t.id end,
           'note', case when t.stage_conflict is not null then 'Stage says ' || split_part(t.stage_conflict, '@', 1) || ' is going' end,
           'urgency', t.urg))
         || case when (t.log).id is not null and (t.log).in_stage_at is null and t.code in ('explore_decision', 'explore_create_pid', 'explore_link', 'explore_not_taken') then
              jsonb_build_array(jsonb_build_object('code', 'explore_paste', 'stage_no', 0, 'label', 'Paste the findings into Stage',
                'blocked_on', 'setup_ops', 'waiting_on', 'setup_ops', 'since', (t.log).submitted_at, 'age_days', t.age, 'urgency', 'soon',
                'next_action_label', 'Copy for Stage', 'next_action_route', '/explore/' || t.id || '/log'))
            else '[]'::jsonb end,
         t.blk, null::date, null::int, false, true, t.id
    from t3 t;
end
$$;

-- The head start on a property: its exploratory — who went, Stage's visit and
-- Pulse's own log (findings, capex). Works from the moment the PID is linked,
-- before the property row exists (the inspection is how it gets created).
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
  select jsonb_build_object('linked', true, 'request', to_jsonb(x) || jsonb_build_object(
           'assignee', a.assignee,
           'last_visit', (select v from jsonb_array_elements(x.visits) v order by (v->>'date') desc nulls last limit 1),
           'log', (select to_jsonb(lg) from exploratory_logs lg where lg.request_id = x.id and lg.submitted_at is not null order by lg.submitted_at desc limit 1)))
    into out
    from exploratory_links l join stage_exploratory x on x.id = l.request_id
    left join exploratory_assignments a on a.request_id = x.id
   where l.pid = p_pid;
  if out is not null then return out; end if;
  select * into p from properties where pid = p_pid and deleted_at is null;
  if not found then return null; end if;
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

-- ── one prospect, for its record page ─────────────────────────────────────
create or replace function public.exploratory_record(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare out jsonb; x stage_exploratory%rowtype; bkey text; pkey text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into x from stage_exploratory where id = p_id;
  if not found then return null; end if;
  bkey := exploratory_building_key(x.property_name); pkey := phone_key(x.owner_phone);
  select jsonb_build_object(
    'request', to_jsonb(x),
    'assignment', (select to_jsonb(a) from exploratory_assignments a where a.request_id = p_id),
    'linked_pid', (select pid from exploratory_links where request_id = p_id),
    'row', (select to_jsonb(r) from explore_journey_state() r where r.request_id = p_id),
    'logs', coalesce((select jsonb_agg(to_jsonb(l) order by coalesce(l.submitted_at, l.updated_at) desc) from exploratory_logs l where l.request_id = p_id), '[]'),
    'my_draft', (select to_jsonb(l) from exploratory_logs l where l.request_id = p_id and l.submitted_at is null and l.author = lower(auth.jwt() ->> 'email')),
    'is_admin', pulse_is_admin(),
    'me', lower(auth.jwt() ->> 'email'),
    'tags', exploratory_reason_tags(coalesce(x.visits->-1->>'observations', '') || ' ' || coalesce(x.visits->-1->>'notes', '')),
    'seen_before', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'name', o.property_name, 'status', o.status,
                       'date', coalesce(o.visit_date, o.created_at::date),
                       'why', case when bkey is not null and exploratory_building_key(o.property_name) = bkey then 'same building' else 'same landlord' end,
                       'tags', exploratory_reason_tags(coalesce(o.visits->-1->>'observations', '') || ' ' || coalesce(o.visits->-1->>'notes', '')))
                       order by o.created_at desc), '[]')
                      from stage_exploratory o where o.id <> p_id and o.created_at < x.created_at
                       and ((bkey is not null and exploratory_building_key(o.property_name) = bkey) or (pkey is not null and phone_key(o.owner_phone) = pkey))),
    -- who could go, for the assign choice: what else each person has that day
    'people', (select coalesce(jsonb_agg(jsonb_build_object('email', t.email, 'day', (
                  select coalesce(jsonb_agg(w), '[]') from (
                    select 'Exploratory · ' || o.property_name || coalesce(' · ' || ltrim(to_char(o.visit_time, 'HH12:MI am'), '0'), '') w
                      from stage_exploratory o left join exploratory_assignments oa on oa.request_id = o.id
                     where o.id <> p_id and o.visit_date = x.visit_date and lower(coalesce(oa.assignee, o.stage_inspector)) = t.email
                       and o.status in ('new_request', 'visit_scheduled')
                    union all
                    select 'Setup · ' || pr.pid from properties pr where pr.deleted_at is null and pr.setup_date = x.visit_date
                       and lower(coalesce(nullif(btrim(pr.assigned_to), ''), pr.owner_email)) = t.email
                    union all
                    select 'Handover · ' || pr.pid from properties pr where pr.deleted_at is null and pr.handover_date = x.visit_date and pr.handover_done_at is null
                       and lower(coalesce(nullif(btrim(pr.assigned_to), ''), pr.owner_email)) = t.email) z),
                  'week', (select count(*) from stage_exploratory o left join exploratory_assignments oa on oa.request_id = o.id
                            where lower(coalesce(oa.assignee, o.stage_inspector)) = t.email
                              and o.visit_date between coalesce(x.visit_date, current_date) - 3 and coalesce(x.visit_date, current_date) + 3),
                  'seen', exists (select 1 from stage_exploratory o left join exploratory_assignments oa on oa.request_id = o.id
                            where o.id <> p_id and lower(coalesce(oa.assignee, o.stage_inspector)) = t.email
                              and ((bkey is not null and exploratory_building_key(o.property_name) = bkey) or (pkey is not null and phone_key(o.owner_phone) = pkey)))
                ) order by t.properties desc), '[]')
                from team_members() t where t.email like '%@flent.in' and t.properties > 0)
  ) into out;
  return out;
end
$$;

-- ── calendar data — re-defined ────────────────────────────────────────────
create or replace function public.setup_clash_keep(p_pid text, p_stage_date date)
returns void language sql security definer set search_path = public as $$
  insert into setup_clash_acks (pid, stage_date, kept_by) select p_pid, p_stage_date, lower(auth.jwt() ->> 'email')
   where auth.uid() is not null on conflict do nothing
$$;

create or replace function public.setup_calendar(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare out jsonb;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_to < p_from or p_to - p_from > 92 then raise exception 'Pick a window of up to three months'; end if;

  with pn as (
    select p.pid, coalesce(nullif(btrim(p.name), ''), p.pid) name, lower(coalesce(nullif(btrim(p.assigned_to), ''), p.owner_email)) owner,
           p.setup_date, p.handover_date, p.handover_done_at, p.setup_closed_at, p.closed_at
      from properties p where p.deleted_at is null
  ),
  stage_setup as (   -- Stage's current plan per property (latest dated setup run)
    select distinct on (s.pid) s.pid, s.date, s.kind, s.state from stage_dates s where s.kind in ('setup', 'revamp') order by s.pid, s.date desc
  ),
  ev as (
    -- setups Pulse knows about
    select 'setup' kind, pn.pid, pn.name, pn.setup_date d, null::text t, pn.owner,
           jsonb_build_object('closed', pn.setup_closed_at is not null,
             'stage_date', case when ss.date is not null and ss.date <> pn.setup_date
                                 and not exists (select 1 from setup_clash_acks k where k.pid = pn.pid and k.stage_date = ss.date) then ss.date end) x
      from pn left join stage_setup ss on ss.pid = pn.pid
     where pn.setup_date between p_from and p_to
    union all
    -- Stage's setup plans that Pulse has no date for (or no property at all)
    select case when s.kind = 'revamp' then 'revamp' else 'stage_setup' end, s.pid, coalesce(pn.name, s.name, s.stage_pid), s.date, null, pn.owner,
           jsonb_build_object('in_pulse', pn.pid is not null, 'state', s.state)
      from stage_dates s left join pn on pn.pid = s.pid
     where s.kind in ('setup', 'revamp') and s.date between p_from and p_to and pn.setup_date is null
    union all
    -- handovers (Pulse)
    select 'handover', pn.pid, pn.name, pn.handover_date, null, pn.owner, jsonb_build_object('done', pn.handover_done_at is not null)
      from pn where pn.handover_date between p_from and p_to
    union all
    -- move-ins (Stage) — deadlines; flagged when setup is not closed by then
    select 'move_in', s.pid, coalesce(pn.name, s.name, s.stage_pid), s.date, null, pn.owner,
           jsonb_build_object('in_pulse', pn.pid is not null,
             'warn', case when pn.pid is null then null
                          when pn.setup_closed_at is not null then null
                          when pn.setup_date is null then 'no setup date in Pulse'
                          when pn.setup_date > s.date then 'move-in is before the setup (' || to_char(pn.setup_date, 'DD Mon') || ')' end)
      from stage_dates s left join pn on pn.pid = s.pid
     where s.kind = 'move_in' and s.date between p_from and p_to
    union all
    -- exploratory visits
    select 'visit', 'explore:' || x.id, x.property_name, x.visit_date, ltrim(to_char(x.visit_time, 'HH12:MI am'), '0'),
           lower(coalesce(a.assignee, case when a.request_id is null or a.stage_written_at is null then x.stage_inspector end)),
           jsonb_build_object('request_id', x.id, 'status', x.status, 'config', x.configuration, 'hour', extract(hour from x.visit_time),
                              'confirmed', a.confirmed_at is not null, 'pulse_assigned', a.assignee is not null,
                              'logged', exists (select 1 from exploratory_logs l where l.request_id = x.id and l.submitted_at is not null)
                                        or jsonb_array_length(x.visits) > 0)
      from stage_exploratory x left join exploratory_assignments a on a.request_id = x.id
     where x.visit_date between p_from and p_to and x.archived_at is null and coalesce(x.property_name, '') !~* '^\s*\[test\]'
  ),
  occ as (
    select d::date as day, w.vendor_id, coalesce(v.full_name, w.vendor_name, 'Vendor') vendor, v.trade, v.phone, w.pid
      from work_orders w left join vendors v on v.id = w.vendor_id
      cross join lateral generate_series(greatest(coalesce(w.scheduled_start, w.scheduled_end)::date, p_from),
                                         least(coalesce(w.scheduled_end, w.scheduled_start)::date, p_to), interval '1 day') d
     where w.vendor_id is not null and coalesce(w.scheduled_start, w.scheduled_end) is not null and w.status not in ('cancelled')
       and coalesce(w.scheduled_end, w.scheduled_start)::date >= p_from and coalesce(w.scheduled_start, w.scheduled_end)::date <= p_to
  ),
  vday as (select occ.day, vendor_id, max(vendor) vendor, max(trade) trade, max(phone) phone, array_agg(distinct pid) pids, count(distinct pid) n
             from occ group by occ.day, vendor_id),
  tray as (   -- properties the engine says are ready for a setup date, with Stage's plan when it has one
    select r.pid, coalesce(pn.name, r.property_name) name, coalesce(pn.owner, lower(r.owner_email)) owner, ss.date stage_date, ss.state stage_state,
           (select (t->>'since')::timestamptz from jsonb_array_elements(r.open_threads) t where t->>'code' = 'setup_date_pending' limit 1) final_at
      from property_journey_state('all') r
      left join pn on pn.pid = r.pid left join stage_setup ss on ss.pid = r.pid
     where r.pid !~* '^test' and exists (select 1 from jsonb_array_elements(r.open_threads) t where t->>'code' = 'setup_date_pending')
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'synced_at', (select max(ran_at) from stage_sync_runs),
    'events', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'pid', pid, 'name', name, 'date', d, 'time', t, 'owner', owner, 'x', x)
                                         order by d, t nulls first, kind, pid) from ev), '[]'),
    'vendors', coalesce((select jsonb_agg(jsonb_build_object('day', vday.day, 'vendor_id', vendor_id, 'vendor', vendor, 'trade', trade,
                                                             'phone', phone, 'pids', pids, 'double', n > 1) order by vday.day, vendor) from vday), '[]'),
    'tray', coalesce((select jsonb_agg(jsonb_build_object('pid', pid, 'name', name, 'owner', owner, 'stage_date', stage_date, 'stage_state', stage_state, 'since', final_at)
                                       order by stage_date nulls last, final_at nulls last) from tray), '[]'),
    'is_admin', pulse_is_admin()
  ) into out;
  return out;
end
$$;

select public.exploratory_autolink();

-- ── grants ────────────────────────────────────────────────────────────────
revoke all on function public.exploratory_respond(uuid, boolean, text) from public, anon;
revoke all on function public.exploratory_resolve_conflict(uuid, boolean) from public, anon;
revoke all on function public.exploratory_log_save(uuid, jsonb, boolean) from public, anon;
revoke all on function public.exploratory_link(uuid, text, boolean) from public, anon;
revoke all on function public.explore_journey_state() from public, anon;
revoke all on function public.exploratory_record(uuid) from public, anon;
revoke all on function public.setup_clash_keep(text, date) from public, anon;
grant execute on function public.exploratory_respond(uuid, boolean, text) to authenticated;
grant execute on function public.exploratory_resolve_conflict(uuid, boolean) to authenticated;
grant execute on function public.exploratory_log_save(uuid, jsonb, boolean) to authenticated;
grant execute on function public.exploratory_link(uuid, text, boolean) to authenticated;
grant execute on function public.explore_journey_state() to authenticated;
grant execute on function public.exploratory_record(uuid) to authenticated;
grant execute on function public.setup_clash_keep(text, date) to authenticated;

commit;
