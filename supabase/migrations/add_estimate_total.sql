-- Add stored total to estimates table.
-- Run once in Supabase SQL editor (Dashboard → SQL Editor → New Query).
-- After running, call backfillEstimateTotals() from the browser console or a one-time script.

ALTER TABLE estimates ADD COLUMN IF NOT EXISTS total numeric;
