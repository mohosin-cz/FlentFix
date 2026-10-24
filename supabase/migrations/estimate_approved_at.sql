-- An estimate that becomes approved always carries approved_at.
--
-- Stage reads Pulse's estimates through recon_landlord_billing_rows
-- (estimate_status + approved_at) to move a property from raised to approved.
-- Landlord approve-all stamped approved_at; an estimate completed by
-- rejecting lines or closed out by staff (estimate_staff_decide /
-- estimate_mark_final → estimate_refresh_status) set status 'approved' but
-- left approved_at null, so Stage never moved it (PID 237, 2026-10-24).

create or replace function public.estimate_refresh_status(p_estimate_id uuid)
returns void language sql security definer set search_path = public as $$
  update estimates e set
      status = case
        when estimate_undecided(e.id) = 0 then 'approved'
        when exists (select 1 from estimate_items i where i.estimate_id = e.id and i.status = 'approved') then 'partially_approved'
        else e.status end,
      approved_at = case when estimate_undecided(e.id) = 0 then coalesce(e.approved_at, now()) else e.approved_at end
   where e.id = p_estimate_id and e.status in ('sent', 'viewed', 'partially_approved', 'approved')
$$;

-- PID 237: closed out 2026-10-24 15:42 IST by mohosin, approved_at never stamped
update estimates
   set approved_at = (select estimate_final_at from properties where pid = '237'),
       approved_by_name = coalesce(approved_by_name, 'mohosin@flent.in'),
       approved_by_email = coalesce(approved_by_email, 'mohosin@flent.in')
 where id = '489f3ec1-c516-4288-ba32-87c87eb9cc1f' and approved_at is null;
