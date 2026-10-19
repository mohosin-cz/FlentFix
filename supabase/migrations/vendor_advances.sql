-- Vendor advances: money paid ahead of payday, recorded the day it's paid,
-- and taken back automatically when the month's payroll is made.
--
-- An advance is split into monthly instalments (all in one month by default,
-- or spread over a few). The instalments always add up to the advance. When a
-- draft month exists — or is created — each vendor's line gets the month's
-- instalments as "advance back", labelled with which advance it is.
--
-- Editing the deduction on a draft line moves money between months instead of
-- losing it: take less and the rest goes to next month; take more and it's
-- pulled forward from later months.
--
-- A month that's final counts its instalments as taken back if the vendor had
-- a line that month; if they had no line, the instalment shows as missed, to be
-- moved on. Lines that never touched the ledger (all of Jan–Sep's typed-in
-- advances) are left exactly as they are.

begin;

create table if not exists public.vendor_advances (
  id            uuid primary key default gen_random_uuid(),
  vendor_id     uuid not null references public.vendors(id) on delete cascade,
  amount        numeric not null check (amount > 0),
  given_on      date not null,
  method        text not null default 'upi' check (method in ('upi', 'bank', 'cash', 'other')),
  reference     text,
  reason        text,
  created_by    text,
  created_at    timestamptz not null default now(),
  cancelled_at  timestamptz,
  cancelled_by  text,
  cancel_reason text
);
create index if not exists vendor_advances_vendor_idx on public.vendor_advances (vendor_id, given_on desc);

create table if not exists public.vendor_advance_installments (
  id          uuid primary key default gen_random_uuid(),
  advance_id  uuid not null references public.vendor_advances(id) on delete cascade,
  month       date not null check (extract(day from month) = 1),
  amount      numeric not null check (amount > 0),
  unique (advance_id, month)
);
create index if not exists vendor_advance_inst_month_idx on public.vendor_advance_installments (month);

alter table public.vendor_payouts add column if not exists advance_auto boolean not null default false;
alter table public.vendor_payouts add column if not exists advance_note text;

alter table public.vendor_advances enable row level security;
alter table public.vendor_advance_installments enable row level security;
drop policy if exists "staff read" on public.vendor_advances;
drop policy if exists "staff read" on public.vendor_advance_installments;
create policy "staff read" on public.vendor_advances for select to authenticated using (true);
create policy "staff read" on public.vendor_advance_installments for select to authenticated using (true);

create or replace function public.adv_me() returns text language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

