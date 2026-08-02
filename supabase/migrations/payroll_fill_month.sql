-- Fill/regenerate a month's payouts by carrying each approved vendor's most
-- recent payout forward (salary, team, cost-centre, bank/upi) and layering
-- fresh attendance (days worked + OT) on top. Idempotent: clears the period's
-- lines first, so it can regenerate a draft month. Repo source of truth.
create or replace function public.payroll_fill_month(p_period_id uuid)
returns int
language plpgsql security invoker set search_path = public
as $$
declare
  per record; rec record; last record;
  v_present int; v_otdays int; v_fixed numeric; v_otamt numeric;
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

    select count(distinct (punched_at at time zone 'Asia/Kolkata')::date),
           count(distinct (punched_at at time zone 'Asia/Kolkata')::date) filter (where kind = 'overtime')
      into v_present, v_otdays
      from public.vendor_attendance
     where vendor_id = rec.id and (punched_at at time zone 'Asia/Kolkata')::date between p_start and p_end;

    v_otamt := case when per.days_in_month > 0 then round(coalesce(v_otdays,0) * v_fixed / per.days_in_month) else 0 end;

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
      v_fixed, 0, coalesce(v_present,0), coalesce(v_otdays,0), v_otamt,
      0, 0, v_fixed + v_otamt, 'generated'
    );
    n := n + 1;
  end loop;
  return n;
end $$;
grant execute on function public.payroll_fill_month(uuid) to authenticated;
