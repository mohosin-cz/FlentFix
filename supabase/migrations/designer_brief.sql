-- The designer's brief: what she plans for a property, in her words.
--
-- The ops person's inspection becomes work orders. The designer's half of the
-- same visit — the furniture, the lighting, the extra switch points, the thing
-- about this flat that will be awkward — has lived in conversation and been
-- lost. This is where it gets written down, against the PID, permanently.
--
-- Two decisions worth stating, because everything else follows from them:
--
-- The submission is kept verbatim and never rewritten. The scope lines that
-- later appear in a work order are derived from it; this row is the record. When
-- a vendor says nobody mentioned the beam, you open this and read what she
-- wrote, next to the photo she took.
--
-- The rooms are snapshotted at creation from the inspection's own config, so
-- her areas are spelled exactly as the ops person's are — "Bedroom 2" is
-- Bedroom 2 in both — and the two scopes group together in the work order
-- instead of drifting into two vocabularies for one house.

create table if not exists public.designer_brief (
  id             uuid primary key default gen_random_uuid(),
  pid            text not null,

  -- the only credential, same pattern as the vendor work order page
  token          text not null unique,

  status         text not null default 'draft' check (status in ('draft','submitted')),

  -- snapshot of the layout this form was built for
  layout         text,
  areas          text[] not null default '{}',

  designer_name  text,
  designer_phone text,

  -- { "Bedroom 1": { furniture, light_points, switch_points, wall_items,
  --                  complications, photos: [path] }, ... }
  -- Deliberately loose: the questions will change and old briefs must still
  -- read back exactly as they were answered.
  answers        jsonb not null default '{}'::jsonb,

  created_at     timestamptz not null default now(),
  created_by     text,
  updated_at     timestamptz not null default now(),
  submitted_at   timestamptz
);

create index if not exists designer_brief_pid_idx on public.designer_brief (pid, created_at desc);

-- One live brief per property. A second one is a revision, raised deliberately.
create unique index if not exists designer_brief_one_open_per_pid
  on public.designer_brief (pid) where status = 'draft';

alter table public.designer_brief enable row level security;
revoke all on public.designer_brief from public;
revoke all on public.designer_brief from anon;
grant select, insert, update, delete on public.designer_brief to authenticated;

drop policy if exists "staff manage designer briefs" on public.designer_brief;
create policy "staff manage designer briefs" on public.designer_brief
  for all to authenticated using (true) with check (true);
-- No anon policy, deliberately: the designer reaches this only through the
-- security-definer RPCs below, so a token can never be used to read the table.

-- ── staff: raise the link ───────────────────────────────────────────────────
-- Refuses before the inspection exists, because the room list comes from it and
-- a form that has to ask a designer what layout she is standing in is a form
-- that already knows less than the system does.
create or replace function public.designer_brief_start(p_pid text)
returns jsonb
language plpgsql security invoker set search_path = public, extensions
as $$
declare insp record; v_rooms text[]; v_areas text[]; b public.designer_brief;
        actor text := coalesce(current_setting('request.jwt.claims', true)::json->>'email', 'staff');
begin
  select * into b from public.designer_brief where pid = p_pid and status = 'draft';
  if b.id is not null then
    return jsonb_build_object('token', b.token, 'existing', true, 'areas', b.areas);
  end if;

  select i.* into insp from public.inspections i
   where i.pid = p_pid and i.config is not null
   order by i.created_at desc limit 1;
  if insp.id is null then
    raise exception 'No inspection on this property yet — the form is built from its rooms';
  end if;

  select array_agg(value order by ordinality)
    into v_rooms
    from jsonb_array_elements_text((insp.config::jsonb)->'rooms') with ordinality as t(value, ordinality);

  -- Every room the inspection knows, in its order, then the ones it never
  -- lists and a designer always needs. A balcony with nowhere to write about it
  -- becomes a sentence inside the living room box.
  v_rooms := coalesce(v_rooms, '{}');
  select array_agg(a order by ord) into v_areas
    from (
      select a, ord from unnest(v_rooms) with ordinality as x(a, ord)
      union all
      select a, 1000 + ord
        from unnest(array['Entrance','Balcony','Utility','Whole property'])
             with ordinality as y(a, ord)
       where a <> all(v_rooms)
    ) z;

  insert into public.designer_brief (pid, token, layout, areas, created_by)
  values (p_pid, encode(extensions.gen_random_bytes(18), 'hex'),
          (insp.config::jsonb)->>'layout', v_areas, actor)
  returning * into b;

  return jsonb_build_object('token', b.token, 'existing', false, 'areas', b.areas);
end $$;

-- ── designer: read, save, submit (token only) ───────────────────────────────
create or replace function public.designer_brief_fetch(p_token text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare b public.designer_brief; p record;
begin
  select * into b from public.designer_brief where token = btrim(p_token);
  if b.id is null then raise exception 'This link is not valid'; end if;
  select * into p from public.properties where pid = b.pid;

  return jsonb_build_object(
    'pid', b.pid, 'property_name', p.name, 'layout', b.layout,
    'areas', to_jsonb(b.areas), 'answers', b.answers,
    'designer_name', b.designer_name, 'designer_phone', b.designer_phone,
    'status', b.status, 'submitted_at', b.submitted_at);
end $$;

create or replace function public.designer_brief_save(
  p_token text, p_answers jsonb, p_name text default null, p_phone text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare b public.designer_brief;
begin
  select * into b from public.designer_brief where token = btrim(p_token);
  if b.id is null then raise exception 'This link is not valid'; end if;
  if b.status <> 'draft' then raise exception 'This brief has already been submitted'; end if;

  update public.designer_brief
     set answers = coalesce(p_answers, answers),
         designer_name = coalesce(nullif(btrim(p_name), ''), designer_name),
         designer_phone = coalesce(nullif(btrim(p_phone), ''), designer_phone),
         updated_at = now()
   where id = b.id;

  return jsonb_build_object('saved', true);
end $$;

create or replace function public.designer_brief_submit(p_token text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare b public.designer_brief;
begin
  select * into b from public.designer_brief where token = btrim(p_token);
  if b.id is null then raise exception 'This link is not valid'; end if;
  if b.status = 'submitted' then return jsonb_build_object('already', true); end if;

  update public.designer_brief
     set status = 'submitted', submitted_at = now(), updated_at = now()
   where id = b.id;

  return jsonb_build_object('submitted', true);
end $$;

revoke all on function public.designer_brief_start(text)                     from public;
grant execute on function public.designer_brief_start(text)                  to authenticated;
grant execute on function public.designer_brief_fetch(text)                  to anon, authenticated;
grant execute on function public.designer_brief_save(text, jsonb, text, text) to anon, authenticated;
grant execute on function public.designer_brief_submit(text)                 to anon, authenticated;
