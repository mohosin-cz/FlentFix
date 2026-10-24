-- What the landlord was first shown, kept apart from estimates.total.
-- estimates.total moves as lines are rejected (Stage reads it as the approved
-- amount); sent_total is the figure that went out, so screens can say
-- "₹approved of ₹sent" and the rejected share stays visible.

alter table public.estimates add column if not exists sent_total numeric;

-- Every send writes a version row with its snapshot total; the latest send wins.
create or replace function public.estimate_version_sent_total()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update estimates set sent_total = new.total where id = new.estimate_id;
  return new;
end $$;

drop trigger if exists trg_estimate_version_sent_total on public.estimate_versions;
create trigger trg_estimate_version_sent_total
  after insert on public.estimate_versions
  for each row execute function public.estimate_version_sent_total();

-- Backfill: the latest version where one exists …
update estimates e set sent_total = v.total
from (select distinct on (estimate_id) estimate_id, total
      from estimate_versions order by estimate_id, version_number desc) v
where v.estimate_id = e.id and e.sent_total is null;

-- … otherwise (older estimates sent before versions) every live costed line,
-- rejected ones included, since they were on the estimate that went out.
update estimates e set sent_total = s.amt
from (select estimate_id,
             sum((coalesce(material_cost,0) + coalesce(labour_cost,0)) * coalesce(qty,1)) amt
      from estimate_items
      where status not in ('removed','excluded') and cost_type in ('priced','actuals')
      group by estimate_id) s
where s.estimate_id = e.id and e.sent_total is null
  and (e.status <> 'draft' or e.sent_at is not null);

-- Any send path (some skip the version snapshot) stamps the figure that went
-- out at the moment sent_at moves: every live costed line not already dropped.
create or replace function public.estimate_stamp_sent_total()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.sent_at is not null and new.sent_at is distinct from old.sent_at then
    select coalesce(sum((coalesce(material_cost,0) + coalesce(labour_cost,0)) * coalesce(qty,1)), 0)
      into new.sent_total
      from estimate_items
     where estimate_id = new.id
       and status not in ('removed','excluded','rejected')
       and cost_type in ('priced','actuals');
  end if;
  return new;
end $$;

drop trigger if exists trg_estimate_stamp_sent_total on public.estimates;
create trigger trg_estimate_stamp_sent_total
  before update of sent_at on public.estimates
  for each row execute function public.estimate_stamp_sent_total();