-- ── put the ledger onto a draft month ──────────────────────────────────────
create or replace function public.payroll_apply_advances(p_period_id uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare per record; m date; m_end date; n int;
begin
  select * into per from vendor_payroll_periods where id = p_period_id;
  if per.id is null or per.status <> 'draft' then return 0; end if;
  m := date_trunc('month', per.period_month)::date;
  m_end := (m + interval '1 month' - interval '1 day')::date;
  -- our own writes: the reconcile trigger stays out of the way
  perform set_config('pulse.advance_apply', '1', true);

  with due as (
    select a.vendor_id, sum(i.amount) amt,
           string_agg('Advance ' || to_char(a.given_on, 'FMDD Mon') || ' · ₹' || to_char(a.amount, 'FM99,99,999')
                      || case when (select count(*) from vendor_advance_installments x where x.advance_id = a.id) = 1 then ' · all this month'
                              else ' · ₹' || to_char(i.amount, 'FM99,99,999') || ' this month' end, '; ' order by a.given_on) note
      from vendor_advance_installments i join vendor_advances a on a.id = i.advance_id
     where i.month = m and a.cancelled_at is null
     group by a.vendor_id
  ),
  given as (
    select vendor_id, sum(amount) amt from vendor_advances
     where cancelled_at is null and given_on between m and m_end group by vendor_id
  ),
  calc as (
    select p.id,
           coalesce(d.amt, 0) rec, coalesce(g.amt, 0) gv, d.note,
           (d.vendor_id is not null or g.vendor_id is not null) touched
      from vendor_payouts p
      left join due d on d.vendor_id = p.vendor_id
      left join given g on g.vendor_id = p.vendor_id
     where p.period_id = p_period_id and p.vendor_id is not null
       and (p.advance_auto or d.vendor_id is not null or g.vendor_id is not null)
  )
  update vendor_payouts p set
    advance_recovered = c.rec,
    advance_given     = c.gv,
    advance_auto      = c.touched,
    advance_note      = c.note,
    total_payout      = round(coalesce(p.fixed_pay, 0) / 30 * coalesce(p.days_worked, 30))
                        + coalesce(p.allowance, 0) + coalesce(p.ot_amount, 0) - c.rec
    from calc c
   where p.id = c.id;
  get diagnostics n = row_count;
  perform set_config('pulse.advance_apply', '', true);
  return n;
end $$;

-- every draft month an advance's instalments touch
create or replace function public.adv_apply_months(p_months date[])
returns void
language sql security definer set search_path = public as $$
  select payroll_apply_advances(pp.id) from vendor_payroll_periods pp
   where pp.status = 'draft' and date_trunc('month', pp.period_month)::date = any(p_months)
$$;

-- ── staff edits a draft line's deduction: move money, don't lose it ───────
create or replace function public.vendor_payout_advance_sync()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  per record; m date; sched numeric; diff numeric; r record; take numeric;
begin
  if coalesce(current_setting('pulse.advance_apply', true), '') = '1' then return new; end if;
  if new.vendor_id is null or new.advance_recovered is not distinct from old.advance_recovered then return new; end if;
  select * into per from vendor_payroll_periods where id = new.period_id;
  if per.status <> 'draft' then return new; end if;
  m := date_trunc('month', per.period_month)::date;

  select coalesce(sum(i.amount), 0) into sched
    from vendor_advance_installments i join vendor_advances a on a.id = i.advance_id
   where a.vendor_id = new.vendor_id and a.cancelled_at is null and i.month = m;
  if sched = 0 and not exists (select 1 from vendor_advances a join vendor_advance_installments i on i.advance_id = a.id
                                where a.vendor_id = new.vendor_id and a.cancelled_at is null and i.month > m) then
    return new;   -- no ledger for this vendor: a hand-typed deduction, as before
  end if;

  diff := coalesce(new.advance_recovered, 0) - sched;
  if diff < 0 then
    -- taking less: push the shortfall to next month, newest advance first
    diff := -diff;
    for r in select i.* from vendor_advance_installments i join vendor_advances a on a.id = i.advance_id
              where a.vendor_id = new.vendor_id and a.cancelled_at is null and i.month = m
              order by a.given_on desc, a.created_at desc loop
      exit when diff <= 0;
      take := least(diff, r.amount);
      insert into vendor_advance_installments (advance_id, month, amount)
      values (r.advance_id, (m + interval '1 month')::date, take)
      on conflict (advance_id, month) do update set amount = vendor_advance_installments.amount + excluded.amount;
      if take = r.amount then delete from vendor_advance_installments where id = r.id;
      else update vendor_advance_installments set amount = amount - take where id = r.id; end if;
      diff := diff - take;
    end loop;
  elsif diff > 0 then
    -- taking more: pull forward from later months, oldest advance first
    for r in select i.* from vendor_advance_installments i join vendor_advances a on a.id = i.advance_id
              where a.vendor_id = new.vendor_id and a.cancelled_at is null and i.month > m
              order by a.given_on, i.month loop
      exit when diff <= 0;
      take := least(diff, r.amount);
      insert into vendor_advance_installments (advance_id, month, amount) values (r.advance_id, m, take)
      on conflict (advance_id, month) do update set amount = vendor_advance_installments.amount + excluded.amount;
      if take = r.amount then delete from vendor_advance_installments where id = r.id;
      else update vendor_advance_installments set amount = amount - take where id = r.id; end if;
      diff := diff - take;
    end loop;
  end if;

  -- relabel the line (anything still above the ledger stays as typed)
  perform set_config('pulse.advance_apply', '1', true);
  update vendor_payouts set advance_auto = true,
         advance_note = (select string_agg('Advance ' || to_char(a.given_on, 'FMDD Mon') || ' · ₹' || to_char(i.amount, 'FM99,99,999') || ' this month', '; ' order by a.given_on)
                           from vendor_advance_installments i join vendor_advances a on a.id = i.advance_id
                          where a.vendor_id = new.vendor_id and a.cancelled_at is null and i.month = m)
   where id = new.id;
  perform set_config('pulse.advance_apply', '', true);
  return new;
end $$;

drop trigger if exists vendor_payout_advance_sync on public.vendor_payouts;
create trigger vendor_payout_advance_sync after update of advance_recovered on public.vendor_payouts
  for each row execute function public.vendor_payout_advance_sync();

-- ── record / move / cancel ─────────────────────────────────────────────────
create or replace function public.vendor_advance_record(p_vendor uuid, p_amount numeric, p_given_on date,
  p_method text default 'upi', p_reference text default null, p_reason text default null,
  p_recover_from date default null, p_months int default 1)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; first date; per numeric; k int; months date[] := '{}'; st text;
begin
  if adv_me() = '' then raise exception 'Sign in first'; end if;
  if not exists (select 1 from vendors where id = p_vendor) then raise exception 'Pick a vendor'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter the amount'; end if;
  if p_given_on is null then raise exception 'When was it paid?'; end if;
  if p_months is null or p_months < 1 or p_months > 12 then raise exception 'Spread it over 1 to 12 months'; end if;
  first := date_trunc('month', coalesce(p_recover_from, p_given_on))::date;
  if first < date_trunc('month', p_given_on)::date then raise exception 'It can’t be taken back before it was paid'; end if;
  select status into st from vendor_payroll_periods where date_trunc('month', period_month)::date = first;
  if st in ('locked', 'paid') then
    raise exception '% payroll is already final — take it back from the next month', to_char(first, 'FMMonth');
  end if;

  insert into vendor_advances (vendor_id, amount, given_on, method, reference, reason, created_by)
  values (p_vendor, round(p_amount, 2), p_given_on, coalesce(p_method, 'upi'), nullif(btrim(coalesce(p_reference, '')), ''),
          nullif(btrim(coalesce(p_reason, '')), ''), adv_me())
  returning id into v_id;

  per := floor(p_amount / p_months);
  for k in 0 .. p_months - 1 loop
    insert into vendor_advance_installments (advance_id, month, amount)
    values (v_id, (first + make_interval(months => k))::date,
            case when k = p_months - 1 then round(p_amount, 2) - per * (p_months - 1) else per end);
    months := months || (first + make_interval(months => k))::date;
  end loop;
  -- the month it was paid in carries "advance paid" too
  months := months || date_trunc('month', p_given_on)::date;
  perform adv_apply_months(months);
  return v_id;
end $$;

-- An instalment's state, from the payroll month it falls in.
create or replace function public.adv_inst_state(p_vendor uuid, p_month date)
returns text
language sql stable set search_path = public as $$
  select case
    when pp.id is null then 'upcoming'
    when pp.status = 'draft' then 'draft'
    when exists (select 1 from vendor_payouts p where p.period_id = pp.id and p.vendor_id = p_vendor) then 'recovered'
    else 'missed' end
  from (select 1) x
  left join vendor_payroll_periods pp on date_trunc('month', pp.period_month)::date = p_month
$$;

-- Move one month's instalment on to the next month (a vendor short that
-- month, or a month that went final without them).
create or replace function public.vendor_advance_move(p_advance uuid, p_month date)
returns void
language plpgsql security definer set search_path = public as $$
declare a record; i record; nxt date; st text;
begin
  if adv_me() = '' then raise exception 'Sign in first'; end if;
  select * into a from vendor_advances where id = p_advance and cancelled_at is null;
  if a.id is null then raise exception 'Advance not found'; end if;
  select * into i from vendor_advance_installments where advance_id = p_advance and month = date_trunc('month', p_month)::date;
  if i.id is null then raise exception 'Nothing due that month'; end if;
  st := adv_inst_state(a.vendor_id, i.month);
  if st = 'recovered' then raise exception 'That month already took it back'; end if;
  nxt := (i.month + interval '1 month')::date;
  -- skip forward past months already final
  while exists (select 1 from vendor_payroll_periods where date_trunc('month', period_month)::date = nxt and status in ('locked', 'paid')) loop
    nxt := (nxt + interval '1 month')::date;
  end loop;
  insert into vendor_advance_installments (advance_id, month, amount) values (p_advance, nxt, i.amount)
  on conflict (advance_id, month) do update set amount = vendor_advance_installments.amount + excluded.amount;
  delete from vendor_advance_installments where id = i.id;
  perform adv_apply_months(array[i.month, nxt]);
