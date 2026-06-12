-- Tabela własnych wpisów wiedzy dla parafii
-- Admini parafii mogą dodawać nowe artykuły widoczne dla jej członków

CREATE TABLE wiedza_entries (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  parish_id   UUID        NOT NULL REFERENCES parishes(id) ON DELETE CASCADE,
  category_id TEXT        NOT NULL,   -- np. 'modlitwy', 'naczynia', własny klucz
  section     TEXT        NOT NULL DEFAULT '',
  title       TEXT        NOT NULL,
  content     TEXT        NOT NULL,
  subtitle    TEXT,
  display_order INTEGER   NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE wiedza_entries ENABLE ROW LEVEL SECURITY;

-- Odczyt: wszyscy z tej parafii
CREATE POLICY "wiedza_entries_read" ON wiedza_entries
  FOR SELECT USING (
    parish_id = (
      SELECT parish_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Zapis: tylko admini parafii
CREATE POLICY "wiedza_entries_admin_write" ON wiedza_entries
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND parish_id = wiedza_entries.parish_id
        AND (role = 'admin' OR is_admin = TRUE)
    )
  );
