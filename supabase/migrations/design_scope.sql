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

begin;

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

commit;

-- check: existing lines untouched and visible, no design lines yet
select source, included, count(*) from public.work_order_items group by 1, 2;
