-- The Pulse-wide notepad: personal notes, saved against the person who wrote
-- them, each either general or about one PID.
--
-- Private by construction: RLS lets a signed-in user see and change only their
-- own rows. The PID's shared team note (the inspection notepad) stays where it
-- was, in quick_notes; this table is the person's own.

begin;

create table if not exists public.user_notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pid         text,                         -- null = general
  title       text not null default '',
  body        text not null default '',
  pinned      boolean not null default false,
  context     jsonb not null default '{}',  -- where it was started: { path, label }
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz                   -- soft delete, so a delete can be undone
);
create index if not exists user_notes_user_idx on public.user_notes (user_id, updated_at desc);
create index if not exists user_notes_pid_idx  on public.user_notes (user_id, pid);

alter table public.user_notes enable row level security;
drop policy if exists "own notes" on public.user_notes;
create policy "own notes" on public.user_notes
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.user_notes from anon;
grant select, insert, update, delete on public.user_notes to authenticated;

commit;
