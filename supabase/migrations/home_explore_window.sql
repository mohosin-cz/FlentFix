-- The Team view's exploratory card, for a chosen window: 1, 3 or 6 months
-- (told 2026-10-19). Same funnel and calls as home_team() — which keeps its
-- 90-day default for the first paint — over the last p_days.

begin;

create or replace function public.home_explore_funnel(p_days int default 90)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not pulse_is_admin() then raise exception 'Only an admin can open the team view'; end if;
  if p_days not between 7 and 400 then raise exception 'Pick a window between a week and a year'; end if;
  return jsonb_build_object(
    'days', p_days,
    'funnel', (
      with sdone as materialized (select distinct pid, exploratory_building_key(name) k from stage_dates where kind in ('setup', 'revamp') and state = 'actual'),
      x as (
        select e.*, (select min(nullif(v->>'date', '')::date) from jsonb_array_elements(e.visits) v) stage_visit,
               (select min(l.visited_at)::date from exploratory_logs l where l.request_id = e.id and l.submitted_at is not null) pulse_visit,
               lk.pid linked, exploratory_building_key(e.property_name) bk
          from stage_exploratory e left join exploratory_links lk on lk.request_id = e.id
         where e.created_at > now() - make_interval(days => p_days) and e.archived_at is null and coalesce(e.property_name, '') !~* '^\s*\[test\]'
      ), y as (
        select x.*, coalesce(least(x.stage_visit, x.pulse_visit), x.stage_visit, x.pulse_visit) visited,
               x.status in ('approved', 'rejected', 'converted') decided, x.status in ('approved', 'converted') approved,
               -- set up: Pulse marked setup closed, or Stage recorded the setup as done
               -- (by the linked PID, or by the building when nothing is linked)
               (exists (select 1 from properties p where p.pid = x.linked and p.setup_closed_at is not null)
                or exists (select 1 from sdone where sdone.pid = x.linked
                            or (x.bk is not null and sdone.k is not null and (sdone.k like x.bk || '%' or x.bk like sdone.k || '%')))) set_up
          from x
      )
      select jsonb_build_object(
        'raised', count(*), 'visited', count(*) filter (where visited is not null), 'decided', count(*) filter (where decided),
        'approved', count(*) filter (where approved), 'set_up', count(*) filter (where set_up),
        'raise_to_visit', percentile_cont(0.5) within group (order by (visited - created_at::date)) filter (where visited is not null and visited >= created_at::date),
        'visit_to_decision', percentile_cont(0.5) within group (order by (stage_updated_at::date - visited)) filter (where decided and visited is not null and stage_updated_at::date >= visited))
        from y),
    'calls', coalesce((
      with v as (   -- every verdict a person gave: Pulse logs, and Stage visits they recorded
        select lower(l.author) who, l.request_id id, case l.verdict when 'go' then 'go' when 'no_go' then 'no_go' end verdict
          from exploratory_logs l where l.submitted_at is not null
        union
        select lower(vv->>'by'), e.id, case when vv->>'outcome' ~* 'accept' then 'go' when vv->>'outcome' ~* 'reject' then 'no_go' end
          from stage_exploratory e cross join jsonb_array_elements(e.visits) vv where vv->>'by' is not null
      ), j as (
        select v.who, v.id, v.verdict, e.status, e.property_name from v join stage_exploratory e on e.id = v.id
         where v.verdict is not null and e.status in ('approved', 'rejected', 'converted') and v.who like '%@flent.in'
           and e.created_at > now() - make_interval(days => p_days)
      )
      select jsonb_agg(jsonb_build_object('email', who, 'n', n, 'match', m, 'misses', misses) order by n desc)
        from (select who, count(*) n,
                     count(*) filter (where (verdict = 'go') = (status in ('approved', 'converted'))) m,
                     jsonb_agg(jsonb_build_object('name', property_name, 'said', verdict, 'supply', status))
                       filter (where (verdict = 'go') <> (status in ('approved', 'converted'))) misses
                from j group by who) z), '[]')
  );
end
$$;

revoke all on function public.home_explore_funnel(int) from public, anon;
grant execute on function public.home_explore_funnel(int) to authenticated;

commit;
