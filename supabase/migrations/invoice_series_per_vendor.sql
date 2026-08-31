-- A running invoice series per vendor, numbered the way the vendor would.
--
-- These invoices are raised BY each vendor ON Slaash, so the number on one is
-- the vendor's own reference, not ours. Numbering them CLE-0005/… printed our
-- internal filing code on a document somebody else is supposed to have issued.
-- Initials read like a person's own numbering: NK/2627/01, SKR/2627/03.
--
-- The old number was CLE-0005/26-27/08 — code, financial year, month. Two
-- problems beyond whose code it was:
--
--   * It is not a series. It names the month, so a vendor's second invoice in
--     one month collided on the unique index and got a random hex suffix.
--   * It is 17 characters. GST allows 16.
--
-- The month leaves the number — it is already on the document as the invoice
-- date and the period — and a running count takes its place, unique within the
-- financial year, which is what a series has to be.
--
-- Initials collide, so the prefix is ASSIGNED ONCE and stored on the vendor
-- rather than derived from the name every time. Two things depend on that:
-- a vendor keeps the same prefix for life, so their series continues across
-- months; and the day a second person with the same initials is onboarded,
-- they get NK2 and nobody's existing numbers move. Deriving it live would
-- silently renumber an existing vendor the moment a namesake appeared.

begin;

-- ── 1. the vendor's own prefix ──────────────────────────────────────────────
alter table public.vendors add column if not exists invoice_prefix text;
create unique index if not exists vendors_invoice_prefix_key
  on public.vendors (invoice_prefix) where invoice_prefix is not null;

-- First letter of up to three words, letters only. "Suroj Kanti Roy" → SKR.
create or replace function public.vendor_initials(p_name text)
returns text language sql immutable as $$
  select coalesce(nullif(
    upper(substring(regexp_replace(
      (select string_agg(left(w, 1), '')
         from unnest(regexp_split_to_array(btrim(coalesce(p_name, '')), '\s+')) w),
      '[^A-Za-z]', '', 'g') from 1 for 3)), ''), 'XX')
$$;

-- Returns the vendor's prefix, assigning one the first time it is asked for.
-- The uniqueness loop is why this writes: the answer has to be remembered or it
-- is not stable.
create or replace function public.vendor_invoice_prefix(p_vendor_id uuid)
returns text
language plpgsql security definer set search_path = public, extensions
as $$
declare v record; base text; cand text; i int := 1;
begin
  if p_vendor_id is null then return 'NA'; end if;
  select id, full_name, invoice_prefix into v from public.vendors where id = p_vendor_id;
  if v.id is null then return 'NA'; end if;
  if coalesce(btrim(v.invoice_prefix), '') <> '' then return v.invoice_prefix; end if;

  base := public.vendor_initials(v.full_name);
  cand := base;
  while exists (select 1 from public.vendors where invoice_prefix = cand) loop
    i := i + 1;
    cand := base || i::text;
  end loop;
  update public.vendors set invoice_prefix = cand where id = p_vendor_id;
  return cand;
end $$;

-- Assign to everyone now, in name order, so the result is reproducible rather
-- than depending on who happened to be invoiced first.
do $$
declare r record;
begin
  for r in select id from public.vendors
            where coalesce(btrim(invoice_prefix), '') = ''
            order by full_name, id
  loop
    perform public.vendor_invoice_prefix(r.id);
  end loop;
end $$;

-- ── 2. the counter ──────────────────────────────────────────────────────────
-- Keyed on the prefix that appears in the number, so (prefix, number) is unique
-- by construction. A table, not max() over what exists: a voided invoice must
-- not have its number reissued, and two staff generating a month at once must
-- not both be handed 01.
create table if not exists public.vendor_invoice_series (
  series_code text not null,
  fin_year    text not null,
  last_no     int  not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (series_code, fin_year)
);

alter table public.vendor_invoice_series enable row level security;
revoke all on public.vendor_invoice_series from public;
revoke all on public.vendor_invoice_series from anon;
grant select, insert, update, delete on public.vendor_invoice_series to authenticated;
drop policy if exists "staff manage vendor_invoice_series" on public.vendor_invoice_series;
create policy "staff manage vendor_invoice_series" on public.vendor_invoice_series
  for all to authenticated using (true) with check (true);

alter table public.vendor_invoices add column if not exists series_no int;
alter table public.vendor_invoices add column if not exists fin_year  text;

-- '26-27' → '2627'. The hyphen is part of what pushed the old number past 16.
create or replace function public.fin_year_compact(d date)
returns text language sql immutable as $$
  select replace(public.fin_year_label(d), '-', '')
$$;

-- Claims the next number and returns it. The upsert makes the read and the
-- increment one statement, so concurrent callers queue on the row instead of
-- both seeing the same last_no.
create or replace function public.invoice_claim_series_no(p_code text, p_fy text)
returns int
language plpgsql security definer set search_path = public, extensions
as $$
declare n int;
begin
  insert into public.vendor_invoice_series as s (series_code, fin_year, last_no)
       values (p_code, p_fy, 1)
  on conflict (series_code, fin_year)
    do update set last_no = s.last_no + 1, updated_at = now()
  returning s.last_no into n;
  return n;
