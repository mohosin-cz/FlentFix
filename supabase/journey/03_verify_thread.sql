-- Branch B verify. Run AFTER item_lineage.sql. Read-only.
-- Walks the same chain as staff, as the vendor (by work-order token) and as
-- the landlord (by share token), then a hand-added estimate line, an unlinked
-- payment, and the money trail for the property with the most payments.
create temp table if not exists _t (section text, key text, value text);
truncate _t;

do $$
declare
  v_woi uuid; v_wo uuid; v_tok text; v_pid text; v_est uuid; v_ei uuid; v_share text;
  v_hand uuid; v_pay uuid; v_pid_pay text; t0 timestamptz;
  chain text;
begin
  -- a verified work order item whose finding also has an estimate line
  select wi.id, w.id, w.token, w.pid into v_woi, v_wo, v_tok, v_pid
    from work_order_items wi join work_orders w on w.id = wi.work_order_id
   where wi.status = 'verified'
     and exists (select 1 from estimate_items ei where ei.line_item_id = wi.inspection_line_item_id)
   order by wi.verified_at desc nulls last limit 1;
  select ei.id, e.id, e.share_token into v_ei, v_est, v_share
    from estimate_items ei join estimates e on e.id = ei.estimate_id
   where ei.line_item_id = (select inspection_line_item_id from work_order_items where id = v_woi)
   limit 1;
  select id into v_hand from estimate_items where line_item_id is null limit 1;
  select pp.id, pp.pid into v_pay, v_pid_pay from property_payments pp
   where pp.work_order_id is null and pp.pid in (select pid from work_orders) limit 1;

  insert into _t values ('ctx', 'work_order_item', v_woi::text), ('ctx', 'pid', v_pid), ('ctx', 'estimate_item', v_ei::text);

  -- ── staff ──
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","email":"verify@flent.in"}', false);
  t0 := clock_timestamp();
  select string_agg(step || ' ' || kind || case when visible then '' else '(hidden)' end
                    || coalesce(' "' || left(label, 38) || '"', '') || case when is_gap then ' GAP' else '' end
                    || case when is_root then ' ←here' else '' end, ' | ' order by step, at nulls last)
    into chain from item_lineage('work_order_item', v_woi);
  insert into _t values ('staff · from wo item', 'chain', chain),
                        ('timing', 'item_lineage staff', round(extract(ms from clock_timestamp() - t0), 1)::text);
  select string_agg(step || ' ' || kind || case when is_gap then ' GAP: ' || reason else '' end, ' | ' order by step)
    into chain from item_lineage('estimate_item', v_ei);
  insert into _t values ('staff · from estimate line', 'chain', chain);
  select string_agg(step || ' ' || kind || case when is_gap then ' GAP: ' || reason else '' end || case when reason is not null and not is_gap then ' (' || reason || ')' else '' end, ' | ' order by step)
    into chain from item_lineage('estimate_item', v_hand);
  insert into _t values ('staff · hand-added line', 'chain', chain);
  select string_agg(step || ' ' || kind || case when is_gap then ' GAP' else '' end || coalesce(' (' || reason || ')', ''), ' | ' order by step)
    into chain from item_lineage('payment', v_pay);
  insert into _t values ('staff · unlinked payment', 'chain', chain);
  insert into _t select 'staff · rows', 'count', count(*)::text from item_lineage('work_order_item', v_woi);

  -- ── vendor ──
  perform set_config('request.jwt.claims', '', false);
  select string_agg(step || ' ' || kind || case when visible then '' else '(hidden)' end
                    || coalesce(' "' || left(label, 30) || '"', '') || coalesce(' → ' || route, ''), ' | ' order by step)
    into chain from item_lineage('work_order_item', v_woi, v_tok);
  insert into _t values ('vendor · by token', 'chain', chain);
  insert into _t select 'vendor · leaks?', 'detail keys with cost',
         coalesce(string_agg(distinct k, ','), 'none')
    from item_lineage('work_order_item', v_woi, v_tok) l, jsonb_each(l.detail) d(k, v)
   where k ilike '%cost%' and v::text <> 'null';

  -- ── landlord ──
  select string_agg(step || ' ' || kind || case when visible then '' else '(hidden)' end
                    || coalesce(' "' || left(label, 30) || '"', '') || coalesce(' → ' || route, ''), ' | ' order by step)
    into chain from item_lineage('estimate_item', v_ei, v_share);
  insert into _t values ('landlord · by share token', 'chain', chain);
  insert into _t select 'landlord · leaks?', 'vendor_name / verified_by present',
         coalesce(string_agg(distinct k, ','), 'none')
    from item_lineage('estimate_item', v_ei, v_share) l, jsonb_each(l.detail) d(k, v)
   where k in ('vendor_name','verified_by','vendor_id','vendor_note') and v::text <> 'null';

  -- ── nobody ──
  insert into _t select 'anon · no token', 'rows', count(*)::text from item_lineage('work_order_item', v_woi);
  insert into _t select 'anon · wrong token', 'rows', count(*)::text from item_lineage('work_order_item', v_woi, 'nope');
  insert into _t select 'unknown id', 'rows', string_agg(kind || ' ' || coalesce(reason,''), '') from item_lineage('payment', '00000000-0000-0000-0000-000000000000');

  -- ── money trail ──
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', false);
  select pid into v_pid_pay from property_payments group by pid order by count(*) desc limit 1;
  t0 := clock_timestamp();
  insert into _t select 'money · ' || v_pid_pay, group_kind || coalesce(' ' || trade, ''),
         n_payments || ' payments · ₹' || total || ' · mat ' || material || ' · lab ' || labour || ' · undated ' || undated
           || coalesce(' · areas ' || array_to_string(areas, ','), '')
    from property_money_trail(v_pid_pay) where n_payments > 0;
  insert into _t values ('timing', 'property_money_trail', round(extract(ms from clock_timestamp() - t0), 1)::text);
end $$;

select * from _t order by 1, 2;
