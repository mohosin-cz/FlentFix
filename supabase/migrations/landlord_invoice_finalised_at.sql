-- When a landlord invoice was finalised, and by whom.
--
-- Finalising only flipped status draft → sent and touched updated_at, which
-- moves again on every later edit, so the moment of finalisation was lost.
-- The database now stamps it itself on any path to a final status (sent,
-- paid, overdue), and clears it when the invoice is reopened to draft, so
-- finalised_at is always the current finalisation.
--
-- Backfill (finalised_estimated = true, so it's never mistaken for a real stamp):
--   · finalised in Pulse (updated_at moved after creation) → updated_at
--   · imported already final (updated_at = created_at)     → issue_date, else created_at

alter table public.landlord_invoices
  add column if not exists finalised_at timestamptz,
  add column if not exists finalised_by text,
  add column if not exists finalised_estimated boolean not null default false;

create or replace function public.landlord_invoice_stamp_final()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  me text := nullif(lower(coalesce(current_setting('request.jwt.claims', true)::json ->> 'email', '')), '');
  is_final boolean := new.status in ('sent', 'paid', 'overdue');
  was_final boolean := tg_op = 'UPDATE' and old.status in ('sent', 'paid', 'overdue');
begin
  if is_final and not was_final then
    new.finalised_at := now();
    new.finalised_by := coalesce(me, 'system');
    new.finalised_estimated := false;
  elsif not is_final and was_final then
    new.finalised_at := null;
    new.finalised_by := null;
    new.finalised_estimated := false;
  elsif tg_op = 'UPDATE' and is_final then
    -- final → final (sent → paid, or an edit): the moment it was finalised stands
    new.finalised_at := old.finalised_at;
    new.finalised_by := old.finalised_by;
    new.finalised_estimated := old.finalised_estimated;
  end if;
  return new;
end $$;
revoke all on function public.landlord_invoice_stamp_final() from public, anon, authenticated;

drop trigger if exists trg_landlord_invoice_stamp_final on public.landlord_invoices;
create trigger trg_landlord_invoice_stamp_final
  before insert or update of status on public.landlord_invoices
  for each row execute function public.landlord_invoice_stamp_final();

-- backfill; set_config keeps the trigger out of it (it only fires on status changes anyway)
update public.landlord_invoices
   set finalised_at = case when updated_at - created_at > interval '1 minute' then updated_at
                           else coalesce(issue_date::timestamptz, created_at) end,
       finalised_estimated = true
 where status in ('sent', 'paid', 'overdue') and finalised_at is null;