end $$;

-- ── 3. issue new invoices from the series ───────────────────────────────────
create or replace function public.invoice_generate_for_period(p_period_id uuid)
returns int
language plpgsql security invoker set search_path = public, extensions
as $$
declare
  actor text := coalesce(current_setting('request.jwt.claims', true)::json->>'email', 'staff');
  per public.vendor_payroll_periods;
  rec record;
  v_gross numeric; v_no text; v_id uuid; n int := 0;
  v_code text; v_fy text; v_seq int;
begin
  select * into per from public.vendor_payroll_periods where id = p_period_id;
  if per.id is null then raise exception 'Period not found'; end if;
  v_fy := public.fin_year_compact(per.period_month);

  for rec in
    select p.*, v.trade
      from public.vendor_payouts p
      left join public.vendors v on v.id = p.vendor_id
     where p.period_id = p_period_id
       and not exists (select 1 from public.vendor_invoices i where i.payout_id = p.id)
  loop
    v_gross := coalesce(rec.total_payout, 0) + coalesce(rec.advance_recovered, 0);
    -- assigns a prefix if this vendor has never been invoiced before
    v_code  := public.vendor_invoice_prefix(rec.vendor_id);
    v_seq   := public.invoice_claim_series_no(v_code, v_fy);
    v_no    := v_code || '/' || v_fy || '/' || lpad(v_seq::text, 2, '0');

    insert into public.vendor_invoices(
      payout_id, period_id, vendor_id, invoice_no, series_no, fin_year,
      invoice_date, token, subtotal, advance_recovered, net_payable, created_by
    ) values (
      rec.id, p_period_id, rec.vendor_id, v_no, v_seq, v_fy,
      (per.period_month + (coalesce(per.days_in_month, 30) - 1))::date,
      encode(extensions.gen_random_bytes(18), 'hex'),
      v_gross, coalesce(rec.advance_recovered, 0), coalesce(rec.total_payout, 0), actor
    ) returning id into v_id;

    insert into public.vendor_invoice_lines(invoice_id, pid, description, amount, sort)
    values (v_id, null,
            coalesce(nullif(btrim(rec.trade), ''), 'Services') || ' — '
              || to_char(per.period_month, 'Mon YYYY'), v_gross, 0);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ── 4. renumber what has already been issued ────────────────────────────────
-- The number is also inside the frozen snapshot, and that is the copy the
-- document renders from: updating the column alone leaves every invoice
-- displaying its old number while the table claims a new one.
alter table public.vendor_invoices disable trigger trg_vendor_invoices_freeze;

with ordered as (
  select i.id,
         public.vendor_invoice_prefix(i.vendor_id)  as code,
         public.fin_year_compact(per.period_month)  as fy,
         row_number() over (
           partition by public.vendor_invoice_prefix(i.vendor_id),
                        public.fin_year_compact(per.period_month)
           order by i.invoice_date, i.created_at, i.id) as seq
    from public.vendor_invoices i
    join public.vendor_payroll_periods per on per.id = i.period_id
)
update public.vendor_invoices i
   set invoice_no = o.code || '/' || o.fy || '/' || lpad(o.seq::text, 2, '0'),
       series_no  = o.seq,
       fin_year   = o.fy,
       snapshot   = case when i.snapshot is null then null
                    else jsonb_set(i.snapshot, '{invoice_no}',
                           to_jsonb(o.code || '/' || o.fy || '/' || lpad(o.seq::text, 2, '0')))
                    end
  from ordered o
 where o.id = i.id;

alter table public.vendor_invoices enable trigger trg_vendor_invoices_freeze;

-- ── 5. set the counters to where the renumbering left off ───────────────────
insert into public.vendor_invoice_series (series_code, fin_year, last_no)
select public.vendor_invoice_prefix(i.vendor_id), i.fin_year, max(i.series_no)
  from public.vendor_invoices i
 where i.fin_year is not null
 group by 1, 2
on conflict (series_code, fin_year)
  do update set last_no = greatest(vendor_invoice_series.last_no, excluded.last_no),
                updated_at = now();

-- Counters keyed on anything that is not a vendor's prefix are left over from
-- an earlier numbering — this migration is safe to run over the vendor_code
-- version of itself, and those rows would otherwise sit there for ever
-- counting a series nothing issues.
delete from public.vendor_invoice_series s
 where not exists (select 1 from public.vendors v where v.invoice_prefix = s.series_code)
   and s.series_code <> 'NA';

-- ── 6. the GST limit, enforced ──────────────────────────────────────────────
alter table public.vendor_invoices drop constraint if exists vendor_invoices_no_len;
alter table public.vendor_invoices add constraint vendor_invoices_no_len
  check (length(invoice_no) <= 16);

commit;

select v.full_name, v.invoice_prefix, i.invoice_no, length(i.invoice_no) as len,
       i.series_no, i.status,
       i.snapshot->>'invoice_no' as number_on_the_document,
       s.last_no as series_now_at
  from public.vendor_invoices i
  left join public.vendors v on v.id = i.vendor_id
  left join public.vendor_invoice_series s
         on s.series_code = v.invoice_prefix and s.fin_year = i.fin_year
 order by i.invoice_no;
