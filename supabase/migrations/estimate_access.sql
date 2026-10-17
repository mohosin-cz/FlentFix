-- Estimate access: Flent staff by login, landlords by email + code.
--
-- Until now the landlord link (/e/:token) was the only key, and not even that:
-- anon could read and update EVERY estimate and estimate line through the
-- public API key (rls_lockdown.sql "landlord reads / approves", using true).
--
-- Now:
--   · Send (workbench) issues a 6-digit code per estimate, posted to Slack
--     with the link and a summary; the team shares link + code with the
--     landlord. The code is kept (staff-only table) so re-sending after a
--     revision does not lock the landlord out.
--   · Opening the link: a Pulse session with an @flent.in email goes straight
--     in; anyone else enters their email + the code, which opens a 30-day
--     session on that device. Wrong codes are rate-limited.
--   · Every read and write the landlord page makes goes through the functions
--     below, which check the staff login or the session first. A landlord can
--     view, approve, ask and reply — never change a price.
--   · Every approval, question and reply records the email of who did it.
--   · Direct anon access to estimates / estimate_items / estimate_events /
--     estimate_disputes is removed.

begin;

-- ── who approved what ────────────────────────────────────────────────────
alter table public.estimate_items add column if not exists approved_by_email text;
alter table public.estimate_items add column if not exists approved_at       timestamptz;
alter table public.estimates      add column if not exists approved_by_email text;

-- ── the code, and the sessions it opens ───────────────────────────────────
create table if not exists public.estimate_access_codes (
  estimate_id uuid primary key references public.estimates(id) on delete cascade,
  code        text not null,
  set_at      timestamptz not null default now(),
  set_by      text
);
create table if not exists public.estimate_access_sessions (
  session      uuid primary key default gen_random_uuid(),
  estimate_id  uuid not null references public.estimates(id) on delete cascade,
  email        text not null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '30 days',
  last_seen_at timestamptz
);
create table if not exists public.estimate_access_attempts (
  id          bigserial primary key,
  estimate_id uuid not null,
  email       text,
  ok          boolean not null,
  at          timestamptz not null default now()
);
create index if not exists estimate_access_attempts_idx on public.estimate_access_attempts (estimate_id, at desc);

alter table public.estimate_access_codes    enable row level security;
alter table public.estimate_access_sessions enable row level security;
alter table public.estimate_access_attempts enable row level security;
revoke all on public.estimate_access_codes    from public, anon;
revoke all on public.estimate_access_sessions from public, anon, authenticated;
revoke all on public.estimate_access_attempts from public, anon, authenticated;
grant select on public.estimate_access_codes to authenticated;
drop policy if exists "staff read codes" on public.estimate_access_codes;
create policy "staff read codes" on public.estimate_access_codes for select to authenticated using (true);

-- Staff = a signed-in session whose email is @flent.in AND whose Pulse
-- profile is approved (the same test the login screen applies), so signing
-- up with a made-up @flent.in address does not open estimates.
create or replace function public.is_flent_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(lower(auth.jwt() ->> 'email') like '%@flent.in', false)
     and exists (select 1 from profiles where id = auth.uid() and status = 'approved')
$$;

-- Issue (or return the existing) code for an estimate. Staff only.
create or replace function public.estimate_access_code(p_estimate_id uuid, p_reset boolean default false)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v text;
begin
  if not is_flent_staff() then raise exception 'Only Flent staff can issue estimate codes'; end if;
  if not exists (select 1 from estimates where id = p_estimate_id) then raise exception 'No such estimate'; end if;
  select code into v from estimate_access_codes where estimate_id = p_estimate_id;
  if v is null or p_reset then
    v := (select lpad(((get_byte(b, 0) * 65536 + get_byte(b, 1) * 256 + get_byte(b, 2)) % 1000000)::text, 6, '0')
            from gen_random_bytes(3) b);
    insert into estimate_access_codes (estimate_id, code, set_at, set_by)
    values (p_estimate_id, v, now(), lower(auth.jwt() ->> 'email'))
    on conflict (estimate_id) do update set code = excluded.code, set_at = now(), set_by = excluded.set_by;
    if p_reset then delete from estimate_access_sessions where estimate_id = p_estimate_id; end if;
  end if;
  return v;
end
$$;

