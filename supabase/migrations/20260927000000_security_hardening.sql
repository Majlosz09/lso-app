-- =============================================================
-- SECURITY HARDENING (audyt 2026-09-27)
-- Uruchom w: Supabase Dashboard → SQL Editor (całość naraz — jedna transakcja).
-- Zgodne wstecz z wersją apki, która jest już u użytkowników.
--
-- Naprawia:
--  1. Samozwańczy admin cudzej parafii (rejestracja z role='admin' + obcy parish_id,
--     admin przestawiający sobie parish_id na inną parafię)
--  2. Czat: dopisywanie się do dowolnego kanału dowolnej parafii, admin jednej
--     parafii widzący/moderujący kanały wszystkich parafii
--  3. check_in_and_award_points ufał p_profile_id/p_parish_id z klienta
--  4. notify_push i Edge Function send-push jako otwarty przekaźnik pushy
--     (+ paczki po 100 — limit Expo; duże parafie nie dostawały powiadomień)
--  5. link_parent_to_children pozwalał „przejąć” cudze dziecko
--  6. Masowe zakładanie parafii (spam)
--  7. Funkcje RPC wykonywalne bez logowania
-- =============================================================

BEGIN;

-- -------------------------------------------------------------
-- 0. Funkcje pomocnicze (SECURITY DEFINER → brak rekurencji RLS)
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_chat_member(p_channel_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM chat_members WHERE channel_id = p_channel_id AND user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION chat_channel_parish(p_channel_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT parish_id FROM chat_channels WHERE id = p_channel_id
$$;

CREATE OR REPLACE FUNCTION chat_channel_member_count(p_channel_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM chat_members WHERE channel_id = p_channel_id
$$;

-- -------------------------------------------------------------
-- 1. profiles — ochrona parish_id / role / is_admin (INSERT i UPDATE)
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_profiles_protect_sensitive_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_becomes_admin boolean := (NEW.role = 'admin' OR NEW.is_admin IS TRUE);
BEGIN
  -- Bez sesji użytkownika (SQL Editor, service_role, trigger rejestracji w auth) — bez ograniczeń
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.is_admin IS TRUE THEN
      RAISE EXCEPTION 'Brak uprawnień do ustawienia is_admin';
    END IF;
    -- Admin tylko we własnej, właśnie założonej parafii
    IF NEW.role = 'admin' AND NEW.parish_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM parishes WHERE id = NEW.parish_id AND created_by = v_uid
    ) THEN
      RAISE EXCEPTION 'Brak uprawnień: administratorem można zostać tylko we własnej parafii';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: nic wrażliwego się nie zmienia → OK
  IF NEW.parish_id IS NOT DISTINCT FROM OLD.parish_id
     AND NEW.role IS NOT DISTINCT FROM OLD.role
     AND NEW.is_admin IS NOT DISTINCT FROM OLD.is_admin THEN
    RETURN NEW;
  END IF;

  IF OLD.id = v_uid THEN
    -- Własny profil
    IF NEW.is_admin IS TRUE AND OLD.is_admin IS NOT TRUE THEN
      RAISE EXCEPTION 'Brak uprawnień do ustawienia is_admin';
    END IF;

    IF OLD.parish_id IS NULL THEN
      -- Pierwsze dołączenie do parafii: admin tylko we własnej parafii
      IF v_becomes_admin AND NEW.parish_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM parishes WHERE id = NEW.parish_id AND created_by = v_uid
      ) THEN
        RAISE EXCEPTION 'Brak uprawnień: administratorem można zostać tylko we własnej parafii';
      END IF;
      RETURN NEW;
    END IF;

    -- Już w parafii: nie można przenieść się do innej parafii
    IF NEW.parish_id IS DISTINCT FROM OLD.parish_id AND NEW.parish_id IS NOT NULL THEN
      RAISE EXCEPTION 'Nie możesz samodzielnie zmienić parafii';
    END IF;
    -- Można się tylko zdegradować (np. admin → ministrant), nie awansować
    IF NEW.role IS DISTINCT FROM OLD.role AND NEW.role = 'admin' THEN
      RAISE EXCEPTION 'Nie możesz nadać sobie roli administratora';
    END IF;
    RETURN NEW;
  END IF;

  -- Cudzy profil: tylko admin tej samej parafii
  IF NOT (is_parish_admin() AND OLD.parish_id = my_parish_id()) THEN
    RAISE EXCEPTION 'Brak uprawnień do zmiany parish_id, role lub is_admin';
  END IF;
  IF NEW.parish_id IS DISTINCT FROM OLD.parish_id AND NEW.parish_id IS NOT NULL THEN
    RAISE EXCEPTION 'Nie można przenieść użytkownika do innej parafii';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_protect_sensitive ON profiles;
CREATE TRIGGER trg_profiles_protect_sensitive
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION trg_profiles_protect_sensitive_fields();

-- -------------------------------------------------------------
-- 2. parishes — zakładanie tylko gdy nie należysz do parafii, max 5 na konto
-- -------------------------------------------------------------
DROP POLICY IF EXISTS "parishes_insert" ON parishes;
CREATE POLICY "parishes_insert" ON parishes
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND parish_id IS NOT NULL)
    AND (SELECT count(*) FROM parishes p WHERE p.created_by = auth.uid()) < 5
  );

