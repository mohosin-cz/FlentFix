-- Why an onboarding application was turned down.
--
-- Optional. Rejecting works without this column — the client writes the note
-- only if the column exists and retries without it if it does not — so the
-- queue can be cleared today and this can be run whenever convenient. Run it
-- and the reason starts being kept; until then only who and when are recorded,
-- in reviewed_by / reviewed_at.
--
-- No policy changes: staff already update this table directly (the POD picker
-- has always done so), and anon is not granted update on it.

alter table public.vendors
  add column if not exists reject_reason text;

comment on column public.vendors.reject_reason is
  'Free-text note for why a submitted application was rejected. Set alongside status=''rejected'', reviewed_by and reviewed_at.';
