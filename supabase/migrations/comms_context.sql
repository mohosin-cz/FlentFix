-- Branch F · feat/smart-comms
--
-- When the next action is "talk to someone", Pulse drafts the message.
--
-- comms_context(pid) is everything a draft needs about one property, in one
-- round trip, read live — nothing here is stored. The client picks a template
-- (src/components/comms/templates.js) and fills it from this object.
--
-- The object keeps the two audiences in separate sections on purpose:
--
--   property      who the LANDLORD is and how to reach them     (landlord-facing)
--   estimate      what the landlord has / hasn't decided         (landlord-facing)
--   work_orders[] who each VENDOR is, what they still owe        (vendor-facing)
--   done          what has been verified, to tell the landlord   (landlord-facing)
--
-- work_orders[] never carries a cost, a landlord name or a landlord phone;
-- property/estimate never carry a vendor phone. A template that reads the wrong
-- section for its audience is a bug, but the shape makes it a visible one.
--
-- One SELECT, so supabase/journey/06_verify_comms.sql can run the same body
-- read-only. Staff only: revoked from anon, granted to authenticated.

begin;

create or replace function public.comms_context(p_pid text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with p as (
  select pr.pid, pr.name, pr.address, pr.landlord, pr.handover_date, pr.handover_done_at
    from properties pr
   where pr.pid = p_pid
     and pr.deleted_at is null
   limit 1
),
-- latest of each per pid; the same "newest row wins" rule the engine uses
inv as (
  select li.landlord_name, li.landlord_email, li.landlord_phone, li.inspection_id, li.status, li.created_at
    from landlord_invoices li
   where li.pid = p_pid
   order by li.created_at desc
   limit 1
),
est as (
  select e.id, e.status, e.share_token, e.sent_at, e.first_viewed_at, e.approved_at, e.approved_by_name,
         e.landlord_email, e.apartment_name, e.address, e.valid_till, e.inspection_id, e.created_at
    from estimates e
   where e.pid = p_pid
   order by e.created_at desc
   limit 1
),
insp as (
  select i.id
    from inspections i
   where i.pid = p_pid
   order by (i.status in ('completed', 'legacy')) desc, i.created_at desc
   limit 1
),
-- estimates.sent_at arrived late; the earliest surviving evidence of the send
-- wins (journey_engine.sql §6 est_sent, kept identical)
est_sent as (
  select least(est.sent_at,
               (select min(ev.created_at) from estimate_events ev
                 where ev.estimate_id = est.id and ev.event_type = 'sent'),
               (select min(v.sent_at) from estimate_versions v
                 where v.estimate_id = est.id),
               est.first_viewed_at) as at
    from est
),
items as (
  select ei.id, ei.item_name, ei.status, ei.sort_order, ei.created_at
    from est
    join estimate_items ei on ei.estimate_id = est.id
),
item_counts as (
  select count(*) filter (where status = 'pending')                      as pending,
         count(*) filter (where status = 'approved')                     as approved,
         count(*) filter (where status = 'disputed')                     as queried,
         count(*) filter (where status not in ('removed', 'excluded'))   as total
    from items
),
pending_names as (
  select coalesce(jsonb_agg(x.item_name order by x.sort_order, x.created_at), '[]'::jsonb) as names
    from (select item_name, sort_order, created_at
            from items
           where status = 'pending' and nullif(item_name, '') is not null
           order by sort_order, created_at
           limit 5) x
),
-- The landlord's newest message per item. "Answered" is the rule the landlord
-- page itself uses (LandlordEstimate.jsx): the last word on the thread is ours,
-- or the item has since been resolved / removed / approved.
ll_q as (
  select distinct on (d.estimate_item_id)
         d.estimate_item_id, d.reason_tag, d.message, d.created_at as asked_at, d.author_name,
         ei.item_name, ei.status as item_status,
         (coalesce(ei.status, '') in ('resolved', 'removed', 'approved')
          or exists (select 1 from estimate_disputes f
                      where f.estimate_item_id = d.estimate_item_id
                        and f.author_type = 'flent'
                        and f.created_at > d.created_at)) as answered
    from est
    join estimate_disputes d on d.estimate_id = est.id
    left join estimate_items ei on ei.id = d.estimate_item_id
   where d.author_type = 'landlord'
   order by d.estimate_item_id, d.created_at desc
),
queried as (
  select coalesce(jsonb_agg(jsonb_build_object(
           'item_name',  q.item_name,
           'reason_tag', q.reason_tag,
           'message',    q.message,
           'asked_at',   q.asked_at,
           'answered',   q.answered)
           order by q.answered, q.asked_at desc), '[]'::jsonb) as list
    from (select * from ll_q order by answered, asked_at desc limit 8) q
),
ll_name as (
  select author_name from ll_q where nullif(author_name, '') is not null order by asked_at desc limit 1
),
j as (
  select s.stage_code, s.stage_label, s.blocked_on, s.since, s.age_days,
         s.next_action_label, s.next_action_route, s.urgency, s.open_threads
    from public.property_journey_state('all') s
   where s.pid = p_pid
   limit 1
),
-- One row per work order. Descriptions and reasons only — work_order_items has
-- no cost column and nothing here joins the estimate.
wo as (
  select w.id, w.trade, w.vendor_name, v.phone as vendor_phone, w.token, w.status,
         w.scheduled_start, w.scheduled_end, w.verified_at, w.created_at,
         (select coalesce(jsonb_agg(x.description order by x.sort_order), '[]'::jsonb)
            from (select wi.description, wi.sort_order
                    from work_order_items wi
                   where wi.work_order_id = w.id and wi.status = 'pending'
                     and coalesce(wi.included, true) and nullif(wi.description, '') is not null
                   order by wi.sort_order
                   limit 6) x)                                                   as open_items,
         (select count(*) from work_order_items wi
           where wi.work_order_id = w.id and wi.status = 'pending' and coalesce(wi.included, true)) as open_count,
         (select coalesce(jsonb_agg(jsonb_build_object('description', x.description, 'reason', x.dispute_reason)
                                    order by x.sort_order), '[]'::jsonb)
            from (select wi.description, wi.dispute_reason, wi.sort_order
                    from work_order_items wi
                   where wi.work_order_id = w.id and wi.status = 'disputed'
                   order by wi.sort_order
                   limit 6) x)                                                   as sent_back,
         (select count(*) from work_order_items wi
           where wi.work_order_id = w.id and wi.status = 'disputed')             as sent_back_count,
         (select count(*) from work_order_items wi
           where wi.work_order_id = w.id and wi.status = 'vendor_closed')        as closed_unverified,
         (select count(*) from work_order_items wi
           where wi.work_order_id = w.id and wi.status = 'verified')             as verified
    from work_orders w
    left join vendors v on v.id = w.vendor_id
   where w.pid = p_pid
),
wo_list as (
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',                wo.id,
           'trade',             wo.trade,
           'vendor_name',       nullif(wo.vendor_name, ''),
           'vendor_phone',      nullif(wo.vendor_phone, ''),
           'token',             wo.token,
           'status',            wo.status,
           'scheduled_start',   wo.scheduled_start,
           'scheduled_end',     wo.scheduled_end,
           'open_items',        wo.open_items,
           'open_count',        wo.open_count,
           'sent_back',         wo.sent_back,
           'sent_back_count',   wo.sent_back_count,
           'closed_unverified', wo.closed_unverified,
           'verified',          wo.verified)
           order by wo.created_at), '[]'::jsonb) as list
    from wo
),
done as (
  select coalesce(jsonb_agg(wo.trade order by wo.verified_at) filter (where wo.status = 'verified'), '[]'::jsonb) as verified_trades,
         max(wo.verified_at)                                                     as last_verified_at,
         count(*)                                                                as n,
         count(*) filter (where wo.status = 'verified')                          as n_verified
    from wo
)
select jsonb_build_object(
  'pid',          p_pid,
  'generated_at', now(),

  'property', (
    select jsonb_build_object(
      'pid',            p.pid,
      'name',           nullif(p.name, ''),
      'address',        coalesce(nullif(p.address, ''), nullif(est.address, '')),
      'landlord_name',  coalesce(nullif(inv.landlord_name, ''), nullif(p.landlord, ''),
                                 nullif(est.approved_by_name, ''), (select author_name from ll_name)),
      'landlord_phone', nullif(inv.landlord_phone, ''),
      'landlord_email', coalesce(nullif(inv.landlord_email, ''), nullif(est.landlord_email, '')),
      -- where a missing name / phone gets added
      'contact_route',  case
                          when inv.created_at is not null
                            then '/invoice/' || coalesce(inv.inspection_id, est.inspection_id, (select id from insp))::text
                          when est.id is not null then '/estimate/' || est.id
                          else '/properties/' || p.pid
                        end,
      'contact_source', case
                          when nullif(inv.landlord_phone, '') is not null then 'invoice'
                          when nullif(inv.landlord_name, '') is not null  then 'invoice'
                          when nullif(p.landlord, '') is not null         then 'property'
                          when nullif(est.approved_by_name, '') is not null or nullif(est.landlord_email, '') is not null then 'estimate'
                          when (select author_name from ll_name) is not null then 'query'
                          else null
                        end,
      'handover_date',    p.handover_date,
      'handover_done_at', p.handover_done_at)
      from p
      left join inv on true
      left join est on true),

  'journey', (
    select jsonb_build_object(
      'stage_code',        j.stage_code,
      'stage_label',       j.stage_label,
      'blocked_on',        j.blocked_on,
      'since',             j.since,
      'age_days',          j.age_days,
      'next_action_label', j.next_action_label,
      'next_action_route', j.next_action_route,
      'urgency',           j.urgency,
      'threads',           coalesce(j.open_threads, '[]'::jsonb))
      from j),

  'estimate', (
    select jsonb_build_object(
      'id',                   est.id,
      'status',               est.status,
      'share_token',          est.share_token,
      'sent_at',              es.at,
      'first_viewed_at',      est.first_viewed_at,
      'approved_at',          est.approved_at,
      'age_since_sent_days',  case when es.at is null then null
                                   else greatest(0, floor(extract(epoch from (now() - es.at)) / 86400))::int end,
      'age_since_viewed_days', case when est.first_viewed_at is null then null
                                    else greatest(0, floor(extract(epoch from (now() - est.first_viewed_at)) / 86400))::int end,
      'valid_till',           est.valid_till,
      'counts',               (select jsonb_build_object('pending', pending, 'approved', approved,
                                                         'queried', queried, 'total', total)
                                 from item_counts),
      'queried',              (select list from queried),
      'unanswered',           (select count(*) from ll_q where not answered),
      'pending_names',        (select names from pending_names))
      from est
      left join est_sent es on true),

  'work_orders', (select list from wo_list),

  'done', (
    select jsonb_build_object(
      'verified_trades',  d.verified_trades,
      'last_verified_at', d.last_verified_at,
      'all_verified',     d.n > 0 and d.n = d.n_verified)
      from done d)
)
$$;

comment on function public.comms_context(text) is
  'Everything a drafted message needs about one property, live. Landlord-facing (property, estimate, done) and vendor-facing (work_orders[]) sections are kept apart; see src/components/comms/templates.js.';

-- ---------------------------------------------------------------------------
-- Grants. Staff only; anon never calls this (it would hand a landlord phone
-- to whoever holds a share token).
-- ---------------------------------------------------------------------------
revoke all on function public.comms_context(text) from public, anon;
grant execute on function public.comms_context(text) to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY · one property, trimmed. supabase/journey/06_verify_comms.sql does the
-- full pass (three pids, timings, grant check).
-- ---------------------------------------------------------------------------
select c->'property'->>'name'                                as name,
       c->'journey'->>'stage_code'                           as stage,
       c->'estimate'->'counts'                               as estimate_counts,
       jsonb_array_length(c->'work_orders')                  as work_orders,
       c->'done'->'verified_trades'                          as verified_trades
  from public.comms_context('218') c;
