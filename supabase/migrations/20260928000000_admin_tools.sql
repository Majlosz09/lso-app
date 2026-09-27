-- =============================================================
-- NARZĘDZIA ADMINA (2026-09-28)
-- Uruchom w SQL Editor (najpierw LSO-dev, po testach produkcja).
--
--  1. Rejestracja nie gubi roli/imienia/parafii przy potwierdzaniu maila
--     (handle_new_user czyta metadane z signUp) — przyczyna rodziców
--     zapisanych jako ministranci i imion = adres e-mail
--  2. set_member_role     — admin zmienia ministrant ↔ rodzic
--  3. remove_member_from_parish — admin usuwa osobę z parafii
--  4. Stałe dyżury: recurring_assignments + create/cancel RPC
--  5. Tryb obecności 'admin': tylko admin zaznacza obecność
-- =============================================================

BEGIN;

-- -------------------------------------------------------------
-- 1. Profil z metadanych rejestracji
--    Apka wysyła w signUp: full_name, role (member|parent), phone, rocznik, invite_code.
--    Dzięki temu profil jest kompletny nawet gdy sesja powstaje dopiero po potwierdzeniu maila.
--    Stare wersje apki nie wysyłają metadanych → zachowanie jak dotąd.
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_meta    jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role    text  := CASE WHEN v_meta->>'role' IN ('member', 'parent') THEN v_meta->>'role' ELSE 'member' END;
  v_parish  uuid;
  v_rocznik int;
BEGIN
  IF coalesce(v_meta->>'invite_code', '') <> '' THEN
    SELECT id INTO v_parish FROM parishes WHERE invite_code = upper(trim(v_meta->>'invite_code')) LIMIT 1;
  END IF;

  BEGIN
    v_rocznik := nullif(v_meta->>'rocznik', '')::int;
  EXCEPTION WHEN others THEN
    v_rocznik := NULL;
  END;

  INSERT INTO public.profiles (id, full_name, role, phone, rocznik, parish_id)
  VALUES (
    new.id,
    coalesce(nullif(trim(v_meta->>'full_name'), ''), new.email),
    v_role,
    nullif(trim(v_meta->>'phone'), ''),
    CASE WHEN v_role = 'member' THEN v_rocznik END,
    v_parish
  );
  RETURN new;
END;
$$;

-- -------------------------------------------------------------
-- Stałe dyżury — tabela (potrzebna też w set_member_role / remove_member_from_parish)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recurring_assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parish_id   uuid NOT NULL REFERENCES parishes(id) ON DELETE CASCADE,
  profile_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),   -- 0 = niedziela
  "time"      time NOT NULL,
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  created_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date AND end_date <= start_date + 400)
);
CREATE INDEX IF NOT EXISTS recurring_assignments_parish ON recurring_assignments(parish_id);

ALTER TABLE schedule_assignments
  ADD COLUMN IF NOT EXISTS recurring_assignment_id uuid REFERENCES recurring_assignments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS schedule_assignments_recurring ON schedule_assignments(recurring_assignment_id)
  WHERE recurring_assignment_id IS NOT NULL;

ALTER TABLE recurring_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "recurring_assignments_select" ON recurring_assignments;
CREATE POLICY "recurring_assignments_select" ON recurring_assignments
  FOR SELECT USING (
    profile_id = auth.uid()
    OR (is_parish_admin() AND parish_id = my_parish_id())
  );
-- zapis wyłącznie przez RPC poniżej

