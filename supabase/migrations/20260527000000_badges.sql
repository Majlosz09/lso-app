-- Definicje odznak (system: parish_id NULL, custom: parish_id ustawione)
create table badge_definitions (
  id           uuid primary key default gen_random_uuid(),
  parish_id    uuid references parishes(id) on delete cascade,
  name         text not null,
  icon         text not null,
  type         text not null check (type in ('auto', 'manual')),
  persistence  text not null check (persistence in ('status', 'permanent')),
  criteria_key text not null,
  created_at   timestamptz default now()
);

-- Odznaki przyznane członkom
create table member_badges (
  id                  uuid primary key default gen_random_uuid(),
  profile_id          uuid references profiles(id) on delete cascade not null,
  badge_definition_id uuid references badge_definitions(id) on delete cascade not null,
  awarded_at          timestamptz default now(),
  awarded_by          uuid references profiles(id),
  note                text,
  is_active           boolean default true,
  unique (profile_id, badge_definition_id)
);

-- RLS
alter table badge_definitions enable row level security;
alter table member_badges enable row level security;

-- badge_definitions: widoczne dla wszystkich z tej samej parafii (lub systemowe)
create policy "badge_definitions_select" on badge_definitions
  for select using (
    parish_id is null
    or parish_id in (
      select parish_id from profiles where id = auth.uid()
    )
  );

-- badge_definitions: admin może zarządzać własnymi odznakami parafii
create policy "badge_definitions_admin_write" on badge_definitions
  for all using (
    parish_id in (
      select parish_id from profiles
      where id = auth.uid() and (role = 'admin' or is_admin = true)
    )
  ) with check (
    parish_id in (
      select parish_id from profiles
      where id = auth.uid() and (role = 'admin' or is_admin = true)
    )
  );

-- member_badges: widoczne dla właściciela lub admina tej samej parafii
create policy "member_badges_select" on member_badges
  for select using (
    profile_id = auth.uid()
    or exists (
      select 1 from profiles a, profiles m
      where a.id = auth.uid()
        and (a.role = 'admin' or a.is_admin = true)
        and m.id = member_badges.profile_id
        and a.parish_id = m.parish_id
    )
  );

-- member_badges: członek może upsertować własne (auto-sync), admin może upsertować dla dowolnego w parafii
create policy "member_badges_write" on member_badges
  for all using (
    profile_id = auth.uid()
    or exists (
      select 1 from profiles a, profiles m
      where a.id = auth.uid()
        and (a.role = 'admin' or a.is_admin = true)
        and m.id = member_badges.profile_id
        and a.parish_id = m.parish_id
    )
  ) with check (
    profile_id = auth.uid()
    or exists (
      select 1 from profiles a, profiles m
      where a.id = auth.uid()
        and (a.role = 'admin' or a.is_admin = true)
        and m.id = profile_id
        and a.parish_id = m.parish_id
    )
  );

-- Systemowe definicje odznak (parish_id = NULL)
insert into badge_definitions (name, icon, type, persistence, criteria_key) values
  ('Regularny',          '🔥', 'auto',   'status',    'regularny'),
  ('Seria 5',            '⚡', 'auto',   'status',    'seria_5'),
  ('Seria 10',           '⚡', 'auto',   'status',    'seria_10'),
  ('Seria 15',           '⚡', 'auto',   'status',    'seria_15'),
  ('Seria 20',           '⚡', 'auto',   'status',    'seria_20'),
  ('Weteran 100',        '🎖️', 'auto',  'permanent', 'weteran_100'),
  ('Weteran 250',        '🎖️', 'auto',  'permanent', 'weteran_250'),
  ('Weteran 500',        '🎖️', 'auto',  'permanent', 'weteran_500'),
  ('Rocznik 1',          '🎂', 'auto',   'permanent', 'rocznica_1'),
  ('Rocznik 2',          '🎂', 'auto',   'permanent', 'rocznica_2'),
  ('Rocznik 5',          '🎂', 'auto',   'permanent', 'rocznica_5'),
  ('Top 3',              '🏆', 'auto',   'permanent', 'top3'),
  ('Sumienny',           '⭐', 'manual', 'permanent', 'sumienny'),
  ('Animator',           '👑', 'manual', 'permanent', 'animator'),
  ('Szczególna posługa', '✝️', 'manual', 'permanent', 'szczegolna');
