-- Journey milestones, part 2 of 2: the rules. Apply after journey_milestones_schema.sql.
--
-- The order is the journey's (pulse-journey-prompt.md §1):
--   estimate_final → setup_date → setup_closed → qc_done → handover_done → wo_shared → closed
--
--   · estimate_final  — marked once the supply team confirms the landlord has decided
--   · setup_date      — a date, picked; can be moved until setup is closed
--   · the rest        — one tap each
-- Nothing is marked out of order. Only the most recent mark can be undone,
-- so walking back means undoing forward of it. Every mark, date change and
-- undo is written to property_journey by a trigger — never by the client.

begin;

create or replace function public.journey_milestone_keys()
returns text[] language sql immutable as $$
  select array['estimate_final','setup_date','setup_closed','qc_done','handover_done','wo_shared','closed']
$$;

-- Which milestone column holds "done" for a key, as a timestamp.
create or replace function public.journey_milestone_at(p public.properties, p_key text)
returns timestamptz language sql stable as $$
  select case p_key
    when 'estimate_final' then p.estimate_final_at
    when 'setup_date'     then p.setup_date::timestamptz
    when 'setup_closed'   then p.setup_closed_at
    when 'qc_done'        then p.qc_done_at
    when 'handover_done'  then p.handover_done_at
    when 'wo_shared'      then p.wo_shared_at
    when 'closed'         then p.closed_at
  end
$$;

-- What setup closure needs, and what planning sent (utilities_request_schema.sql).
-- Registered = an active record on the Utilities page with its details:
--   WiFi: account number, network name, password · RO: provider, start date.
-- A plan of 0 months means that utility is not needed at this property.
create or replace function public.property_setup_checks(p public.properties)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'wifi', jsonb_build_object(
      'requested_at', p.wifi_requested_at, 'requested_by', p.wifi_requested_by, 'plan_months', p.wifi_plan_months,
      'not_needed', coalesce(p.wifi_plan_months = 0, false),
      'registered', exists (select 1 from property_utilities u where u.pid = p.pid and u.utility_type = 'wifi' and u.status = 'active'
                              and nullif(u.account_number, '') is not null and nullif(u.ssid, '') is not null and nullif(u.wifi_password, '') is not null)),
    'ro', jsonb_build_object(
      'requested_at', p.ro_requested_at, 'requested_by', p.ro_requested_by, 'plan_months', p.ro_plan_months,
      'not_needed', coalesce(p.ro_plan_months = 0, false),
      'registered', exists (select 1 from property_utilities u where u.pid = p.pid and u.utility_type = 'water_purifier' and u.status = 'active'
                              and nullif(u.provider, '') is not null and u.start_date is not null)),
    'payments_logged', jsonb_build_object('at', p.payments_logged_at, 'by', p.payments_logged_by))
$$;

