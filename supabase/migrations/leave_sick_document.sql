-- Sick leave can carry a document — a doctor's note or prescription.
--
-- One day or less: optional. More than one day (counted the way the leave is,
-- so Sundays and holidays don't count): required — the portal won't send
-- without it, and neither will this. The vendor can also add one afterwards,
-- since the note often comes after the visit. The office recording leave
-- itself (vendor_leave_record) is not held to it.
--
-- Files go to vendor-docs (private; vendors can upload, only staff can read)
-- under leave/<id>/, and the stored path is checked against that folder.

alter table public.vendor_leaves add column if not exists doc_path text;

create or replace function public.leave_doc_ok(p_path text)
returns boolean language sql stable security definer set search_path = public, storage as $$
  select p_path like 'leave/%' and p_path not like '%..%'
     and exists (select 1 from storage.objects o where o.bucket_id = 'vendor-docs' and o.name = p_path)
$$;
revoke all on function public.leave_doc_ok(text) from public, anon, authenticated;

drop function if exists public.attend_leave_apply(text, text, date, date, text, text);
create function public.attend_leave_apply(p_token text, p_kind text, p_start date, p_end date,
                                          p_half text default null, p_reason text default null, p_doc text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v uuid := attend_leave_session(p_token); n numeric; v_id uuid; nm text;
        d text := case when p_kind = 'sick' then nullif(btrim(coalesce(p_doc, '')), '') end;
begin
  n := vendor_leave_validate(v, p_kind, p_start, p_end, p_half, p_reason, false);
  if d is not null and not leave_doc_ok(d) then raise exception 'The document didn''t upload — attach it again'; end if;
  if p_kind = 'sick' and n > 1 and d is null then
    raise exception 'Sick leave of more than one day needs a doctor''s note or prescription — attach a photo of it';
  end if;
  insert into vendor_leaves (vendor_id, kind, start_date, end_date, half, reason, days, source, created_by, doc_path)
  values (v, p_kind, p_start, p_end, p_half, nullif(btrim(coalesce(p_reason, '')), ''), n, 'portal', 'vendor', d)
  returning vendor_leaves.id into v_id;
  select full_name into nm from vendors where vendors.id = v;
  perform vendor_leave_notify(v_id, 'Leave request: ' || coalesce(nm, 'a vendor'));
  return jsonb_build_object('id', v_id, 'days', n);
end $$;
grant execute on function public.attend_leave_apply(text, text, date, date, text, text, text) to anon, authenticated;

-- Add or replace the document on one of their own sick leaves afterwards.
create or replace function public.attend_leave_attach(p_token text, p_id uuid, p_doc text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v uuid := attend_leave_session(p_token); l vendor_leaves;
begin
  select * into l from vendor_leaves where id = p_id and vendor_id = v;
  if l.id is null then raise exception 'Leave not found'; end if;
  if l.kind <> 'sick' then raise exception 'Documents are for sick leave'; end if;
  if l.status in ('declined', 'cancelled') then raise exception 'This leave is %', l.status; end if;
  if not leave_doc_ok(p_doc) then raise exception 'The document didn''t upload — attach it again'; end if;
  update vendor_leaves set doc_path = p_doc where id = p_id;
  return jsonb_build_object('id', p_id, 'has_doc', true);
end $$;
revoke all on function public.attend_leave_attach(text, uuid, text) from public;
grant execute on function public.attend_leave_attach(text, uuid, text) to anon, authenticated;

CREATE OR REPLACE FUNCTION public.attend_leave_status(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v uuid := attend_leave_session(p_token); today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  return jsonb_build_object(
    'today', today,
    'balance', vendor_leave_balance(v, today),
    'weekly_off', (select weekly_off from vendor_leave_policy where id = 1),
    'on_leave', (select jsonb_build_object('id', l.id, 'kind', l.kind, 'half', l.half, 'end', l.end_date)
                   from vendor_leaves l where l.vendor_id = v and l.status = 'approved'
                    and today between l.start_date and l.end_date limit 1),
    'holiday_today', (select name from vendor_holidays where day = today),
    'holidays', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'name', name) order by day)
                            from vendor_holidays where day between today and today + 120), '[]'),
    'leaves', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', l.id, 'kind', l.kind, 'start', l.start_date, 'end', l.end_date, 'half', l.half,
                 'reason', l.reason, 'has_doc', l.doc_path is not null, 'status', l.status, 'days', l.days, 'paid_days', l.paid_days,
                 'unpaid_days', l.unpaid_days, 'counts_balance', l.counts_balance,
                 'decided_by', split_part(l.decided_by, '@', 1), 'decided_at', l.decided_at,
                 'note', l.decision_note, 'source', l.source, 'created_at', l.created_at,
                 'cancelled_by', case when l.cancelled_by is null then null when l.cancelled_by = 'vendor' then 'you' else split_part(l.cancelled_by, '@', 1) end)
                 order by l.start_date desc)
               from vendor_leaves l where l.vendor_id = v and l.end_date >= today - 400), '[]')
  );
