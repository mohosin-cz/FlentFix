#!/usr/bin/env python3
"""Flent-Stage → Pulse: copy the setup-calendar dates and the exploratory pipeline.

Reads (only reads) the Flent-Stage project and loads a fresh snapshot into
Pulse's stage_dates table through stage_dates_ingest():

  setups and revamps   the "setup" stage of each setup run (actual date if
                       Stage has one, else the planned date)
  inspections          properties.inspection_date_actual / _planned
  handovers            properties.actual_handover_date / scheduled_handover_date
  key handover, move-in, go-live
  exploratory          every exploratory request with its visits (findings,
                       outcome, capex) → stage_exploratory_ingest(), which also
                       alerts the admins about new unassigned requests

    python3 scripts/stage-sync.py            # write the SQL and load it into Pulse
    python3 scripts/stage-sync.py --dry-run  # write the SQL only

Needs the Supabase CLI logged in with access to both projects. Run it when
you want the calendar fresh (it takes a few seconds); it replaces the whole
snapshot each time.
"""
import json
import os
import subprocess
import sys
import tempfile

STAGE = 'opqvrvuzwzmctkuukggp'   # Flent-Stage
PULSE = 'pjetqnlvyuuejcuvkare'   # FlentFix Database

QUERY = r"""
with p as (select * from properties where pid is not null and btrim(pid) <> ''),
setups as (
  select r.id::text || ':setup' as key, p.pid as stage_pid, p.name,
         case when r.type::text = 'revamp' then 'revamp' else 'setup' end as kind,
         coalesce(s.actual_date, s.planned_date) as date,
         case when s.actual_date is not null then 'actual' else 'planned' end as state,
         jsonb_build_object('run_status', r.status, 'stage_status', s.status, 'type', r.type, 'run', r.sequence) as detail
    from setup_runs r join p on p.id = r.property_id
    join pipeline_stages s on s.setup_run_id = r.id and s.stage::text = 'setup'
   where r.status::text <> 'cancelled' and coalesce(s.actual_date, s.planned_date) is not null
),
dates as (
  select p.id::text || ':inspection', p.pid, p.name, 'inspection', coalesce(p.inspection_date_actual, p.inspection_date_planned),
         case when p.inspection_date_actual is not null then 'actual' else 'planned' end, '{}'::jsonb from p
   where coalesce(p.inspection_date_actual, p.inspection_date_planned) is not null
  union all
  select p.id::text || ':handover', p.pid, p.name, 'handover', coalesce(p.actual_handover_date, p.scheduled_handover_date),
         case when p.actual_handover_date is not null then 'actual' else 'planned' end, '{}'::jsonb from p
   where coalesce(p.actual_handover_date, p.scheduled_handover_date) is not null
  union all
  select p.id::text || ':key_handover', p.pid, p.name, 'key_handover', p.key_handover_date, 'actual',
         jsonb_build_object('remarks', p.key_handover_remarks) from p where p.key_handover_date is not null
  union all
  select p.id::text || ':move_in', p.pid, p.name, 'move_in', p.tentative_move_in_date, 'planned', '{}'::jsonb from p
   where p.tentative_move_in_date is not null
  union all
  select p.id::text || ':go_live', p.pid, p.name, 'go_live', p.go_live_date, 'actual', '{}'::jsonb from p
   where p.go_live_date is not null
)
select coalesce(jsonb_agg(x), '[]'::jsonb)::text as rows from (
  select key, stage_pid, name, kind, date, state, detail from setups
  union all select * from dates
) x
"""


EXPLORATORY = r"""
select coalesce(jsonb_agg(jsonb_build_object(
  'id', r.id, 'property_name', r.property_name, 'address', r.address, 'maps_link', r.maps_link,
  'property_type', r.property_type, 'configuration', r.configuration, 'furnishing_status', r.furnishing_status,
  'owner_name', r.owner_name, 'owner_phone', r.owner_phone, 'owner_email', r.owner_email,
  'status', r.status, 'notes', r.notes,
  'visit_date', r.inspection_scheduled_date, 'visit_time', r.inspection_scheduled_time, 'visit_time_end', r.inspection_scheduled_time_end,
  'last_reschedule_reason', r.last_reschedule_reason, 'ppid_no', r.ppid_no, 'requester_name', r.requester_name, 'raised_by', r.raised_by,
  'inspector_email', (select u.email from users u where u.id = r.assigned_inspector_id),
  'created_at', r.created_at, 'archived_at', r.archived_at, 'updated_at', r.updated_at,
  'visits', coalesce((select jsonb_agg(jsonb_build_object(
      'date', v.visit_date, 'time', v.visit_time, 'outcome', v.visit_outcome, 'notes', v.visit_notes,
      'observations', v.internal_observations, 'capex', v.tentative_capex, 'report_url', v.inspection_report_url,
      'attachments', v.attachment_urls, 'non_retain', v.non_retain_items, 'follow_up', v.follow_up_required,
      'by', (select u.email from users u where u.id = v.created_by), 'created_at', v.created_at) order by v.visit_date, v.created_at)
    from exploratory_visits v where v.request_id = r.id), '[]'::jsonb)
)), '[]'::jsonb)::text as rows
from exploratory_requests r
"""