-- Landlord unlock: email + code → a 30-day session for this estimate.
create or replace function public.estimate_unlock(p_token text, p_email text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_est   uuid;
  v_code  text;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_fails int;
  v_sess  uuid;
begin
  select id into v_est from estimates where share_token = p_token;
  if v_est is null then raise exception 'This estimate link is not valid'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address'; end if;

  select count(*) into v_fails from estimate_access_attempts
   where estimate_id = v_est and not ok and at > now() - interval '15 minutes';
  if v_fails >= 8 then raise exception 'Too many wrong codes — try again in 15 minutes'; end if;

  select code into v_code from estimate_access_codes where estimate_id = v_est;
  if v_code is null or btrim(coalesce(p_code, '')) <> v_code then
    insert into estimate_access_attempts (estimate_id, email, ok) values (v_est, v_email, false);
    raise exception 'That code does not match this estimate';
  end if;

  insert into estimate_access_attempts (estimate_id, email, ok) values (v_est, v_email, true);
  insert into estimate_access_sessions (estimate_id, email) values (v_est, v_email) returning session into v_sess;
  return jsonb_build_object('session', v_sess, 'email', v_email);
end
$$;

-- Who is acting on this estimate: staff by login, landlord by session. Raises when neither.
create or replace function public.estimate_actor(p_token text, p_session uuid, out estimate_id uuid, out email text, out actor text)
language plpgsql
security definer
set search_path = public
as $$
begin
  select e.id into estimate_id from estimates e where e.share_token = p_token;
  if estimate_id is null then raise exception 'This estimate link is not valid'; end if;
  if is_flent_staff() then
    email := lower(auth.jwt() ->> 'email'); actor := 'flent'; return;
  end if;
  select s.email into email from estimate_access_sessions s
   where s.session = p_session and s.estimate_id = estimate_actor.estimate_id and s.expires_at > now();
  if email is null then raise exception 'locked' using errcode = '28000'; end if;
  update estimate_access_sessions set last_seen_at = now() where session = p_session;
  actor := 'landlord';
end
$$;

-- Everything the landlord page shows, in one read.
create or replace function public.estimate_view(p_token text, p_session uuid default null, p_preview boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a      record;
  est    estimates%rowtype;
  ver    estimate_versions%rowtype;
  items  jsonb;
  missing boolean := false;
begin
  select * into a from estimate_actor(p_token, p_session);
  select * into est from estimates where id = a.estimate_id;

  if est.current_version is not null then
    select * into ver from estimate_versions v where v.estimate_id = est.id and v.version_number = est.current_version;
    if ver.id is not null then
      select coalesce(jsonb_agg(to_jsonb(vi) || jsonb_build_object(
               -- the live twin's status and approver are the truth; the snapshot keeps prices
               'status', coalesce(ei.status, vi.status),
               'approved_by_email', ei.approved_by_email) order by vi.sort_order), '[]'::jsonb)
        into items
        from estimate_version_items vi left join estimate_items ei on ei.id = vi.estimate_item_id
       where vi.version_id = ver.id;
      if jsonb_array_length(items) = 0 then items := null; missing := true; end if;
    else
      missing := true;
    end if;
  end if;
  if items is null then
    select coalesce(jsonb_agg(to_jsonb(ei) || jsonb_build_object('inspection_line_items', jsonb_build_object(
               'section_name', li.section_name, 'item_score', li.item_score, 'notes', li.notes, 'availability_status', li.availability_status))
             order by ei.sort_order), '[]'::jsonb)
      into items
      from estimate_items ei left join inspection_line_items li on li.id = ei.line_item_id
     where ei.estimate_id = est.id;
  end if;

  -- a landlord opening it counts as a view (staff and previews do not)
  if a.actor = 'landlord' and not coalesce(p_preview, false) then
    if est.first_viewed_at is null then
      update estimates set first_viewed_at = now(), status = case when status in ('sent', 'draft') then 'viewed' else status end where id = est.id;
    end if;
    insert into estimate_events (estimate_id, event_type, actor, meta) values (est.id, 'viewed', 'landlord', jsonb_build_object('email', a.email));
  end if;

  return jsonb_build_object(
    'actor', a.actor, 'email', a.email,
    'estimate', to_jsonb(est) - 'access_code_hash',
    'snapshot_total', ver.total,
    'version_snapshot_missing', missing,
    'items', items,
    'disputes', coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at) from estimate_disputes d where d.estimate_id = est.id), '[]'::jsonb),
    'inspection', (select jsonb_build_object('id', i.id, 'pid', i.pid, 'house_type', i.house_type, 'inspection_date', i.inspection_date,
                                             'config', i.config, 'owner_email', i.owner_email)
                     from inspections i where i.id = est.inspection_id),
    'media', coalesce((select jsonb_object_agg(m.line_item_id, m.urls) from (
                select lm.line_item_id, jsonb_agg(lm.url) urls from line_item_media lm
                 where lm.line_item_id in (select (x->>'line_item_id')::uuid from jsonb_array_elements(items) x where x->>'line_item_id' is not null)
                 group by lm.line_item_id) m), '{}'::jsonb));
end
$$;

