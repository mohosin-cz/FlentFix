-- Setup calendar: Flent-Stage's dates, Pulse's own dates and the vendors on
-- each day, in one read.
--
-- Flent-Stage (another Supabase project, opqvrvuzwzmctkuukggp) is where the
-- setup pipeline is planned: setup runs (new setups and revamps) with a
-- "setup" stage date, and per property the scheduled / key handover,
-- tentative move-in, go-live and planned inspection dates. Pulse cannot reach
-- it live until an admin stores a connection secret, so for now a snapshot is
-- copied in by scripts/stage-sync.py (read-only on Stage) through
-- stage_dates_ingest(), which is CLI-only. Every row keeps when it was synced.
--
--   stage_dates                the snapshot: one row per (property, kind[, run])
--   stage_sync_runs            one row per sync
--   setup_calendar(from, to)   events in the window — Stage + Pulse — with
--                              vendors per day and clashes, staff only
-- Stage PIDs are "PID273"; Pulse's are "273". The map strips the prefix.

begin;

create table if not exists public.stage_dates (
  key        text primary key,            -- '<stage property id>:<kind>[:<run id>]'
  pid        text not null,               -- Pulse form ("273")
  stage_pid  text not null,               -- Stage form ("PID273")
  name       text,
  kind       text not null,               -- setup · revamp · inspection · handover · key_handover · move_in · go_live
  date       date not null,
  state      text,                        -- planned · actual (setups: whether Stage has an actual date)
  detail     jsonb not null default '{}',
  synced_at  timestamptz not null default now()
);
create index if not exists stage_dates_date_idx on public.stage_dates (date);
create index if not exists stage_dates_pid_idx on public.stage_dates (pid);

create table if not exists public.stage_sync_runs (
  id         bigserial primary key,
  ran_at     timestamptz not null default now(),
  rows_in    int not null,
  note       text
);

alter table public.stage_dates enable row level security;
alter table public.stage_sync_runs enable row level security;
revoke all on public.stage_dates, public.stage_sync_runs from public, anon, authenticated;
revoke all on sequence public.stage_sync_runs_id_seq from public, anon, authenticated;

-- Replace the snapshot. CLI only: nothing in the app can write it.
create or replace function public.stage_dates_ingest(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'p_rows must be a JSON array'; end if;
  delete from stage_dates;
  insert into stage_dates (key, pid, stage_pid, name, kind, date, state, detail, synced_at)
  select r->>'key', regexp_replace(btrim(r->>'stage_pid'), '^PID\s*', '', 'i'), btrim(r->>'stage_pid'), nullif(btrim(r->>'name'), ''),
         r->>'kind', (r->>'date')::date, r->>'state', coalesce(r->'detail', '{}'), now()
    from jsonb_array_elements(p_rows) r
   where nullif(r->>'date', '') is not null and nullif(btrim(r->>'stage_pid'), '') is not null
  on conflict (key) do nothing;
  get diagnostics n = row_count;
  insert into stage_sync_runs (rows_in, note) values (n, 'scripts/stage-sync.py');
  return jsonb_build_object('rows', n);
end
$$;
revoke all on function public.stage_dates_ingest(jsonb) from public, anon, authenticated;

create or replace function public.setup_calendar(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare out jsonb;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_to < p_from or p_to - p_from > 92 then raise exception 'Pick a window of up to three months'; end if;

  with pulse_names as (
    select p.pid, coalesce(nullif(btrim(p.name), ''), p.pid) name, lower(coalesce(nullif(btrim(p.assigned_to), ''), p.owner_email)) owner,
           p.setup_date, p.handover_date, p.handover_done_at, p.setup_closed_at
      from properties p where p.deleted_at is null
  ),
  ev as (
    -- from Flent-Stage
    select 'stage' src, s.pid, coalesce(pn.name, s.name, s.stage_pid) name, s.kind, s.date, s.state, s.detail, pn.owner, (pn.pid is not null) in_pulse
      from stage_dates s left join pulse_names pn on pn.pid = s.pid
     where s.date between p_from and p_to
    union all
    -- Pulse's own setup and handover dates
    select 'pulse', pn.pid, pn.name, 'setup', pn.setup_date, case when pn.setup_closed_at is not null then 'actual' else 'planned' end,
           '{}'::jsonb, pn.owner, true
      from pulse_names pn where pn.setup_date between p_from and p_to
    union all
    select 'pulse', pn.pid, pn.name, 'handover', pn.handover_date, case when pn.handover_done_at is not null then 'actual' else 'planned' end,
           '{}'::jsonb, pn.owner, true
      from pulse_names pn where pn.handover_date between p_from and p_to
  ),
  -- vendors per day: a work order occupies its vendor from its start to its
  -- end date (a one-date order occupies that day)
  occ as (
    select d::date as day, w.vendor_id, coalesce(v.full_name, w.vendor_name, 'Vendor') vendor, v.trade, v.phone, w.pid, w.trade wo_trade, w.status
      from work_orders w
      left join vendors v on v.id = w.vendor_id
      cross join lateral generate_series(greatest(coalesce(w.scheduled_start, w.scheduled_end)::date, p_from),
                                         least(coalesce(w.scheduled_end, w.scheduled_start)::date, p_to), interval '1 day') d
     where w.vendor_id is not null and coalesce(w.scheduled_start, w.scheduled_end) is not null
       and w.status not in ('cancelled')
       and coalesce(w.scheduled_end, w.scheduled_start)::date >= p_from and coalesce(w.scheduled_start, w.scheduled_end)::date <= p_to
  ),
  vday as (
    select occ.day, vendor_id, max(vendor) vendor, max(trade) trade, max(phone) phone,
           array_agg(distinct pid) pids, count(distinct pid) n
      from occ group by occ.day, vendor_id
  ),
  -- Stage and Pulse disagree on a property's setup date
  clash as (
    select s.pid, s.date stage_date, pn.setup_date pulse_date
      from stage_dates s join pulse_names pn on pn.pid = s.pid
     where s.kind = 'setup' and pn.setup_date is not null and s.date <> pn.setup_date
       and (s.date between p_from and p_to or pn.setup_date between p_from and p_to)
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'synced_at', (select max(ran_at) from stage_sync_runs),
    'events', coalesce((select jsonb_agg(jsonb_build_object('src', src, 'pid', pid, 'name', name, 'kind', kind, 'date', date,
                                                            'state', state, 'detail', detail, 'owner', owner, 'in_pulse', in_pulse)
                                         order by date, kind, pid) from ev), '[]'),
    'vendors', coalesce((select jsonb_agg(jsonb_build_object('day', vday.day, 'vendor_id', vendor_id, 'vendor', vendor, 'trade', trade,
                                                             'phone', phone, 'pids', pids, 'double', n > 1) order by vday.day, vendor) from vday), '[]'),
    'clashes', coalesce((select jsonb_agg(jsonb_build_object('pid', pid, 'stage_date', stage_date, 'pulse_date', pulse_date)) from clash), '[]')
  ) into out;
  return out;
end
$$;

revoke all on function public.setup_calendar(date, date) from public, anon;
grant execute on function public.setup_calendar(date, date) to authenticated;

commit;
