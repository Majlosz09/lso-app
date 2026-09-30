-- =============================================================
-- N7: „Słowo dnia” z Pisma Świętego (wspólne dla wszystkich parafii)
--
-- date   — dzień (jeden wpis na dzień)
-- sigla  — np. „J 15, 12”
-- text   — treść fragmentu
-- source — przekład / źródło, np. „Biblia Tysiąclecia, wyd. V” (wyświetlane pod tekstem)
--
-- Czytają zalogowani. Zapis tylko z SQL Editora / service role — dane wgrywa się
-- skryptem scripts/import-daily-word.mjs (CSV → SQL do wklejenia).
-- Brak wpisu na dany dzień → aplikacja pokazuje „Hasło dnia” z Wiedzy.
-- =============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS daily_word (
  date       date PRIMARY KEY,
  sigla      text NOT NULL CHECK (char_length(sigla) BETWEEN 1 AND 60),
  text       text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 2000),
  source     text CHECK (char_length(source) <= 120),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE daily_word ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "daily_word_select" ON daily_word;
CREATE POLICY "daily_word_select" ON daily_word FOR SELECT TO authenticated USING (true);
GRANT SELECT ON daily_word TO authenticated;

COMMIT;
