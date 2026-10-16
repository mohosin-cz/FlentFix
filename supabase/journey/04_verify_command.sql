-- Branch D · feat/command-surface — read-only verification, run AFTER
-- supabase/migrations/command_search.sql has been applied.
--
--   supabase db query --linked --project-ref pjetqnlvyuuejcuvkare -f supabase/journey/04_verify_command.sql
--
-- The CLI prints only the last statement's result, so everything is folded
-- into one result set: three sample searches, their row counts, a stage-join
-- check, and wall-clock timing for each call. Nothing here writes.

with t0 as (select clock_timestamp() as at),
s1 as (select 'pid fragment "21"'::text as q, r.* from public.command_search('21', 10) r),
t1 as (select clock_timestamp() as at from (select count(*) from s1) x),
s2 as (select 'vendor "nikhil"'::text as q, r.* from public.command_search('nikhil', 10) r),
t2 as (select clock_timestamp() as at from (select count(*) from s2) x),
s3 as (select 'name "rose"'::text as q, r.* from public.command_search('rose', 10) r),
t3 as (select clock_timestamp() as at from (select count(*) from s3) x),
rows as (
  select q, kind, id, pid, label, sub, route, round(rank::numeric, 2) as rank,
         row_number() over (partition by q order by rank desc, label) as n
    from (select * from s1 union all select * from s2 union all select * from s3) u
),
checks as (
  select 'CHECK · property rows carry a stage in sub'::text as q,
         case when bool_and(sub ~ ' · ') then 'ok' else 'FAIL' end as kind,
         count(*)::text as id, null::text as pid,
         string_agg(distinct split_part(sub, ' · ', 1), ', ') as label,
         null::text as sub, null::text as route, null::numeric as rank, 0::bigint as n
    from rows where kind = 'property'
  union all
  select 'CHECK · anon cannot execute',
         case when has_function_privilege('anon', 'public.command_search(text,int)', 'execute') then 'FAIL' else 'ok' end,
         null, null, null, null, null, null, 0
  union all
  select 'CHECK · authenticated can execute',
         case when has_function_privilege('authenticated', 'public.command_search(text,int)', 'execute') then 'ok' else 'FAIL' end,
         null, null, null, null, null, null, 0
  union all
  select 'CHECK · empty query returns nothing',
         case when (select count(*) from public.command_search('', 10)) = 0 then 'ok' else 'FAIL' end,
         null, null, null, null, null, null, 0
  union all
  select 'CHECK · wildcard is literal ("%" matches nothing)',
         case when (select count(*) from public.command_search('%', 10)) = 0 then 'ok' else 'FAIL' end,
         null, null, null, null, null, null, 0
),
timing as (
  -- clock_timestamp() between CTEs: close enough to see 30ms vs 3s, not a benchmark
  select 'TIMING (approx) · ' || lbl as q, 'ms' as kind, round(extract(epoch from (b - a)) * 1000)::text as id,
         null::text as pid, null::text as label, null::text as sub, null::text as route, null::numeric as rank, 0::bigint as n
    from (
      select '"21"'     as lbl, t0.at as a, t1.at as b from t0, t1
      union all select '"nikhil"' , t1.at, t2.at from t1, t2
      union all select '"rose"'   , t2.at, t3.at from t2, t3
    ) x
)
select q, kind, id, pid, label, sub, route, rank
  from (
    select q, kind, id, pid, label, sub, route, rank, n, 0 as grp from rows
    union all select q, kind, id, pid, label, sub, route, rank, n, 1 from checks
    union all select q, kind, id, pid, label, sub, route, rank, n, 2 from timing
  ) all_rows
 order by grp, q, n;
