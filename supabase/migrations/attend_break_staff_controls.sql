-- Staff controls for breaks, to match the ones for shifts.
--
-- attend_force_punch_out let staff close a shift somebody walked away from.
-- Breaks had no equivalent: every write to vendor_breaks went through an RPC
-- keyed on the vendor's own live session token, and staff hold SELECT and
-- nothing else. So a lunch that was never ended could not be ended by anyone —
-- the vendor's token expires with their day, and the row keeps counting against
-- the allowance for as long as it exists. The board showed the overrun and
-- offered no way to correct it.
--
-- Four controls, because "end it" alone is not enough to describe what actually
-- happens on a site: a break that was never ended, a break with the wrong
-- times, a break that never happened, and a break that happened but nobody
-- pressed the button.
--
-- All four follow attend_force_punch_out exactly:
--   * authenticated only, gated on an email in the caller's JWT
--   * a reason is required, and is never blank
--   * the acting staff email comes out of the JWT, not from an argument
--   * times are typed by a human, because only a human knows them, and are
--     bounded so the arithmetic cannot produce a negative break or a future one
--
-- Deliberately NOT enforced here: the 13:00 / 16:00-18:00 windows that
-- attend_break_start applies to the vendor. Those exist to stop a vendor taking
-- lunch at nine in the morning. Staff are recording what already happened, and
-- a rule that refuses to record reality just moves the lie somewhere else.

alter table public.vendor_breaks add column if not exists note       text;
alter table public.vendor_breaks add column if not exists updated_by text;
alter table public.vendor_breaks add column if not exists updated_at timestamptz;

comment on column public.vendor_breaks.note is
  'Why staff added or changed this break. Required for any staff write.';
comment on column public.vendor_breaks.updated_by is
  'The staff member who last changed this break. Null while it is only the vendor''s own.';

-- A delete leaves nothing behind to read, which is the one staff action that
-- could quietly rewrite somebody's day. Every staff action on a break lands
-- here, so the row surviving or not makes no difference to the trail.
create table if not exists public.vendor_break_audit (
  id         bigserial primary key,
  break_id   uuid,
  vendor_id  uuid not null,
  kind       text,
  action     text not null check (action in ('added','adjusted','ended','deleted')),
  started_at timestamptz,
  ended_at   timestamptz,
  reason     text not null,
  by_email   text not null,
  at         timestamptz not null default now()
);

create index if not exists vendor_break_audit_vendor_idx on public.vendor_break_audit(vendor_id, at desc);

alter table public.vendor_break_audit enable row level security;
drop policy if exists "authenticated can read break audit" on public.vendor_break_audit;
create policy "authenticated can read break audit"
  on public.vendor_break_audit for select to authenticated using (true);
revoke all on public.vendor_break_audit from anon;

