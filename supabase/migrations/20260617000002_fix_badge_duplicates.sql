-- Usuń duplikaty w badge_definitions (system: parish_id IS NULL)
-- Zachowaj najstarszy rekord dla każdego criteria_key

DELETE FROM badge_definitions
WHERE id NOT IN (
  SELECT DISTINCT ON (criteria_key, COALESCE(parish_id::text, ''))
    id
  FROM badge_definitions
  ORDER BY criteria_key, COALESCE(parish_id::text, ''), created_at ASC
);

-- Dodaj partial unique index blokujący przyszłe duplikaty systemowych odznakami
CREATE UNIQUE INDEX IF NOT EXISTS badge_definitions_criteria_key_system_uq
  ON badge_definitions (criteria_key)
  WHERE parish_id IS NULL;

-- Oraz dla odznakami parafii (criteria_key unikalny w obrębie parafii)
CREATE UNIQUE INDEX IF NOT EXISTS badge_definitions_criteria_key_parish_uq
  ON badge_definitions (criteria_key, parish_id)
  WHERE parish_id IS NOT NULL;

-- Przeładuj cache schematu PostgREST (naprawi brakującą relację chat_messages ↔ chat_polls)
NOTIFY pgrst, 'reload schema';
