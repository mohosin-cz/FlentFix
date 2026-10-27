-- Moving between sites in one day.
--
-- A vendor starts at PID X in the morning and is sent on to Y, then Z. A move
-- is recorded as two ordinary punches at the same moment — OUT at the site
-- they're leaving, IN at the one they're going to — both marked via = 'switch'.
-- Stored that way, everything that already reads attendance stays right with
-- no change: payroll counts the day once and adds the hours across sites,
-- "who is on site at this PID" sees them leave X and arrive at Y, and the
-- property timeline and logged PIDs pick up every site they worked at.
-- `via` is what lets a screen draw it as one shift with a route instead of a
-- check-out and a new check-in.

alter table public.vendor_attendance add column if not exists via text;
alter table public.vendor_attendance drop constraint if exists vendor_attendance_via_chk;
alter table public.vendor_attendance add constraint vendor_attendance_via_chk check (via is null or via = 'switch');

create or replace function public.attend_switch_site(
  p_token text, p_pid text, p_lat numeric default null, p_lng numeric default null, p_accuracy numeric default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  s public.attend_session; v public.vendors; cur public.vendor_attendance;
  r_out public.vendor_attendance; r_in public.vendor_attendance;
  v_to text := nullif(btrim(coalesce(p_pid, '')), '');
  t timestamptz := clock_timestamp();
begin
  select * into s from public.attend_session where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Session expired — sign in again'; end if;
  select * into v from public.vendors where id = s.vendor_id;
  if v_to is null then raise exception 'Pick the site you are moving to'; end if;

  -- the shift that is running now (regular or overtime): the newest punch of
  -- that kind is an IN
  select a.* into cur from public.vendor_attendance a
   where a.vendor_id = v.id
     and a.punch_type = 'in'
     and not exists (select 1 from public.vendor_attendance b
                      where b.vendor_id = a.vendor_id and b.kind = a.kind and b.punched_at > a.punched_at)
   order by a.punched_at desc limit 1;
  if cur.id is null then raise exception 'You are not checked in — check in at the site instead'; end if;
  if lower(coalesce(cur.pid, '')) = lower(v_to) then raise exception 'You are already at PID %', v_to; end if;
  if exists (select 1 from public.vendor_breaks where vendor_id = v.id and ended_at is null) then
    raise exception 'End your break first, then move';
  end if;

  insert into public.vendor_attendance(vendor_id, punch_type, pid, pod, lat, lng, accuracy, source, kind, via, punched_at)
  values (v.id, 'out', cur.pid, v.pod, p_lat, p_lng, p_accuracy, 'self', cur.kind, 'switch', t)
  returning * into r_out;
  -- a millisecond later, so the pair always sorts out-then-in
  insert into public.vendor_attendance(vendor_id, punch_type, pid, pod, lat, lng, accuracy, source, kind, via, punched_at)
  values (v.id, 'in', v_to, v.pod, p_lat, p_lng, p_accuracy, 'self', cur.kind, 'switch', t + interval '1 millisecond')
  returning * into r_in;

  return jsonb_build_object('from_pid', cur.pid, 'to_pid', r_in.pid, 'kind', r_in.kind,
                            'moved_at', r_in.punched_at, 'pid_flag', r_in.pid_flag, 'in', to_jsonb(r_in));
end $$;

revoke all on function public.attend_switch_site(text, text, numeric, numeric, numeric) from public;
grant execute on function public.attend_switch_site(text, text, numeric, numeric, numeric) to anon, authenticated;

-- History carries `via` so the portal can show a move as a move.
drop function if exists public.attend_history(text);
create function public.attend_history(p_token text)
returns table(punched_at timestamptz, punch_type text, pid text, kind text, via text)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare s public.attend_session;
begin
  select * into s from public.attend_session where token = p_token and expires_at > now();
  if s.token is null then raise exception 'Session expired — sign in again'; end if;
  return query select a.punched_at, a.punch_type, a.pid, a.kind, a.via
    from public.vendor_attendance a where a.vendor_id = s.vendor_id
    order by a.punched_at desc limit 120;
end $$;
grant execute on function public.attend_history(text) to anon, authenticated;
