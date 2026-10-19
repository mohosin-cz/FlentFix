-- Closing setup with something missing (payments not confirmed, WiFi or RO not
-- registered) crashed with "malformed array literal" instead of saying what was
-- missing: `missing || 'text'` read the text as an array. array_append says
-- what it means. Same function otherwise (live definition, 2026-10-19).

begin;

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
        if p.payments_logged_at is null then missing := array_append(missing, 'confirm all payments are logged'); end if;
        if not (c->'wifi'->>'not_needed')::boolean and not (c->'wifi'->>'registered')::boolean then missing := array_append(missing, 'register the WiFi details'); end if;
        if not (c->'ro'->>'not_needed')::boolean and not (c->'ro'->>'registered')::boolean then missing := array_append(missing, 'register the RO details'); end if;
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
$function$;

commit;
