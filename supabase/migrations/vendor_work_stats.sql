-- Per-vendor work stats for the staff onboarded roster: how many distinct
-- properties (sites) they've clocked in at. Payout will be added once payroll
-- exists. Repo source of truth.
create or replace function public.vendor_stats()
returns table (vendor_id uuid, properties_done bigint)
language sql
security invoker
set search_path = public
as $$
  select vendor_id, count(distinct pid)
  from public.vendor_attendance
  where pid is not null
  group by vendor_id;
$$;
grant execute on function public.vendor_stats() to authenticated;
