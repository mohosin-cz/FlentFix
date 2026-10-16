-- Branch B · feat/the-thread
--
-- The schema already links a cracked tile to the money spent on it:
--   inspection finding → estimate line → landlord decision → work order item
--   → QC outcome → vendor on site → payment → invoice line
-- Nobody can see that chain. These two functions make it readable from any
-- node. Read-only: nothing here writes, nothing backfills a link.
--
-- Honesty rules:
--   · A missing link is a visible gap, never a shorter chain. Every one of the
--     eight steps comes back as a row — real, missing-not-yet, or missing-gap.
--   · Two audiences, two truths. A vendor token sees no costs and no landlord
--     correspondence; a landlord token sees no payments and no vendor rates.
--     Hidden steps come back as ONE redacted row per step, so a vendor cannot
--     count how many payments exist behind the curtain.
--   · Payments carry no work_order_id today (0 of 2,095). The money trail says
--     "unlinked: 2,095" rather than pretending.

begin;

-- ---------------------------------------------------------------------------
-- 1 · Indexes for the reverse lookups
-- ---------------------------------------------------------------------------
create index if not exists estimate_items_line_item_idx    on public.estimate_items (line_item_id);
create index if not exists work_order_items_line_item_idx  on public.work_order_items (inspection_line_item_id);
create index if not exists property_payments_wo_idx        on public.property_payments (work_order_id);
create index if not exists property_payments_pid_idx       on public.property_payments (pid);
create index if not exists landlord_invoice_items_est_idx  on public.landlord_invoice_items (estimate_item_id);
create index if not exists landlord_invoice_items_woi_idx  on public.landlord_invoice_items (wo_item_id);
create index if not exists vendor_attendance_vendor_pid_idx on public.vendor_attendance (vendor_id, pid, punched_at);
create index if not exists estimate_disputes_item_idx      on public.estimate_disputes (estimate_item_id, created_at desc);
create index if not exists line_item_media_item_idx        on public.line_item_media (line_item_id);

