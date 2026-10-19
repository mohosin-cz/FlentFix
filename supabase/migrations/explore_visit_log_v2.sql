-- The exploratory visit log, second shape (2026-10-19):
--   supply's asks answered one by one (a T5 ask sends them to a Pulse inspection),
--   each trade scored out of 10, site checks (seepage, washing-machine point,
--   meter phase, sump / overhead tank, water, backup…), items not to retain,
--   pros / cons / action items, internal notes, follow-up, and the outcome in
--   Stage's words. No capex.
-- The structured answers live in exploratory_logs.detail; checks and retain
-- are still filled (trades → checks with a derived rating, non-retain items →
-- retain) so every screen that already reads them keeps working.

begin;

alter table public.exploratory_logs add column if not exists detail jsonb;

create or replace function public.exploratory_log_save(p_id uuid, p_log jsonb, p_submit boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare me text := lower(coalesce(auth.jwt() ->> 'email', '')); lid uuid; e stage_exploratory%rowtype; v text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into e from stage_exploratory where id = p_id;
  if not found then raise exception 'No such request'; end if;
  v := nullif(p_log->>'verdict', '');
  -- Stage's words: Accept / Reject / Under review (stored as go / no_go / unsure)
  if p_submit and v is null then raise exception 'Pick the outcome: Accept, Reject or Under review'; end if;
  select id into lid from exploratory_logs where request_id = p_id and author = me and submitted_at is null;
  if lid is null then
    insert into exploratory_logs (request_id, author) values (p_id, me) returning id into lid;
  end if;
  update exploratory_logs set
    visited_at    = coalesce(nullif(p_log->>'visited_at', '')::timestamptz, visited_at, now()),
    verdict       = v,
    checks        = coalesce(p_log->'checks', checks),
    capex_band    = nullif(p_log->>'capex_band', ''),
    landlord_note = nullif(btrim(p_log->>'landlord_note'), ''),
    retain        = coalesce(p_log->'retain', retain),
    notes         = nullif(btrim(p_log->>'notes'), ''),
    detail        = coalesce(p_log->'detail', detail),
    submitted_at  = case when p_submit then now() else submitted_at end,
    updated_at    = now()
   where id = lid;
  if p_submit then
    insert into notifications (user_email, kind, pid, title, body, route, dedupe_key)
    select ad, 'exploratory_logged', null,
           split_part(me, '@', 1) || ' logged ' || coalesce(e.property_name, 'a visit') || ' — ' ||
             case v when 'go' then 'Accept' when 'no_go' then 'Reject' else 'Under review' end,
           coalesce(nullif(btrim(p_log->>'summary'), ''), 'findings in Pulse · to be pasted into Stage'),
           '/explore/' || p_id, 'exploratory_logged:' || lid
      from unnest(pulse_admins()) ad where ad <> me;
  end if;
  return jsonb_build_object('id', lid, 'submitted', p_submit);
end
$$;

commit;
