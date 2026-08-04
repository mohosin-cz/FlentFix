-- Recharge log for property utilities. Each time a utility is recharged/renewed,
-- record it here; the latest recharge date drives the "next recharge due" calc
-- (base = last_recharged_on || start_date, + one billing cycle). Repo source of truth.
alter table public.property_utilities add column if not exists last_recharged_on date;

create table if not exists public.property_utility_recharges (
  id          uuid        primary key default gen_random_uuid(),
  utility_id  uuid        not null references public.property_utilities(id) on delete cascade,
  recharged_on date       not null default current_date,
  amount      numeric,
  note        text,
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_put_recharges_utility on public.property_utility_recharges(utility_id, recharged_on desc);

alter table public.property_utility_recharges enable row level security;
drop policy if exists "authenticated full access" on public.property_utility_recharges;
create policy "authenticated full access" on public.property_utility_recharges
  for all to authenticated using (true) with check (true);