end $$;

create or replace function public.vendor_advance_cancel(p_advance uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare a record; months date[];
begin
  if adv_me() = '' then raise exception 'Sign in first'; end if;
  select * into a from vendor_advances where id = p_advance and cancelled_at is null;
  if a.id is null then raise exception 'Advance not found'; end if;
  if exists (select 1 from vendor_advance_installments i where i.advance_id = p_advance and adv_inst_state(a.vendor_id, i.month) = 'recovered') then
    raise exception 'Some of it has already been taken back — move the rest instead of cancelling';
  end if;
  select array_agg(month) into months from vendor_advance_installments where advance_id = p_advance;
  update vendor_advances set cancelled_at = now(), cancelled_by = adv_me(), cancel_reason = nullif(btrim(coalesce(p_reason, '')), '') where id = p_advance;
  perform adv_apply_months(coalesce(months, '{}') || date_trunc('month', a.given_on)::date);
end $$;

-- ── what the ledger shows ──────────────────────────────────────────────────
create or replace function public.vendor_advance_ledger()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m0 date := date_trunc('month', (now() at time zone 'Asia/Kolkata'))::date;
begin
  if adv_me() = '' then raise exception 'Sign in first'; end if;
  return (
    with inst as (
      select i.*, a.vendor_id, adv_inst_state(a.vendor_id, i.month) state
        from vendor_advance_installments i join vendor_advances a on a.id = i.advance_id
    ),
    adv as (
      select a.*, v.full_name, v.trade, v.avatar_path,
             coalesce((select sum(amount) from inst where advance_id = a.id and state = 'recovered'), 0) recovered,
             coalesce((select jsonb_agg(jsonb_build_object('month', month, 'amount', amount, 'state', state) order by month)
                         from inst where advance_id = a.id), '[]') schedule
        from vendor_advances a join vendors v on v.id = a.vendor_id
    )
    select jsonb_build_object(
      'month', m0,
      'advances', coalesce((select jsonb_agg(jsonb_build_object(
          'id', id, 'vendor_id', vendor_id, 'name', full_name, 'trade', trade, 'avatar', avatar_path,
          'amount', amount, 'given_on', given_on, 'method', method, 'reference', reference, 'reason', reason,
          'created_by', split_part(created_by, '@', 1), 'created_at', created_at,
          'cancelled', cancelled_at is not null, 'cancel_reason', cancel_reason,
          'recovered', recovered, 'outstanding', case when cancelled_at is null then amount - recovered else 0 end,
          'schedule', schedule) order by (cancelled_at is null and amount - recovered > 0) desc, given_on desc) from adv), '[]'),
      'outstanding', coalesce((select sum(amount - recovered) from adv where cancelled_at is null), 0),
      'due_this_month', coalesce((select sum(i.amount) from inst i join vendor_advances a on a.id = i.advance_id
                                   where a.cancelled_at is null and i.month = m0), 0),
      'due_vendors', (select count(distinct a.vendor_id) from inst i join vendor_advances a on a.id = i.advance_id
                       where a.cancelled_at is null and i.month = m0),
      'paid_this_month', coalesce((select sum(amount) from vendor_advances where cancelled_at is null
                                    and given_on >= m0 and given_on < (m0 + interval '1 month')::date), 0),
      'missed', (select count(*) from inst i join vendor_advances a on a.id = i.advance_id where a.cancelled_at is null and i.state = 'missed')
    )
  );
end $$;

-- The vendor's own view, in the /attend portal.
create or replace function public.attend_advances(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  select vendor_id into v from attend_session where token = p_token and expires_at > now();
  if v is null then raise exception 'Session expired — sign in again'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'amount', a.amount, 'given_on', a.given_on, 'method', a.method,
      'schedule', (select jsonb_agg(jsonb_build_object('month', i.month, 'amount', i.amount, 'state', adv_inst_state(v, i.month)) order by i.month)
                     from vendor_advance_installments i where i.advance_id = a.id)) order by a.given_on desc)
    from vendor_advances a where a.vendor_id = v and a.cancelled_at is null
      and a.given_on > (now() - interval '400 days')::date), '[]');
