-- A vendor's own work orders, from their portal session.
--
-- Nothing new is assigned here and no new way in is created. work_orders
-- already carries vendor_id and its own token; the token was simply only ever
-- reachable by someone pasting a link into a message. A vendor who has already
-- proved who they are — email and password, an attend_session — can be handed
-- the list instead.
--
-- So the vendor-facing work order page does not change at all. It still opens
-- on a work order token and every action still goes through wo_fetch,
-- wo_close_item, wo_reopen_item and wo_submit exactly as before. This only
-- answers "which ones are mine".
--
-- Drafts are excluded. A draft has not been issued to anybody, and a vendor
-- seeing work that staff are still writing is a promise nobody made.

create or replace function public.attend_work_orders(p_token text)
returns table (
  id                   uuid,
  token                text,
  pid                  text,
  trade                text,
  status               text,
  scheduled_start      date,
  scheduled_end        date,
  issued_at            timestamptz,
  vendor_completed_at  timestamptz,
  verified_at          timestamptz,
  item_count           int,
  open_count           int,
  disputed_count       int
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare s public.attend_session;
begin
  select * into s from public.attend_session
   where token = p_token and expires_at > now();
  if s.token is null then
    raise exception 'Session expired — sign in again';
  end if;

  return query
    select w.id, w.token, w.pid, w.trade, w.status,
           w.scheduled_start, w.scheduled_end,
           w.issued_at, w.vendor_completed_at, w.verified_at,
           (select count(*)::int from public.work_order_items i
             where i.work_order_id = w.id)                                  as item_count,
           -- 'pending' and 'disputed' are what the vendor page counts as open;
           -- disputed is called out separately because it is work sent back,
           -- which is a different thing from work not started.
           (select count(*)::int from public.work_order_items i
             where i.work_order_id = w.id and i.status in ('pending','disputed')) as open_count,
           (select count(*)::int from public.work_order_items i
             where i.work_order_id = w.id and i.status = 'disputed')        as disputed_count
      from public.work_orders w
     where w.vendor_id = s.vendor_id
       and coalesce(w.status, '') <> 'draft'
     -- still to do first, then most recently issued
     order by (coalesce(w.status,'') in ('assigned','in_progress')) desc,
              w.issued_at desc nulls last,
              w.created_at desc;
end $$;

revoke all on function public.attend_work_orders(text) from public;
grant execute on function public.attend_work_orders(text) to anon, authenticated;

-- check: should list the work orders belonging to whoever holds that session
-- select * from public.attend_work_orders('<a live attend_session token>');
