-- Every estimate line needs a decision before the estimate is final.
--
-- A decision is approved or rejected. Landlords approve on their page; a "no"
-- (on a call, in a thread, through supply) is recorded by staff on the
-- workbench with estimate_staff_decide, which can also record an approval
-- given outside the page. Lines nobody owes a decision on — removed, excluded,
-- nil cost — don't count.
--
-- One "final": the workbench's Mark final and the journey's Estimate final
-- now do the same thing through the same check — lock the estimate and set
-- properties.estimate_final_at. Before, the workbench only locked.
--
-- Rejected (and excluded) lines no longer count in the estimate total.

begin;

alter table public.estimate_items
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by_email text,
  add column if not exists rejection_note text;

create or replace function public.estimate_undecided(p_estimate_id uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from estimate_items
   where estimate_id = p_estimate_id
     and coalesce(status, 'pending') not in ('approved', 'rejected', 'removed', 'excluded')
     and cost_type is distinct from 'nil'
$$;

create or replace function public.estimate_refresh_status(p_estimate_id uuid)
returns void language sql security definer set search_path = public as $$
  update estimates e set status = case
      when estimate_undecided(e.id) = 0 then 'approved'
      when exists (select 1 from estimate_items i where i.estimate_id = e.id and i.status = 'approved') then 'partially_approved'
      else e.status end
   where e.id = p_estimate_id and e.status in ('sent', 'viewed', 'partially_approved', 'approved')
$$;

create or replace function public.estimate_staff_decide(p_item_id uuid, p_decision text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me  text := nullif(lower(coalesce(auth.jwt() ->> 'email', '')), '');
  it  estimate_items%rowtype;
  est estimates%rowtype;
begin
  if me is null or me !~ '@flent\.in$' then raise exception 'Only Flent staff can record a decision'; end if;
  if p_decision not in ('approved', 'rejected', 'pending') then raise exception 'Decision must be approved, rejected or pending'; end if;
  select * into it from estimate_items where id = p_item_id for update;
  if not found then raise exception 'No such estimate line'; end if;
  select * into est from estimates where id = it.estimate_id;
  if est.locked then raise exception 'This estimate is final — reopen it to change a decision'; end if;
  if it.status in ('removed', 'excluded') then raise exception 'This line isn''t on the estimate'; end if;

  update estimate_items set
    status            = p_decision,
    approved_at       = case when p_decision = 'approved' then now() end,
    approved_by_email = case when p_decision = 'approved' then me end,
    rejected_at       = case when p_decision = 'rejected' then now() end,
    rejected_by_email = case when p_decision = 'rejected' then me end,
    rejection_note    = case when p_decision = 'rejected' then nullif(btrim(coalesce(p_note, '')), '') end
  where id = p_item_id;

  insert into estimate_events (estimate_id, event_type, actor, meta)
  values (it.estimate_id, 'item_' || p_decision, me, jsonb_build_object('item_id', p_item_id, 'by', me, 'note', nullif(btrim(coalesce(p_note, '')), '')));

  perform estimate_refresh_status(it.estimate_id);
  return jsonb_build_object('item_id', p_item_id, 'status', p_decision, 'undecided', estimate_undecided(it.estimate_id));
end $$;

-- The workbench's Mark final: same check as the journey step, same result.
create or replace function public.estimate_mark_final(p_estimate_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me  text := nullif(lower(coalesce(auth.jwt() ->> 'email', '')), '');
  est estimates%rowtype;
  v_open int;
begin
  if me is null or me !~ '@flent\.in$' then raise exception 'Only Flent staff can mark an estimate final'; end if;
  select * into est from estimates where id = p_estimate_id for update;
  if not found then raise exception 'No such estimate'; end if;
  v_open := estimate_undecided(p_estimate_id);
  if v_open > 0 then
    raise exception '% item% still need% a decision — mark each one approved or rejected, then mark final',
      v_open, case when v_open = 1 then '' else 's' end, case when v_open = 1 then 's' else '' end;
  end if;
  update estimates set locked = true, locked_at = coalesce(locked_at, now()), locked_by = coalesce(locked_by, me) where id = p_estimate_id;
  update properties set estimate_final_at = now(), estimate_final_by = me
   where pid = est.pid and deleted_at is null and estimate_final_at is null;
  perform estimate_refresh_status(p_estimate_id);
  return jsonb_build_object('estimate_id', p_estimate_id, 'locked', true);
end $$;

revoke all on function public.estimate_staff_decide(uuid, text, text) from public, anon;
revoke all on function public.estimate_mark_final(uuid) from public, anon;
revoke all on function public.estimate_undecided(uuid) from public, anon;
grant execute on function public.estimate_staff_decide(uuid, text, text) to authenticated;
grant execute on function public.estimate_mark_final(uuid) to authenticated;
grant execute on function public.estimate_undecided(uuid) to authenticated;

-- totals: rejected and excluded lines aren't part of what the landlord pays
create or replace function public.recompute_estimate_total()
returns trigger language plpgsql security definer set search_path = public as $$
declare eid uuid;
begin
  eid := coalesce(new.estimate_id, old.estimate_id);
  update estimates e set total = coalesce((
    select sum((coalesce(material_cost,0)+coalesce(labour_cost,0))*coalesce(qty,1))
    from estimate_items
    where estimate_id=eid and coalesce(status,'pending') not in ('removed', 'excluded', 'rejected')
      and coalesce(cost_type,'priced') in ('priced', 'actuals')),0)
  where e.id=eid;
  return null;
end $$;

update public.estimates e set total = x.t
  from (select e2.id, coalesce((select sum((coalesce(material_cost,0)+coalesce(labour_cost,0))*coalesce(qty,1))
          from public.estimate_items i where i.estimate_id = e2.id and coalesce(i.status,'pending') not in ('removed', 'excluded', 'rejected')
           and coalesce(i.cost_type,'priced') in ('priced', 'actuals')), 0) t from public.estimates e2) x
 where x.id = e.id and e.total is distinct from x.t;

-- landlord approvals: a rejected line counts as decided
CREATE OR REPLACE FUNCTION public.estimate_approve_all(p_token text, p_session uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a record; v_all boolean; v_status text;
begin
  select * into a from estimate_actor(p_token, p_session);
  update estimate_items set status = 'approved', approved_by_email = a.email, approved_at = now()
   where estimate_id = a.estimate_id and coalesce(status, 'pending') = 'pending';
  select bool_and(status in ('approved', 'rejected', 'removed', 'excluded') or cost_type = 'nil') into v_all
    from estimate_items where estimate_id = a.estimate_id;
  v_status := case when v_all then 'approved' else 'partially_approved' end;
  update estimates set status = v_status,
         approved_at = case when v_all then now() else approved_at end,
         approved_by_name = a.email, approved_by_email = a.email
   where id = a.estimate_id;
  insert into estimate_events (estimate_id, event_type, actor, meta)
  values (a.estimate_id, v_status, a.actor, jsonb_build_object('name', a.email, 'email', a.email));
  return v_status;
end
$function$
;

CREATE OR REPLACE FUNCTION public.estimate_approve_item(p_token text, p_session uuid, p_item_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a record;
begin
  select * into a from estimate_actor(p_token, p_session);
  update estimate_items set status = 'approved', approved_by_email = a.email, approved_at = now()
   where id = p_item_id and estimate_id = a.estimate_id;
  if not found then raise exception 'That line is not on this estimate'; end if;
  insert into estimate_events (estimate_id, event_type, actor, meta)
  values (a.estimate_id, 'item_approved', a.actor, jsonb_build_object('item_id', p_item_id, 'name', a.email, 'email', a.email));
end
$function$
;

-- journey step: same check, and it locks the estimate too
CREATE OR REPLACE FUNCTION public.property_mark_milestone(p_pid text, p_key text, p_date date DEFAULT NULL::date, p_note text DEFAULT NULL::text)
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

  -- Nothing moves past the estimate until it is marked final. (A setup date can
  -- arrive from Stage without one, so the previous-step check alone isn't enough.)
  if p_key <> 'estimate_final' and p.estimate_final_at is null then
    raise exception 'Mark the estimate final first';
  end if;

  -- And it is only final once the landlord has answered every live line.
  if p_key = 'estimate_final' then
    declare v_est uuid; v_open int;
    begin
      select id into v_est from estimates where pid = p_pid order by created_at desc limit 1;
      if v_est is null then raise exception 'There is no estimate for this property yet'; end if;
      v_open := estimate_undecided(v_est);
      if v_open > 0 then
        raise exception '% item% still need% a decision — mark each one approved or rejected on the workbench, then mark final',
          v_open, case when v_open = 1 then '' else 's' end, case when v_open = 1 then 's' else '' end;
      end if;
      update estimates set locked = true, locked_at = coalesce(locked_at, now()), locked_by = coalesce(locked_by, me) where id = v_est;
    end;
  end if;
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
$function$
;

commit;
