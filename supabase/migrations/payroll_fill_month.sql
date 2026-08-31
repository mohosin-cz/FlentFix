-- Fill/regenerate a month's payouts by carrying each approved vendor's monthly
-- salary forward (from their most recent payout / rate), pro-rated on a 30-day
-- basis, plus overtime from attendance. Idempotent: clears the period's lines
-- first, so it can regenerate a draft month. Repo source of truth.
--
-- Model: per_day = salary / 30. earned = per_day × days_worked (default 30 =
-- full month; staff reduce for absentees on review). OT = per_day × 1.25 ×
-- ot_days (1 OT day pays a day and a quarter). total = earned + allowance + OT
-- − advances.
--
-- The 1.25 also lives in PayrollTab.jsx as OT_RATE, which recomputes a row when
-- staff edit it. The two have to move together or a generated month and an
-- edited one disagree about the same overtime.
create or replace function public.payroll_fill_month(p_period_id uuid)
returns int
language plpgsql security invoker set search_path = public
as $$
declare
  per record; rec record; last record;
  v_otdays int; v_fixed numeric; v_otamt numeric; v_earned numeric;
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

    -- monthly salary (base), carried forward
    v_fixed := coalesce(rec.monthly_rate, last.fixed_pay,
                        (select monthly_rate from public.payroll_trade_rate where trade = rec.trade), 0);

    -- OT days from attendance (distinct dates with an overtime session)
    select count(distinct (punched_at at time zone 'Asia/Kolkata')::date) filter (where kind = 'overtime')
      into v_otdays
      from public.vendor_attendance
     where vendor_id = rec.id and (punched_at at time zone 'Asia/Kolkata')::date between p_start and p_end;

    v_otamt  := round(coalesce(v_otdays,0) * 1.25 * v_fixed / 30);  -- 1 OT day = 1.25 days' pay
    v_earned := round(v_fixed / 30 * 30);                     -- full month (days_worked = 30 default)

    insert into public.vendor_payouts(
      period_id, vendor_id, beneficiary_name, team, cost_centre, upi_id,
      bank_account_name, bank_account_no, bank_ifsc,
      fixed_pay, allowance, days_worked, ot_days, ot_amount,
      advance_given, advance_recovered, total_payout, source
    ) values (
      p_period_id, rec.id,
      coalesce(last.beneficiary_name, rec.full_name),
      coalesce(last.team, rec.pod),
      last.cost_centre,
      coalesce(last.upi_id, rec.upi_id),
      coalesce(last.bank_account_name, rec.bank_account_name),
      coalesce(last.bank_account_no, rec.bank_account_no),
      coalesce(last.bank_ifsc, rec.bank_ifsc),
      v_fixed, 0, 30, coalesce(v_otdays,0), v_otamt,
      0, 0, v_earned + v_otamt, 'generated'
    );
    n := n + 1;
  end loop;
  return n;
end $$;
grant execute on function public.payroll_fill_month(uuid) to authenticated;
