-- Closing a shift somebody walked away from.
--
-- attendance is a log of punches, and a shift is an IN with an OUT after it. A
-- vendor who goes home without pressing the button leaves an IN with nothing
-- after it, and nothing in the product could ever close it: the vendor's own
-- page punches out against a live session token that expired with their day,
-- and staff have SELECT on vendor_attendance and nothing more. The row just sat
-- there counting, and the board showed a shift 37 hours long.
--
-- So this is a staff punch. It is deliberately NOT disguised as the vendor's:
--   source     = 'staff'  — the vendor's own punches are 'self'
--   note       = why, required, no blank ones
--   created_by = the email out of the caller's JWT, not a value they pass
-- Anyone reading the log later can tell a punch somebody made from a punch
-- somebody recorded on their behalf, and can see why.
--
-- The time is typed by a human because only a human knows it. It is bounded on
-- both sides — after the IN, not in the future — so the arithmetic cannot
-- produce a negative shift or a day that has not happened yet.
--
-- An open break is closed at the same moment. A vendor who never punched out
-- often never came back from lunch either, and a break with no end keeps
-- growing against the allowance for as long as the row exists.

alter table public.vendor_attendance add column if not exists note       text;
alter table public.vendor_attendance add column if not exists created_by text;

comment on column public.vendor_attendance.note is
  'Why a punch was recorded by staff rather than made by the vendor. Required when source = ''staff''.';
comment on column public.vendor_attendance.created_by is
  'The staff member who recorded this punch. Null for a vendor''s own punch.';

-- ── Close one open shift ─────────────────────────────────────────────────────
-- Takes the IN punch rather than the vendor, because a vendor can have two open
-- shifts — a regular and an overtime — and "close their session" would be
-- ambiguous. The card the staff member is looking at knows which one it is.
create or replace function public.attend_force_punch_out(
  p_in_punch_id uuid,
  p_punched_at  timestamptz,
  p_reason      text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_in    public.vendor_attendance;
  v_next  public.vendor_attendance;
  v_out   public.vendor_attendance;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_breaks int;
begin
  -- Same gate the work order verifications use: an email in the JWT or nothing.
  v_email := nullif(current_setting('request.jwt.claims', true)::json->>'email', '');
  if v_email is null then
    raise exception 'Sign in to close a shift' using errcode = 'insufficient_privilege';
  end if;

  if v_reason is null then
    raise exception 'A reason is required to close a shift on someone''s behalf';
  end if;

  select * into v_in from public.vendor_attendance where id = p_in_punch_id;
  if v_in.id is null then
    raise exception 'That punch no longer exists';
  end if;
  if v_in.punch_type <> 'in' then
    raise exception 'That punch is a check-out, not a check-in';
  end if;

  -- Open means nothing follows it. Checking the very next punch rather than
  -- "any out after this" is what keeps a second shift later the same day from
  -- looking like this one's missing check-out.
  select * into v_next
    from public.vendor_attendance
   where vendor_id = v_in.vendor_id and punched_at > v_in.punched_at
   order by punched_at asc limit 1;
  if v_next.id is not null then
    raise exception 'That shift is already closed';
  end if;

  if p_punched_at is null then
    raise exception 'A check-out time is required';
  end if;
  if p_punched_at <= v_in.punched_at then
    raise exception 'The check-out has to be after the check-in';
  end if;
  if p_punched_at > now() then
    raise exception 'The check-out cannot be in the future';
  end if;

  insert into public.vendor_attendance
    (vendor_id, punch_type, punched_at, pid, pod, kind, source, note, created_by)
  values
    (v_in.vendor_id, 'out', p_punched_at, v_in.pid, v_in.pod,
     coalesce(v_in.kind, 'regular'), 'staff', v_reason, v_email)
  returning * into v_out;

  -- A break that never ended would keep counting against the allowance for as
  -- long as the row existed. It ends when the shift does, or when it started if
  -- somehow that is later.
  update public.vendor_breaks
     set ended_at = greatest(p_punched_at, started_at)
   where vendor_id = v_in.vendor_id and ended_at is null
     and started_at <= p_punched_at;
  get diagnostics v_breaks = row_count;

  return jsonb_build_object(
    'punch_id',       v_out.id,
    'vendor_id',      v_in.vendor_id,
    'punched_at',     v_out.punched_at,
    'kind',           v_out.kind,
    'breaks_closed',  v_breaks,
    'duration_hours', round(extract(epoch from (v_out.punched_at - v_in.punched_at)) / 3600.0, 2),
    'by',             v_email
  );
end $$;

revoke all on function public.attend_force_punch_out(uuid, timestamptz, text) from public, anon;
grant execute on function public.attend_force_punch_out(uuid, timestamptz, text) to authenticated;