end $$;

-- ── a new month picks the ledger up ────────────────────────────────────────
-- payroll_fill_month as of vendor_leave.sql (leave comes off the 30), plus the
-- advances applied at the end.
create or replace function public.payroll_fill_month(p_period_id uuid)
returns int
language plpgsql security invoker set search_path = public
as $$
declare
  per record; rec record; last record;
  v_otdays int; v_fixed numeric; v_otamt numeric; v_earned numeric;
  v_paid numeric; v_unpaid numeric; v_days numeric;
  p_start date; p_end date; n int := 0;
begin
  select * into per from public.vendor_payroll_periods where id = p_period_id;
  if per.id is null then raise exception 'Period not found'; end if;
  p_start := per.period_month;
  p_end   := per.period_month + (coalesce(per.days_in_month, 30) - 1);

  delete from public.vendor_payouts where period_id = p_period_id;

  for rec in select * from public.vendors where status = 'approved' loop
    select p.* into last
      from public.vendor_payouts p
      join public.vendor_payroll_periods pp on pp.id = p.period_id
     where p.vendor_id = rec.id and p.period_id <> p_period_id
     order by pp.period_month desc limit 1;

    v_fixed := coalesce(rec.monthly_rate, last.fixed_pay,
                        (select monthly_rate from public.payroll_trade_rate where trade = rec.trade), 0);

    select count(distinct (punched_at at time zone 'Asia/Kolkata')::date) filter (where kind = 'overtime')
      into v_otdays
      from public.vendor_attendance
     where vendor_id = rec.id and (punched_at at time zone 'Asia/Kolkata')::date between p_start and p_end;

    select coalesce(sum(amount) filter (where paid), 0), coalesce(sum(amount) filter (where not paid), 0)
      into v_paid, v_unpaid
      from public.vendor_leave_day_rows(p_start, p_end, rec.id) where status = 'approved';

    v_days   := greatest(30 - v_unpaid, 0);
    v_otamt  := round(coalesce(v_otdays,0) * 1.25 * v_fixed / 30);
    v_earned := round(v_fixed / 30 * v_days);

    insert into public.vendor_payouts(
      period_id, vendor_id, beneficiary_name, team, cost_centre, upi_id,
      bank_account_name, bank_account_no, bank_ifsc,
      fixed_pay, allowance, days_worked, ot_days, ot_amount,
      advance_given, advance_recovered, total_payout, source, comments
    ) values (
      p_period_id, rec.id,
      coalesce(last.beneficiary_name, rec.full_name),
      coalesce(last.team, rec.pod),
      last.cost_centre,
      coalesce(last.upi_id, rec.upi_id),
      coalesce(last.bank_account_name, rec.bank_account_name),
      coalesce(last.bank_account_no, rec.bank_account_no),
      coalesce(last.bank_ifsc, rec.bank_ifsc),
      v_fixed, 0, v_days, coalesce(v_otdays,0), v_otamt,
      0, 0, v_earned + v_otamt, 'generated',
      case when v_paid + v_unpaid > 0 then
        'Leave: ' || concat_ws(', ', case when v_paid > 0 then trim_scale(v_paid)::text || ' paid' end,
                                     case when v_unpaid > 0 then trim_scale(v_unpaid)::text || ' unpaid (deducted)' end) end
    );
    n := n + 1;
  end loop;

  perform public.payroll_apply_advances(p_period_id);
  return n;
end $$;

-- ── grants ─────────────────────────────────────────────────────────────────
revoke all on function public.payroll_apply_advances(uuid) from public, anon;
revoke all on function public.adv_apply_months(date[]) from public, anon, authenticated;
revoke all on function public.vendor_advance_record(uuid, numeric, date, text, text, text, date, int) from public, anon;
revoke all on function public.vendor_advance_move(uuid, date) from public, anon;
revoke all on function public.vendor_advance_cancel(uuid, text) from public, anon;
revoke all on function public.vendor_advance_ledger() from public, anon;
grant execute on function public.payroll_apply_advances(uuid) to authenticated;
grant execute on function public.vendor_advance_record(uuid, numeric, date, text, text, text, date, int) to authenticated;
grant execute on function public.vendor_advance_move(uuid, date) to authenticated;
grant execute on function public.vendor_advance_cancel(uuid, text) to authenticated;
grant execute on function public.vendor_advance_ledger() to authenticated;
grant execute on function public.adv_inst_state(uuid, date) to authenticated;
grant execute on function public.attend_advances(text) to anon, authenticated;
grant execute on function public.payroll_fill_month(uuid) to authenticated;

commit;
