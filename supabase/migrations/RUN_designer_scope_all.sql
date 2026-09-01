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
        v_layout text; v_bhk int;
        actor text := coalesce(current_setting('request.jwt.claims', true)::json->>'email', 'staff');
begin
  select * into b from public.designer_brief where pid = p_pid and status = 'draft';
  if b.id is not null then
    return jsonb_build_object('token', b.token, 'existing', true, 'areas', b.areas);
  end if;

  -- The newest inspection that actually LISTS its rooms, not merely the newest
  -- one. Plenty of rows carry a layout with rooms still null — taking the latest
  -- blindly would hand a designer a form with no bedrooms in it, which looks
  -- like a broken link rather than like missing data.
  select i.* into insp from public.inspections i
   where i.pid = p_pid
     and jsonb_typeof(i.config->'rooms') = 'array'
     and jsonb_array_length(i.config->'rooms') > 0
   order by i.created_at desc limit 1;

  if insp.id is not null then
    select array_agg(value order by ordinality)
      into v_rooms
      from jsonb_array_elements_text(insp.config->'rooms') with ordinality as t(value, ordinality);
  else
    -- Nothing listed its rooms. Fall back to the layout and lay the flat out the
    -- way every inspection that did list them lays it out: living room, kitchen,
    -- N bedrooms, N-1 bathrooms, unnumbered at 1 BHK. Better a form she can
    -- correct in words than no form at all.
    select i.config->>'layout' into v_layout
      from public.inspections i
     where i.pid = p_pid and coalesce(i.config->>'layout', '') <> ''
     order by i.created_at desc limit 1;
    if v_layout is null then
      raise exception 'No inspection on this property yet — the form is built from its rooms';
    end if;

    v_bhk := greatest(coalesce(nullif(regexp_replace(v_layout, '\D', '', 'g'), ''), '1')::int, 1);
    v_rooms := array['Living Room', 'Kitchen'];
    if v_bhk = 1 then
      v_rooms := v_rooms || array['Bedroom', 'Bathroom'];
    else
      select v_rooms || array_agg('Bedroom ' || g order by g) into v_rooms from generate_series(1, v_bhk) g;
      -- One bathroom is "Bathroom", two or more are numbered — the spelling
      -- every inspection that did list its rooms already uses.
      if v_bhk = 2 then
        v_rooms := v_rooms || array['Bathroom'];
      else
        select v_rooms || array_agg('Bathroom ' || g order by g) into v_rooms from generate_series(1, v_bhk - 1) g;
      end if;
    end if;
  end if;

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
          coalesce(insp.config->>'layout', v_layout), v_areas, actor)
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


-- Design scope: the designer's half of the job, inside the work orders.
--
-- Her lines live in work_order_items alongside the ops person's, marked with a
-- source, rather than in a table of their own. That is the whole design: the
-- vendor page, the report and the costing already read work_order_items, so a
-- shelf she asked for reaches the carpenter through the machinery that already
-- exists. A parallel table would have meant teaching every one of those about a
-- second kind of line, and a vendor opening two work orders for one house.
--
-- Nothing she asks for reaches a vendor by being asked for. Designer lines land
-- unticked; somebody includes them deliberately. The tick is the review step,
-- sitting where staff are already looking instead of on an approval screen
-- nobody opens.


-- ── the marks on a line ─────────────────────────────────────────────────────
alter table public.work_order_items add column if not exists source           text;
alter table public.work_order_items add column if not exists task_id          uuid references public.task_catalogue(id) on delete set null;
alter table public.work_order_items add column if not exists brief_id         uuid references public.designer_brief(id) on delete set null;
alter table public.work_order_items add column if not exists category         text;
alter table public.work_order_items add column if not exists requirement_type text;
alter table public.work_order_items add column if not exists minutes          int;
alter table public.work_order_items add column if not exists included         boolean;

-- Backfill before defaulting, so the 170 lines already out there keep behaving
-- exactly as they do now: they came from an inspection, and they are in.
update public.work_order_items set source   = 'inspection' where source is null;
update public.work_order_items set included = true         where included is null;

alter table public.work_order_items alter column source   set default 'inspection';
alter table public.work_order_items alter column source   set not null;
alter table public.work_order_items alter column included set default true;
alter table public.work_order_items alter column included set not null;

alter table public.work_order_items drop constraint if exists work_order_items_source_check;
alter table public.work_order_items add constraint work_order_items_source_check
  check (source in ('inspection', 'designer'));

create index if not exists work_order_items_source_idx
  on public.work_order_items (work_order_id, source, included);

