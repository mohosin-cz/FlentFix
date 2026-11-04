-- Pulse's handover date is Stage's "Move-in Ready" (told 2026-11-04).
--
-- Until now the handover date came from Stage's scheduled / actual handover
-- date, but in Stage that is the landlord handing the property to Flent,
-- before setup. Pulse's handover comes after setup and QC: the home is ready
-- for the tenant, which is what Stage records as Move-in Ready
-- (properties.move_in_ready_notified_at; the sync stores its IST day as kind
-- 'move_in_ready').
--
--   · Stage has Move-in Ready → that is the handover date. It's what actually
--     happened, so it also replaces a date typed in Pulse.
--   · Stage doesn't have it yet → the date is entered in Pulse by hand, as
--     before (property_set_handover_date), and stays until Move-in Ready
--     arrives.
--
-- Dates filled from the old field are cleared where the property hasn't been
-- handed over and Stage has no Move-in Ready, so the journey asks for the date
-- instead of showing the landlord's one.

begin;

create or replace function public.property_dates_from_stage()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare claims text := current_setting('request.jwt.claims', true); ns int; nh int; nc int;
begin
  -- the journey's history says these moves were Stage's
  perform set_config('request.jwt.claims', '{"email":"stage"}', true);
  with s as (select pid, stage_pick_date(pid, 'setup') d from (select distinct pid from stage_dates where kind = 'setup') x)
  update properties p set setup_date = s.d, setup_date_by = 'stage'
    from s
   where p.pid = s.pid and p.deleted_at is null and s.d is not null
     and (p.setup_date_by is null or p.setup_date_by = 'stage') and p.setup_date is distinct from s.d;
  get diagnostics ns = row_count;

  -- Move-in Ready wins over whatever the handover date was
  with s as (select pid, stage_pick_date(pid, 'move_in_ready') d from (select distinct pid from stage_dates where kind = 'move_in_ready') x)
  update properties p set handover_date = s.d, handover_date_by = 'stage'
    from s
   where p.pid = s.pid and p.deleted_at is null and s.d is not null
     and (p.handover_date is distinct from s.d or p.handover_date_by is distinct from 'stage');
  get diagnostics nh = row_count;

  -- a Stage-filled date with no Move-in Ready behind it (Move-in Ready
  -- withdrawn in Stage, or left from the old field) goes, so it can be entered
  -- by hand; a property already handed over keeps its date
  update properties p set handover_date = null, handover_date_by = null
   where p.deleted_at is null and p.handover_date_by = 'stage' and p.handover_done_at is null
     and not exists (select 1 from stage_dates s where s.pid = p.pid and s.kind = 'move_in_ready');
  get diagnostics nc = row_count;

  perform set_config('request.jwt.claims', coalesce(claims, ''), true);
  return jsonb_build_object('setup', ns, 'handover', nh, 'handover_cleared', nc);
end $$;
revoke all on function public.property_dates_from_stage() from public, anon, authenticated;

-- What Stage says for one property. 'handover' is Move-in Ready now; the
-- landlord's handover to Flent stays visible as 'landlord_handover'.
create or replace function public.property_stage_dates(p_pid text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'setup', stage_pick_date(p_pid, 'setup'), 'handover', stage_pick_date(p_pid, 'move_in_ready'),
    'landlord_handover', stage_pick_date(p_pid, 'handover'),
    'move_in', stage_pick_date(p_pid, 'move_in'), 'key_handover', stage_pick_date(p_pid, 'key_handover'),
    'go_live', stage_pick_date(p_pid, 'go_live'), 'inspection', stage_pick_date(p_pid, 'inspection'),
    'synced_at', (select max(synced_at) from stage_dates))
$$;
revoke all on function public.property_stage_dates(text) from public, anon;
grant execute on function public.property_stage_dates(text) to authenticated;

-- "Use Stage's" on the handover date takes Move-in Ready.
create or replace function public.property_use_stage_date(p_pid text, p_kind text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare d date;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_kind not in ('setup', 'handover') then raise exception 'Unknown date'; end if;
  d := stage_pick_date(p_pid, case p_kind when 'handover' then 'move_in_ready' else p_kind end);
  if d is null then
    raise exception '%', case p_kind when 'handover' then 'Stage has no Move-in Ready date for this property yet'
                                     else 'Stage has no setup date for this property' end;
  end if;
  if p_kind = 'setup' then update properties set setup_date = d, setup_date_by = 'stage' where pid = p_pid;
  else update properties set handover_date = d, handover_date_by = 'stage' where pid = p_pid; end if;
  return property_milestones(p_pid);
end $$;
revoke all on function public.property_use_stage_date(text, text) from public, anon;
grant execute on function public.property_use_stage_date(text, text) to authenticated;

-- Typing a handover date is for when Stage has no Move-in Ready yet. Once it
-- has one, that is the date, and the next sync would put it back anyway.
CREATE OR REPLACE FUNCTION public.property_set_handover_date(p_pid text, p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me  text := lower(auth.jwt() ->> 'email');
  old date;
  mir date;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_date is null then raise exception 'Pick a handover date'; end if;
  select handover_date into old from properties where pid = p_pid and deleted_at is null for update;
  if not found then raise exception 'No such property'; end if;
  if exists (select 1 from properties where pid = p_pid and handover_done_at is not null) then
    raise exception 'Already handed over — undo that first to change the date';
  end if;
  mir := stage_pick_date(p_pid, 'move_in_ready');
  if mir is not null then
    raise exception 'Stage has this home Move-in Ready on % — that is the handover date', to_char(mir, 'DD Mon YYYY');
  end if;
  if old is not distinct from p_date then return property_milestones(p_pid); end if;

  update properties set handover_date = p_date, handover_date_by = me where pid = p_pid;
  insert into property_journey (pid, stage, changed_by, notes)
  values (p_pid, 'handover_date', me,
          case when old is null then 'set · ' || to_char(p_date, 'DD Mon YYYY')
               else 'moved · ' || to_char(old, 'DD Mon') || ' → ' || to_char(p_date, 'DD Mon YYYY') end);
  return property_milestones(p_pid);
end
$function$;

commit;
