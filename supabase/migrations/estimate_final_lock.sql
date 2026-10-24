-- A final estimate is closed for everyone. Once estimate_mark_final sets
-- estimates.locked, neither the landlord (/e page RPCs) nor Pulse staff
-- (workbench, workspace) can change it: no line edits, decisions, new lines,
-- deletions, re-sends or new queries. The screens already hide the controls;
-- this is the wall behind them.
--
-- Only requests through the API are stopped. Maintenance run directly on the
-- database (no request.jwt.claims) still can, so a mistaken final can be
-- corrected by hand.

create or replace function public.estimate_is_final(p_estimate_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select locked from estimates where id = p_estimate_id), false)
$$;

create or replace function public.estimate_from_api()
returns boolean language sql stable as $$
  select coalesce(current_setting('request.jwt.claims', true), '') <> ''
$$;

-- Lines: nothing in, nothing out, nothing changed.
create or replace function public.estimate_items_final_lock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if estimate_from_api() and estimate_is_final(coalesce(new.estimate_id, old.estimate_id)) then
    raise exception 'This estimate is marked final — it can no longer be changed'
      using errcode = 'P0001', hint = 'estimate_final';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_estimate_items_final_lock on public.estimate_items;
create trigger trg_estimate_items_final_lock
  before insert or update or delete on public.estimate_items
  for each row execute function public.estimate_items_final_lock();

-- The estimate row: once final, only Pulse's own bookkeeping may move
-- (status / totals / approval stamps / view stamps). Content, the lock
-- itself and the send state are frozen.
create or replace function public.estimates_final_lock()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  free constant text[] := array['status','total','sent_total','approved_at','approved_by_name',
                                'approved_by_email','first_viewed_at','updated_at'];
begin
  if old.locked and estimate_from_api()
     and (to_jsonb(new) - free) is distinct from (to_jsonb(old) - free) then
    raise exception 'This estimate is marked final — it can no longer be changed'
      using errcode = 'P0001', hint = 'estimate_final';
  end if;
  return new;
end $$;

drop trigger if exists trg_estimates_final_lock on public.estimates;
create trigger trg_estimates_final_lock
  before update on public.estimates
  for each row execute function public.estimates_final_lock();

-- No re-sending a final estimate, and no new queries on it from either side.
create or replace function public.estimate_child_final_lock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if estimate_from_api() and estimate_is_final(new.estimate_id) then
    raise exception 'This estimate is marked final — it can no longer be changed'
      using errcode = 'P0001', hint = 'estimate_final';
  end if;
  return new;
end $$;

drop trigger if exists trg_estimate_versions_final_lock on public.estimate_versions;
create trigger trg_estimate_versions_final_lock
  before insert on public.estimate_versions
  for each row execute function public.estimate_child_final_lock();

drop trigger if exists trg_estimate_disputes_final_lock on public.estimate_disputes;
create trigger trg_estimate_disputes_final_lock
  before insert on public.estimate_disputes
  for each row execute function public.estimate_child_final_lock();
