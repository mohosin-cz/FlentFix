-- Per-vendor present days + overtime days for a period (IST), for auto-filling
-- a new payroll month (vendor_payouts) from attendance. Repo source of truth.
create or replace function public.payout_month_stats(p_start date, p_end date)
returns table (vendor_id uuid, present_days int, ot_days int)
language sql
security invoker
set search_path = public
as $$
  select vendor_id,
         count(distinct (punched_at at time zone 'Asia/Kolkata')::date)::int as present_days,
         count(distinct (punched_at at time zone 'Asia/Kolkata')::date)
           filter (where kind = 'overtime')::int as ot_days
  from public.vendor_attendance
  where (punched_at at time zone 'Asia/Kolkata')::date between p_start and p_end
  group by vendor_id;
$$;
grant execute on function public.payout_month_stats(date, date) to authenticated;
