-- Every punch (in/out) captures a selfie. Store its path on the attendance row
-- (image lives in the vendor-avatars bucket under selfies/). Repo source of truth.
alter table public.vendor_attendance add column if not exists selfie_path text;

-- arg list changes (adds p_selfie), so drop the old signature then recreate
drop function if exists public.attend_punch(text, text, text, numeric, numeric, numeric, text);

create or replace function public.attend_punch(
  p_token text, p_type text, p_pid text, p_lat numeric, p_lng numeric,
  p_accuracy numeric, p_kind text default 'regular', p_selfie text default null)
returns vendor_attendance
language plpgsql security definer set search_path = public, extensions
as $$
declare s public.attend_session; v public.vendors; last public.vendor_attendance; r public.vendor_attendance;
begin
  if p_type not in ('in','out') then raise exception 'Invalid punch type'; end if;
  if p_kind not in ('regular','overtime') then raise exception 'Invalid punch kind'; end if;
  select * into s from public.attend_session where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Session expired — sign in again'; end if;
  select * into v from public.vendors where id = s.vendor_id;
  select * into last from public.vendor_attendance
    where vendor_attendance.vendor_id = v.id and vendor_attendance.kind = p_kind
    order by punched_at desc limit 1;
  if p_type = 'in'  and last.punch_type = 'in'  then raise exception 'Already checked in — check out first'; end if;
  if p_type = 'out' and (last.id is null or last.punch_type = 'out') then raise exception 'Not checked in yet'; end if;
  insert into public.vendor_attendance(vendor_id, punch_type, pid, pod, lat, lng, accuracy, source, kind, selfie_path)
   values (v.id, p_type, nullif(btrim(coalesce(p_pid,'')), ''), v.pod, p_lat, p_lng, p_accuracy, 'self', p_kind, nullif(btrim(coalesce(p_selfie,'')),''))
   returning * into r;
  return r;
end $$;
grant execute on function public.attend_punch(text,text,text,numeric,numeric,numeric,text,text) to anon, authenticated;
