-- =============================================================
-- CZAT, WYDAJNOŚĆ, RODO (2026-09-28)
-- Uruchom PO 20260928010000_points_approval_hardening.sql (najpierw LSO-dev).
--
--  1. Czat: ustawienie parafii „wiadomości prywatne między członkami” egzekwowane w bazie
--     (było tylko w apce), limit długości wiadomości, zgłaszanie wiadomości do admina
--  2. Indeksy pod najczęstsze zapytania (grafik, obecności, punkty, profile parafii)
--  3. RLS: funkcje bez argumentów w politykach liczone raz na zapytanie (SELECT …),
--     zamiast dla każdego wiersza — zalecenie Supabase
--  4. Historia: admin widzi imię osoby usuniętej z parafii (former_parish_id)
--  5. RODO art. 15/20: export_my_data() — kopia własnych danych w JSON
-- =============================================================

BEGIN;

-- =============================================================
-- 1. CZAT
-- =============================================================
-- DM: admin zawsze; ministrant/rodzic tylko gdy parafia na to pozwala
CREATE OR REPLACE FUNCTION parish_allows_member_dm()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT allow_member_dm FROM parishes WHERE id = my_parish_id()), false)
$$;

DROP POLICY IF EXISTS "chat_channels_insert" ON chat_channels;
CREATE POLICY "chat_channels_insert" ON chat_channels
  FOR INSERT WITH CHECK (
    parish_id = (SELECT my_parish_id())
    AND (
      (SELECT is_parish_admin())
      OR (type = 'dm' AND (SELECT parish_allows_member_dm()))
    )
  );

DROP POLICY IF EXISTS "chat_members_insert" ON chat_members;
CREATE POLICY "chat_members_insert" ON chat_members
  FOR INSERT WITH CHECK (
    chat_channel_parish(channel_id) = (SELECT my_parish_id())
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = chat_members.user_id AND p.parish_id = (SELECT my_parish_id()) AND p.approved)
    AND (
      (SELECT is_parish_admin())
      OR (
        (SELECT parish_allows_member_dm())
        AND EXISTS (SELECT 1 FROM chat_channels cc WHERE cc.id = chat_members.channel_id AND cc.type = 'dm')
        AND chat_channel_member_count(channel_id) < 2
      )
    )
  );

-- Limit długości (NOT VALID: nie sprawdza starych wiadomości)
DO $$ BEGIN
  ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_content_length CHECK (char_length(content) <= 4000) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Zgłoszenia wiadomości
