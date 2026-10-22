-- Stage → Pulse sync every 30 minutes, 9 am – 10 pm IST, on Supabase's clock.
--
-- The sync is the GitHub Actions workflow (stage-sync.yml). Its own cron is
-- best-effort and in practice fired 3–4 times a day, hours late; a dispatch
-- starts within seconds. So pg_cron calls the stage-sync-now edge function,
-- which dispatches the workflow (and skips if a run is already going).
--
-- Two Vault secrets, set once outside this file (never commit them):
--   stage_sync_cron_secret — same value as the edge function secret STAGE_SYNC_CRON_SECRET
--   stage_sync_anon_key    — the project's anon key (verify_jwt needs a valid JWT)

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.stage_sync_kick()
returns bigint
language sql
security definer
set search_path = public
as $$
  select net.http_post(
    url := 'https://pjetqnlvyuuejcuvkare.supabase.co/functions/v1/stage-sync-now',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'stage_sync_anon_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'stage_sync_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000)
$$;
revoke all on function public.stage_sync_kick() from public, anon, authenticated;

-- UTC: 03:30–16:30 is 9:00–22:00 IST (the 03:00 run is 8:30 IST — skipped)
select cron.unschedule('stage-sync') where exists (select 1 from cron.job where jobname = 'stage-sync');
select cron.schedule('stage-sync', '0,30 4-16 * * *', 'select public.stage_sync_kick()');
select cron.schedule('stage-sync-0330', '30 3 * * *', 'select public.stage_sync_kick()')
 where not exists (select 1 from cron.job where jobname = 'stage-sync-0330');
