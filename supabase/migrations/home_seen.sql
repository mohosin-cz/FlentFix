-- Branch C · feat/home-copilot
--
-- One tiny table so Home can say what moved since this person last looked.
-- RECENTLY MOVED is the "landlord approved overnight" moment — the most
-- valuable thing on the screen — and it needs a baseline per user.
--
-- A visit is a visit, not a page load: reloading Home twice in a minute must
-- not wipe the list. prev_seen_at only rolls forward when the last touch is
-- more than 30 minutes old, so the baseline is "the last time you were away".

begin;

create table if not exists public.home_seen (
  user_email   text primary key,
  last_seen_at timestamptz not null default now(),
  prev_seen_at timestamptz
);

alter table public.home_seen enable row level security;
revoke all on public.home_seen from public;
revoke all on public.home_seen from anon;
grant select on public.home_seen to authenticated;
drop policy if exists "own row" on public.home_seen;
create policy "own row" on public.home_seen
  for select to authenticated
  using (user_email = lower(coalesce(auth.jwt() ->> 'email', '')));

-- Writes only through here, so the 30-minute rule cannot be bypassed.
create or replace function public.home_touch()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me   text := nullif(lower(coalesce(auth.jwt() ->> 'email', '')), '');
  v_prev timestamptz;
  v_last timestamptz;
begin
  if v_me is null then return null; end if;
  insert into home_seen (user_email, last_seen_at, prev_seen_at)
  values (v_me, now(), null)
  on conflict (user_email) do update
    set prev_seen_at = case when home_seen.last_seen_at < now() - interval '30 minutes'
                            then home_seen.last_seen_at else home_seen.prev_seen_at end,
        last_seen_at = now()
  returning prev_seen_at, last_seen_at into v_prev, v_last;
  return jsonb_build_object('prev_seen_at', v_prev, 'last_seen_at', v_last);
end
$$;

revoke all on function public.home_touch() from public, anon;
grant execute on function public.home_touch() to authenticated;

commit;
