-- Utilities and setup-closure checks, part 1 of 2: the columns.
--
-- Utilities appear twice in the journey (as setup ops runs it):
--   · PLANNING, after the estimate is final: a request goes to the WiFi
--     partner and to the RO partner — property, address, plan length. That
--     request leaves no trace in Pulse, so it is a tick: who sent it, when,
--     and which plan (1, 3, 6, 9 or 12 months; 0 = not needed here).
--   · SETUP CLOSURE: the utility details are registered on the Utilities page
--     (derived — WiFi: account, network name, password; RO: provider, start
--     date), and someone confirms every payment for the property is logged
--     (a tick). Setup cannot be closed until both are true.
-- Part 2 is journey_milestones_logic.sql (re-applied) and journey_engine_v2.sql.

alter table public.properties
  add column if not exists wifi_requested_at  timestamptz,
  add column if not exists wifi_requested_by  text,
  add column if not exists wifi_plan_months   int,
  add column if not exists ro_requested_at    timestamptz,
  add column if not exists ro_requested_by    text,
  add column if not exists ro_plan_months     int,
  add column if not exists payments_logged_at timestamptz,
  add column if not exists payments_logged_by text;
