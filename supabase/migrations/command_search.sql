-- Branch D · feat/command-surface
--
-- One way into everything. The palette searches a local cache of the user's
-- properties and vendors first (instant, no network) and calls this for the
-- long tail: work orders, estimates, invoices, and anything the cache missed.
--
-- One scan per table, every kind in one result set, ranked. Properties are
-- joined to the journey engine so a hit says what the thing IS right now —
-- "214 · Rose Villa · QC pending, 3 days" — not just its name.
--
-- Ranking: pg_trgm is NOT installed on this project (checked pg_extension on
-- 2026-10-16: pg_stat_statements, pgcrypto, plpgsql, supabase_vault,
-- uuid-ossp), so there is no similarity(). Rank is a fixed ladder instead:
-- exact 1.0 › prefix 0.8 › word-start 0.6 › contains 0.4, with a small
-- per-kind penalty so a property outranks a work order that mentions it.
-- An exact PID match sits above everything. If pg_trgm is ever enabled,
-- swap command_rank() for similarity() and add the gin indexes; nothing
-- else changes.
--
-- Staff only: SECURITY DEFINER, revoked from public and anon. It mounts
-- inside ProtectedRoute, and vendors/landlords never hold an authenticated
-- session, so nobody outside staff can even call it.
--
-- Apply:
--   supabase db query --linked --project-ref pjetqnlvyuuejcuvkare -f supabase/migrations/command_search.sql

begin;

-- ---------------------------------------------------------------------------
-- 1 · Rank ladder. Pure and immutable so the planner can fold it.
-- ---------------------------------------------------------------------------
create or replace function public.command_rank(p_hay text, p_q text)
returns real
language sql
immutable
parallel safe
as $$
  select case
    when p_hay is null or p_q is null or p_q = ''      then 0
    when lower(p_hay) = p_q                            then 1.0
    when lower(p_hay) like p_q || '%'                  then 0.8
    when lower(p_hay) like '% ' || p_q || '%'          then 0.6
    when lower(p_hay) like '%' || p_q || '%'           then 0.4
    else 0 end::real
$$;

-- "3 days" · "since Tuesday" · "yesterday" · "today" — the same words
-- Home2.ago() uses, so a palette row and a Home row never disagree.
create or replace function public.command_age(p_since timestamptz, p_age_days int)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when p_age_days is null      then ''
    when p_age_days = 0          then 'today'
    when p_age_days = 1          then 'yesterday'
    when p_age_days < 7 and p_since is not null
                                 then 'since ' || trim(to_char(p_since, 'Day'))
    when p_age_days < 30         then p_age_days || ' days'
    when p_age_days < 60         then 'over a month'
    else round(p_age_days / 30.0) || ' months' end
$$;

-- ---------------------------------------------------------------------------
-- 2 · Indexes. Prefix matches use these; contains-matches are sequential by
--     design — every table here is well under a thousand rows, and the
--     function is called at most once per 150ms per user.
-- ---------------------------------------------------------------------------
create index if not exists properties_search_pid_idx
  on public.properties (lower(pid) text_pattern_ops) where deleted_at is null;
create index if not exists properties_search_name_idx
  on public.properties (lower(name) text_pattern_ops) where deleted_at is null;
create index if not exists vendors_search_name_idx
  on public.vendors (lower(full_name) text_pattern_ops);
create index if not exists vendors_search_code_idx
  on public.vendors (lower(vendor_code) text_pattern_ops);
create index if not exists landlord_invoices_search_number_idx
  on public.landlord_invoices (lower(invoice_number) text_pattern_ops);
create index if not exists work_orders_search_vendor_idx
  on public.work_orders (lower(vendor_name) text_pattern_ops);

