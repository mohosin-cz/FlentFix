-- Property Utilities & Access
-- Run once in Supabase SQL editor (Dashboard → SQL Editor → New Query).
--
-- Adds two tables, both keyed by the text `pid`:
--   property_utilities — one row per subscription/rental service (WiFi, RO, DTH…)
--   property_access    — one row per property, holds the lockbox code + access notes
-- Internal-only data (edited behind ProtectedRoute), so RLS grants full access to
-- the `authenticated` role and nothing to anon.

-- ── property_utilities ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS property_utilities (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pid            text        NOT NULL,
  utility_type   text        NOT NULL,              -- key: wifi | water_purifier | dth | gas | electricity | maintenance | other
  custom_type    text,                              -- free-text name when utility_type = 'other'
  provider       text,                              -- company / vendor, e.g. ACT, Kent
  plan_type      text,                              -- plan / tariff description, e.g. "100 Mbps unlimited"
  account_number text,                              -- account / customer / consumer number
  start_date     date,
  billing_amount numeric,
  billing_cycle  text,                              -- Monthly | Quarterly | Half-yearly | Yearly | One-time
  status         text        NOT NULL DEFAULT 'active',  -- active | paused | cancelled
  notes          text,
  created_by     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_property_utilities_pid ON property_utilities (pid);

ALTER TABLE property_utilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated full access" ON property_utilities;
CREATE POLICY "authenticated full access" ON property_utilities
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── property_access ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS property_access (
  pid          text        PRIMARY KEY,
  lockbox_code text,
  access_notes text,
  updated_by   text,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE property_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated full access" ON property_access;
CREATE POLICY "authenticated full access" ON property_access
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
