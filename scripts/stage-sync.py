#!/usr/bin/env python3
"""Flent-Stage → Pulse: copy the setup-calendar dates.

Reads (only reads) the Flent-Stage project and loads a fresh snapshot into
Pulse's stage_dates table through stage_dates_ingest():

  setups and revamps   the "setup" stage of each setup run (actual date if
                       Stage has one, else the planned date)
  inspections          properties.inspection_date_actual / _planned
  handovers            properties.actual_handover_date / scheduled_handover_date
  key handover, move-in, go-live

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


def cli(*args):
    r = subprocess.run(['supabase', *args], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f'supabase {" ".join(args[:3])}… failed:\n{r.stderr or r.stdout}')
    return r.stdout


def main(dry):
    out = cli('db', 'query', '--linked', '--project-ref', STAGE, '-o', 'json', QUERY)
    out = out[out.index('{'):]                       # the CLI may print a login line first
    rows = json.loads(json.loads(out)['rows'][0]['rows'])
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
    loaded = json.loads(res[res.index('{'):])['rows'][0]['result']
    print(f"Loaded into Pulse: {loaded['rows']} dates (the previous snapshot was replaced)")
    os.remove(path)


if __name__ == '__main__':
    main('--dry-run' in sys.argv)
