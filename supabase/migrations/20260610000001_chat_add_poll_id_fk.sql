-- =============================================================
-- Dodaj poll_id do chat_messages jeśli nie istnieje
-- (CREATE TABLE IF NOT EXISTS pominęło tę kolumnę jeśli tabela
--  istniała przed migracją 20260604000000_chat_full.sql)
-- Po wykonaniu: Dashboard → Settings → API → Reload schema cache
-- =============================================================

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS poll_id uuid REFERENCES chat_polls(id) ON DELETE SET NULL;
