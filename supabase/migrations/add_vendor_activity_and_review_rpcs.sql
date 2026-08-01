-- Vendor management hub — activity log + review RPCs.
-- Applied to the project via the Supabase migration tooling; kept here as the
-- repo source of truth.

-- ── Vendor activity log: trigger-only writes, RLS on, authenticated read ─────
create table if not exists public.vendor_activity (
  id         uuid primary key default gen_random_uuid(),
  vendor_id  uuid not null references public.vendors(id) on delete cascade,
  action     text not null,
  field      text,
  old_value  text,
  new_value  text,
  changed_by text,
  changed_at timestamptz not null default now()
);

create index if not exists vendor_activity_vendor_idx
  on public.vendor_activity(vendor_id, changed_at desc);

alter table public.vendor_activity enable row level security;

drop policy if exists "authenticated can read vendor activity" on public.vendor_activity;
create policy "authenticated can read vendor activity"
  on public.vendor_activity for select to authenticated using (true);
-- deliberately NO insert/update/delete policy: writes happen only through the
-- SECURITY DEFINER trigger below, mirroring the estimate_activity pattern.

-- ── Trigger: log status / pod / vendor_code changes (AFTER UPDATE only, so the
--    public onboarding INSERT path from Branch A is never touched) ────────────
create or replace function public.log_vendor_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  actor text := coalesce(current_setting('request.jwt.claims', true)::json->>'email', 'sql/system');
begin
  if new.status is distinct from old.status then
    insert into vendor_activity(vendor_id, action, field, old_value, new_value, changed_by)
    values (new.id, 'status_change', 'status', old.status::text, new.status::text, actor);
  end if;
  if new.pod is distinct from old.pod then
    insert into vendor_activity(vendor_id, action, field, old_value, new_value, changed_by)
    values (new.id, 'pod_assigned', 'pod', old.pod, new.pod, actor);
  end if;
  if new.vendor_code is distinct from old.vendor_code then
    insert into vendor_activity(vendor_id, action, field, old_value, new_value, changed_by)
    values (new.id, 'vendor_code_assigned', 'vendor_code', old.vendor_code, new.vendor_code, actor);
  end if;
  return null;
end $$;

drop trigger if exists trg_log_vendor_change on public.vendors;
create trigger trg_log_vendor_change
after update on public.vendors
for each row execute function public.log_vendor_change();

-- ── Approve: sequential, collision-safe vendor_code computed server-side in a
--    single statement, serialized per-trade with an advisory lock ────────────
create or replace function public.approve_vendor(p_vendor_id uuid)
returns public.vendors
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_trade  text;
  v_prefix text;
  v_next   int;
  v_code   text;
  v_row    public.vendors;
begin
  select trade into v_trade from public.vendors where id = p_vendor_id;
  if v_trade is null then
    raise exception 'Vendor % not found', p_vendor_id;
  end if;

  v_prefix := case v_trade
    when 'Runner'      then 'RUN'
    when 'Electrician' then 'ELE'
    when 'Carpenter'   then 'CAR'
    when 'Plumber'     then 'PLU'
    when 'Cleaner'     then 'CLE'
    else 'OTH'
  end;

  -- serialize allocation for this prefix so two concurrent approvals can't
  -- grab the same suffix
  perform pg_advisory_xact_lock(hashtext('vendor_code:' || v_prefix));

  select coalesce(max((split_part(vendor_code, '-', 2))::int), 0) + 1
    into v_next
    from public.vendors
   where vendor_code like v_prefix || '-%';

  v_code := v_prefix || '-' || lpad(v_next::text, 4, '0');

  update public.vendors
     set status      = 'approved',
         reviewed_at = now(),
         reviewed_by = coalesce(current_setting('request.jwt.claims', true)::json->>'email', reviewed_by),
         vendor_code = v_code
   where id = p_vendor_id
   returning * into v_row;

  return v_row;
end $$;

-- ── Reject: rejection reason mandatory, enforced server-side ─────────────────
create or replace function public.reject_vendor(p_vendor_id uuid, p_reason text, p_note text default null)
returns public.vendors
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_row    public.vendors;
  v_reason text;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A rejection reason is required';
  end if;

  v_reason := btrim(p_reason)
    || case when coalesce(btrim(p_note), '') <> '' then ' — ' || btrim(p_note) else '' end;

  update public.vendors
     set status           = 'rejected',
         reviewed_at      = now(),
         reviewed_by      = coalesce(current_setting('request.jwt.claims', true)::json->>'email', reviewed_by),
         rejection_reason = v_reason
   where id = p_vendor_id
   returning * into v_row;

  if v_row.id is null then
    raise exception 'Vendor % not found', p_vendor_id;
  end if;

  return v_row;
end $$;

grant execute on function public.approve_vendor(uuid) to authenticated;
grant execute on function public.reject_vendor(uuid, text, text) to authenticated;
