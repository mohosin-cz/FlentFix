-- A payment can be marked as having no bill — cash to a labourer, a small
-- local purchase — so it reads "No bill" rather than "missing a bill".
-- Attaching a bill later clears it.
alter table public.property_payments add column if not exists no_bill boolean not null default false;
