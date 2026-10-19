-- Stage's dates are the source of truth for a property's setup and handover
-- dates (told 2026-10-19). Every Stage sync fills them into the journey; the
-- journey keeps its date inputs, prefilled, and a date changed there stays in
-- Pulse — nothing is written back to Stage.
--
-- Who owns a date is in *_date_by:
--   'stage'   filled from Stage — the next sync keeps it in step
--   an email  set or moved in Pulse — the sync leaves it alone
--   'none'    cleared in Pulse on purpose — the sync leaves it empty
--   null      never set — the sync fills it if Stage has one
-- "Use Stage's date" in the journey hands a date back to Stage.
--
-- Which Stage date: an upcoming plan wins over an older actual (a property set
-- up in 2024 and planned again now is the plan); otherwise the latest actual.

begin;

create or replace function public.stage_pick_date(p_pid text, p_kind text)
returns date
language sql stable security definer set search_path = public as $$
  select case
           when max(date) filter (where state = 'planned') > coalesce(max(date) filter (where state = 'actual'), '-infinity'::date)
             then max(date) filter (where state = 'planned')
           else coalesce(max(date) filter (where state = 'actual'), max(date) filter (where state = 'planned'))
         end
    from stage_dates where pid = p_pid and kind = p_kind
$$;

create or replace function public.property_dates_from_stage()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare claims text := current_setting('request.jwt.claims', true); ns int; nh int;
begin
  -- the journey's history says these moves were Stage's
  perform set_config('request.jwt.claims', '{"email":"stage"}', true);
  with s as (select pid, stage_pick_date(pid, 'setup') d from (select distinct pid from stage_dates where kind = 'setup') x)
  update properties p set setup_date = s.d, setup_date_by = 'stage'
    from s
   where p.pid = s.pid and p.deleted_at is null and s.d is not null
     and (p.setup_date_by is null or p.setup_date_by = 'stage') and p.setup_date is distinct from s.d;
  get diagnostics ns = row_count;
  with s as (select pid, stage_pick_date(pid, 'handover') d from (select distinct pid from stage_dates where kind = 'handover') x)
  update properties p set handover_date = s.d, handover_date_by = 'stage'
    from s
   where p.pid = s.pid and p.deleted_at is null and s.d is not null
     and (p.handover_date_by is null or p.handover_date_by = 'stage') and p.handover_date is distinct from s.d;
  get diagnostics nh = row_count;
  perform set_config('request.jwt.claims', coalesce(claims, ''), true);
  return jsonb_build_object('setup', ns, 'handover', nh);
end $$;
revoke all on function public.property_dates_from_stage() from public, anon, authenticated;

-- What Stage says for one property (the journey shows it beside Pulse's).
create or replace function public.property_stage_dates(p_pid text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'setup', stage_pick_date(p_pid, 'setup'), 'handover', stage_pick_date(p_pid, 'handover'),
    'move_in', stage_pick_date(p_pid, 'move_in'), 'key_handover', stage_pick_date(p_pid, 'key_handover'),
    'go_live', stage_pick_date(p_pid, 'go_live'), 'inspection', stage_pick_date(p_pid, 'inspection'),
    'synced_at', (select max(synced_at) from stage_dates))
$$;
revoke all on function public.property_stage_dates(text) from public, anon;
grant execute on function public.property_stage_dates(text) to authenticated;

-- Hand a date back to Stage: take Stage's value now, and follow it from here.
create or replace function public.property_use_stage_date(p_pid text, p_kind text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare d date;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_kind not in ('setup', 'handover') then raise exception 'Unknown date'; end if;
  d := stage_pick_date(p_pid, p_kind);
  if d is null then raise exception 'Stage has no % date for this property', p_kind; end if;
  if p_kind = 'setup' then update properties set setup_date = d, setup_date_by = 'stage' where pid = p_pid;
  else update properties set handover_date = d, handover_date_by = 'stage' where pid = p_pid; end if;
  return property_milestones(p_pid);
end $$;
revoke all on function public.property_use_stage_date(text, text) from public, anon;
grant execute on function public.property_use_stage_date(text, text) to authenticated;

CREATE OR REPLACE FUNCTION public.property_undo_milestone(p_pid text, p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    when 'setup_date'     then
      -- cleared in Pulse: remember that, so the next Stage sync doesn't put it back
      update properties set setup_date = null,
             setup_date_by = case when stage_pick_date(p_pid, 'setup') is not null then 'none' end
       where pid = p_pid;
    when 'setup_closed'   then update properties set setup_closed_at = null, setup_closed_by = null where pid = p_pid;
    when 'qc_done'        then update properties set qc_done_at = null, qc_done_by = null where pid = p_pid;
    when 'handover_done'  then update properties set handover_done_at = null, handover_done_by = null where pid = p_pid;
    when 'wo_shared'      then update properties set wo_shared_at = null, wo_shared_by = null where pid = p_pid;
    when 'closed'         then update properties set closed_at = null, closed_by = null, closure_note = null where pid = p_pid;
  end case;
  return property_milestones(p_pid);
end
$function$;

create or replace function public.stage_dates_ingest(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'p_rows must be a JSON array'; end if;
  delete from stage_dates;
  insert into stage_dates (key, pid, stage_pid, name, kind, date, state, detail, synced_at)
  select r->>'key', regexp_replace(btrim(r->>'stage_pid'), '^PID\s*', '', 'i'), btrim(r->>'stage_pid'), nullif(btrim(r->>'name'), ''),
         r->>'kind', (r->>'date')::date, r->>'state', coalesce(r->'detail', '{}'), now()
    from jsonb_array_elements(p_rows) r
   where nullif(r->>'date', '') is not null and nullif(btrim(r->>'stage_pid'), '') is not null
  on conflict (key) do nothing;
  get diagnostics n = row_count;
  insert into stage_sync_runs (rows_in, note) values (n, 'scripts/stage-sync.py');
  -- Stage's dates are the source of truth for the journey (unless edited in Pulse)
  return jsonb_build_object('rows', n, 'properties', property_dates_from_stage());
end
$$;

-- fill once now, from what the last sync brought in
select public.property_dates_from_stage();

commit;