def load(project, sql_text, fn, tag):
    """Wrap a JSON payload in a call to fn() and run it on Pulse."""
    if tag in sql_text:
        sys.exit('Payload contains the quoting tag; refusing to write.')
    fd, path = tempfile.mkstemp(prefix='stage-sync-', suffix='.sql')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        f.write(f'select public.{fn}({tag}{sql_text}{tag}::jsonb) as result;\n')
    return path


def rows_of(out):
    """The result rows from `supabase db query -o json`, whichever shape this
    CLI version prints: {"rows": [...], "boundary": …} (older) or a bare
    [...] (newer) — ignoring anything printed before ("Initialising login
    role…") or after (update notices on CI)."""
    starts = [i for i in (out.find('{'), out.find('[')) if i >= 0]
    if not starts:
        sys.exit(f'No JSON in the CLI output:\n{out[:500]}')
    doc = json.JSONDecoder().raw_decode(out[min(starts):])[0]
    return doc['rows'] if isinstance(doc, dict) and 'rows' in doc else doc


def cli(*args):
    r = subprocess.run(['supabase', *args], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f'supabase {" ".join(args[:3])}… failed:\n{r.stderr or r.stdout}')
    return r.stdout


def main(dry):
    # (dry: read everything, write nothing to either side)
    out = cli('db', 'query', '--linked', '--project-ref', STAGE, '-o', 'json', QUERY)
    rows = rows_of(out)[0]['rows']
    rows = json.loads(rows) if isinstance(rows, str) else rows
    payload = json.dumps(rows, ensure_ascii=False, default=str)
    tag = '$sg$'
    if tag in payload:
        sys.exit('Payload contains the quoting tag; refusing to write.')
    fd, path = tempfile.mkstemp(prefix='stage-sync-', suffix='.sql')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        f.write(f'select public.stage_dates_ingest({tag}{payload}{tag}::jsonb) as result;\n')
    kinds = {}
    for r in rows:
        kinds[r['kind']] = kinds.get(r['kind'], 0) + 1
    print(f'{len(rows)} dates read from Flent-Stage: ' + ', '.join(f'{k} {n}' for k, n in sorted(kinds.items())))
    if dry:
        print(f'SQL written to {path} (not loaded)')
        return
    res = cli('db', 'query', '--linked', '--project-ref', PULSE, '-o', 'json', '-f', path)
    loaded = rows_of(res)[0]['result']
    loaded = json.loads(loaded) if isinstance(loaded, str) else loaded
    print(f"Loaded into Pulse: {loaded['rows']} dates (the previous snapshot was replaced)")
    os.remove(path)

    # the exploratory pipeline
    out = cli('db', 'query', '--linked', '--project-ref', STAGE, '-o', 'json', EXPLORATORY)
    reqs = rows_of(out)[0]['rows']
    reqs = json.loads(reqs) if isinstance(reqs, str) else reqs
    path = load(PULSE, json.dumps(reqs, ensure_ascii=False, default=str), 'stage_exploratory_ingest', '$ex$')
    res = cli('db', 'query', '--linked', '--project-ref', PULSE, '-o', 'json', '-f', path)
    r = rows_of(res)[0]['result']
    r = json.loads(r) if isinstance(r, str) else r
    print(f"Exploratory: {r['requests']} requests mirrored · {r['alerts']} new alert(s) for admins"
          f" · {r.get('pasted', 0)} log(s) now in Stage · {r.get('conflicts', 0)} assignment conflict(s)")
    os.remove(path)

    # The one thing Pulse writes to Stage: who is going on each visit.
    res = cli('db', 'query', '--linked', '--project-ref', PULSE, '-o', 'json',
              'select public.exploratory_assignments_pending()::text as p')
    pending = rows_of(res)[0]['p']
    pending = json.loads(pending) if isinstance(pending, str) else pending
    if not pending:
        print('Assignments: nothing to write to Stage')
        return
    if dry:
        print(f'Assignments: {len(pending)} would be written to Stage (dry run)')
        return
    values = ', '.join(
        "('%s'::uuid, %s)" % (p['id'], "'%s'" % p['email'].replace("'", "''") if p.get('email') else 'null')
        for p in pending)
    sql = (f"with x(id, email) as (values {values}) "
           "update exploratory_requests r set assigned_inspector_id = (select u.id from users u where lower(u.email) = lower(x.email)) "
           "from x where r.id = x.id and (x.email is null or exists (select 1 from users u where lower(u.email) = lower(x.email))) "
           "returning r.id::text as id")
    res = cli('db', 'query', '--linked', '--project-ref', STAGE, '-o', 'json', sql)
    done = {row['id'] for row in rows_of(res)}
    marks = [{'id': p['id'], 'email': p.get('email'),
              'error': None if p['id'] in done else 'not written — no Stage user with that email, or the request is gone'}
             for p in pending]
    path = load(PULSE, json.dumps(marks), 'exploratory_assignments_mark_written', '$wb$')
    cli('db', 'query', '--linked', '--project-ref', PULSE, '-o', 'json', '-f', path)
    os.remove(path)
    print(f'Assignments: {len(done)} written to Stage' + (f' · {len(pending) - len(done)} could not be' if len(done) < len(pending) else ''))


if __name__ == '__main__':
    main('--dry-run' in sys.argv)