-- Where a property is: the done/undone state of each milestone, the one now
-- due, and the one that may be undone.
create or replace function public.property_milestones(p_pid text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p    properties%rowtype;
  keys text[] := journey_milestone_keys();
  out  jsonb := '[]'::jsonb;
  due  text;
  last text;
  k    text;
  at   timestamptz;
begin
  select * into p from properties where pid = p_pid and deleted_at is null;
  if not found then return null; end if;
  foreach k in array keys loop
    at := journey_milestone_at(p, k);
    if at is null and due is null then due := k; end if;
    if at is not null then last := k; end if;
    out := out || jsonb_build_object(
      'key', k, 'done', at is not null, 'at', at,
      'by', case k
              when 'estimate_final' then p.estimate_final_by when 'setup_date' then p.setup_date_by
              when 'setup_closed' then p.setup_closed_by     when 'qc_done' then p.qc_done_by
              when 'handover_done' then p.handover_done_by   when 'wo_shared' then p.wo_shared_by
              when 'closed' then p.closed_by end,
      'date', case when k = 'setup_date' then p.setup_date end,
      'note', case when k = 'closed' then p.closure_note end);
  end loop;
  return jsonb_build_object('pid', p_pid, 'milestones', out, 'due', due, 'undoable', last, 'checks', property_setup_checks(p));
end
$$;

-- Mark the milestone that is due. setup_date takes p_date (and may be moved
-- while setup is still open); closed takes an optional closure date and note.
create or replace function public.property_mark_milestone(p_pid text, p_key text, p_date date default null, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me   text := nullif(lower(coalesce(auth.jwt() ->> 'email', '')), '');
  p    properties%rowtype;
  keys text[] := journey_milestone_keys();
  i    int := array_position(keys, p_key);
begin
  if me is null then raise exception 'Sign in to mark milestones'; end if;
  if i is null then raise exception 'Unknown milestone %', p_key; end if;
  select * into p from properties where pid = p_pid and deleted_at is null for update;
  if not found then raise exception 'No live property %', p_pid; end if;

  -- moving the setup date: allowed until setup is closed
  if p_key = 'setup_date' and p.setup_date is not null then
    if p_date is null then raise exception 'Pick a setup date'; end if;
    if p.setup_closed_at is not null then raise exception 'Setup is already closed — undo that first to move the date'; end if;
    update properties set setup_date = p_date, setup_date_by = me where pid = p_pid;
    return property_milestones(p_pid);
  end if;

  if journey_milestone_at(p, p_key) is not null then raise exception 'Already marked'; end if;
  if i > 1 and journey_milestone_at(p, keys[i - 1]) is null then
    raise exception 'Mark "%" first', replace(keys[i - 1], '_', ' ');
  end if;

  case p_key
    when 'estimate_final' then update properties set estimate_final_at = now(), estimate_final_by = me where pid = p_pid;
    when 'setup_date'     then
      if p_date is null then raise exception 'Pick a setup date'; end if;
      update properties set setup_date = p_date, setup_date_by = me where pid = p_pid;
    when 'setup_closed'   then
      declare c jsonb := property_setup_checks(p); missing text[] := '{}';
      begin
        if p.payments_logged_at is null then missing := missing || 'confirm all payments are logged'; end if;
        if not (c->'wifi'->>'not_needed')::boolean and not (c->'wifi'->>'registered')::boolean then missing := missing || 'register the WiFi details'; end if;
        if not (c->'ro'->>'not_needed')::boolean and not (c->'ro'->>'registered')::boolean then missing := missing || 'register the RO details'; end if;
        if cardinality(missing) > 0 then
          raise exception 'Setup can''t close yet: %', array_to_string(missing, ', ');
        end if;
        update properties set setup_closed_at = now(), setup_closed_by = me where pid = p_pid;
      end;
    when 'qc_done'        then update properties set qc_done_at = now(), qc_done_by = me where pid = p_pid;
    when 'handover_done'  then update properties set handover_done_at = now(), handover_done_by = me where pid = p_pid;
    when 'wo_shared'      then update properties set wo_shared_at = now(), wo_shared_by = me where pid = p_pid;
    when 'closed'         then update properties set closed_at = coalesce(p_date::timestamptz, now()), closed_by = me,
                                                     closure_note = nullif(btrim(p_note), '') where pid = p_pid;
  end case;
  return property_milestones(p_pid);
end
$$;

-- Undo the most recent mark only.
create or replace function public.property_undo_milestone(p_pid text, p_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me   text := nullif(lower(coalesce(auth.jwt() ->> 'email', '')), '');
  p    properties%rowtype;
  keys text[] := journey_milestone_keys();
  i    int := array_position(keys, p_key);
begin
  if me is null then raise exception 'Sign in to undo milestones'; end if;
  if i is null then raise exception 'Unknown milestone %', p_key; end if;
  select * into p from properties where pid = p_pid and deleted_at is null for update;
  if not found then raise exception 'No live property %', p_pid; end if;
  if journey_milestone_at(p, p_key) is null then raise exception 'Not marked'; end if;
  if i < array_length(keys, 1) and journey_milestone_at(p, keys[i + 1]) is not null then
    raise exception 'Undo "%" first', replace(keys[i + 1], '_', ' ');
  end if;

  case p_key
    when 'estimate_final' then update properties set estimate_final_at = null, estimate_final_by = null where pid = p_pid;
    when 'setup_date'     then update properties set setup_date = null, setup_date_by = null where pid = p_pid;
    when 'setup_closed'   then update properties set setup_closed_at = null, setup_closed_by = null where pid = p_pid;
    when 'qc_done'        then update properties set qc_done_at = null, qc_done_by = null where pid = p_pid;
    when 'handover_done'  then update properties set handover_done_at = null, handover_done_by = null where pid = p_pid;
    when 'wo_shared'      then update properties set wo_shared_at = null, wo_shared_by = null where pid = p_pid;
    when 'closed'         then update properties set closed_at = null, closed_by = null, closure_note = null where pid = p_pid;
  end case;
  return property_milestones(p_pid);
end
$$;

-- The log. Every change to a milestone lands in property_journey, written here.
create or replace function public.properties_log_milestones()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  me   text := coalesce(nullif(lower(coalesce(auth.jwt() ->> 'email', '')), ''), 'system');
  k    text;
  a    timestamptz;
  b    timestamptz;
begin
  foreach k in array journey_milestone_keys() loop
    a := journey_milestone_at(old, k);
    b := journey_milestone_at(new, k);
    if a is distinct from b then
      insert into property_journey (pid, stage, changed_by, notes)
      values (new.pid, k, me,
              case
                when a is null then 'marked' || case when k = 'setup_date' then ' · ' || to_char(new.setup_date, 'DD Mon YYYY') else '' end
                                             || case when k = 'closed' and new.closure_note is not null then ' · ' || new.closure_note else '' end
                when b is null then 'undone'
                else 'moved · ' || to_char(old.setup_date, 'DD Mon') || ' → ' || to_char(new.setup_date, 'DD Mon YYYY')
              end);
    end if;
  end loop;
  return new;
end
$$;

drop trigger if exists trg_properties_log_milestones on public.properties;
create trigger trg_properties_log_milestones
  after update of setup_date, estimate_final_at, setup_closed_at, qc_done_at, handover_done_at, wo_shared_at, closed_at
  on public.properties
  for each row execute function public.properties_log_milestones();

revoke all on function public.property_milestones(text) from public, anon;
revoke all on function public.property_mark_milestone(text, text, date, text) from public, anon;
revoke all on function public.property_undo_milestone(text, text) from public, anon;
revoke all on function public.properties_log_milestones() from public, anon, authenticated;
grant execute on function public.property_milestones(text) to authenticated;
grant execute on function public.property_mark_milestone(text, text, date, text) to authenticated;
grant execute on function public.property_undo_milestone(text, text) to authenticated;


-- Planning: a utility was requested from its partner (plan 1/3/6/9/12 months),
-- or is not needed here (0). Undo clears it. Locked once setup is closed.
create or replace function public.property_request_utility(p_pid text, p_kind text, p_months int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := nullif(lower(coalesce(auth.jwt() ->> 'email', '')), ''); p properties%rowtype;
begin
  if me is null then raise exception 'Sign in first'; end if;
  if p_kind not in ('wifi', 'ro') then raise exception 'Unknown utility %', p_kind; end if;
  select * into p from properties where pid = p_pid and deleted_at is null for update;
  if not found then raise exception 'No live property %', p_pid; end if;
  if p.setup_closed_at is not null then raise exception 'Setup is closed — undo that first'; end if;
  if p_months is null then
    if p_kind = 'wifi' then update properties set wifi_requested_at = null, wifi_requested_by = null, wifi_plan_months = null where pid = p_pid;
    else update properties set ro_requested_at = null, ro_requested_by = null, ro_plan_months = null where pid = p_pid; end if;
  elsif p_months not in (0, 1, 3, 6, 9, 12) then
    raise exception 'Plan must be 1, 3, 6, 9 or 12 months (0 = not needed)';
  elsif p_kind = 'wifi' then update properties set wifi_requested_at = now(), wifi_requested_by = me, wifi_plan_months = p_months where pid = p_pid;
  else update properties set ro_requested_at = now(), ro_requested_by = me, ro_plan_months = p_months where pid = p_pid;
  end if;
  return property_milestones(p_pid);
end $$;

-- Setup closure: someone confirms every payment for the property is logged.
create or replace function public.property_mark_payments_logged(p_pid text, p_done boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := nullif(lower(coalesce(auth.jwt() ->> 'email', '')), ''); p properties%rowtype;
begin
  if me is null then raise exception 'Sign in first'; end if;
  select * into p from properties where pid = p_pid and deleted_at is null for update;
  if not found then raise exception 'No live property %', p_pid; end if;
  if p.setup_closed_at is not null then raise exception 'Setup is closed — undo that first'; end if;
  if p_done then update properties set payments_logged_at = now(), payments_logged_by = me where pid = p_pid;
  else update properties set payments_logged_at = null, payments_logged_by = null where pid = p_pid; end if;
  return property_milestones(p_pid);
end $$;

-- Log those ticks to the property's history, like the milestones.
create or replace function public.properties_log_setup_checks()
returns trigger language plpgsql security definer set search_path = public as $$
declare me text := coalesce(nullif(lower(coalesce(auth.jwt() ->> 'email', '')), ''), 'system');
begin
  if old.wifi_requested_at is distinct from new.wifi_requested_at or old.wifi_plan_months is distinct from new.wifi_plan_months then
    insert into property_journey (pid, stage, changed_by, notes) values (new.pid, 'wifi_requested', me,
      case when new.wifi_requested_at is null then 'undone' when new.wifi_plan_months = 0 then 'not needed' else new.wifi_plan_months || '-month plan' end);
  end if;
  if old.ro_requested_at is distinct from new.ro_requested_at or old.ro_plan_months is distinct from new.ro_plan_months then
    insert into property_journey (pid, stage, changed_by, notes) values (new.pid, 'ro_requested', me,
      case when new.ro_requested_at is null then 'undone' when new.ro_plan_months = 0 then 'not needed' else new.ro_plan_months || '-month plan' end);
  end if;
  if old.payments_logged_at is distinct from new.payments_logged_at then
    insert into property_journey (pid, stage, changed_by, notes) values (new.pid, 'payments_logged', me,
      case when new.payments_logged_at is null then 'undone' else 'all payments logged' end);
  end if;
  return new;
end $$;

drop trigger if exists trg_properties_log_setup_checks on public.properties;
create trigger trg_properties_log_setup_checks
  after update of wifi_requested_at, wifi_plan_months, ro_requested_at, ro_plan_months, payments_logged_at on public.properties
  for each row execute function public.properties_log_setup_checks();

revoke all on function public.property_setup_checks(public.properties) from public, anon, authenticated;
revoke all on function public.property_request_utility(text, text, int) from public, anon;
revoke all on function public.property_mark_payments_logged(text, boolean) from public, anon;
revoke all on function public.properties_log_setup_checks() from public, anon, authenticated;
grant execute on function public.property_request_utility(text, text, int) to authenticated;
grant execute on function public.property_mark_payments_logged(text, boolean) to authenticated;

commit;

-- check
select pid, property_milestones(pid) -> 'due' as due from properties where deleted_at is null and source is distinct from 'payments_backfill' limit 3;