-- ---------------------------------------------------------------------------
-- 3 · The search
-- ---------------------------------------------------------------------------
drop function if exists public.command_search(text, int);
create or replace function public.command_search(p_q text, p_limit int default 20)
returns table (
  kind  text,   -- property · vendor · work_order · estimate · invoice
  id    text,   -- pid for a property, uuid::text otherwise; de-dup key is kind+id
  pid   text,   -- the property this belongs to, when there is one
  label text,   -- the thing's name
  sub   text,   -- what it is right now: stage and age, or status
  route text,   -- where Enter goes
  rank  real
)
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    -- lower, trimmed, and LIKE-safe: a typed % or _ is a character, not a wildcard
    select replace(replace(replace(lower(trim(coalesce(p_q, ''))), '\', '\\'), '%', '\%'), '_', '\_') as q,
           greatest(1, least(coalesce(p_limit, 20), 100)) as lim
  ),
  journey as (
    -- the engine, once, for the whole portfolio (~30ms); only read when a
    -- property matched, since nothing else joins it
    select s.pid, s.stage_label, s.stage_code, s.since, s.age_days, s.urgency, s.next_action_route
      from public.property_journey_state('all') s
  ),
  props as (
    select 'property'::text as kind,
           p.pid            as id,
           p.pid            as pid,
           coalesce(nullif(trim(p.name), ''), nullif(trim(p.address), ''), 'Unnamed property') as label,
           coalesce(j.stage_label, 'No stage') || ' · ' || public.command_age(j.since, j.age_days) as sub,
           '/properties/' || p.pid as route,
           greatest(
             case when lower(p.pid) = q.q then 1.5 else public.command_rank(p.pid, q.q) end,
             public.command_rank(p.name, q.q),
             public.command_rank(p.address, q.q) - 0.05,
             public.command_rank(p.landlord, q.q) - 0.05) as rank
      from q, public.properties p
      left join journey j on j.pid = p.pid
     where q.q <> '' and p.deleted_at is null
       and p.source is distinct from 'payments_backfill'
       and (lower(p.pid)      like '%' || q.q || '%'
         or lower(p.name)     like '%' || q.q || '%'
         or lower(p.address)  like '%' || q.q || '%'
         or lower(p.landlord) like '%' || q.q || '%')
  ),
  vends as (
    select 'vendor'::text as kind,
           v.id::text     as id,
           null::text     as pid,
           coalesce(nullif(trim(v.full_name), ''), v.vendor_code, 'Unnamed vendor') as label,
           concat_ws(' · ', nullif(v.trade, ''), replace(v.status::text, '_', ' '), nullif(v.pod, '')) as sub,
           '/vendors'     as route,
           greatest(
             public.command_rank(v.full_name, q.q),
             public.command_rank(v.vendor_code, q.q),
             public.command_rank(v.trade, q.q) - 0.1,
             public.command_rank(v.phone, q.q) - 0.1) - 0.02 as rank
      from q, public.vendors v
     where q.q <> '' and (lower(v.full_name)   like '%' || q.q || '%'
         or lower(v.vendor_code) like '%' || q.q || '%'
         or lower(v.trade)       like '%' || q.q || '%'
         or v.phone              like '%' || q.q || '%')
  ),
  wos as (
    select 'work_order'::text as kind,
           w.id::text         as id,
           w.pid              as pid,
           concat_ws(' · ', nullif(w.trade, ''), coalesce(nullif(w.vendor_name, ''), 'no vendor')) as label,
           concat_ws(' · ', replace(w.status, '_', ' '),
                     case when w.scheduled_start is not null then to_char(w.scheduled_start, 'DD Mon') end) as sub,
           '/properties/' || w.pid || '/work-orders#wo-' || w.id as route,
           greatest(
             public.command_rank(w.pid, q.q) - 0.1,
             public.command_rank(w.vendor_name, q.q),
             public.command_rank(w.trade, q.q) - 0.1,
             public.command_rank(w.status, q.q) - 0.2) - 0.04 as rank
      from q, public.work_orders w
     where q.q <> '' and w.pid is not null
       and (lower(w.pid)         like '%' || q.q || '%'
         or lower(w.vendor_name) like '%' || q.q || '%'
         or lower(w.trade)       like '%' || q.q || '%'
         or lower(w.status)      like '%' || q.q || '%')
  ),
  ests as (
    select 'estimate'::text as kind,
           e.id::text       as id,
           e.pid            as pid,
           'Estimate' || case when e.total is not null then ' ₹' || to_char(e.total, 'FM9,99,99,999') else '' end as label,
           concat_ws(' · ', replace(coalesce(e.status, 'draft'), '_', ' '),
                     to_char(coalesce(e.sent_at, e.created_at), 'DD Mon')) as sub,
           '/estimate/' || e.id as route,
           greatest(
             public.command_rank(e.pid, q.q) - 0.1,
             public.command_rank(e.apartment_name, q.q),
             public.command_rank(e.address, q.q) - 0.05,
             public.command_rank(e.status, q.q) - 0.2) - 0.06 as rank
      from q, public.estimates e
     where q.q <> '' and e.pid is not null
       and (lower(e.pid)            like '%' || q.q || '%'
         or lower(e.apartment_name) like '%' || q.q || '%'
         or lower(e.address)        like '%' || q.q || '%'
         or lower(e.status)         like '%' || q.q || '%')
  ),
  invs as (
    select 'invoice'::text as kind,
           li.id::text     as id,
           li.pid          as pid,
           coalesce(nullif(li.invoice_number, ''), 'Invoice') as label,
           concat_ws(' · ', replace(coalesce(li.status, 'draft'), '_', ' '),
                     case when li.total is not null then '₹' || to_char(li.total, 'FM9,99,99,999') end,
                     nullif(li.landlord_name, '')) as sub,
           -- the invoice page is keyed by inspection; an invoice without one
           -- (none today) falls back to the property's payments page
           case when li.inspection_id is not null then '/invoice/' || li.inspection_id
                else '/properties/' || li.pid || '/payments' end as route,
           greatest(
             public.command_rank(li.invoice_number, q.q),
             public.command_rank(li.pid, q.q) - 0.1,
             public.command_rank(li.landlord_name, q.q) - 0.05,
             public.command_rank(li.status, q.q) - 0.2) - 0.08 as rank
      from q, public.landlord_invoices li
     where q.q <> '' and (lower(li.invoice_number) like '%' || q.q || '%'
         or lower(li.pid)            like '%' || q.q || '%'
         or lower(li.landlord_name)  like '%' || q.q || '%'
         or lower(li.status)         like '%' || q.q || '%')
  ),
  everything as (
    select * from props
    union all select * from vends
    union all select * from wos
    union all select * from ests
    union all select * from invs
  )
  select e.kind, e.id, e.pid, e.label, e.sub, e.route, e.rank
    from everything e, q
   where q.q <> ''
     and e.rank > 0
   order by e.rank desc,
            case e.kind when 'property' then 0 when 'vendor' then 1 when 'work_order' then 2
                        when 'estimate' then 3 else 4 end,
            e.label
   limit (select lim from q)
$$;

comment on function public.command_search(text, int) is
  'Palette long-tail search across properties, vendors, work orders, estimates and invoices. Staff only.';

-- ---------------------------------------------------------------------------
-- 4 · Grants. Staff only; anon never calls these.
-- ---------------------------------------------------------------------------
revoke all on function public.command_rank(text, text)          from public, anon;
revoke all on function public.command_age(timestamptz, int)     from public, anon;
revoke all on function public.command_search(text, int)         from public, anon;
grant execute on function public.command_rank(text, text)        to authenticated;
grant execute on function public.command_age(timestamptz, int)   to authenticated;
grant execute on function public.command_search(text, int)       to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY · a PID fragment and a vendor name. Both should return rows with the
-- property rows carrying a stage in `sub`.
-- ---------------------------------------------------------------------------
select kind, id, pid, label, sub, route, rank from public.command_search('21', 10);
