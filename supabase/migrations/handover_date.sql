-- Handover date, captured on the journey like the setup date.
--
-- properties.handover_date already exists — it is the planned handover day
-- ("T-Day"): Home's bulk T-Day action sets it, the handover-tomorrow alert and
-- the comms templates read it. The journey never asked for it, so it was only
-- ever set from Home. Now the handover step asks for the date first (and it
-- can be moved), then is marked done as before (handover_done_at).
--
--   property_set_handover_date(pid, date) — set or move; who and when kept,
--                                           every change logged to the timeline
--   property_milestones(pid)              — handover_done now carries 'date'
-- Re-applies property_milestones from journey_milestones_logic.sql with that
-- one change.

begin;

alter table public.properties add column if not exists handover_date_by text;

create or replace function public.property_set_handover_date(p_pid text, p_date date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me  text := lower(auth.jwt() ->> 'email');
  old date;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_date is null then raise exception 'Pick a handover date'; end if;
  select handover_date into old from properties where pid = p_pid and deleted_at is null for update;
  if not found then raise exception 'No such property'; end if;
  if exists (select 1 from properties where pid = p_pid and handover_done_at is not null) then
    raise exception 'Already handed over — undo that first to change the date';
  end if;
  if old is not distinct from p_date then return property_milestones(p_pid); end if;

  update properties set handover_date = p_date, handover_date_by = me where pid = p_pid;
  insert into property_journey (pid, stage, changed_by, notes)
  values (p_pid, 'handover_date', me,
          case when old is null then 'set · ' || to_char(p_date, 'DD Mon YYYY')
               else 'moved · ' || to_char(old, 'DD Mon') || ' → ' || to_char(p_date, 'DD Mon YYYY') end);
  return property_milestones(p_pid);
end
$$;

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
      'date', case k when 'setup_date' then p.setup_date when 'handover_done' then p.handover_date end,
      'date_by', case k when 'handover_done' then p.handover_date_by end,
      'note', case when k = 'closed' then p.closure_note end);
  end loop;
  return jsonb_build_object('pid', p_pid, 'milestones', out, 'due', due, 'undoable', last, 'checks', property_setup_checks(p));
end
$$;

revoke all on function public.property_set_handover_date(text, date) from public, anon;
grant execute on function public.property_set_handover_date(text, date) to authenticated;

commit;