-- Flaga do oddzielenia naszych/testowych parafii od prawdziwych
ALTER TABLE parishes ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

-- -------------------------------------------------------------
-- 3. Czat
-- -------------------------------------------------------------
-- chat_channels
DROP POLICY IF EXISTS "chat_channels_select" ON chat_channels;
CREATE POLICY "chat_channels_select" ON chat_channels
  FOR SELECT USING (
    is_chat_member(id)
    OR (is_parish_admin() AND parish_id = my_parish_id())
    -- świeżo utworzony, jeszcze pusty DM we własnej parafii (insert ... returning)
    OR (type = 'dm' AND parish_id = my_parish_id() AND chat_channel_member_count(id) = 0)
  );

DROP POLICY IF EXISTS "chat_channels_insert" ON chat_channels;
CREATE POLICY "chat_channels_insert" ON chat_channels
  FOR INSERT WITH CHECK (
    parish_id = my_parish_id()
    AND (type = 'dm' OR is_parish_admin())
  );

-- chat_members
DROP POLICY IF EXISTS "chat_members_select" ON chat_members;
CREATE POLICY "chat_members_select" ON chat_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR is_chat_member(channel_id)
    OR (is_parish_admin() AND chat_channel_parish(channel_id) = my_parish_id())
  );

DROP POLICY IF EXISTS "chat_members_insert" ON chat_members;
CREATE POLICY "chat_members_insert" ON chat_members
  FOR INSERT WITH CHECK (
    chat_channel_parish(channel_id) = my_parish_id()
    -- dodawany użytkownik musi być z tej samej parafii
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = chat_members.user_id AND p.parish_id = my_parish_id())
    AND (
      is_parish_admin()
      -- zakładanie DM: kanał typu dm, który ma jeszcze < 2 członków
      OR (
        EXISTS (SELECT 1 FROM chat_channels cc WHERE cc.id = chat_members.channel_id AND cc.type = 'dm')
        AND chat_channel_member_count(channel_id) < 2
      )
    )
  );

-- chat_messages
DROP POLICY IF EXISTS "chat_messages_select" ON chat_messages;
CREATE POLICY "chat_messages_select" ON chat_messages
  FOR SELECT USING (is_chat_member(channel_id));

DROP POLICY IF EXISTS "chat_messages_insert" ON chat_messages;
CREATE POLICY "chat_messages_insert" ON chat_messages
  FOR INSERT WITH CHECK (sender_id = auth.uid() AND is_chat_member(channel_id));

DROP POLICY IF EXISTS "chat_messages_update" ON chat_messages;
CREATE POLICY "chat_messages_update" ON chat_messages
  FOR UPDATE USING (
    (sender_id = auth.uid() AND is_chat_member(channel_id))
    OR (is_parish_admin() AND chat_channel_parish(channel_id) = my_parish_id())
  ) WITH CHECK (
    (sender_id = auth.uid() AND is_chat_member(channel_id))
    OR (is_parish_admin() AND chat_channel_parish(channel_id) = my_parish_id())
  );

-- chat_reactions
DROP POLICY IF EXISTS "chat_reactions_insert" ON chat_reactions;
CREATE POLICY "chat_reactions_insert" ON chat_reactions
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM chat_messages m
      WHERE m.id = chat_reactions.message_id AND is_chat_member(m.channel_id)
    )
  );

-- chat_polls
DROP POLICY IF EXISTS "chat_polls_update" ON chat_polls;
CREATE POLICY "chat_polls_update" ON chat_polls
  FOR UPDATE USING (
    creator_id = auth.uid()
    OR (is_parish_admin() AND chat_channel_parish(channel_id) = my_parish_id())
  );

-- chat_poll_votes
DROP POLICY IF EXISTS "chat_poll_votes_insert" ON chat_poll_votes;
CREATE POLICY "chat_poll_votes_insert" ON chat_poll_votes
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM chat_poll_options o
      JOIN chat_polls p ON p.id = o.poll_id
      WHERE o.id = chat_poll_votes.option_id AND is_chat_member(p.channel_id)
    )
  );

