-- =============================================================
-- POPRAWKA do 20260928020000 (2026-09-28)
-- Po zamianie fn() → (SELECT fn()) polityki zawierają podzapytania. Postgres zgłasza
-- „infinite recursion detected in policy”, gdy polityka tabeli X ma podzapytanie do X
-- (albo do tabeli, której polityka wraca do X). Dotyczyło:
--   - parishes_insert: licznik parafii użytkownika czytał parishes
--   - chat_messages_select ↔ chat_reports_insert (wzajemne podzapytania)
-- Rozwiązanie: te sprawdzenia w funkcjach SECURITY DEFINER (bez RLS, bez rekurencji).
-- Uruchom PO 20260928020000_chat_perf_rodo.sql.
-- =============================================================

BEGIN;

CREATE OR REPLACE FUNCTION my_created_parish_count()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM parishes WHERE created_by = auth.uid()
$$;

CREATE OR REPLACE FUNCTION i_belong_to_parish()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND parish_id IS NOT NULL)
$$;

DROP POLICY IF EXISTS "parishes_insert" ON parishes;
CREATE POLICY "parishes_insert" ON parishes
  FOR INSERT WITH CHECK (
    created_by = (SELECT auth.uid())
    AND NOT (SELECT i_belong_to_parish())
    AND (SELECT my_created_parish_count()) < 5
  );

CREATE OR REPLACE FUNCTION message_is_reported(p_message_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM chat_reports WHERE message_id = p_message_id)
$$;

CREATE OR REPLACE FUNCTION can_see_message_channel(p_message_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM chat_messages m
     WHERE m.id = p_message_id AND is_chat_member(m.channel_id)
  )
$$;

DROP POLICY IF EXISTS "chat_messages_select" ON chat_messages;
CREATE POLICY "chat_messages_select" ON chat_messages
  FOR SELECT USING (
    is_chat_member(channel_id)
    OR (
      (SELECT is_parish_admin())
      AND chat_channel_parish(channel_id) = (SELECT my_parish_id())
      AND message_is_reported(id)
    )
  );

DROP POLICY IF EXISTS "chat_reports_insert" ON chat_reports;
CREATE POLICY "chat_reports_insert" ON chat_reports
  FOR INSERT WITH CHECK (
    reporter_id = (SELECT auth.uid())
    AND can_see_message_channel(message_id)
  );

REVOKE EXECUTE ON FUNCTION my_created_parish_count() FROM anon;
REVOKE EXECUTE ON FUNCTION i_belong_to_parish() FROM anon;
REVOKE EXECUTE ON FUNCTION message_is_reported(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION can_see_message_channel(uuid) FROM anon;

COMMIT;
