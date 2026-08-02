-- Vendor self-service profile edits, gated two ways:
--  1) staff grant a 1-hour edit window (status requested -> granted),
--  2) staff review the actual proposed values before they apply (submitted -> applied).
-- The 1h window is enforced by expires_at checked on every read/write (no cron).
-- Editable whitelist (contact + payout + documents) lives in the RPCs; email and
-- name stay locked (email is the vendor's login key). Repo source of truth.
create table if not exists public.vendor_edit_requests (
  id            uuid primary key default gen_random_uuid(),
  vendor_id     uuid not null references public.vendors(id) on delete cascade,
  status        text not null default 'requested'
                check (status in ('requested','granted','submitted','applied','denied','expired')),
  reason        text,
  requested_at  timestamptz not null default now(),
  granted_at    timestamptz,
  granted_by    text,
  expires_at    timestamptz,
  proposed      jsonb,
  submitted_at  timestamptz,
  reviewed_at   timestamptz,
  reviewed_by   text,
  decision_note text
);
create index if not exists vendor_edit_requests_vendor_idx on public.vendor_edit_requests(vendor_id);
create index if not exists vendor_edit_requests_status_idx on public.vendor_edit_requests(status);

alter table public.vendor_edit_requests enable row level security;
drop policy if exists "staff manage edit requests" on public.vendor_edit_requests;
create policy "staff manage edit requests" on public.vendor_edit_requests
  for all to authenticated using (true) with check (true);

-- ── vendor (token, SECURITY DEFINER): request a 1-hour edit window ────────────
-- #variable_conflict use_column: the RETURNS TABLE columns (status/expires_at)
-- share names with the tables queried below; prefer the column in bare refs.
create or replace function public.attend_request_edit(p_token text, p_reason text default null)
returns table (id uuid, status text, expires_at timestamptz)
language plpgsql security definer set search_path = public, extensions
as $$
#variable_conflict use_column
declare s public.attend_session; er public.vendor_edit_requests; v_id uuid;
begin
  select * into s from public.attend_session ses where ses.token = p_token and ses.expires_at > now();
  if s.token is null then raise exception 'Session expired — sign in again'; end if;

  select * into er from public.vendor_edit_requests ver
   where ver.vendor_id = s.vendor_id and ver.status in ('requested','granted','submitted')
     and (ver.status <> 'granted' or ver.expires_at > now())
   order by ver.requested_at desc limit 1;
  if er.id is not null then
    return query select er.id, er.status, er.expires_at; return;
  end if;

  insert into public.vendor_edit_requests (vendor_id, reason)
  values (s.vendor_id, nullif(btrim(p_reason), '')) returning vendor_edit_requests.id into v_id;
  return query select v_id, 'requested'::text, null::timestamptz;
end $$;

-- ── vendor: current edit state (lazily expires a stale granted window) ────────
create or replace function public.attend_edit_status(p_token text)
returns table (id uuid, status text, expires_at timestamptz, proposed jsonb, decision_note text)
language plpgsql security definer set search_path = public, extensions
as $$
#variable_conflict use_column
declare s public.attend_session; r public.vendor_edit_requests;
begin
  select * into s from public.attend_session ses where ses.token = p_token and ses.expires_at > now();
  if s.token is null then raise exception 'Session expired — sign in again'; end if;

  select * into r from public.vendor_edit_requests ver
   where ver.vendor_id = s.vendor_id order by ver.requested_at desc limit 1;
  if r.id is null then return; end if;

  if r.status = 'granted' and r.expires_at <= now() then
    update public.vendor_edit_requests set status = 'expired' where id = r.id;
    r.status := 'expired';
  end if;
  return query select r.id, r.status, r.expires_at, r.proposed, r.decision_note;
end $$;

-- ── vendor: submit proposed values (only inside an active granted window) ─────
create or replace function public.attend_submit_edit(p_token text, p_changes jsonb)
returns table (status text)
language plpgsql security definer set search_path = public, extensions
as $$
#variable_conflict use_column
declare s public.attend_session; r public.vendor_edit_requests; clean jsonb;
begin
  select * into s from public.attend_session ses where ses.token = p_token and ses.expires_at > now();
  if s.token is null then raise exception 'Session expired — sign in again'; end if;

  select * into r from public.vendor_edit_requests ver
   where ver.vendor_id = s.vendor_id and ver.status = 'granted' and ver.expires_at > now()
   order by ver.requested_at desc limit 1;
  if r.id is null then raise exception 'No active edit window — request access first'; end if;

  select jsonb_object_agg(key, value) into clean
    from jsonb_each(coalesce(p_changes, '{}'::jsonb))
   where key in ('phone','alt_phone','address_line','city','pincode',
                 'bank_account_name','bank_account_no','bank_ifsc','upi_id',
                 'pan_number','dl_number','dl_expiry');
  if clean is null then raise exception 'No changes to submit'; end if;

  update public.vendor_edit_requests
     set proposed = clean, status = 'submitted', submitted_at = now()
   where id = r.id;
  return query select 'submitted'::text;
end $$;

grant execute on function public.attend_request_edit(text, text) to anon, authenticated;
grant execute on function public.attend_edit_status(text) to anon, authenticated;
grant execute on function public.attend_submit_edit(text, jsonb) to anon, authenticated;

-- ── staff: grant window / apply reviewed values / deny ───────────────────────
create or replace function public.vendor_grant_edit(p_request_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare actor text := coalesce(current_setting('request.jwt.claims', true)::json->>'email', 'staff');
begin
  update public.vendor_edit_requests
     set status='granted', granted_at=now(), expires_at=now()+interval '1 hour', granted_by=actor
   where id=p_request_id and status='requested';
end $$;

create or replace function public.vendor_deny_edit(p_request_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public
as $$
declare actor text := coalesce(current_setting('request.jwt.claims', true)::json->>'email', 'staff');
begin
  update public.vendor_edit_requests
     set status='denied', decision_note=nullif(btrim(p_note),''), reviewed_at=now(), reviewed_by=actor
   where id=p_request_id and status in ('requested','granted','submitted');
end $$;

create or replace function public.vendor_apply_edit(p_request_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare actor text := coalesce(current_setting('request.jwt.claims', true)::json->>'email', 'staff'); r public.vendor_edit_requests;
begin
  select * into r from public.vendor_edit_requests where id=p_request_id;
  if r.id is null then raise exception 'Request not found'; end if;
  if r.status <> 'submitted' then raise exception 'Nothing submitted to apply'; end if;

  update public.vendors v set
    phone             = case when r.proposed ? 'phone'             then nullif(r.proposed->>'phone','')             else v.phone end,
    alt_phone         = case when r.proposed ? 'alt_phone'         then nullif(r.proposed->>'alt_phone','')         else v.alt_phone end,
    address_line      = case when r.proposed ? 'address_line'      then nullif(r.proposed->>'address_line','')      else v.address_line end,
    city              = case when r.proposed ? 'city'              then nullif(r.proposed->>'city','')              else v.city end,
    pincode           = case when r.proposed ? 'pincode'           then nullif(r.proposed->>'pincode','')           else v.pincode end,
    bank_account_name = case when r.proposed ? 'bank_account_name' then nullif(r.proposed->>'bank_account_name','') else v.bank_account_name end,
    bank_account_no   = case when r.proposed ? 'bank_account_no'   then nullif(r.proposed->>'bank_account_no','')   else v.bank_account_no end,
    bank_ifsc         = case when r.proposed ? 'bank_ifsc'         then nullif(r.proposed->>'bank_ifsc','')         else v.bank_ifsc end,
    upi_id            = case when r.proposed ? 'upi_id'            then nullif(r.proposed->>'upi_id','')            else v.upi_id end,
    pan_number        = case when r.proposed ? 'pan_number'        then nullif(r.proposed->>'pan_number','')        else v.pan_number end,
    dl_number         = case when r.proposed ? 'dl_number'         then nullif(r.proposed->>'dl_number','')         else v.dl_number end,
    dl_expiry         = case when r.proposed ? 'dl_expiry'         then nullif(r.proposed->>'dl_expiry','')::date    else v.dl_expiry end
  where v.id = r.vendor_id;

  update public.vendor_edit_requests set status='applied', reviewed_at=now(), reviewed_by=actor where id=p_request_id;
end $$;

revoke execute on function public.vendor_grant_edit(uuid) from public;
revoke execute on function public.vendor_deny_edit(uuid, text) from public;
revoke execute on function public.vendor_apply_edit(uuid) from public;
grant execute on function public.vendor_grant_edit(uuid) to authenticated;
grant execute on function public.vendor_deny_edit(uuid, text) to authenticated;
grant execute on function public.vendor_apply_edit(uuid) to authenticated;