-- -------------------------------------------------------------
-- 2. Zmiana roli ministrant ↔ rodzic (przez admina tej samej parafii)
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_member_role(p_profile_id uuid, p_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_parish uuid := my_parish_id();
  v_target profiles%ROWTYPE;
BEGIN
  IF NOT is_parish_admin() OR v_parish IS NULL THEN
    RAISE EXCEPTION 'Tylko administrator parafii może zmieniać role';
  END IF;
  IF p_role NOT IN ('member', 'parent') THEN
    RAISE EXCEPTION 'Nieprawidłowa rola';
  END IF;

  SELECT * INTO v_target FROM profiles WHERE id = p_profile_id;
  IF v_target.id IS NULL OR v_target.parish_id IS DISTINCT FROM v_parish THEN
    RAISE EXCEPTION 'Ta osoba nie należy do Twojej parafii';
  END IF;
  IF v_target.role = 'admin' OR v_target.is_admin THEN
    RAISE EXCEPTION 'Najpierw odbierz tej osobie uprawnienia administratora';
  END IF;
  IF v_target.role = p_role THEN
    RETURN;
  END IF;

  IF p_role = 'parent' THEN
    -- rodzic nie pełni dyżurów: zdejmij przyszłe przydziały i stałe dyżury
    DELETE FROM schedule_assignments sa
     USING schedules s
     WHERE s.id = sa.schedule_id AND sa.profile_id = p_profile_id
       AND s.date >= current_date AND sa.status IN ('assigned', 'excused');
    DELETE FROM recurring_assignments WHERE profile_id = p_profile_id;
    DELETE FROM recurring_commitments WHERE profile_id = p_profile_id;
    UPDATE profiles SET role = 'parent', parent_id = NULL WHERE id = p_profile_id;
    DELETE FROM chat_members cm USING chat_channels cc
     WHERE cc.id = cm.channel_id AND cc.parish_id = v_parish AND cc.slug = 'ministranci'
       AND cm.user_id = p_profile_id;
  ELSE
    UPDATE profiles SET parent_id = NULL WHERE parent_id = p_profile_id;  -- odłącz „dzieci”
    UPDATE profiles SET role = 'member' WHERE id = p_profile_id;
    DELETE FROM chat_members cm USING chat_channels cc
     WHERE cc.id = cm.channel_id AND cc.parish_id = v_parish AND cc.slug = 'rodzice'
       AND cm.user_id = p_profile_id;
  END IF;
  -- dopisanie do właściwego kanału robi trigger trg_add_profile_to_chat_channels
END;
$$;

-- -------------------------------------------------------------
-- 3. Usunięcie osoby z parafii (konto zostaje, traci dostęp do parafii)
--    Historia (obecności, punkty) zostaje w parafii; przyszłe dyżury są zdejmowane.
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION remove_member_from_parish(p_profile_id uuid)
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

  DELETE FROM schedule_assignments sa
   USING schedules s
   WHERE s.id = sa.schedule_id AND sa.profile_id = p_profile_id
     AND s.date >= current_date AND sa.status IN ('assigned', 'excused');
  DELETE FROM recurring_assignments WHERE profile_id = p_profile_id;
  DELETE FROM recurring_commitments WHERE profile_id = p_profile_id;
  DELETE FROM chat_members cm USING chat_channels cc
   WHERE cc.id = cm.channel_id AND cc.parish_id = v_parish AND cm.user_id = p_profile_id;

  UPDATE profiles SET parent_id = NULL WHERE parent_id = p_profile_id;
  UPDATE profiles
     SET parish_id = NULL, parent_id = NULL, rank_id = NULL
   WHERE id = p_profile_id;
END;
$$;

-- -------------------------------------------------------------
-- 4. Stałe dyżury: tworzenie i cofanie
-- -------------------------------------------------------------
-- Pojedynczy push przy przydziale — pomijamy przydziały ze stałych dyżurów
-- (dla nich create_recurring_assignments wysyła jedno zbiorcze powiadomienie)
CREATE OR REPLACE FUNCTION public.trg_fn_notify_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_token      text;
  v_name       text;
  v_parent_id  uuid;
  v_p_token    text;
  v_title      text;
  v_date_str   text;
BEGIN
  IF NEW.recurring_assignment_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT push_token, full_name, parent_id
    INTO v_token, v_name, v_parent_id
    FROM profiles WHERE id = NEW.profile_id;

  SELECT title,
         to_char(date::date, 'DD.MM') || ' ' || left(time::text, 5)
    INTO v_title, v_date_str
    FROM schedules WHERE id = NEW.schedule_id;

  IF v_token IS NOT NULL THEN
    PERFORM notify_push(
      ARRAY[v_token], 'Nowy dyżur',
      'Zostałeś przypisany do: ' || v_title || ' (' || v_date_str || ')'
    );
  END IF;

  IF v_parent_id IS NOT NULL THEN
    SELECT push_token INTO v_p_token FROM profiles WHERE id = v_parent_id;
    IF v_p_token IS NOT NULL THEN
      PERFORM notify_push(
        ARRAY[v_p_token], 'Dyżur dziecka',
        v_name || ' przypisany do: ' || v_title || ' (' || v_date_str || ')'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION create_recurring_assignments(
  p_profile_ids uuid[],
  p_day_of_week int,
  p_time        time,
  p_start       date,
  p_end         date
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_parish   uuid := my_parish_id();
  v_pid      uuid;
  v_rule     uuid;
  v_date     date;
  v_schedule uuid;
  v_rules    int := 0;
  v_count    int := 0;
  v_rows     int;
  v_days     text[] := array['niedzielę', 'poniedziałek', 'wtorek', 'środę', 'czwartek', 'piątek', 'sobotę'];
  v_token    text;
  v_name     text;
  v_parent   uuid;
  v_p_token  text;
  v_msg      text;
BEGIN
  IF NOT is_parish_admin() OR v_parish IS NULL THEN
    RAISE EXCEPTION 'Tylko administrator parafii może ustawiać stałe dyżury';
  END IF;
  IF p_day_of_week NOT BETWEEN 0 AND 6 THEN
    RAISE EXCEPTION 'Nieprawidłowy dzień tygodnia';
  END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_end < p_start OR p_end > p_start + 400 THEN
    RAISE EXCEPTION 'Nieprawidłowy zakres dat (maksymalnie ok. rok)';
  END IF;
  IF p_profile_ids IS NULL OR array_length(p_profile_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Wybierz co najmniej jednego ministranta';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_profile_ids) x(id)
     WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = x.id AND p.parish_id = v_parish AND p.role = 'member')
  ) THEN
    RAISE EXCEPTION 'Można przypisać tylko ministrantów z Twojej parafii';
  END IF;

  FOREACH v_pid IN ARRAY p_profile_ids LOOP
    INSERT INTO recurring_assignments (parish_id, profile_id, day_of_week, "time", start_date, end_date, created_by)
    VALUES (v_parish, v_pid, p_day_of_week, p_time, p_start, p_end, v_uid)
    RETURNING id INTO v_rule;
    v_rules := v_rules + 1;

    -- pierwszy pasujący dzień tygodnia >= p_start
    v_date := p_start + ((p_day_of_week - extract(dow FROM p_start)::int + 7) % 7);
    WHILE v_date <= p_end LOOP
      SELECT id INTO v_schedule
        FROM schedules
       WHERE parish_id = v_parish AND date = v_date AND "time" = p_time
       ORDER BY (category = 'msza') DESC
       LIMIT 1;

      IF v_schedule IS NULL THEN
        INSERT INTO schedules (title, date, "time", location, gps_radius, parish_id, category, created_by)
        VALUES ('Msza Święta', v_date, p_time, '', 100, v_parish, 'msza', v_uid)
        RETURNING id INTO v_schedule;
      END IF;

      INSERT INTO schedule_assignments (schedule_id, profile_id, role, status, recurring_assignment_id)
      VALUES (v_schedule, v_pid, 'ministrant', 'assigned', v_rule)
      ON CONFLICT (schedule_id, profile_id) DO NOTHING;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      v_count := v_count + v_rows;

      v_date := v_date + 7;
    END LOOP;

    -- jedno zbiorcze powiadomienie (ministrant + rodzic)
    SELECT push_token, full_name, parent_id INTO v_token, v_name, v_parent FROM profiles WHERE id = v_pid;
    v_msg := 'Stały dyżur: co ' || v_days[p_day_of_week + 1] || ' o ' || to_char(p_time, 'HH24:MI')
             || ' (do ' || to_char(p_end, 'DD.MM.YYYY') || ')';
    IF v_token IS NOT NULL THEN
      PERFORM notify_push(ARRAY[v_token], 'Nowy stały dyżur', v_msg);
    END IF;
    IF v_parent IS NOT NULL THEN
      SELECT push_token INTO v_p_token FROM profiles WHERE id = v_parent;
      IF v_p_token IS NOT NULL THEN
        PERFORM notify_push(ARRAY[v_p_token], 'Stały dyżur dziecka', v_name || ' — ' || v_msg);
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('rules', v_rules, 'assignments', v_count);
END;
$$;

-- Cofnięcie stałych dyżurów: usuwa przyszłe przydziały z tych reguł (historia zostaje)
CREATE OR REPLACE FUNCTION cancel_recurring_assignments(p_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_parish uuid := my_parish_id();
  v_count  int;
BEGIN
  IF NOT is_parish_admin() OR v_parish IS NULL THEN
    RAISE EXCEPTION 'Tylko administrator parafii może cofać stałe dyżury';
  END IF;
  IF EXISTS (SELECT 1 FROM recurring_assignments WHERE id = ANY(p_ids) AND parish_id <> v_parish) THEN
    RAISE EXCEPTION 'Brak uprawnień';
  END IF;

  DELETE FROM schedule_assignments sa
   USING schedules s
   WHERE s.id = sa.schedule_id
     AND sa.recurring_assignment_id = ANY(p_ids)
     AND s.date >= current_date
     AND sa.status IN ('assigned', 'excused');
  GET DIAGNOSTICS v_count = ROW_COUNT;

  DELETE FROM recurring_assignments WHERE id = ANY(p_ids) AND parish_id = v_parish;

  RETURN jsonb_build_object('removed_assignments', v_count);
END;
$$;

-- -------------------------------------------------------------
-- 5. Tryb obecności 'admin' — ministrant nie melduje się sam
-- -------------------------------------------------------------
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
  v_is_admin boolean;
BEGIN
  SELECT parish_id INTO v_schedule_parish FROM schedules WHERE id = p_schedule_id;
  IF v_schedule_parish IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono służby';
  END IF;
  IF v_schedule_parish IS DISTINCT FROM p_parish_id THEN
    RAISE EXCEPTION 'Służba należy do innej parafii';
  END IF;

  IF v_uid IS NOT NULL THEN
    v_is_admin := is_parish_admin() AND my_parish_id() = v_schedule_parish;
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_profile_id AND parish_id = v_schedule_parish) THEN
      RAISE EXCEPTION 'Ministrant nie należy do tej parafii';
    END IF;
    IF p_profile_id <> v_uid AND NOT v_is_admin THEN
      RAISE EXCEPTION 'Brak uprawnień do potwierdzenia obecności innej osoby';
    END IF;
    IF NOT v_is_admin AND (SELECT attendance_mode FROM parishes WHERE id = v_schedule_parish) = 'admin' THEN
      RAISE EXCEPTION 'W tej parafii obecność zaznacza administrator';
    END IF;
  END IF;

  RETURN check_in_and_award_points_impl(p_schedule_id, p_profile_id, p_parish_id, p_method, p_lat, p_lng);
END;
$$;

-- bezpośredni zapis do attendance (lib/checkin.ts) — ta sama zasada
DROP POLICY IF EXISTS "attendance_insert" ON attendance;
CREATE POLICY "attendance_insert" ON attendance
  FOR INSERT WITH CHECK (
    parish_id = my_parish_id()
    AND (
      is_parish_admin()
      OR (
        profile_id = auth.uid()
        AND (SELECT attendance_mode FROM parishes WHERE id = attendance.parish_id) <> 'admin'
      )
    )
  );

-- -------------------------------------------------------------
-- Uprawnienia do nowych RPC: tylko zalogowani
-- -------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION set_member_role(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION remove_member_from_parish(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION create_recurring_assignments(uuid[], int, time, date, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION cancel_recurring_assignments(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_member_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION remove_member_from_parish(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION create_recurring_assignments(uuid[], int, time, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_recurring_assignments(uuid[]) TO authenticated;

COMMIT;
