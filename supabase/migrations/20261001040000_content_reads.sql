-- =============================================================
-- N6 / N8: co przeczytałem — ogłoszenia (licznik nieprzeczytanych)
-- i hasła Wiedzy („3 z 8”, ✔ przy haśle). Synchronizuje się web ↔ telefon.
--
-- kind 'announcement' → item_key = announcements.id
-- kind 'wiedza'       → item_key = „<kategoria>/<id hasła>” (hasła wbudowane) albo „<kategoria>/__db_<uuid>”
-- Każdy widzi i zapisuje tylko swoje wpisy.
-- =============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS content_reads (
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('announcement', 'wiedza')),
  item_key   text NOT NULL CHECK (char_length(item_key) BETWEEN 1 AND 200),
  read_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, kind, item_key)
);

ALTER TABLE content_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "content_reads_select" ON content_reads;
CREATE POLICY "content_reads_select" ON content_reads
  FOR SELECT USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "content_reads_insert" ON content_reads;
CREATE POLICY "content_reads_insert" ON content_reads
  FOR INSERT WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS "content_reads_delete" ON content_reads;
CREATE POLICY "content_reads_delete" ON content_reads
  FOR DELETE USING (profile_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON content_reads TO authenticated;

COMMIT;