-- Approve one line. Takes the live estimate_items id.
create or replace function public.estimate_approve_item(p_token text, p_session uuid, p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare a record;
begin
  select * into a from estimate_actor(p_token, p_session);
  update estimate_items set status = 'approved', approved_by_email = a.email, approved_at = now()
   where id = p_item_id and estimate_id = a.estimate_id;
  if not found then raise exception 'That line is not on this estimate'; end if;
  insert into estimate_events (estimate_id, event_type, actor, meta)
  values (a.estimate_id, 'item_approved', a.actor, jsonb_build_object('item_id', p_item_id, 'name', a.email, 'email', a.email));
end
$$;

-- Ask about a line (a new query) or reply in its thread.
create or replace function public.estimate_post_query(p_token text, p_session uuid, p_item_id uuid, p_message text, p_reason_tag text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare a record;
begin
  select * into a from estimate_actor(p_token, p_session);
  if not exists (select 1 from estimate_items where id = p_item_id and estimate_id = a.estimate_id) then
    raise exception 'That line is not on this estimate';
  end if;
  if btrim(coalesce(p_message, '')) = '' then raise exception 'Write a message first'; end if;
  insert into estimate_disputes (estimate_item_id, estimate_id, author_type, author_name, reason_tag, message)
  values (p_item_id, a.estimate_id, case when a.actor = 'flent' then 'flent' else 'landlord' end, a.email, p_reason_tag, left(p_message, 4000));
  if p_reason_tag is not null then
    insert into estimate_events (estimate_id, event_type, actor, meta)
    values (a.estimate_id, 'queried', a.actor, jsonb_build_object('item_id', p_item_id, 'query', p_reason_tag, 'name', a.email, 'email', a.email));
  end if;
end
$$;

-- Approve everything still pending.
create or replace function public.estimate_approve_all(p_token text, p_session uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare a record; v_all boolean; v_status text;
begin
  select * into a from estimate_actor(p_token, p_session);
  update estimate_items set status = 'approved', approved_by_email = a.email, approved_at = now()
   where estimate_id = a.estimate_id and coalesce(status, 'pending') = 'pending';
  select bool_and(status in ('approved', 'removed', 'excluded') or cost_type = 'nil') into v_all
    from estimate_items where estimate_id = a.estimate_id;
  v_status := case when v_all then 'approved' else 'partially_approved' end;
  update estimates set status = v_status,
         approved_at = case when v_all then now() else approved_at end,
         approved_by_name = a.email, approved_by_email = a.email
   where id = a.estimate_id;
  insert into estimate_events (estimate_id, event_type, actor, meta)
  values (a.estimate_id, v_status, a.actor, jsonb_build_object('name', a.email, 'email', a.email));
  return v_status;
end
$$;

-- ── grants ────────────────────────────────────────────────────────────────
revoke all on function public.is_flent_staff() from public, anon;
revoke all on function public.estimate_actor(text, uuid) from public, anon, authenticated;
revoke all on function public.estimate_access_code(uuid, boolean) from public, anon;
grant execute on function public.is_flent_staff() to authenticated;
grant execute on function public.estimate_access_code(uuid, boolean) to authenticated;
revoke all on function public.estimate_unlock(text, text, text) from public;
revoke all on function public.estimate_view(text, uuid, boolean) from public;
revoke all on function public.estimate_approve_item(text, uuid, uuid) from public;
revoke all on function public.estimate_post_query(text, uuid, uuid, text, text) from public;
revoke all on function public.estimate_approve_all(text, uuid) from public;
grant execute on function public.estimate_unlock(text, text, text) to anon, authenticated;
grant execute on function public.estimate_view(text, uuid, boolean) to anon, authenticated;
grant execute on function public.estimate_approve_item(text, uuid, uuid) to anon, authenticated;
grant execute on function public.estimate_post_query(text, uuid, uuid, text, text) to anon, authenticated;
grant execute on function public.estimate_approve_all(text, uuid) to anon, authenticated;

-- ── close the open doors ──────────────────────────────────────────────────
-- (inspections, inspection_line_items and line_item_media stay readable by
-- anon: other public pages use them, and they carry no prices.)
drop policy if exists "landlord reads"              on public.estimates;
drop policy if exists "landlord approves"           on public.estimates;
drop policy if exists "landlord reads"              on public.estimate_items;
drop policy if exists "landlord approves"           on public.estimate_items;
drop policy if exists "landlord reads"              on public.estimate_events;
drop policy if exists "landlord records"            on public.estimate_events;
drop policy if exists "landlord reads"              on public.estimate_disputes;
drop policy if exists "landlord raises"             on public.estimate_disputes;
drop policy if exists "anyone with the link reads"  on public.estimate_versions;
drop policy if exists "anyone with the link reads"  on public.estimate_version_items;
revoke select, insert, update, delete on public.estimates              from anon;
revoke select, insert, update, delete on public.estimate_items         from anon;
revoke select, insert, update, delete on public.estimate_events        from anon;
revoke select, insert, update, delete on public.estimate_disputes      from anon;
revoke select, insert, update, delete on public.estimate_versions      from anon;
revoke select, insert, update, delete on public.estimate_version_items from anon;

commit;
