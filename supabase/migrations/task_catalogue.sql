-- The task catalogue: what a job is called, who does it, and how long it takes.
--
-- Every line that reaches a work order — from the ops person's inspection or
-- from the designer's brief — should resolve to one of these, so that "how long
-- will this property take" is answerable by adding up rather than by asking
-- around. Nothing computes a duration; the duration is looked up here.
--
-- This is deliberately the one place a human sets time. The extraction step
-- reads a designer's note and returns what and how many. It is never asked how
-- long, and its output has no field to say so, because a model will produce a
-- confident number that somebody then rosters against.
--
-- requirement_type is a closed list on purpose. work_order_items.fix_type was
-- meant to be install/repair/replace and now holds sixteen values including
-- "Change the jet spray and put Alton jet spray with 1.25m pipe" and both
-- 'install' and 'Install'. A free text field with good intentions degrades
-- within months; a check constraint does not.

create table if not exists public.task_catalogue (
  id               uuid primary key default gen_random_uuid(),

  name             text not null,
  trade            text not null,
  category         text not null,
  requirement_type text not null,

  -- minutes for ONE unit. Six switch points is 6 × minutes; the multiplication
  -- lives in the reader, so a duration here is always per-unit and comparable.
  minutes          int  not null check (minutes > 0),
  unit             text not null default 'each',

  -- What a designer might call this instead. "switchboard", "switch point",
  -- "plug point" are one task and three words; matching on the name alone
  -- would miss two of them and send the line back as unrecognised.
  aliases          text[] not null default '{}',

  notes            text,
  active           boolean not null default true,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       text
);

alter table public.task_catalogue
  drop constraint if exists task_catalogue_requirement_type_check;
alter table public.task_catalogue add constraint task_catalogue_requirement_type_check
  check (requirement_type in (
    'installation',   -- fixing something new in place
    'assembly',       -- building a thing that arrives in parts
    'repair',
    'replacement',
    'removal',
    'supply_only',    -- procured, nobody's time on site
    'finishing',      -- paint, polish, sealing
    'other'
  ));

-- Two rows called the same thing is how a catalogue stops being one.
create unique index if not exists task_catalogue_name_key
  on public.task_catalogue (lower(btrim(name)));

create index if not exists task_catalogue_trade_idx on public.task_catalogue (trade, category);

create or replace function public.task_catalogue_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(current_setting('request.jwt.claims', true)::json->>'email', new.updated_by);
  return new;
end $$;
drop trigger if exists trg_task_catalogue_touch on public.task_catalogue;
create trigger trg_task_catalogue_touch before insert or update on public.task_catalogue
  for each row execute function public.task_catalogue_touch();

-- ── access ──────────────────────────────────────────────────────────────────
-- Everyone signed in reads it: the work order needs the durations to add them
-- up. Only the admin writes, because a duration is a number the whole plan
-- rests on and it should move deliberately. The screen hides the controls; this
-- is the gate that actually holds.
alter table public.task_catalogue enable row level security;
revoke all on public.task_catalogue from public;
revoke all on public.task_catalogue from anon;
grant select, insert, update, delete on public.task_catalogue to authenticated;

drop policy if exists "staff read task catalogue" on public.task_catalogue;
create policy "staff read task catalogue" on public.task_catalogue
  for select to authenticated using (true);

drop policy if exists "admin writes task catalogue" on public.task_catalogue;
create policy "admin writes task catalogue" on public.task_catalogue
  for all to authenticated
  using      (lower(coalesce(auth.jwt() ->> 'email', '')) = 'mohosin@flent.in')
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'mohosin@flent.in');

-- ── a starting set ──────────────────────────────────────────────────────────
-- Enough to be useful on the first property, not a guess at everything. The
-- catalogue is meant to fill out from real requests: anything a designer asks
-- for that is not here arrives with no time, somebody sets one, and it joins.
insert into public.task_catalogue (name, trade, category, requirement_type, minutes, unit, aliases) values
  ('Switch point',        'Electrician', 'Electrical',      'installation', 20, 'each',   '{switchboard,"switch board","plug point",socket,"power point"}'),
  ('Light point',         'Electrician', 'Lighting',        'installation', 30, 'each',   '{"light fitting","ceiling light","light fixture"}'),
  ('Fan point',           'Electrician', 'Electrical',      'installation', 40, 'each',   '{"ceiling fan point"}'),
  ('Ceiling fan',         'Electrician', 'Electrical',      'installation', 45, 'each',   '{fan}'),
  ('Wall light / sconce', 'Electrician', 'Lighting',        'installation', 25, 'each',   '{sconce,"wall lamp"}'),
  ('Profile / strip light','Electrician','Lighting',        'installation', 35, 'metre',  '{"cove light","led strip","profile light"}'),
  ('Wall shelf',          'Carpenter',   'Carpentry',       'installation', 45, 'each',   '{shelf,"floating shelf"}'),
  ('Curtain rod',         'Carpenter',   'Soft furnishing', 'installation', 25, 'each',   '{"curtain rail","curtain track"}'),
  ('Mirror (wall fixed)', 'Carpenter',   'Carpentry',       'installation', 30, 'each',   '{mirror}'),
  ('TV wall mount',       'Carpenter',   'Carpentry',       'installation', 40, 'each',   '{"tv unit mount","tv bracket"}'),
  ('Wardrobe (2 door)',   'Carpenter',   'Furniture',       'assembly',    240, 'each',   '{wardrobe,almirah,closet}'),
  ('Bed (queen)',         'Carpenter',   'Furniture',       'assembly',     90, 'each',   '{bed,"double bed"}'),
  ('Sofa',                'Carpenter',   'Furniture',       'assembly',     60, 'each',   '{couch,"sofa set"}'),
  ('Dining table + chairs','Carpenter',  'Furniture',       'assembly',     75, 'each',   '{"dining set","dining table"}'),
  ('Study / work table',  'Carpenter',   'Furniture',       'assembly',     45, 'each',   '{desk,"study table"}'),
  ('Chest of drawers',    'Carpenter',   'Furniture',       'assembly',     60, 'each',   '{dresser,drawers}'),
  ('Shoe rack',           'Carpenter',   'Furniture',       'assembly',     40, 'each',   '{"shoe cabinet"}'),
  ('Curtains (hang)',     'Carpenter',   'Soft furnishing', 'installation', 20, 'window', '{curtain,drapes,blinds}'),
  ('False ceiling',       'Carpenter',   'Carpentry',       'installation', 60, 'sqft',   '{"gypsum ceiling","pop ceiling"}'),
  ('Wall painting',       'Painter',     'Painting',        'finishing',     8, 'sqft',   '{paint,repaint}')
on conflict do nothing;

-- check
select name, trade, category, requirement_type, minutes, unit
  from public.task_catalogue order by trade, category, name;