CREATE TABLE IF NOT EXISTS chat_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  uuid NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason      text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE (message_id, reporter_id)
);
ALTER TABLE chat_reports ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION chat_message_parish(p_message_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT cc.parish_id FROM chat_messages m JOIN chat_channels cc ON cc.id = m.channel_id WHERE m.id = p_message_id
$$;

DROP POLICY IF EXISTS "chat_reports_insert" ON chat_reports;
CREATE POLICY "chat_reports_insert" ON chat_reports
  FOR INSERT WITH CHECK (
    reporter_id = (SELECT auth.uid())
    AND EXISTS (SELECT 1 FROM chat_messages m WHERE m.id = chat_reports.message_id AND is_chat_member(m.channel_id))
  );
DROP POLICY IF EXISTS "chat_reports_select" ON chat_reports;
CREATE POLICY "chat_reports_select" ON chat_reports
  FOR SELECT USING (
    reporter_id = (SELECT auth.uid())
    OR ((SELECT is_parish_admin()) AND chat_message_parish(message_id) = (SELECT my_parish_id()))
  );
DROP POLICY IF EXISTS "chat_reports_admin_update" ON chat_reports;
CREATE POLICY "chat_reports_admin_update" ON chat_reports
  FOR UPDATE USING ((SELECT is_parish_admin()) AND chat_message_parish(message_id) = (SELECT my_parish_id()))
  WITH CHECK ((SELECT is_parish_admin()) AND chat_message_parish(message_id) = (SELECT my_parish_id()));

-- Admin widzi zgłoszone wiadomości ze swojej parafii (także z cudzych DM) — tylko zgłoszone
DROP POLICY IF EXISTS "chat_messages_select" ON chat_messages;
CREATE POLICY "chat_messages_select" ON chat_messages
  FOR SELECT USING (
    is_chat_member(channel_id)
    OR (
      (SELECT is_parish_admin())
      AND chat_channel_parish(channel_id) = (SELECT my_parish_id())
      AND EXISTS (SELECT 1 FROM chat_reports r WHERE r.message_id = chat_messages.id)
    )
  );

-- Admin dostaje powiadomienie o zgłoszeniu
CREATE OR REPLACE FUNCTION trg_fn_notify_chat_report()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tokens text[];
  v_parish uuid := chat_message_parish(NEW.message_id);
BEGIN
  SELECT array_agg(push_token) INTO v_tokens FROM profiles
   WHERE parish_id = v_parish AND approved AND (role = 'admin' OR is_admin) AND push_token IS NOT NULL;
  IF v_tokens IS NOT NULL THEN
    PERFORM notify_push(v_tokens, 'Zgłoszona wiadomość', 'Ktoś zgłosił wiadomość na czacie: ' || left(NEW.reason, 120),
      jsonb_build_object('screen', 'chat-reports'));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_chat_report ON chat_reports;
CREATE TRIGGER trg_notify_chat_report AFTER INSERT ON chat_reports
  FOR EACH ROW EXECUTE FUNCTION trg_fn_notify_chat_report();

-- =============================================================
-- 2. INDEKSY
-- =============================================================
CREATE INDEX IF NOT EXISTS profiles_parish_role      ON profiles(parish_id, role);
CREATE INDEX IF NOT EXISTS profiles_parent           ON profiles(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS schedules_parish_date     ON schedules(parish_id, date);
CREATE INDEX IF NOT EXISTS schedule_assignments_prof ON schedule_assignments(profile_id);
CREATE INDEX IF NOT EXISTS attendance_parish         ON attendance(parish_id);
CREATE INDEX IF NOT EXISTS attendance_profile        ON attendance(profile_id);
CREATE INDEX IF NOT EXISTS points_parish             ON points(parish_id);
CREATE INDEX IF NOT EXISTS points_profile            ON points(profile_id);
CREATE INDEX IF NOT EXISTS announcements_parish      ON announcements(parish_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mass_templates_parish     ON mass_templates(parish_id);
CREATE INDEX IF NOT EXISTS point_rules_parish        ON point_rules(parish_id);
CREATE INDEX IF NOT EXISTS member_badges_badge       ON member_badges(badge_definition_id);
CREATE INDEX IF NOT EXISTS recurring_assignments_prof ON recurring_assignments(profile_id);
CREATE INDEX IF NOT EXISTS chat_reports_message      ON chat_reports(message_id);

-- =============================================================
-- 3. RLS: (SELECT fn()) zamiast fn() — wynik liczony raz na zapytanie
--    Dotyczy tylko funkcji bez argumentów; idempotentne (nie zawija drugi raz).
-- =============================================================
DO $$
DECLARE
  r record;
  v_qual text;
  v_check text;
  fn text;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
      FROM pg_policies
     WHERE schemaname = 'public'
  LOOP
    v_qual := r.qual;
    v_check := r.with_check;
    FOREACH fn IN ARRAY array['my_parish_id', 'get_my_parish_id', 'is_parish_admin', 'auth.uid', 'parish_allows_member_dm'] LOOP
      IF v_qual IS NOT NULL THEN
        v_qual := regexp_replace(v_qual, '(?<!SELECT )(?<![a-z_.])' || replace(fn, '.', '\.') || '\(\)', '( SELECT ' || fn || '() )', 'g');
      END IF;
      IF v_check IS NOT NULL THEN
        v_check := regexp_replace(v_check, '(?<!SELECT )(?<![a-z_.])' || replace(fn, '.', '\.') || '\(\)', '( SELECT ' || fn || '() )', 'g');
      END IF;
    END LOOP;

    IF v_qual IS DISTINCT FROM r.qual THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)', r.policyname, r.schemaname, r.tablename, v_qual);
    END IF;
    IF v_check IS DISTINCT FROM r.with_check THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I WITH CHECK (%s)', r.policyname, r.schemaname, r.tablename, v_check);
    END IF;
  END LOOP;
END $$;

-- =============================================================
-- 4. Historia usuniętych członków
-- =============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS former_parish_id uuid REFERENCES parishes(id) ON DELETE SET NULL;

DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (
    id = (SELECT auth.uid())
    OR (parish_id = (SELECT my_parish_id()) AND approved)
    -- admin widzi osoby usunięte ze swojej parafii (imię w historii służb i punktów)
    OR (former_parish_id = (SELECT my_parish_id()) AND (SELECT is_parish_admin()))
  );

CREATE OR REPLACE FUNCTION public.remove_member_from_parish(p_profile_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_parish uuid := my_parish_id();
  v_target profiles%ROWTYPE;
BEGIN
  IF NOT is_parish_admin() OR v_parish IS NULL THEN
    RAISE EXCEPTION 'Tylko administrator parafii może usuwać osoby z parafii';
  END IF;
  SELECT * INTO v_target FROM profiles WHERE id = p_profile_id;
  IF v_target.id IS NULL OR v_target.parish_id IS DISTINCT FROM v_parish THEN
    RAISE EXCEPTION 'Ta osoba nie należy do Twojej parafii';
  END IF;
  IF p_profile_id = auth.uid() THEN
    RAISE EXCEPTION 'Nie możesz usunąć samego siebie';
  END IF;
  IF v_target.role = 'admin' OR v_target.is_admin THEN
    RAISE EXCEPTION 'Najpierw odbierz tej osobie uprawnienia administratora';
  END IF;

  DELETE FROM schedule_assignments sa USING schedules s
   WHERE s.id = sa.schedule_id AND sa.profile_id = p_profile_id
     AND s.date >= current_date AND sa.status IN ('assigned', 'excused');
  DELETE FROM recurring_assignments WHERE profile_id = p_profile_id;
  DELETE FROM recurring_commitments WHERE profile_id = p_profile_id;
  DELETE FROM chat_members cm USING chat_channels cc
   WHERE cc.id = cm.channel_id AND cc.parish_id = v_parish AND cm.user_id = p_profile_id;

  UPDATE profiles SET parent_id = NULL WHERE parent_id = p_profile_id;
  UPDATE profiles
     SET parish_id = NULL, parent_id = NULL, rank_id = NULL, approved = true,
         -- odrzucona prośba (nigdy nie był członkiem) nie zostawia śladu w parafii
         former_parish_id = CASE WHEN v_target.approved THEN v_parish ELSE former_parish_id END
   WHERE id = p_profile_id;
END;
$$;

-- =============================================================
-- 5. RODO: eksport własnych danych
-- =============================================================
CREATE OR REPLACE FUNCTION export_my_data()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  RETURN jsonb_build_object(
    'wygenerowano', now(),
    'konto', (SELECT jsonb_build_object('email', email, 'utworzono', created_at, 'ostatnie_logowanie', last_sign_in_at)
                FROM auth.users WHERE id = v_uid),
    'profil', (SELECT to_jsonb(p) - 'push_token' FROM profiles p WHERE p.id = v_uid),
    'parafia', (SELECT jsonb_build_object('nazwa', pa.name, 'miejscowosc', pa.city)
                  FROM profiles p JOIN parishes pa ON pa.id = p.parish_id WHERE p.id = v_uid),
    'dzieci', (SELECT coalesce(jsonb_agg(jsonb_build_object('imie_nazwisko', full_name)), '[]') FROM profiles WHERE parent_id = v_uid),
    'dyzury', (SELECT coalesce(jsonb_agg(jsonb_build_object('data', s.date, 'godzina', s."time", 'nazwa', s.title,
                        'status', sa.status, 'powod_nieobecnosci', sa.absence_reason) ORDER BY s.date), '[]')
                 FROM schedule_assignments sa JOIN schedules s ON s.id = sa.schedule_id WHERE sa.profile_id = v_uid),
    'obecnosci', (SELECT coalesce(jsonb_agg(jsonb_build_object('sluzba', schedule_id, 'kiedy', checked_at, 'metoda', method) ORDER BY checked_at), '[]')
                    FROM attendance WHERE profile_id = v_uid),
    'punkty', (SELECT coalesce(jsonb_agg(jsonb_build_object('ile', amount, 'za_co', reason, 'kiedy', created_at) ORDER BY created_at), '[]')
                 FROM points WHERE profile_id = v_uid),
    'odznaki', (SELECT coalesce(jsonb_agg(jsonb_build_object('odznaka', bd.name, 'przyznano', mb.awarded_at)), '[]')
                  FROM member_badges mb JOIN badge_definitions bd ON bd.id = mb.badge_definition_id WHERE mb.profile_id = v_uid),
    'wiadomosci', (SELECT coalesce(jsonb_agg(jsonb_build_object('kiedy', created_at, 'tresc', content) ORDER BY created_at), '[]')
                     FROM chat_messages WHERE sender_id = v_uid AND deleted_at IS NULL)
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION export_my_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION export_my_data() TO authenticated;
REVOKE EXECUTE ON FUNCTION parish_allows_member_dm() FROM anon;
REVOKE EXECUTE ON FUNCTION chat_message_parish(uuid) FROM anon;

COMMIT;