-- ── shared gate ──────────────────────────────────────────────────────────────
create or replace function public.attend_staff_actor(p_reason text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_email text; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  v_email := nullif(current_setting('request.jwt.claims', true)::json->>'email', '');
  if v_email is null then
    raise exception 'Sign in to change a break' using errcode = 'insufficient_privilege';
  end if;
  if v_reason is null then
    raise exception 'A reason is required to change someone''s break';
  end if;
  return v_email;
end $$;

revoke all on function public.attend_staff_actor(text) from public, anon;
grant execute on function public.attend_staff_actor(text) to authenticated;

-- ── 1. End a break that is still running ─────────────────────────────────────
create or replace function public.attend_staff_end_break(
  p_break_id uuid,
  p_ended_at timestamptz,
  p_reason   text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_email text; b public.vendor_breaks; out_row public.vendor_breaks;
begin
  v_email := public.attend_staff_actor(p_reason);

  select * into b from public.vendor_breaks where id = p_break_id;
  if b.id is null then raise exception 'That break no longer exists'; end if;
  if b.ended_at is not null then raise exception 'That break has already ended'; end if;
  if p_ended_at is null then raise exception 'An end time is required'; end if;
  if p_ended_at < b.started_at then raise exception 'The break cannot end before it started'; end if;
  if p_ended_at > now() then raise exception 'The break cannot end in the future'; end if;

  update public.vendor_breaks
     set ended_at = p_ended_at, note = btrim(p_reason), updated_by = v_email, updated_at = now()
   where id = p_break_id
  returning * into out_row;

  insert into public.vendor_break_audit(break_id, vendor_id, kind, action, started_at, ended_at, reason, by_email)
  values (out_row.id, out_row.vendor_id, out_row.kind, 'ended', out_row.started_at, out_row.ended_at, btrim(p_reason), v_email);

  return jsonb_build_object(
    'break_id', out_row.id, 'vendor_id', out_row.vendor_id, 'kind', out_row.kind,
    'started_at', out_row.started_at, 'ended_at', out_row.ended_at,
    'minutes', round(extract(epoch from (out_row.ended_at - out_row.started_at)) / 60.0),
    'by', v_email
  );
end $$;

revoke all on function public.attend_staff_end_break(uuid, timestamptz, text) from public, anon;
grant execute on function public.attend_staff_end_break(uuid, timestamptz, text) to authenticated;

-- ── 2. Correct the times on a break ──────────────────────────────────────────
-- A null end means still running, so this is also how a break ended by mistake
-- gets reopened.
create or replace function public.attend_staff_adjust_break(
  p_break_id   uuid,
  p_started_at timestamptz,
  p_ended_at   timestamptz,
  p_reason     text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_email text; b public.vendor_breaks; out_row public.vendor_breaks; v_day date;
begin
  v_email := public.attend_staff_actor(p_reason);

  select * into b from public.vendor_breaks where id = p_break_id;
  if b.id is null then raise exception 'That break no longer exists'; end if;
  if p_started_at is null then raise exception 'A start time is required'; end if;
  if p_started_at > now() then raise exception 'The break cannot start in the future'; end if;
  if p_ended_at is not null then
    if p_ended_at < p_started_at then raise exception 'The break cannot end before it started'; end if;
    if p_ended_at > now() then raise exception 'The break cannot end in the future'; end if;
  end if;

  -- The day a break belongs to comes from when it started, in IST, and one
  -- lunch and one snack per vendor per day is a unique index. Moving a break
  -- across midnight can therefore collide with a real break on the other day;
  -- say which, rather than surfacing a constraint name.
  v_day := (p_started_at at time zone 'Asia/Kolkata')::date;
  if v_day <> b.break_day and exists (
    select 1 from public.vendor_breaks
     where vendor_id = b.vendor_id and break_day = v_day and kind = b.kind and id <> b.id
  ) then
    raise exception 'That vendor already has a % break on %', b.kind, v_day;
  end if;

  update public.vendor_breaks
     set started_at = p_started_at, ended_at = p_ended_at, break_day = v_day,
         note = btrim(p_reason), updated_by = v_email, updated_at = now()
   where id = p_break_id
  returning * into out_row;

  insert into public.vendor_break_audit(break_id, vendor_id, kind, action, started_at, ended_at, reason, by_email)
  values (out_row.id, out_row.vendor_id, out_row.kind, 'adjusted', out_row.started_at, out_row.ended_at, btrim(p_reason), v_email);

  return jsonb_build_object(
    'break_id', out_row.id, 'vendor_id', out_row.vendor_id, 'kind', out_row.kind,
    'started_at', out_row.started_at, 'ended_at', out_row.ended_at,
    'still_running', out_row.ended_at is null, 'by', v_email
  );
end $$;

revoke all on function public.attend_staff_adjust_break(uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.attend_staff_adjust_break(uuid, timestamptz, timestamptz, text) to authenticated;

-- ── 3. Record a break the vendor never pressed ───────────────────────────────
create or replace function public.attend_staff_add_break(
  p_vendor_id  uuid,
  p_kind       text,
  p_started_at timestamptz,
  p_ended_at   timestamptz,
  p_reason     text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_email text; out_row public.vendor_breaks; v_day date; r record;
begin
  v_email := public.attend_staff_actor(p_reason);

  select * into r from public.attend_break_rules() where kind = p_kind;
  if r.kind is null then raise exception 'Unknown break type'; end if;
  if not exists (select 1 from public.vendors where id = p_vendor_id) then
    raise exception 'Vendor not found';
  end if;
  if p_started_at is null then raise exception 'A start time is required'; end if;
  if p_started_at > now() then raise exception 'The break cannot start in the future'; end if;
  if p_ended_at is not null then
    if p_ended_at < p_started_at then raise exception 'The break cannot end before it started'; end if;
    if p_ended_at > now() then raise exception 'The break cannot end in the future'; end if;
  end if;

  v_day := (p_started_at at time zone 'Asia/Kolkata')::date;
  if exists (select 1 from public.vendor_breaks
              where vendor_id = p_vendor_id and break_day = v_day and kind = p_kind) then
    raise exception 'That vendor already has a % break on %', p_kind, v_day;
  end if;

  insert into public.vendor_breaks(vendor_id, kind, started_at, ended_at, break_day, source, note, updated_by, updated_at)
  values (p_vendor_id, p_kind, p_started_at, p_ended_at, v_day, 'staff', btrim(p_reason), v_email, now())
  returning * into out_row;

  insert into public.vendor_break_audit(break_id, vendor_id, kind, action, started_at, ended_at, reason, by_email)
  values (out_row.id, out_row.vendor_id, out_row.kind, 'added', out_row.started_at, out_row.ended_at, btrim(p_reason), v_email);

  return jsonb_build_object(
    'break_id', out_row.id, 'vendor_id', out_row.vendor_id, 'kind', out_row.kind,
    'started_at', out_row.started_at, 'ended_at', out_row.ended_at,
    'still_running', out_row.ended_at is null, 'by', v_email
  );
end $$;

revoke all on function public.attend_staff_add_break(uuid, text, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.attend_staff_add_break(uuid, text, timestamptz, timestamptz, text) to authenticated;

-- ── 4. Remove a break that never happened ────────────────────────────────────
create or replace function public.attend_staff_delete_break(
  p_break_id uuid,
  p_reason   text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_email text; b public.vendor_breaks;
begin
  v_email := public.attend_staff_actor(p_reason);

  select * into b from public.vendor_breaks where id = p_break_id;
  if b.id is null then raise exception 'That break no longer exists'; end if;

  -- audit first: after the delete there is nothing left to read the values from
  insert into public.vendor_break_audit(break_id, vendor_id, kind, action, started_at, ended_at, reason, by_email)
  values (b.id, b.vendor_id, b.kind, 'deleted', b.started_at, b.ended_at, btrim(p_reason), v_email);

  delete from public.vendor_breaks where id = p_break_id;

  return jsonb_build_object(
    'break_id', b.id, 'vendor_id', b.vendor_id, 'kind', b.kind,
    'started_at', b.started_at, 'ended_at', b.ended_at, 'deleted', true, 'by', v_email
  );
end $$;

revoke all on function public.attend_staff_delete_break(uuid, text) from public, anon;
grant execute on function public.attend_staff_delete_break(uuid, text) to authenticated;
