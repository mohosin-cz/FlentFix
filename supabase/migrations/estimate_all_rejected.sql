-- 100% rejected → the estimate's status is 'rejected'.
--
-- Everything else is captured as before (each line's rejection, history,
-- workbench, journey). Only the estimate's overall status changes, so Stage
-- and other apps reading estimates.status / approved_at (e.g. through
-- recon_landlord_billing_rows) see a rejected estimate, not an approved one:
--   every live line decided, at least one approved → 'approved' (+ approved_at)
--   every live line decided, every one rejected    → 'rejected' (approved_at null)
--   some undecided, at least one approved           → 'partially_approved'
--   some undecided, none approved                   → back to viewed / sent
--                                                     (an undone decision)
-- An estimate with no live lines is left alone.

create or replace function public.estimate_refresh_status(p_estimate_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_open int := estimate_undecided(p_estimate_id);
  v_appr int; v_rej int;
begin
  select count(*) filter (where status = 'approved'), count(*) filter (where status = 'rejected')
    into v_appr, v_rej
    from estimate_items where estimate_id = p_estimate_id and cost_type is distinct from 'nil';

  update estimates e set
      status = case
        when v_open = 0 and v_appr > 0 then 'approved'
        when v_open = 0 and v_appr = 0 and v_rej > 0 then 'rejected'
        when v_open > 0 and v_appr > 0 then 'partially_approved'
        when v_open > 0 and e.status in ('approved', 'rejected', 'partially_approved')
          then case when e.first_viewed_at is not null then 'viewed' else 'sent' end
        else e.status end,
      -- an approval date only while fully approved; undone or rejected clears it
      approved_at = case when v_open = 0 and v_appr > 0 then coalesce(e.approved_at, now()) else null end
   where e.id = p_estimate_id and e.status in ('sent', 'viewed', 'partially_approved', 'approved', 'rejected');
end $$;
