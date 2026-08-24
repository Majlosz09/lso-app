-- Dodaj FK constraint poll_id → chat_polls jeśli jeszcze nie istnieje.
-- Migracja 20260610000001 używała ADD COLUMN IF NOT EXISTS, które pomija
-- FK gdy kolumna już istniała (kolumna bez constraintu → brak relacji w PostgREST).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chat_messages_poll_id_fkey'
      AND table_name = 'chat_messages'
      AND constraint_schema = 'public'
  ) THEN
    ALTER TABLE chat_messages
      ADD CONSTRAINT chat_messages_poll_id_fkey
      FOREIGN KEY (poll_id) REFERENCES chat_polls(id) ON DELETE SET NULL;
  END IF;
END;
$$;

-- Przeładuj cache schematu PostgREST po dodaniu constraintu
NOTIFY pgrst, 'reload schema';
