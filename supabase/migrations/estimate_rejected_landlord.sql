-- A line Flent has rejected is no longer the landlord's to approve: their page
-- shows it as dropped with no buttons, and this keeps a stale page (opened
-- before the rejection) from approving it anyway. Removed and excluded lines
-- get the same guard. Also refreshes the estimate's status after an approval.

create or replace function public.estimate_approve_item(p_token text, p_session uuid, p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare a record; v_status text;
begin
  select * into a from estimate_actor(p_token, p_session);
  select status into v_status from estimate_items where id = p_item_id and estimate_id = a.estimate_id;
  if not found then raise exception 'That line is not on this estimate'; end if;
  if v_status in ('rejected', 'removed', 'excluded') then
    raise exception 'This item has been dropped from the estimate';
  end if;
  update estimate_items set status = 'approved', approved_by_email = a.email, approved_at = now()
   where id = p_item_id and estimate_id = a.estimate_id;
  insert into estimate_events (estimate_id, event_type, actor, meta)
  values (a.estimate_id, 'item_approved', a.actor, jsonb_build_object('item_id', p_item_id, 'name', a.email, 'email', a.email));
  perform estimate_refresh_status(a.estimate_id);
end
$$;