-- -------------------------------------------------------------
-- 4. check_in_and_award_points — walidacja wywołującego
--    Oryginalna funkcja zostaje nietknięta jako *_impl (niedostępna z API),
--    nowa funkcja o tej samej sygnaturze sprawdza uprawnienia i ją woła.
-- -------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.check_in_and_award_points_impl(uuid,uuid,uuid,text,double precision,double precision)') IS NULL THEN
    ALTER FUNCTION public.check_in_and_award_points(uuid, uuid, uuid, text, double precision, double precision)
      RENAME TO check_in_and_award_points_impl;
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.check_in_and_award_points_impl(uuid, uuid, uuid, text, double precision, double precision)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_in_and_award_points(
  p_schedule_id uuid,
  p_profile_id  uuid,
  p_parish_id   uuid,
  p_method      text DEFAULT 'manual',
  p_lat         double precision DEFAULT NULL,
  p_lng         double precision DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_schedule_parish uuid;
BEGIN
  SELECT parish_id INTO v_schedule_parish FROM schedules WHERE id = p_schedule_id;
  IF v_schedule_parish IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono służby';
  END IF;
  IF v_schedule_parish IS DISTINCT FROM p_parish_id THEN
    RAISE EXCEPTION 'Służba należy do innej parafii';
  END IF;

  IF v_uid IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_profile_id AND parish_id = v_schedule_parish) THEN
      RAISE EXCEPTION 'Ministrant nie należy do tej parafii';
    END IF;
    IF p_profile_id <> v_uid AND NOT (is_parish_admin() AND my_parish_id() = v_schedule_parish) THEN
      RAISE EXCEPTION 'Brak uprawnień do potwierdzenia obecności innej osoby';
    END IF;
  END IF;

  RETURN check_in_and_award_points_impl(p_schedule_id, p_profile_id, p_parish_id, p_method, p_lat, p_lng);
END;
$$;

-- -------------------------------------------------------------
-- 5. notify_push — bezpośrednio do Expo (bez publicznej Edge Function),
--    paczki po 100 (limit Expo), niedostępne z API
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_push(
  tokens text[],
  title  text,
  body   text,
  data   jsonb DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  batch jsonb := '[]'::jsonb;
  token text;
BEGIN
  IF tokens IS NULL OR array_length(tokens, 1) IS NULL THEN RETURN; END IF;

  FOREACH token IN ARRAY tokens LOOP
    CONTINUE WHEN token IS NULL OR length(token) = 0;
    batch := batch || jsonb_build_array(jsonb_build_object(
      'to', token, 'title', title, 'body', left(body, 500), 'data', data, 'sound', 'default'
    ));
    IF jsonb_array_length(batch) = 100 THEN
      BEGIN
        PERFORM net.http_post(
          url     := 'https://exp.host/--/api/v2/push/send',
          headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json'),
          body    := batch
        );
      EXCEPTION WHEN OTHERS THEN NULL; -- push nigdy nie może przerwać zapisu obecności/punktów
      END;
      batch := '[]'::jsonb;
    END IF;
  END LOOP;

  IF jsonb_array_length(batch) > 0 THEN
    BEGIN
      PERFORM net.http_post(
        url     := 'https://exp.host/--/api/v2/push/send',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json'),
        body    := batch
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION notify_push(text[], text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- -------------------------------------------------------------
-- 6. link_parent_to_children — tylko dzieci bez przypisanego rodzica
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION link_parent_to_children(p_child_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id   uuid := auth.uid();
  v_parish_id uuid;
  v_role      text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT parish_id, role INTO v_parish_id, v_role FROM profiles WHERE id = v_user_id;

  IF v_role NOT IN ('parent', 'admin') THEN
    RAISE EXCEPTION 'Only parents or admins can link children';
  END IF;
  IF v_parish_id IS NULL THEN
    RAISE EXCEPTION 'User has no parish assigned';
  END IF;

  -- Już przypisane dziecko może przepiąć tylko admin parafii (member-detail)
  UPDATE profiles
     SET parent_id = v_user_id
   WHERE id = ANY(p_child_ids)
     AND parish_id = v_parish_id
     AND role = 'member'
     AND (parent_id IS NULL OR parent_id = v_user_id);
END;
$$;

-- -------------------------------------------------------------
-- 6b. Minimalizacja danych: nie przechowujemy lokalizacji ministranta
--     (weryfikacja odległości dzieje się w apce; współrzędne nigdzie nie są czytane,
--      a polityka prywatności obiecuje, że lokalizacja nie jest przechowywana)
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_attendance_strip_location()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.lat := NULL;
  NEW.lng := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_strip_location ON attendance;
CREATE TRIGGER trg_attendance_strip_location
  BEFORE INSERT OR UPDATE ON attendance
  FOR EACH ROW EXECUTE FUNCTION trg_attendance_strip_location();

UPDATE attendance SET lat = NULL, lng = NULL WHERE lat IS NOT NULL OR lng IS NOT NULL;

-- -------------------------------------------------------------
-- 7. Funkcje RPC: bez logowania wolno wywołać tylko to, czego potrzebuje
--    ekran rejestracji + helpery używane w politykach RLS
-- -------------------------------------------------------------
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.prorettype <> 'trigger'::regtype
      AND p.proname NOT IN (
        'get_parish_by_invite_code', 'get_parish_members',
        'my_parish_id', 'is_parish_admin',
        'is_chat_member', 'chat_channel_parish', 'chat_channel_member_count',
        -- wewnętrzne — zablokowane dla wszystkich wyżej
        'notify_push', 'check_in_and_award_points_impl'
      )
      -- pomijamy funkcje z rozszerzeń
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    -- najpierw jawny grant dla zalogowanych (żeby REVOKE z PUBLIC ich nie odciął)
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f.sig);
  END LOOP;
END $$;

COMMIT;

-- Po uruchomieniu: Dashboard → Edge Functions → send-push → Delete
-- (nie jest już używana, a była publicznym przekaźnikiem powiadomień).
