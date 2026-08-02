-- ════════════════════════════════════════════════════════════════════════════
-- PAYROLL CORE — fixed-monthly model, monthly runs, per-trade rate + override.
-- net = (monthly_rate − absence_deduction + ot + bonus) − deduction − advance
--        − pf − esi − tds. Runs are drafts you review & edit, then finalize.
-- Applied via Supabase migration tooling; repo source of truth.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.payroll_settings (
  id            int primary key default 1,
  ot_multiplier numeric not null default 2,
  standard_days int    not null default 30,
  hours_per_day numeric not null default 8,
  pf_percent    numeric not null default 0,
  esi_percent   numeric not null default 0,
  tds_percent   numeric not null default 0,
  currency      text    not null default '₹',
  constraint payroll_settings_one_row check (id = 1)
);
insert into public.payroll_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.payroll_trade_rate (
  trade        text primary key,
  monthly_rate numeric not null default 0
);

alter table public.vendors add column if not exists monthly_rate numeric;

create table if not exists public.payroll_run (
  id           uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end   date not null,
  label        text,
  status       text not null default 'draft' check (status in ('draft','finalized')),
  created_by   text,
  created_at   timestamptz not null default now(),
  finalized_at timestamptz
);
create index if not exists payroll_run_period_idx on public.payroll_run(period_start desc);

create table if not exists public.payroll_item (
  id                uuid primary key default gen_random_uuid(),
  run_id            uuid not null references public.payroll_run(id) on delete cascade,
  vendor_id         uuid not null references public.vendors(id) on delete cascade,
  monthly_rate      numeric not null default 0,
  standard_days     int    not null default 30,
  present_days      int    not null default 0,
  absent_days       int    not null default 0,
  absence_deduction numeric not null default 0,
  ot_hours          numeric not null default 0,
  ot_amount         numeric not null default 0,
  bonus             numeric not null default 0,
  deduction         numeric not null default 0,
  advance_recovered numeric not null default 0,
  pf                numeric not null default 0,
  esi               numeric not null default 0,
  tds               numeric not null default 0,
  gross             numeric not null default 0,
  net               numeric not null default 0,
  payment_status    text not null default 'pending' check (payment_status in ('pending','paid')),
  payment_method    text,
  payment_ref       text,
  paid_at           timestamptz,
  notes             text,
  unique (run_id, vendor_id)
);
create index if not exists payroll_item_run_idx    on public.payroll_item(run_id);
create index if not exists payroll_item_vendor_idx on public.payroll_item(vendor_id);

create or replace function public.payroll_item_compute()
returns trigger language plpgsql as $$
begin
  new.gross := coalesce(new.monthly_rate,0) - coalesce(new.absence_deduction,0)
             + coalesce(new.ot_amount,0) + coalesce(new.bonus,0);
  new.net   := new.gross - coalesce(new.deduction,0) - coalesce(new.advance_recovered,0)
             - coalesce(new.pf,0) - coalesce(new.esi,0) - coalesce(new.tds,0);
  return new;
end $$;
drop trigger if exists trg_payroll_item_compute on public.payroll_item;
create trigger trg_payroll_item_compute before insert or update on public.payroll_item
  for each row execute function public.payroll_item_compute();

create table if not exists public.payroll_advance (
  id         uuid primary key default gen_random_uuid(),
  vendor_id  uuid not null references public.vendors(id) on delete cascade,
  amount     numeric not null,
  given_at   date not null default current_date,
  note       text,
  run_id     uuid references public.payroll_run(id) on delete set null,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists payroll_advance_vendor_idx on public.payroll_advance(vendor_id) where run_id is null;

-- RLS: staff (authenticated) manage everything
do $$
declare t text;
begin
  foreach t in array array['payroll_settings','payroll_trade_rate','payroll_run','payroll_item','payroll_advance'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "staff read %1$s" on public.%1$s', t);
    execute format('create policy "staff read %1$s" on public.%1$s for select to authenticated using (true)', t);
    execute format('drop policy if exists "staff write %1$s" on public.%1$s', t);
    execute format('create policy "staff write %1$s" on public.%1$s for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ── generate a draft run: one computed item per approved vendor ─────────────
create or replace function public.payroll_generate(p_start date, p_end date, p_label text)
returns uuid
language plpgsql security invoker set search_path = public
as $$
declare
  s public.payroll_settings; v_run uuid;
  actor text := coalesce(current_setting('request.jwt.claims', true)::json->>'email', 'staff');
  rec record;
  v_rate numeric; v_present int; v_ot numeric; v_absent int; v_absded numeric;
  v_otrate numeric; v_otamt numeric; v_adv numeric;
begin
  select * into s from public.payroll_settings where id = 1;
  insert into public.payroll_run(period_start, period_end, label, created_by)
  values (p_start, p_end, p_label, actor) returning id into v_run;

  for rec in select * from public.vendors where status = 'approved' loop
    v_rate := coalesce(rec.monthly_rate,
                       (select monthly_rate from public.payroll_trade_rate where trade = rec.trade), 0);

    select count(distinct (punched_at at time zone 'Asia/Kolkata')::date) into v_present
      from public.vendor_attendance
     where vendor_id = rec.id
       and (punched_at at time zone 'Asia/Kolkata')::date between p_start and p_end;

    select coalesce(sum(extract(epoch from (nxt - punched_at)) / 3600.0), 0) into v_ot
      from (
        select punched_at, punch_type,
               lead(punched_at) over w as nxt, lead(punch_type) over w as ntype
          from public.vendor_attendance
         where vendor_id = rec.id and kind = 'overtime'
           and (punched_at at time zone 'Asia/Kolkata')::date between p_start and p_end
         window w as (order by punched_at)
      ) t where punch_type = 'in' and ntype = 'out';

    v_absent := greatest(0, s.standard_days - v_present);
    v_absded := round(case when s.standard_days > 0 then v_rate / s.standard_days * v_absent else 0 end, 2);
    v_otrate := case when s.standard_days > 0 and s.hours_per_day > 0
                     then v_rate / (s.standard_days * s.hours_per_day) else 0 end;
    v_otamt  := round(v_ot * v_otrate * s.ot_multiplier, 2);

    select coalesce(sum(amount), 0) into v_adv
      from public.payroll_advance
     where vendor_id = rec.id and run_id is null and given_at <= p_end;

    insert into public.payroll_item(
      run_id, vendor_id, monthly_rate, standard_days, present_days, absent_days,
      absence_deduction, ot_hours, ot_amount, advance_recovered, pf, esi, tds
    ) values (
      v_run, rec.id, v_rate, s.standard_days, v_present, v_absent,
      v_absded, round(v_ot, 2), v_otamt, v_adv,
      round(v_rate * s.pf_percent / 100, 2),
      round(v_rate * s.esi_percent / 100, 2),
      round(v_rate * s.tds_percent / 100, 2)
    );

    if v_adv > 0 then
      update public.payroll_advance set run_id = v_run
       where vendor_id = rec.id and run_id is null and given_at <= p_end;
    end if;
  end loop;
  return v_run;
end $$;

create or replace function public.payroll_finalize(p_run_id uuid)
returns void language plpgsql security invoker set search_path = public
as $$
begin
  update public.payroll_run set status = 'finalized', finalized_at = now()
   where id = p_run_id and status = 'draft';
end $$;

grant execute on function public.payroll_generate(date, date, text) to authenticated;
grant execute on function public.payroll_finalize(uuid) to authenticated;
