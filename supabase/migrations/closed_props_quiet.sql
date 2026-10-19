-- A property that's closed or archived is finished: nothing about it should
-- sit in anyone's tasks (told 2026-10-20). The journey engine already treats it
-- as done; these are the places that read work orders and estimates directly:
--   · the vendor app's WO tab — only finished (verified) work orders of a
--     closed / archived property stay, as history
--   · vendor leave — work on those properties is no longer "booked"
--   · the bell — alerts about a property are marked read when it closes or is
--     archived
-- (Home's desk and Team view: home_desk.sql and home_team.sql, re-applied.)

begin;

create or replace function public.attend_work_orders(p_token text)
 returns table(id uuid, token text, pid text, trade text, status text, scheduled_start date, scheduled_end date, issued_at timestamp with time zone, vendor_completed_at timestamp with time zone, verified_at timestamp with time zone, item_count integer, open_count integer, disputed_count integer)
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare s public.attend_session;
begin
  select * into s from public.attend_session a
   where a.token = p_token and a.expires_at > now();
  if s.token is null then
    raise exception 'Session expired — sign in again';
  end if;

  return query
    select w.id, w.token, w.pid, w.trade, w.status,
           w.scheduled_start, w.scheduled_end,
           w.issued_at, w.vendor_completed_at, w.verified_at,
           (select count(*)::int from public.work_order_items i
             where i.work_order_id = w.id) as item_count,
           (select count(*)::int from public.work_order_items i
             where i.work_order_id = w.id and i.status in ('pending','disputed')) as open_count,
           (select count(*)::int from public.work_order_items i
             where i.work_order_id = w.id and i.status = 'disputed') as disputed_count
      from public.work_orders w
      left join public.properties p on p.pid = w.pid
     where w.vendor_id = s.vendor_id
       and coalesce(w.status, '') <> 'draft'
       -- a closed or archived property's work is over: keep only finished work orders, as history
       and (w.status = 'verified' or p.pid is null or (p.deleted_at is null and p.closed_at is null and p.archived_at is null))
     order by (coalesce(w.status,'') in ('assigned','in_progress')) desc,
              w.issued_at desc nulls last,
              w.created_at desc;
end $function$;

create or replace function public.vendor_leave_quote(p_vendor uuid, p_kind text, p_start date, p_end date,
                                                     p_half text default null, p_exclude uuid default null)
returns jsonb
language plpgsql stable set search_path = public as $$
declare
  n numeric; bal jsonb; lft numeric; v record;
begin
  select * into v from vendors where id = p_vendor;
  select coalesce(sum(amount), 0) into n from vendor_leave_workdays(p_start, p_end, p_half);
  bal := vendor_leave_balance(p_vendor, p_start);
  lft := greatest((bal ->> 'left')::numeric, 0);
  return jsonb_build_object(
    'days', n,
    'calendar_days', p_end - p_start + 1,
    'paid',   case when p_kind = 'paid' then least(n, lft) when p_kind = 'sick' then n else null end,
    'unpaid', case when p_kind = 'paid' then greatest(n - lft, 0) when p_kind = 'sick' then 0 else null end,
    'balance', bal,
    'skipped', coalesce((select jsonb_agg(jsonb_build_object('day', d::date,
                          'why', coalesce((select h.name from vendor_holidays h where h.day = d::date), 'Sunday')) order by d)
                           from generate_series(p_start, p_end, interval '1 day') d
                          where not exists (select 1 from vendor_leave_workdays(d::date, d::date) w)), '[]'),
    'overlaps', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'start', l.start_date, 'end', l.end_date, 'status', l.status, 'kind', l.kind))
                            from vendor_leaves l where l.vendor_id = p_vendor and l.status in ('pending', 'approved')
                             and l.start_date <= p_end and l.end_date >= p_start and l.id is distinct from p_exclude), '[]'),
    -- work they are booked on in that stretch: a work order's scheduled days,
    -- or the setup day of a property where their work is still open
    'clashes', coalesce((select jsonb_agg(c order by c ->> 'day') from (
        select distinct jsonb_build_object('pid', w.pid, 'day', greatest(w.scheduled_start, p_start), 'trade', w.trade,
                                           'what', 'work order ' || to_char(w.scheduled_start, 'DD Mon')
                                                   || case when coalesce(w.scheduled_end, w.scheduled_start) > w.scheduled_start
                                                           then '–' || to_char(w.scheduled_end, 'DD Mon') else '' end) c
          from work_orders w join properties pw on pw.pid = w.pid
         where w.vendor_id = p_vendor and w.status not in ('verified', 'cancelled')
           and pw.deleted_at is null and pw.closed_at is null and pw.archived_at is null and pw.journey_paused_at is null
           and w.scheduled_start is not null
           and w.scheduled_start <= p_end and coalesce(w.scheduled_end, w.scheduled_start) >= p_start
        union
        select distinct jsonb_build_object('pid', p.pid, 'day', p.setup_date, 'trade', w.trade, 'what', 'setup day')
          from properties p join work_orders w on w.pid = p.pid and w.vendor_id = p_vendor
         where p.setup_date between p_start and p_end and p.setup_closed_at is null
           and p.deleted_at is null and p.closed_at is null and p.archived_at is null and p.journey_paused_at is null
           and exists (select 1 from work_order_items i where i.work_order_id = w.id and i.status in ('pending', 'disputed'))
      ) s), '[]'),
    -- who could cover: same trade, not off on any of those days
    'cover', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.full_name) order by o.full_name)
                         from vendors o
                        where o.status = 'approved' and o.exited_at is null and o.archived_at is null
                          and o.id <> p_vendor and o.trade = v.trade
                          and not exists (select 1 from vendor_leaves l where l.vendor_id = o.id and l.status in ('approved', 'pending')
                                           and l.start_date <= p_end and l.end_date >= p_start)), '[]')
  );
end $$;

create or replace function public.vendor_leave_board(p_from date default null, p_to date default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
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
                                           'start', l.start_date, 'end', l.end_date, 'half', l.half, 'reason', l.reason,
                                           'days', l.days, 'created_at', l.created_at, 'source', l.source,
                                           'quote', vendor_leave_quote(l.vendor_id, l.kind, l.start_date, l.end_date, l.half, l.id))
                                         order by l.start_date)
                          from vendor_leaves l where l.status = 'pending'), '[]'),
    'month', jsonb_build_object('start', m0,
       'paid',   (select coalesce(sum(amount) filter (where paid), 0) from vendor_leave_day_rows(m0, (m0 + interval '1 month' - interval '1 day')::date) where status = 'approved'),
       'unpaid', (select coalesce(sum(amount) filter (where not paid), 0) from vendor_leave_day_rows(m0, (m0 + interval '1 month' - interval '1 day')::date) where status = 'approved'))
  );
end $$;

-- the bell: a property that's closed or archived has nothing left to alert about
create or replace function public.properties_quiet_when_done()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.closed_at is not null and old.closed_at is null) or (new.archived_at is not null and old.archived_at is null) then
    update notifications set read_at = coalesce(read_at, now()) where pid = new.pid and read_at is null;
  end if;
  return new;
end $$;
drop trigger if exists trg_properties_quiet_when_done on public.properties;
create trigger trg_properties_quiet_when_done after update of closed_at, archived_at on public.properties
  for each row execute function public.properties_quiet_when_done();

-- and today, for what's already closed or archived
update notifications n set read_at = coalesce(n.read_at, now())
  from properties p where p.pid = n.pid and n.read_at is null and (p.closed_at is not null or p.archived_at is not null);

commit;
