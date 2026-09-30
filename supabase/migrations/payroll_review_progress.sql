-- ════════════════════════════════════════════════════════════════════════════
-- PAYROLL REVIEW PROGRESS — approvals survive leaving the review flow.
--
-- The card review ("Review & finalize") kept which vendors had been approved,
-- and every edit made to them, in React state only. Nothing reached the
-- database until the very last card was approved and the month submitted, so
-- closing the overlay — or a reload, or a phone locking itself — threw away an
-- hour of work and started you at vendor 1 again.
--
-- A review is now recorded per payout line, the moment that line is approved:
-- the edited figures are written, and reviewed_at/reviewed_by stamp who signed
-- off on them. Reopening the flow restores the ticks and drops you on the
-- first line nobody has approved yet.
--
-- reviewed_at means "these stored figures were approved". Anything that
-- changes the figures afterwards — editing the card again, or a cell in the
-- review table — clears it, so the stamp can never describe numbers other than
-- the ones it was given. payroll_fill_month() deletes and re-inserts a month's
-- lines, so Regenerate correctly starts the review over.
-- Repo source of truth; applied via Supabase migration tooling.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.vendor_payouts
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by text;

-- The only question ever asked of these columns is "how far through this month
-- are we", so the index carries the period and skips lines nobody has touched.
create index if not exists vendor_payouts_reviewed_idx
  on public.vendor_payouts (period_id)
  where reviewed_at is not null;
