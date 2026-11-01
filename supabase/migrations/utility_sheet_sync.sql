-- Pulse → Fixture sheet (utility-log tab), one way.
--
-- Utilities are entered in Pulse from now on; the sheet keeps getting them in
-- its own format. A small Apps Script bound to the sheet (scripts/
-- utility-sheet-sync.gs) pulls what is new or changed every 15 minutes,
-- writes each booking as a utility-log row, and tells Pulse which ones it
-- wrote. Only WiFi and water purifier go to the sheet — gas, pest control and
-- anything else stay in Pulse.
--
-- `sheet_synced_at` is when the row last reached the sheet; a later
-- `updated_at` means it was edited in Pulse since and goes out again.
-- `sheet_key` is how the script finds that row in the sheet again
-- (pid|WiFi|Water|start date), so an edit updates the row in place instead of
-- adding another.
--
-- The script authenticates with a key minted into api_clients with the scope
-- 'utilities:sheet' — only the hash is stored.

alter table public.property_utilities add column if not exists sheet_synced_at timestamptz;
alter table public.property_utilities add column if not exists sheet_key text;

create or replace function public.utility_sheet_client(p_key text)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare c uuid;
begin
  select id into c from public.api_clients
   where key_hash = encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex')
     and active and revoked_at is null and 'utilities:sheet' = any(scopes);
  if c is null then raise exception 'Not allowed'; end if;
  update public.api_clients set last_used_at = now() where id = c;
  return c;
end $$;
revoke all on function public.utility_sheet_client(text) from public, anon, authenticated;

-- What the sheet should write: WiFi / water purifier bookings on a real
-- (numeric) PID that never reached the sheet, or changed since.
create or replace function public.utility_sheet_feed(p_key text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
begin
  perform public.utility_sheet_client(p_key);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', u.id,
      'pid', u.pid,
      'service', case u.utility_type when 'wifi' then 'WiFi' else 'Water' end,
      'provider', u.provider,
      'duration', coalesce(nullif(btrim(u.duration_raw), ''),
                    case u.billing_cycle when 'Monthly' then '1M' when 'Bi-monthly' then '2M'
                      when 'Quarterly' then '3M' when 'Half-yearly' then '6M' when 'Yearly' then '12M' end),
      'price', u.billing_amount,
      'added', coalesce(u.added_cost, 0),
      'start', u.start_date,
      'account', u.account_number,
      'ssid', u.ssid,
      'password', coalesce(u.wifi_password, u.password),
      'plan', u.plan_type,
      'lockbox', u.lockbox_code,
      'invoice', u.invoice_link,
      'payment', u.payment_mode,
      'sheet_key', u.sheet_key
    ) order by u.start_date nulls last, u.created_at)
    from public.property_utilities u
    where u.utility_type in ('wifi', 'water_purifier')
      and u.pid ~ '^\d+$'
      and coalesce(u.status, '') <> 'cancelled'
      and (u.sheet_synced_at is null or u.updated_at > u.sheet_synced_at)
  ), '[]'::jsonb);
end $$;
revoke all on function public.utility_sheet_feed(text) from public;
grant execute on function public.utility_sheet_feed(text) to anon;

-- The script reports back each row it wrote, with the key it wrote it under.
-- clock_timestamp() so the stamp lands after the updated_at the touch trigger
-- sets in this same update.
create or replace function public.utility_sheet_ack(p_key text, p_rows jsonb)
returns int
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare n int;
begin
  perform public.utility_sheet_client(p_key);
  update public.property_utilities u
     set sheet_synced_at = clock_timestamp(), sheet_key = r->>'key'
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
   where u.id = (r->>'id')::uuid;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.utility_sheet_ack(text, jsonb) from public;
grant execute on function public.utility_sheet_ack(text, jsonb) to anon;