-- ---------------------------------------------------------------------------
-- 2 · item_lineage
-- ---------------------------------------------------------------------------
drop function if exists public.item_lineage(text, uuid, text);
create or replace function public.item_lineage(p_kind text, p_id uuid, p_token text default null)
returns table (
  step       int,          -- 1 finding · 2 estimate_line · 3 decision · 4 wo_item · 5 qc · 6 on_site · 7 payment · 8 invoice_line
  kind       text,         -- the step's kind, or 'missing'
  id         uuid,
  label      text,
  status     text,
  at         timestamptz,
  route      text,
  visible    boolean,      -- false → redacted for this audience; one row per hidden step
  is_root    boolean,      -- the node the caller is standing on
  is_gap     boolean,      -- missing AND something downstream exists → the link is broken
  reason     text,         -- why a step is missing
  detail     jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_role       text;
  v_pid        text;
  v_findings   uuid[] := '{}';
  v_est_items  uuid[] := '{}';
  v_wo_items   uuid[] := '{}';
  v_wos        uuid[] := '{}';
  v_pays       uuid[] := '{}';
  v_inv_items  uuid[] := '{}';
  v_root_wo    uuid;
  v_wo_token   text;   -- vendor's own token, for vendor-facing routes
  v_share      text;   -- landlord's share token, for landlord-facing routes
  v_has        boolean[] := array_fill(false, array[8]);
  v_invoice_exists boolean;
  s int;
begin
  -- ── Resolve the root to a property and seed the sets ─────────────────────
  case p_kind
    when 'inspection_line_item' then
      select i.pid into v_pid
        from inspection_line_items li join inspections i on i.id = li.inspection_id
       where li.id = p_id;
      v_findings := array[p_id];
    when 'estimate_item' then
      select e.pid, array_remove(array[ei.line_item_id], null) into v_pid, v_findings
        from estimate_items ei join estimates e on e.id = ei.estimate_id
       where ei.id = p_id;
      v_est_items := array[p_id];
    when 'estimate' then
      select e.pid, coalesce(array_agg(ei.line_item_id) filter (where ei.line_item_id is not null), '{}'),
             coalesce(array_agg(ei.id), '{}')
        into v_pid, v_findings, v_est_items
        from estimates e left join estimate_items ei on ei.estimate_id = e.id
       where e.id = p_id group by e.pid;
    when 'work_order_item' then
      select w.pid, array_remove(array[wi.inspection_line_item_id], null), array[w.id]
        into v_pid, v_findings, v_wos
        from work_order_items wi join work_orders w on w.id = wi.work_order_id
       where wi.id = p_id;
      v_wo_items := array[p_id];
    when 'work_order' then
      select w.pid, coalesce(array_agg(wi.inspection_line_item_id) filter (where wi.inspection_line_item_id is not null), '{}'),
             coalesce(array_agg(wi.id), '{}')
        into v_pid, v_findings, v_wo_items
        from work_orders w left join work_order_items wi on wi.work_order_id = w.id
       where w.id = p_id group by w.pid;
      v_wos := array[p_id];
    when 'payment' then
      select pp.pid, pp.work_order_id into v_pid, v_root_wo from property_payments pp where pp.id = p_id;
      v_pays := array[p_id];
      if v_root_wo is not null then
        v_wos := array[v_root_wo];
        select coalesce(array_agg(wi.inspection_line_item_id) filter (where wi.inspection_line_item_id is not null), '{}'),
               coalesce(array_agg(wi.id), '{}')
          into v_findings, v_wo_items
          from work_order_items wi where wi.work_order_id = v_root_wo;
      end if;
    when 'invoice_item' then
      select inv.pid, array_remove(array[ii.estimate_item_id], null), array_remove(array[ii.wo_item_id], null)
        into v_pid, v_est_items, v_wo_items
        from landlord_invoice_items ii join landlord_invoices inv on inv.id = ii.invoice_id
       where ii.id = p_id;
      v_inv_items := array[p_id];
      select coalesce(array_agg(x), '{}') into v_findings from (
        select ei.line_item_id as x from estimate_items ei where ei.id = any(v_est_items) and ei.line_item_id is not null
        union
        select wi.inspection_line_item_id from work_order_items wi where wi.id = any(v_wo_items) and wi.inspection_line_item_id is not null
      ) q;
    when 'invoice' then
      select inv.pid, coalesce(array_agg(ii.id), '{}'),
             coalesce(array_agg(ii.estimate_item_id) filter (where ii.estimate_item_id is not null), '{}'),
             coalesce(array_agg(ii.wo_item_id) filter (where ii.wo_item_id is not null), '{}')
        into v_pid, v_inv_items, v_est_items, v_wo_items
        from landlord_invoices inv left join landlord_invoice_items ii on ii.invoice_id = inv.id
       where inv.id = p_id group by inv.pid;
      select coalesce(array_agg(x), '{}') into v_findings from (
        select ei.line_item_id as x from estimate_items ei where ei.id = any(v_est_items) and ei.line_item_id is not null
        union
        select wi.inspection_line_item_id from work_order_items wi where wi.id = any(v_wo_items) and wi.inspection_line_item_id is not null
      ) q;
    else
      raise exception 'item_lineage: unknown kind %', p_kind;
  end case;

  if v_pid is null then
    -- The root itself does not exist. Say so instead of returning nothing.
    step := 0; kind := 'missing'; id := p_id; label := 'Not found'; status := null; at := null; route := null;
    visible := true; is_root := true; is_gap := true; reason := p_kind || ' ' || p_id || ' does not exist'; detail := '{}'::jsonb;
    return next; return;
  end if;

  -- ── Who is asking ────────────────────────────────────────────────────────
  if auth.uid() is not null then
    v_role := 'staff';
  elsif p_token is not null and exists (select 1 from work_orders w where w.token = p_token and w.pid = v_pid) then
    v_role := 'vendor'; v_wo_token := p_token;
  elsif p_token is not null and exists (select 1 from estimates e where e.share_token = p_token and e.pid = v_pid) then
    v_role := 'landlord'; v_share := p_token;
  else
    v_role := 'none';
  end if;
  if v_role = 'none' then return; end if;

  -- ── Close the sets over the findings ─────────────────────────────────────
  select coalesce(array_agg(distinct x), '{}') into v_est_items from (
    select unnest(v_est_items) as x
    union select ei.id from estimate_items ei where ei.line_item_id = any(v_findings)) q;
  select coalesce(array_agg(distinct x), '{}') into v_wo_items from (
    select unnest(v_wo_items) as x
    union select wi.id from work_order_items wi where wi.inspection_line_item_id = any(v_findings)) q;
  select coalesce(array_agg(distinct x), '{}') into v_wos from (
    select unnest(v_wos) as x
    union select wi.work_order_id from work_order_items wi where wi.id = any(v_wo_items)) q;
  select coalesce(array_agg(distinct x), '{}') into v_pays from (
    select unnest(v_pays) as x
    union select pp.id from property_payments pp where pp.work_order_id = any(v_wos)) q;
  select coalesce(array_agg(distinct x), '{}') into v_inv_items from (
    select unnest(v_inv_items) as x
    union select ii.id from landlord_invoice_items ii
           where ii.estimate_item_id = any(v_est_items) or ii.wo_item_id = any(v_wo_items)) q;
  -- a vendor only ever sees their own work order's slice
  if v_role = 'vendor' then
    select coalesce(array_agg(w.id), '{}') into v_wos from work_orders w where w.id = any(v_wos) and w.token = p_token;
    select coalesce(array_agg(wi.id), '{}') into v_wo_items from work_order_items wi where wi.id = any(v_wo_items) and wi.work_order_id = any(v_wos);
  end if;

  if v_role = 'staff' then
    v_share := (select e.share_token from estimates e where e.id = any(select ei.estimate_id from estimate_items ei where ei.id = any(v_est_items)) limit 1);
  end if;
  v_invoice_exists := exists (select 1 from landlord_invoices inv where inv.pid = v_pid);

  -- ── Step 1 · finding ─────────────────────────────────────────────────────
  for step, kind, id, label, status, at, route, visible, is_root, is_gap, reason, detail in
    select 1, 'inspection_line_item', li.id,
           coalesce(li.area, li.section_name, '—') || ' · ' || coalesce(li.item_name, '—'),
           case when li.issue_description in ('Functional','Not available','No provision','Not required') then lower(li.issue_description)
                when li.item_score is not null then 'score ' || li.item_score
                else 'unscored' end,
           li.created_at,
           -- the raw inspection page is staff-only; token audiences get no link
           case when v_role = 'staff' then '/inspections/' || li.inspection_id || '/raw#li-' || li.id end,
           true, (p_kind = 'inspection_line_item' and li.id = p_id), false, null,
           jsonb_build_object(
             'inspection_id', li.inspection_id, 'inspection_date', i.inspection_date,
             'issue', li.issue_description, 'action', li.action, 'trade', li.trade,
             'photos', (select count(*) from line_item_media m where m.line_item_id = li.id),
             'excluded_from_estimate', li.excluded_from_estimate)
           || case when v_role = 'staff' then jsonb_build_object('material_cost', li.material_cost, 'labour_cost', li.labour_cost, 'notes', li.notes) else '{}'::jsonb end
      from inspection_line_items li join inspections i on i.id = li.inspection_id
     where li.id = any(v_findings)
     order by li.created_at
  loop v_has[1] := true; return next; end loop;

  -- ── Step 2 · estimate line · Step 3 · landlord decision ──────────────────
  if v_role = 'vendor' then
    if cardinality(v_est_items) > 0 then
      step := 2; kind := 'estimate_item'; id := null; label := null; status := null; at := null; route := null;
      visible := false; is_root := false; is_gap := false; reason := 'hidden for vendors'; detail := '{}'::jsonb; return next;
      step := 3; kind := 'decision'; return next;
      v_has[2] := true; v_has[3] := true;
    end if;
  else
    for step, kind, id, label, status, at, route, visible, is_root, is_gap, reason, detail in
      select 2, 'estimate_item', ei.id,
             coalesce(ei.item_name, '—') || case when ei.cost_type = 'priced' and (coalesce(ei.material_cost,0) + coalesce(ei.labour_cost,0)) > 0
                                            then ' · ₹' || to_char((coalesce(ei.material_cost,0) + coalesce(ei.labour_cost,0)) * coalesce(ei.qty,1), 'FM9,99,99,990')
                                            else '' end,
             ei.status, ei.created_at,
             case when v_role = 'landlord' then '/e/' || v_share || '#item-' || ei.id
                  else '/estimate/' || ei.estimate_id || '#row-' || ei.id end,
             true, (p_kind = 'estimate_item' and ei.id = p_id), false,
             case when ei.line_item_id is null then 'added by hand — no inspection finding behind it' end,
             jsonb_build_object('estimate_id', ei.estimate_id, 'estimate_status', e.status, 'area', ei.area, 'trade', ei.trade,
                                'material_cost', ei.material_cost, 'labour_cost', ei.labour_cost, 'qty', ei.qty,
                                'cost_type', ei.cost_type, 'warranty', ei.warranty, 'version', e.current_version)
        from estimate_items ei join estimates e on e.id = ei.estimate_id
       where ei.id = any(v_est_items)
       order by ei.sort_order, ei.created_at
    loop v_has[2] := true; return next; end loop;

    for step, kind, id, label, status, at, route, visible, is_root, is_gap, reason, detail in
      select 3, 'decision', ei.id,
             case ei.status
               when 'approved' then 'Approved by landlord' || coalesce(' · ' || e.approved_by_name, '')
               when 'disputed' then 'Queried by landlord' || coalesce(' · ' || replace(d.reason_tag, '_', ' '), '')
               when 'resolved' then 'Query resolved'
               when 'removed'  then 'Removed from estimate'
               when 'excluded' then 'Excluded from estimate'
               when 'pending'  then case when e.sent_at is null and e.status = 'draft' then 'Not sent yet' else 'Awaiting landlord' end
               else coalesce(ei.status, 'unknown') end,
             ei.status,
             case ei.status
               when 'approved' then coalesce(ev.at, e.approved_at)
               when 'disputed' then d.created_at
               when 'resolved' then d.created_at
               else coalesce(e.first_viewed_at, e.sent_at) end,
             case when v_role = 'landlord' then '/e/' || v_share || '#item-' || ei.id
                  else '/estimate/' || ei.estimate_id || '#row-' || ei.id end,
             true, false, false, null,
             jsonb_build_object('disputes', (select count(*) from estimate_disputes x where x.estimate_item_id = ei.id),
                                'last_word', d.author_type, 'query', d.message, 'sent_at', e.sent_at, 'viewed_at', e.first_viewed_at)
        from estimate_items ei
        join estimates e on e.id = ei.estimate_id
        left join lateral (select x.* from estimate_disputes x where x.estimate_item_id = ei.id order by x.created_at desc limit 1) d on true
        left join lateral (select max(x.created_at) as at from estimate_events x
                            where x.estimate_id = ei.estimate_id and x.event_type = 'item_approved' and x.meta->>'item_id' = ei.id::text) ev on true
       where ei.id = any(v_est_items)
       order by ei.sort_order, ei.created_at
    loop v_has[3] := true; return next; end loop;
  end if;

  -- ── Step 4 · work order item · Step 5 · QC ───────────────────────────────
  for step, kind, id, label, status, at, route, visible, is_root, is_gap, reason, detail in
    select 4, 'work_order_item', wi.id,
           coalesce(wi.description, '—') || ' · ' ||
             case when v_role = 'landlord' then w.trade                      -- never the vendor's name
                  else coalesce(w.vendor_name, 'no vendor') || ' (' || w.trade || ')' end,
           wi.status, wi.created_at,
           case when v_role = 'vendor'   then '/wo/' || v_wo_token || '#wo-item-' || wi.id
                when v_role = 'landlord' then null                           -- work orders are not a landlord page
                else '/properties/' || w.pid || '/work-orders#woi-' || wi.id end,
           true, (p_kind = 'work_order_item' and wi.id = p_id), false, null,
           jsonb_build_object('work_order_id', w.id, 'wo_status', w.status, 'trade', w.trade, 'area', wi.area,
                              'scheduled_start', w.scheduled_start, 'scheduled_end', w.scheduled_end, 'included', wi.included,
                              'vendor_name', case when v_role = 'landlord' then null else w.vendor_name end,
                              'vendor_note', case when v_role = 'landlord' then null else wi.vendor_note end)
      from work_order_items wi join work_orders w on w.id = wi.work_order_id
     where wi.id = any(v_wo_items)
     order by w.created_at, wi.sort_order
  loop v_has[4] := true; return next; end loop;

  for step, kind, id, label, status, at, route, visible, is_root, is_gap, reason, detail in
    select 5, 'qc', wi.id,
           case wi.status
             when 'verified'      then 'Verified' || case when v_role = 'landlord' then ' by Flent' else coalesce(' by ' || split_part(wi.verified_by, '@', 1), '') end
             when 'disputed'      then 'Sent back' || case when wi.dispute_count > 1 then ' ×' || wi.dispute_count else '' end
                                      || case when v_role = 'landlord' then '' else coalesce(' · ' || wi.dispute_reason, '') end  -- internal note
             when 'vendor_closed' then 'Vendor closed, awaiting QC'
           end,
           wi.status,
           case wi.status when 'verified' then wi.verified_at when 'vendor_closed' then wi.vendor_closed_at
                          else (select max(a.changed_at) from work_order_activity a where a.item_id = wi.id and a.event ilike '%disput%') end,
           case when v_role = 'vendor'   then '/wo/' || v_wo_token || '#wo-item-' || wi.id
                when v_role = 'landlord' then null
                else '/properties/' || w.pid || '/work-orders#woi-' || wi.id end,
           true, false, false, null,
           jsonb_build_object('dispute_count', wi.dispute_count, 'verified_by', case when v_role = 'staff' then wi.verified_by end,
                              'vendor_closed_at', wi.vendor_closed_at, 'verified_at', wi.verified_at)
      from work_order_items wi join work_orders w on w.id = wi.work_order_id
     where wi.id = any(v_wo_items) and wi.status in ('verified','disputed','vendor_closed')
     order by w.created_at, wi.sort_order
  loop v_has[5] := true; return next; end loop;

  -- ── Step 6 · vendor on site ──────────────────────────────────────────────
  for step, kind, id, label, status, at, route, visible, is_root, is_gap, reason, detail in
    select 6, 'on_site', w.id,
           case when v_role = 'landlord' then 'On site' else coalesce(w.vendor_name, 'Vendor') || ' on site' end
             || ' · ' || a.days || ' day' || case when a.days > 1 then 's' else '' end
             || ' · ' || to_char(a.first_at, 'DD Mon') || case when a.days > 1 then '–' || to_char(a.last_at, 'DD Mon') else '' end,
           case when a.last_at::date >= coalesce(w.scheduled_start, a.last_at::date) then 'attended' else 'before schedule' end,
           a.first_at,
           case when v_role = 'vendor'   then '/wo/' || v_wo_token
                when v_role = 'landlord' then null
                else '/properties/' || w.pid || '/work-orders#wo-' || w.id end,
           true, false, false, null,
           jsonb_build_object('work_order_id', w.id, 'punch_ins', a.n, 'days', a.days, 'first_at', a.first_at, 'last_at', a.last_at,
                              'vendor_id', case when v_role = 'staff' then w.vendor_id end)
      from work_orders w
      join lateral (
        select count(*) as n, count(distinct va.punched_at::date) as days, min(va.punched_at) as first_at, max(va.punched_at) as last_at
          from vendor_attendance va
         where va.vendor_id = w.vendor_id and va.pid = w.pid and va.punch_type = 'in'
      ) a on a.n > 0
     where w.id = any(v_wos) and w.vendor_id is not null
     order by a.first_at
  loop v_has[6] := true; return next; end loop;

  -- ── Step 7 · payment ─────────────────────────────────────────────────────
  if v_role <> 'staff' then
    if cardinality(v_pays) > 0 then
      step := 7; kind := 'payment'; id := null; label := null; status := null; at := null; route := null;
      visible := false; is_root := false; is_gap := false; reason := 'hidden for ' || v_role || 's'; detail := '{}'::jsonb;
      v_has[7] := true; return next;
    end if;
  else
    for step, kind, id, label, status, at, route, visible, is_root, is_gap, reason, detail in
      select 7, 'payment', pp.id,
             '₹' || to_char(pp.amount, 'FM9,99,99,990') || ' ' || lower(pp.kind) || coalesce(' to ' || pp.payee_name, '')
               || coalesce(' · ' || to_char(pp.paid_on, 'DD Mon YY'), ' · undated'),
             coalesce(pp.method, 'unknown method'), coalesce(pp.paid_on::timestamptz, pp.created_at),
             '/properties/' || pp.pid || '/payments#pay-' || pp.id,
             true, (p_kind = 'payment' and pp.id = p_id), false,
             case when pp.work_order_id is null then 'not linked to a work order' end,
             jsonb_build_object('amount', pp.amount, 'kind', pp.kind, 'trade', pp.trade, 'material_cost', pp.material_cost,
                                'labour_cost', pp.labour_cost, 'reference', pp.reference, 'source', pp.source,
                                'items', (select count(*) from property_payment_items x where x.payment_id = pp.id),
                                'bills', (select count(*) from property_payment_bills x where x.payment_id = pp.id))
        from property_payments pp
       where pp.id = any(v_pays)
       order by pp.paid_on nulls last, pp.created_at
    loop v_has[7] := true; return next; end loop;
  end if;

  -- ── Step 8 · invoice line ────────────────────────────────────────────────
  if v_role = 'vendor' then
    if cardinality(v_inv_items) > 0 then
      step := 8; kind := 'invoice_item'; id := null; label := null; status := null; at := null; route := null;
      visible := false; is_root := false; is_gap := false; reason := 'hidden for vendors'; detail := '{}'::jsonb;
      v_has[8] := true; return next;
    end if;
  else
    for step, kind, id, label, status, at, route, visible, is_root, is_gap, reason, detail in
      select 8, 'invoice_item', ii.id,
             inv.invoice_number || ' · ' || ii.description || ' · ₹' || to_char(ii.qty * ii.unit_price, 'FM9,99,99,990'),
             inv.status, coalesce(inv.issue_date::timestamptz, ii.created_at),
             '/invoice/' || inv.inspection_id || '#inv-' || ii.id,
             true, (p_kind = 'invoice_item' and ii.id = p_id), false,
             case when ii.estimate_item_id is null and ii.wo_item_id is null then 'typed in — no estimate line or work order item behind it' end,
             jsonb_build_object('invoice_id', inv.id, 'qty', ii.qty, 'unit', ii.unit, 'unit_price', ii.unit_price, 'category', ii.category,
                                'via', case when ii.wo_item_id is not null then 'work_order_item' when ii.estimate_item_id is not null then 'estimate_item' end)
        from landlord_invoice_items ii join landlord_invoices inv on inv.id = ii.invoice_id
       where ii.id = any(v_inv_items)
       order by inv.issue_date, ii.sl_no
    loop v_has[8] := true; return next; end loop;
  end if;

  -- ── Gaps · every empty step is a row, and says why ───────────────────────
  for s in 1..8 loop
    if v_has[s] then continue; end if;
    -- steps this audience never sees do not get a gap row either
    if v_role = 'vendor' and s in (2,3,7,8) then continue; end if;
    if v_role = 'landlord' and s = 7 then continue; end if;

    step := s; id := null; label := null; status := null; at := null; route := null;
    visible := true; is_root := false; detail := '{}'::jsonb;
    is_gap := exists (select 1 from unnest(v_has[s+1:8]) h where h);   -- something downstream exists
    kind := 'missing';

    -- A payment with no work_order_id has exactly one broken link — its own.
    -- Everything upstream is untraceable, not five separate failures.
    if p_kind = 'payment' and v_root_wo is null and s <= 6 then
      label := case s when 1 then 'No inspection finding' when 2 then 'No estimate line' when 3 then 'No landlord decision'
                      when 4 then 'No work order' when 5 then 'No QC outcome' else 'No punch-in on record' end;
      is_gap := (s = 4);
      reason := case when s = 4 then 'this payment carries no work order id, so nothing upstream can be traced'
                     else 'untraceable: the payment is not linked to a work order' end;
      return next; continue;
    end if;

    case s
      when 1 then label := 'No inspection finding';
                  reason := case when is_gap then 'this line was added by hand; nothing in an inspection points to it' else 'no inspection' end;
      when 2 then label := 'No estimate line';
                  reason := case when is_gap then 'work was raised without an estimate line for this finding' else 'not estimated yet' end;
      when 3 then label := 'No landlord decision';
                  reason := case when is_gap then 'work went ahead without a landlord decision on this line' else 'not sent to the landlord yet' end;
      when 4 then label := 'No work order item';
                  reason := case when is_gap then 'money or an invoice line exists but no work order item traces to this finding' else 'no work order raised yet' end;
      when 5 then label := 'No QC outcome';
                  reason := case when is_gap then 'paid or invoiced before anyone verified the work' else 'work not closed yet' end;
      when 6 then label := 'No punch-in on record';
                  -- attendance is optional evidence; only a gap once the vendor says the work is done
                  is_gap := exists (select 1 from work_orders w where w.id = any(v_wos) and w.status in ('vendor_completed','verified'));
                  reason := case when is_gap then 'vendor marked the work done but never punched in at this property' else 'vendor has not been on site yet' end;
      when 7 then label := 'No payment linked';
                  is_gap := exists (select 1 from work_order_items wi where wi.id = any(v_wo_items) and wi.status = 'verified');
                  reason := case when is_gap then 'work is verified but no payment carries this work order id' else 'nothing paid yet' end;
      when 8 then label := 'No invoice line';
                  -- only a gap once there was something to bill: an approved line or verified work
                  is_gap := v_invoice_exists and (
                    exists (select 1 from estimate_items ei where ei.id = any(v_est_items) and ei.status = 'approved')
                    or exists (select 1 from work_order_items wi where wi.id = any(v_wo_items) and wi.status = 'verified'));
                  reason := case when is_gap then 'an invoice exists for this property but no line traces here' else 'not invoiced yet' end;
    end case;
    return next;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 3 · property_money_trail — payments grouped by the work order they paid for
--     and, through it, the inspection areas. Unlinked payments are a group of
--     their own, with the count in the open.
-- ---------------------------------------------------------------------------
drop function if exists public.property_money_trail(text);
create or replace function public.property_money_trail(p_pid text)
returns table (
  group_kind   text,      -- 'work_order' · 'unlinked'
  work_order_id uuid,
  trade        text,      -- the work order's trade, or the payment's trade for unlinked rows
  vendor_name  text,
  wo_status    text,
  areas        text[],    -- inspection areas the work order's items trace to
  n_payments   int,
  total        numeric,
  material     numeric,
  labour       numeric,
  undated      int,
  first_paid   date,
  last_paid    date
)
language sql
stable
security definer
set search_path = public
as $$
  with pays as (
    select pp.*,
           case pp.kind when 'Material' then pp.amount when 'Both' then coalesce(pp.material_cost, 0) else 0 end as mat,
           case pp.kind when 'Labour'   then pp.amount when 'Both' then coalesce(pp.labour_cost, 0)   else 0 end as lab
      from property_payments pp
     where pp.pid = p_pid
  )
  select 'work_order', w.id, w.trade, w.vendor_name, w.status,
         (select array_agg(distinct coalesce(li.area, wi.area)) from work_order_items wi
            left join inspection_line_items li on li.id = wi.inspection_line_item_id
           where wi.work_order_id = w.id),
         count(p.id)::int, coalesce(sum(p.amount), 0), coalesce(sum(p.mat), 0), coalesce(sum(p.lab), 0),
         count(p.id) filter (where p.paid_on is null)::int, min(p.paid_on), max(p.paid_on)
    from work_orders w
    left join pays p on p.work_order_id = w.id
   where w.pid = p_pid
   group by w.id, w.trade, w.vendor_name, w.status
  union all
  select 'unlinked', null::uuid, p.trade, null::text, null::text, null::text[],
         count(*)::int, sum(p.amount), sum(p.mat), sum(p.lab),
         count(*) filter (where p.paid_on is null)::int, min(p.paid_on), max(p.paid_on)
    from pays p
   where p.work_order_id is null
   group by p.trade
   order by 1, 8 desc nulls last
$$;

-- ---------------------------------------------------------------------------
-- 4 · Grants. item_lineage serves the token pages too, so anon may execute it
--     — the function itself returns nothing without a matching token.
-- ---------------------------------------------------------------------------
revoke all on function public.item_lineage(text, uuid, text) from public;
grant execute on function public.item_lineage(text, uuid, text) to anon, authenticated;
revoke all on function public.property_money_trail(text) from public, anon;
grant execute on function public.property_money_trail(text) to authenticated;

commit;
