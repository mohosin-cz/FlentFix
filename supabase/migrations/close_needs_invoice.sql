-- Closing a property needs a landlord invoice — or a reason there is none.
--
-- Until now the "closed" milestone could be marked with no invoice at all.
-- The only legitimate case is when no invoice is needed, and then the team
-- should say why. So:
--   · an invoice counts when it has lines (opening the invoice page creates
--     an empty draft; that is not an invoice — same rule as the engine)
--   · without one, closing requires a reason (preset + optional note; note
--     required for "other"), saved with who and when
--   · enforced by a trigger on properties.closed_at, so no path can skip it
--   · undoing the close clears the reason, so a re-close asks again
--   · property_milestones exposes both, for the close control and for the
--     "closed without invoice" highlight on the record
-- Apply after handover_date.sql (re-applies property_milestones with this added).

begin;

alter table public.properties
  add column if not exists no_invoice_reason text,
  add column if not exists no_invoice_note   text,
  add column if not exists no_invoice_by     text,
  add column if not exists no_invoice_at     timestamptz;

create or replace function public.property_invoice_state(p_pid text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'exists', exists (select 1 from landlord_invoices li
                       where li.pid = p_pid and exists (select 1 from landlord_invoice_items ii where ii.invoice_id = li.id)),
    'number', (select li.invoice_number from landlord_invoices li
                where li.pid = p_pid and exists (select 1 from landlord_invoice_items ii where ii.invoice_id = li.id)
                order by li.created_at desc limit 1),
    -- where "Create the invoice" should go: the invoice page is keyed by inspection
    'inspection_id', (select i.id from inspections i where i.pid = p_pid order by i.inspection_date desc nulls last, i.created_at desc limit 1))
$$;

create or replace function public.properties_close_needs_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.closed_at is null and old.closed_at is not null then
    new.no_invoice_reason := null; new.no_invoice_note := null; new.no_invoice_by := null; new.no_invoice_at := null;
    return new;
  end if;
  if new.closed_at is not null and old.closed_at is null
     and not (property_invoice_state(new.pid) ->> 'exists')::boolean
     and nullif(btrim(new.no_invoice_reason), '') is null then
    raise exception 'No landlord invoice yet — create it, or say why this property needs none';
  end if;
  return new;
end
$$;

drop trigger if exists trg_properties_close_needs_invoice on public.properties;
create trigger trg_properties_close_needs_invoice
  before update of closed_at on public.properties
  for each row execute function public.properties_close_needs_invoice();

-- Close without an invoice: record why, then close through the usual milestone.
create or replace function public.property_close_without_invoice(p_pid text, p_reason text, p_note text default null, p_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare me text := lower(auth.jwt() ->> 'email');
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_reason not in ('landlord_paid_directly', 'no_billable_work', 'absorbed_by_flent', 'invoiced_outside_pulse', 'other') then
    raise exception 'Pick a reason';
  end if;
  if p_reason = 'other' and nullif(btrim(p_note), '') is null then raise exception 'Say why in the note'; end if;

  update properties set no_invoice_reason = p_reason, no_invoice_note = nullif(btrim(p_note), ''),
                        no_invoice_by = me, no_invoice_at = now()
   where pid = p_pid and deleted_at is null;
  if not found then raise exception 'No such property'; end if;

  perform property_mark_milestone(p_pid, 'closed', p_date, p_note);
  insert into property_journey (pid, stage, changed_by, notes)
  values (p_pid, 'closed_without_invoice', me,
          case p_reason when 'landlord_paid_directly' then 'Landlord paid the vendors directly'
                        when 'no_billable_work' then 'No billable work'
                        when 'absorbed_by_flent' then 'Cost absorbed by Flent'
                        when 'invoiced_outside_pulse' then 'Invoiced outside Pulse'
                        else 'Other' end
          || coalesce(' — ' || nullif(btrim(p_note), ''), ''));
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
  return jsonb_build_object('pid', p_pid, 'milestones', out, 'due', due, 'undoable', last,
    'checks', property_setup_checks(p),
    'invoice', property_invoice_state(p_pid),
    'no_invoice', case when p.no_invoice_reason is not null then jsonb_build_object(
      'reason', p.no_invoice_reason, 'note', p.no_invoice_note, 'by', p.no_invoice_by, 'at', p.no_invoice_at) end);
end
$$;

revoke all on function public.property_invoice_state(text) from public, anon;
revoke all on function public.properties_close_needs_invoice() from public, anon, authenticated;
revoke all on function public.property_close_without_invoice(text, text, text, date) from public, anon;
grant execute on function public.property_invoice_state(text) to authenticated;
grant execute on function public.property_close_without_invoice(text, text, text, date) to authenticated;

commit;