end $function$;

CREATE OR REPLACE FUNCTION public.vendor_leave_board(p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  f date := coalesce(p_from, today);
  t date := coalesce(p_to, coalesce(p_from, today) + 13);
  m0 date := date_trunc('month', today)::date;
begin
  return jsonb_build_object(
    'today', today, 'from', f, 'to', t,
    'me', leave_me(), 'can_decide', leave_can_decide(), 'approvers', to_jsonb(leave_approvers()),
    'policy', (select to_jsonb(p) from vendor_leave_policy p where id = 1),
    'vendors', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'name', v.full_name, 'trade', v.trade, 'code', v.vendor_code,
                                                             'avatar', v.avatar_path, 'balance', vendor_leave_balance(v.id, today))
                                          order by v.full_name)
                           from vendors v where v.status = 'approved' and v.exited_at is null and v.archived_at is null), '[]'),
    'holidays', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'name', name, 'kind', kind) order by day)
                            from vendor_holidays where day >= today - 365), '[]'),
    'days', coalesce((select jsonb_agg(jsonb_build_object('leave_id', r.leave_id, 'vendor_id', r.vendor_id, 'day', r.day,
                                                          'amount', r.amount, 'paid', r.paid, 'kind', r.kind, 'status', r.status, 'half', r.half))
                        from vendor_leave_day_rows(f, t) r), '[]'),
    -- booked work in the window, for the grid's underline
    'work', coalesce((select jsonb_agg(distinct jsonb_build_object('vendor_id', w.vendor_id, 'day', d::date, 'pid', w.pid))
                        from work_orders w join properties pw on pw.pid = w.pid and pw.deleted_at is null and pw.closed_at is null and pw.archived_at is null and pw.journey_paused_at is null
                        cross join lateral generate_series(greatest(w.scheduled_start, f), least(coalesce(w.scheduled_end, w.scheduled_start), t), interval '1 day') d
                       where w.vendor_id is not null and w.status not in ('verified', 'cancelled') and w.scheduled_start is not null
                         and w.scheduled_start <= t and coalesce(w.scheduled_end, w.scheduled_start) >= f), '[]')
             || coalesce((select jsonb_agg(distinct jsonb_build_object('vendor_id', w.vendor_id, 'day', p.setup_date, 'pid', p.pid))
                        from properties p join work_orders w on w.pid = p.pid and w.vendor_id is not null
                       where p.setup_date between f and t and p.setup_closed_at is null and p.journey_paused_at is null and p.closed_at is null and p.archived_at is null and p.deleted_at is null
                         and exists (select 1 from work_order_items i where i.work_order_id = w.id and i.status in ('pending', 'disputed'))), '[]'),
    'pending', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'vendor_id', l.vendor_id, 'kind', l.kind,
                                           'start', l.start_date, 'end', l.end_date, 'half', l.half, 'reason', l.reason, 'doc', l.doc_path,
                                           'days', l.days, 'created_at', l.created_at, 'source', l.source,
                                           'quote', vendor_leave_quote(l.vendor_id, l.kind, l.start_date, l.end_date, l.half, l.id))
                                         order by l.start_date)
                          from vendor_leaves l where l.status = 'pending'), '[]'),
    'month', jsonb_build_object('start', m0,
       'paid',   (select coalesce(sum(amount) filter (where paid), 0) from vendor_leave_day_rows(m0, (m0 + interval '1 month' - interval '1 day')::date) where status = 'approved'),
       'unpaid', (select coalesce(sum(amount) filter (where not paid), 0) from vendor_leave_day_rows(m0, (m0 + interval '1 month' - interval '1 day')::date) where status = 'approved'))
  );
end $function$;
