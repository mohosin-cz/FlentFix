-- Per-vendor portal access, for the vendor analytics dashboard.
--
-- attend_session has RLS on and no policies at all, so staff can read nothing
-- from it — which is right, because the rows are bearer tokens: anything able
-- to read that table could sign in as any vendor. But whether a vendor still
-- has a live session is exactly what says "this person is locked out and does
-- not know their password", and that was invisible to every screen. Six people
-- were in that state before anyone looked.
--
-- So this returns liveness and nothing else. There is no token column, by
-- construction rather than by every caller remembering not to select it.
create or replace function public.vendor_portal_login_health()
returns table (
  vendor_id      uuid,
  last_login_at  timestamptz,
  live_sessions  int,
  session_until  timestamptz
)
language sql
security definer
set search_path = public
as $$
  select v.id,
         v.portal_last_login_at,
         (select count(*)::int from public.attend_session s
           where s.vendor_id = v.id and s.expires_at > now()),
         (select max(s.expires_at) from public.attend_session s
           where s.vendor_id = v.id and s.expires_at > now())
    from public.vendors v
$$;

revoke all on function public.vendor_portal_login_health() from public, anon;
grant execute on function public.vendor_portal_login_health() to authenticated;