-- ── the vendor sees ticked lines only ───────────────────────────────────────
-- One added condition. Everything else is the function exactly as it was.
create or replace function public.wo_fetch(p_token text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare v_wo public.work_orders; v_items jsonb;
begin
  select * into v_wo from public.work_orders where token = p_token;
  if not found then
    raise exception 'Work order not found';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id, 'area', i.area, 'description', i.description,
           'fix_type', i.fix_type, 'material', i.material, 'quantity', i.quantity,
           'photo_path', i.photo_path, 'status', i.status,
           'vendor_note', i.vendor_note, 'dispute_reason', i.dispute_reason
         ) order by i.sort_order, i.created_at), '[]'::jsonb)
    into v_items
    from public.work_order_items i
   where i.work_order_id = v_wo.id
     and i.included;                      -- unticked design scope is not theirs to see

  -- NOTE: this payload is what a public link exposes. No costs. Keep it that way.
  return jsonb_build_object(
    'pid', v_wo.pid, 'trade', v_wo.trade, 'vendor_name', v_wo.vendor_name,
    'status', v_wo.status, 'scheduled_start', v_wo.scheduled_start,
    'scheduled_end', v_wo.scheduled_end, 'notes', v_wo.notes, 'items', v_items);
end $function$;

-- ── add a line from the catalogue ───────────────────────────────────────────
-- The trade is not a choice: it comes from the task. A shelf is a carpenter's
-- whoever typed it. If that trade has no work order on this property the draft
-- is created here — she asked for something nobody had planned for, which is
-- the point of asking her — but it is created unassigned, so nothing lands in
-- front of a vendor because a form was filled in.
create or replace function public.design_scope_add(
  p_pid       text,
  p_task_id   uuid,
  p_area      text,
  p_quantity  numeric default 1,
  p_note      text    default null,
  p_brief_id  uuid    default null
)
returns jsonb
language plpgsql security invoker set search_path = public, extensions
as $$
declare t public.task_catalogue; wo public.work_orders; it public.work_order_items;
        v_qty numeric := greatest(coalesce(p_quantity, 1), 0.01);
        v_sort int; v_raised boolean := false;
begin
  select * into t from public.task_catalogue where id = p_task_id;
  if t.id is null then raise exception 'That task is not in the catalogue'; end if;

  select * into wo from public.work_orders
   where pid = p_pid and trade = t.trade
   order by created_at desc limit 1;

  if wo.id is null then
    insert into public.work_orders (pid, trade, status, token, notes)
    values (p_pid, t.trade, 'draft',
            encode(extensions.gen_random_bytes(16), 'hex'),
            'Raised from the design brief')
    returning * into wo;
    v_raised := true;
  end if;

  select coalesce(max(sort_order), 0) + 1 into v_sort
    from public.work_order_items where work_order_id = wo.id;

  insert into public.work_order_items (
    work_order_id, area, description, fix_type, quantity, sort_order, status,
    source, task_id, brief_id, category, requirement_type, minutes, included
  ) values (
    wo.id, coalesce(nullif(btrim(p_area), ''), 'Whole property'),
    t.name || case when coalesce(btrim(p_note), '') <> '' then ' — ' || btrim(p_note) else '' end,
    t.requirement_type, v_qty, v_sort, 'pending',
    'designer', t.id, p_brief_id, t.category, t.requirement_type,
    -- minutes are stored, not looked up later: the catalogue will change and a
    -- plan already made should not move underneath somebody
    round(t.minutes * v_qty)::int,
    false
  ) returning * into it;

  return jsonb_build_object('item_id', it.id, 'work_order_id', wo.id,
                            'trade', t.trade, 'minutes', it.minutes,
                            -- true only when this call raised it; an existing
                            -- draft is not news
                            'created_work_order', v_raised);
end $$;

create or replace function public.design_scope_set_included(p_item_id uuid, p_included boolean)
returns jsonb
language plpgsql security invoker set search_path = public
as $$
begin
  update public.work_order_items set included = coalesce(p_included, false)
   where id = p_item_id and source = 'designer';
  if not found then raise exception 'Not a design scope line'; end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.design_scope_remove(p_item_id uuid)
returns jsonb
language plpgsql security invoker set search_path = public
as $$
begin
  delete from public.work_order_items where id = p_item_id and source = 'designer';
  if not found then raise exception 'Not a design scope line'; end if;
  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.design_scope_add(text, uuid, text, numeric, text, uuid) to authenticated;
grant execute on function public.design_scope_set_included(uuid, boolean)                to authenticated;
grant execute on function public.design_scope_remove(uuid)                               to authenticated;


-- check: existing lines untouched and visible, no design lines yet
select source, included, count(*) from public.work_order_items group by 1, 2;
