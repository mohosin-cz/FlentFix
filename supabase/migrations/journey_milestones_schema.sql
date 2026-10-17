-- Journey milestones, part 1 of 2: the columns.
--
-- The steps only a person can confirm (pulse-journey-prompt.md §2), plus the
-- setup date everything after it hangs off. Stored on the property, house
-- style *_at / *_by like deleted_at / deleted_by; *_by is the email of whoever
-- marked it. Part 2 (journey_milestones_logic.sql) adds the rules, the
-- mark / undo functions and the activity-log trigger — DDL and the statements
-- that depend on it are kept in separate files.
--
-- handover_done_at already exists (added with the first journey engine); it
-- gains its _by. handover_date stays for now — the current engine reads it —
-- and is superseded by setup_date when the engine is rebuilt.

alter table public.properties
  add column if not exists setup_date        date,
  add column if not exists setup_date_by     text,
  add column if not exists estimate_final_at timestamptz,
  add column if not exists estimate_final_by text,
  add column if not exists setup_closed_at   timestamptz,
  add column if not exists setup_closed_by   text,
  add column if not exists qc_done_at        timestamptz,
  add column if not exists qc_done_by        text,
  add column if not exists handover_done_at  timestamptz,
  add column if not exists handover_done_by  text,
  add column if not exists wo_shared_at      timestamptz,
  add column if not exists wo_shared_by      text,
  add column if not exists closed_at         timestamptz,
  add column if not exists closed_by         text,
  add column if not exists closure_note      text;
