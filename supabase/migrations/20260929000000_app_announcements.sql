-- =============================================================
-- KOMUNIKATY „CO NOWEGO” (2026-09-29)
-- Jednorazowe okno po otwarciu aplikacji, osobne treści dla ról.
-- Treść dodajemy SQL-em (docs/announcements/*.sql) — bez wydawania nowej wersji apki.
-- Zamknięcie zapisuje się na koncie → nie wraca na żadnym urządzeniu.
-- Widzą je tylko osoby zarejestrowane PRZED publikacją (nowi nie dostają „nowości”).
-- =============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS app_announcements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  body         text NOT NULL,                       -- zwykły tekst; linie zaczynające się od „• ” to punkty
  audience     text[] NOT NULL DEFAULT array['member', 'parent', 'admin'],
  published_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz,                         -- po tej dacie nikomu się już nie pokaże
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_announcement_dismissals (
  announcement_id uuid NOT NULL REFERENCES app_announcements(id) ON DELETE CASCADE,
  profile_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  dismissed_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, profile_id)
);

ALTER TABLE app_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_announcement_dismissals ENABLE ROW LEVEL SECURITY;

-- Komunikaty czyta się przez RPC poniżej; bezpośrednio tylko odczyt aktywnych (bez zapisu z apki)
DROP POLICY IF EXISTS "app_announcements_select" ON app_announcements;
CREATE POLICY "app_announcements_select" ON app_announcements
  FOR SELECT TO authenticated
  USING (published_at <= now() AND (expires_at IS NULL OR expires_at > now()));

DROP POLICY IF EXISTS "announcement_dismissals_own" ON app_announcement_dismissals;
CREATE POLICY "announcement_dismissals_own" ON app_announcement_dismissals
  FOR ALL TO authenticated
  USING (profile_id = (SELECT auth.uid()))
  WITH CHECK (profile_id = (SELECT auth.uid()));

-- Nieprzeczytane komunikaty dla zalogowanego (rola, data rejestracji, zatwierdzony członek parafii)
CREATE OR REPLACE FUNCTION get_my_announcements()
RETURNS TABLE (id uuid, title text, body text, published_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.title, a.body, a.published_at
    FROM app_announcements a
    JOIN profiles p ON p.id = auth.uid()
   WHERE p.approved
     AND p.parish_id IS NOT NULL
     AND a.published_at <= now()
     AND (a.expires_at IS NULL OR a.expires_at > now())
     AND (CASE WHEN p.role = 'admin' OR p.is_admin THEN 'admin' ELSE p.role END) = ANY (a.audience)
     AND p.created_at < a.published_at
     AND NOT EXISTS (
       SELECT 1 FROM app_announcement_dismissals d
        WHERE d.announcement_id = a.id AND d.profile_id = p.id
     )
   ORDER BY a.published_at;
$$;
REVOKE EXECUTE ON FUNCTION get_my_announcements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_my_announcements() TO authenticated;

COMMIT;
