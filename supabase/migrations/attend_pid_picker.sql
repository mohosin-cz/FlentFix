-- Vendors stop typing PIDs (pulse-journey-prompt.md §4, Branch 3).
--
-- A typo files a punch-in against the wrong property and makes a vendor who
-- showed up look absent. On file today: of 310 punch-ins with a PID, 66 name a
-- PID that exists nowhere (0001, 04, 9078 …), and 226 are at real properties
-- where the vendor has no work order — daily work at live homes, not setup.
-- So the picker offers, in order:
--   1. properties with this vendor's open work orders (today's and tomorrow's first)
--   2. properties this vendor punched in at in the last 14 days
--   3. a search over every Flent property — Pulse's and the Holy Grail list —
--      by name or PID
-- and typing stays as a last resort. Vendor-facing: name and PID only.
--
-- vendor_attendance.pid_flag is set by a trigger on every punch-in; a punch is
-- never blocked over data quality:
--   unknown_pid   the PID is in neither Pulse nor the Holy Grail list — check it
--   not_assigned  a real property, no open work order there for this vendor
--                 (informational: normal for daily work)
-- attend_punch() is untouched.

begin;

alter table public.vendor_attendance add column if not exists pid_flag text;

-- Every property a vendor might be at: Pulse's live ones and the sheet's.
create or replace function public.flent_site_name(p_pid text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select nullif(p.name, '') from properties p where p.pid = p_pid and p.deleted_at is null and not is_placeholder_name(p.name, p.pid)),
    (select nullif(s.property_name, '') from sheet_properties s where s.pid = p_pid),
    (select p.pid from properties p where p.pid = p_pid and p.deleted_at is null))
$$;

create or replace function public.attend_my_sites(p_token text)
returns table (pid text, name text, section text, when_label text, sort_key int)
language plpgsql
stable
security definer
set search_path = public
as $$
declare s public.attend_session;
begin
  select * into s from public.attend_session a where a.token = p_token and a.expires_at > now();
  if s.token is null then raise exception 'Session expired — sign in again'; end if;

  return query
    with work as (
      select wo.pid,
             min(coalesce(wo.scheduled_end, wo.scheduled_start)) filter (where coalesce(wo.scheduled_end, wo.scheduled_start) >= current_date) next_date
        from work_orders wo
       where wo.vendor_id = s.vendor_id and coalesce(wo.status, '') not in ('verified', 'draft')
       group by wo.pid
    ),
    recent as (
      select va.pid, max(va.punched_at) last_at
        from vendor_attendance va
       where va.vendor_id = s.vendor_id and va.punch_type = 'in' and va.pid is not null
         and va.punched_at > now() - interval '14 days'
         and va.pid not in (select pid from work)
         and flent_site_name(va.pid) is not null
       group by va.pid
    )
    select w.pid, flent_site_name(w.pid), 'work',
           case when w.next_date = current_date then 'today'
                when w.next_date = current_date + 1 then 'tomorrow'
                when w.next_date is not null then to_char(w.next_date, 'DD Mon')
                else 'open work' end,
           case when w.next_date = current_date then 0 when w.next_date = current_date + 1 then 1 else 2 end
      from work w
    union all
    select r.pid, flent_site_name(r.pid), 'recent',
           case when (r.last_at at time zone 'Asia/Kolkata')::date = current_date then 'today'
                when (r.last_at at time zone 'Asia/Kolkata')::date = current_date - 1 then 'yesterday'
                else to_char(r.last_at at time zone 'Asia/Kolkata', 'DD Mon') end,
           3
      from recent r
    order by 5, 4, 2;
end
$$;

-- Search every Flent property by name or PID. Session required; 20 results.
create or replace function public.attend_find_site(p_token text, p_q text)
returns table (pid text, name text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.attend_session;
  q text := lower(btrim(coalesce(p_q, '')));
begin
  select * into s from public.attend_session a where a.token = p_token and a.expires_at > now();
  if s.token is null then raise exception 'Session expired — sign in again'; end if;
  if length(q) < 1 then return; end if;

  return query
    with sites as (
      select p.pid, flent_site_name(p.pid) as name from properties p
       where p.deleted_at is null and p.source is distinct from 'payments_backfill'
      union
      select sp.pid, coalesce(nullif(sp.property_name, ''), sp.pid) from sheet_properties sp
       where not exists (select 1 from properties p where p.pid = sp.pid and p.deleted_at is null)
    )
    select x.pid, x.name from sites x
     where lower(x.pid) like q || '%' or lower(x.name) like '%' || replace(replace(q, '%', ''), '_', '') || '%'
     order by (lower(x.pid) = q) desc, (lower(x.pid) like q || '%') desc, x.name
     limit 20;
end
$$;

revoke all on function public.flent_site_name(text) from public, anon, authenticated;
revoke all on function public.attend_my_sites(text) from public;
revoke all on function public.attend_find_site(text, text) from public;
grant execute on function public.attend_my_sites(text) to anon, authenticated;
grant execute on function public.attend_find_site(text, text) to anon, authenticated;

-- Flag, never block.
create or replace function public.vendor_attendance_flag_pid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.punch_type <> 'in' or new.pid is null or btrim(new.pid) = '' then return new; end if;
  if flent_site_name(new.pid) is null then
    new.pid_flag := 'unknown_pid';
  elsif not exists (select 1 from work_orders w where w.pid = new.pid and w.vendor_id = new.vendor_id
                     and coalesce(w.status, '') not in ('verified', 'draft')) then
    new.pid_flag := 'not_assigned';
  else
    new.pid_flag := null;
  end if;
  return new;
end
$$;

drop trigger if exists trg_vendor_attendance_flag_pid on public.vendor_attendance;
create trigger trg_vendor_attendance_flag_pid
  before insert on public.vendor_attendance
  for each row execute function public.vendor_attendance_flag_pid();

revoke all on function public.vendor_attendance_flag_pid() from public, anon, authenticated;

commit;

-- how the punches on file would be flagged now (read-only)
select case when flent_site_name(va.pid) is null then 'unknown_pid'
            when not exists (select 1 from work_orders w where w.pid = va.pid and w.vendor_id = va.vendor_id) then 'not_assigned'
            else 'ok' end as would_be, count(*)
  from vendor_attendance va where va.punch_type = 'in' and va.pid is not null and btrim(va.pid) <> ''
 group by 1 order by 2 desc;
