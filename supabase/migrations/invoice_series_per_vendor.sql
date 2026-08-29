-- A running invoice series per vendor, held in the system rather than implied.
--
-- The old number was CLE-0005/26-27/08 — code, financial year, month. Two
-- problems with it:
--
--   * It is not a series. It names the month, so a vendor's second invoice in
--     one month collided on the unique index and got a random hex suffix
--     (CLE-0005/26-27/08-a3f9). Nothing recorded that it was their second.
--   * It is 17 characters. GST allows 16.
--
-- These invoices are raised BY each vendor ON Slaash, so each vendor is the
-- supplier and needs their own consecutive series, unique within the financial
-- year. The month leaves the number — it is already on the document as the
-- invoice date and the period — and a running count takes its place:
--
--     CLE-0005/2627/01   first invoice Pintu Konai raises in FY 26-27
--     CLE-0005/2627/02   his second
--     CAR-0001/2627/01   a different vendor, a different series
--
-- 8 + 1 + 4 + 1 + 2 = 16 exactly, on the longest vendor code in use.
--
-- The counter is a table, not a max() over what happens to exist: a number
-- must not be reissued because an invoice was voided or deleted, and two staff
-- generating a month at once must not both be handed 01.

begin;

-- ── 1. the counter ──────────────────────────────────────────────────────────
-- Keyed on the code that prefixes the number, not on vendor_id: the pair
-- (prefix, series no.) is what has to be unique, so keying on anything else
-- would let two vendors sharing a prefix both be issued 01. Vendors with no
-- code share the 'NA' series, which keeps their numbers unique but gives them
-- no series of their own — give them codes.
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

-- ── 2. the series on the invoice itself ─────────────────────────────────────
-- So "which number in the series is this" is a column you can sort and audit
-- on, rather than a substring to be parsed back out of the printed number.
alter table public.vendor_invoices add column if not exists series_no int;
alter table public.vendor_invoices add column if not exists fin_year   text;

-- ── 3. helpers ──────────────────────────────────────────────────────────────
-- '26-27' → '2627'. The hyphen is what pushed the old number past 16.
create or replace function public.fin_year_compact(d date)
returns text language sql immutable as $$
  select replace(public.fin_year_label(d), '-', '')
$$;

-- Claims the next number in a series and returns it. The upsert makes the read
-- and the increment one atomic statement, so concurrent callers queue on the
-- row rather than both seeing the same last_no.
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

-- ── 4. issue new invoices from the series ───────────────────────────────────
-- Same function as before; only the numbering changes. The collision fallback
-- that appended four hex characters is gone — the series cannot collide, and a
-- number that sometimes grew a random tail was never a series in the first
-- place.
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
    select p.*, v.vendor_code, v.trade
      from public.vendor_payouts p
      left join public.vendors v on v.id = p.vendor_id
     where p.period_id = p_period_id
       and not exists (select 1 from public.vendor_invoices i where i.payout_id = p.id)
  loop
    v_gross := coalesce(rec.total_payout, 0) + coalesce(rec.advance_recovered, 0);

    v_code := coalesce(nullif(btrim(rec.vendor_code), ''), 'NA');
    v_seq  := public.invoice_claim_series_no(v_code, v_fy);
    v_no   := v_code || '/' || v_fy || '/' || lpad(v_seq::text, 2, '0');

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
              || to_char(per.period_month, 'Mon YYYY'),
            v_gross, 0);

    n := n + 1;
  end loop;

  return n;
end $$;

-- ── 5. renumber the sixteen already issued ──────────────────────────────────
-- Ordered by invoice date then creation, so the series follows the order the
-- invoices were actually raised.
--
-- The number is also inside the frozen snapshot, and that is the copy the
-- document renders from — updating the column alone would leave every invoice
-- displaying its old number while the table claimed a new one. Both move
-- together or the change is worse than not making it.
--
-- trg_vendor_invoices_freeze guards invoice_no and snapshot precisely to stop
-- this kind of edit. Suspended for these two statements, inside the
-- transaction, so any failure below rolls it back on.
alter table public.vendor_invoices disable trigger trg_vendor_invoices_freeze;

with ordered as (
  select i.id,
         coalesce(nullif(btrim(v.vendor_code), ''), 'NA')      as code,
         public.fin_year_compact(per.period_month)             as fy,
         row_number() over (
           partition by coalesce(nullif(btrim(v.vendor_code), ''), 'NA'),
                        public.fin_year_compact(per.period_month)
           order by i.invoice_date, i.created_at, i.id)        as seq
    from public.vendor_invoices i
    join public.vendor_payroll_periods per on per.id = i.period_id
    left join public.vendors v on v.id = i.vendor_id
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

-- ── 6. set the counters to where the renumbering left off ───────────────────
-- Without this the next invoice of the year would be issued 01 again.
insert into public.vendor_invoice_series (series_code, fin_year, last_no)
select coalesce(nullif(btrim(v.vendor_code), ''), 'NA'),
       i.fin_year,
       max(i.series_no)
  from public.vendor_invoices i
  left join public.vendors v on v.id = i.vendor_id
 where i.fin_year is not null
 group by 1, 2
on conflict (series_code, fin_year)
  do update set last_no = greatest(vendor_invoice_series.last_no, excluded.last_no),
                updated_at = now();

-- ── 7. the limit, enforced ──────────────────────────────────────────────────
-- Added last, because the old numbers would have failed it. A vendor code
-- longer than eight characters would now be refused outright rather than
-- quietly issuing a number no GST return will accept.
alter table public.vendor_invoices drop constraint if exists vendor_invoices_no_len;
alter table public.vendor_invoices add constraint vendor_invoices_no_len
  check (length(invoice_no) <= 16);

commit;

-- ── check ───────────────────────────────────────────────────────────────────
-- Every invoice, its series position, and the counter standing behind it.
select i.invoice_no,
       i.series_no,
       i.fin_year,
       length(i.invoice_no) as len,
       i.snapshot->>'invoice_no' as number_on_the_document,
       s.last_no as series_now_at
  from public.vendor_invoices i
  left join public.vendors v on v.id = i.vendor_id
  left join public.vendor_invoice_series s
         on s.series_code = coalesce(nullif(btrim(v.vendor_code), ''), 'NA')
        and s.fin_year = i.fin_year
 order by i.invoice_no;
