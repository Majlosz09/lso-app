-- =============================================================
-- Audyt 2026-11-05 — Etap 1: doszczelnienia w bazie (aplikacja bez zmian)
--
--  1. chat_members: członek zmienia u siebie tylko last_read_at
--     (wcześniej mógł sam zdjąć wyciszenie can_post albo przenieść członkostwo do innego kanału).
--  2. chat_messages: autor nie cofa usunięcia (deleted_at), nie edytuje usuniętej wiadomości
--     i nie zmienia kanału / nadawcy / typu / ankiety / odpowiedzi / daty.
--  3. profiles: sam użytkownik po dołączeniu do parafii nie zmienia roli (ministrant ↔ rodzic),
--     daty stopnia (rank_since), kodu przejęcia ani pól profilu zarządzanego.
--  4. schedule_assignments: ministrant usuwa własny przydział tylko przed służbą,
--     w trybie zapisów i ze statusem „zapisany” (jak przycisk „Wypisz się”).
--  5. Zgłoszenie nieobecności (assigned → excused) najpóźniej 30 min przed służbą (jak w aplikacji).
--  6. Punkty za meldowanie bez duplikatów przy dwóch meldowaniach naraz (unikalny indeks
--     + punkty tylko wtedy, gdy obecność faktycznie została zapisana).
--  7. Indeksy kluczy obcych używanych w zapytaniach i przy usuwaniu kont.
-- Operacje systemowe (lso.sys) i opiekun swojej parafii działają jak dotąd.
-- =============================================================

BEGIN;

-- -------------------------------------------------------------
-- 1. chat_members
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_chat_members_protect()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR current_setting('lso.sys', true) = 'on' THEN RETURN NEW; END IF;
  -- opiekun parafii kanału (wyciszanie, porządki)
  IF is_parish_admin() AND chat_channel_parish(OLD.channel_id) = my_parish_id() THEN RETURN NEW; END IF;
  IF NEW.channel_id IS DISTINCT FROM OLD.channel_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Brak uprawnień do zmiany członkostwa w kanale';
  END IF;
  IF NEW.can_post IS DISTINCT FROM OLD.can_post THEN
    -- wyjątek: trigger dołączania opiekuna do kanałów (ON CONFLICT … SET can_post = true)
    IF NEW.can_post AND EXISTS (
         SELECT 1 FROM profiles p WHERE p.id = NEW.user_id AND (p.role = 'admin' OR p.is_admin)) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Prawo pisania w kanale zmienia opiekun parafii';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_chat_members_protect ON chat_members;
CREATE TRIGGER trg_chat_members_protect BEFORE UPDATE ON chat_members
  FOR EACH ROW EXECUTE FUNCTION public.trg_chat_members_protect();

-- -------------------------------------------------------------
-- 2. chat_messages
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_chat_messages_protect()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR current_setting('lso.sys', true) = 'on' THEN RETURN NEW; END IF;
  IF is_parish_admin() AND chat_channel_parish(OLD.channel_id) = my_parish_id() THEN RETURN NEW; END IF;
  IF NEW.channel_id IS DISTINCT FROM OLD.channel_id
     OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.type IS DISTINCT FROM OLD.type
     OR NEW.poll_id IS DISTINCT FROM OLD.poll_id
     OR NEW.reply_to_id IS DISTINCT FROM OLD.reply_to_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Tej części wiadomości nie można zmienić';
  END IF;
  IF OLD.deleted_at IS NOT NULL AND (
       NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
    OR NEW.content IS DISTINCT FROM OLD.content
    OR NEW.edited_at IS DISTINCT FROM OLD.edited_at) THEN
    RAISE EXCEPTION 'Usuniętej wiadomości nie można przywrócić ani edytować';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_chat_messages_protect ON chat_messages;
CREATE TRIGGER trg_chat_messages_protect BEFORE UPDATE ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.trg_chat_messages_protect();

-- -------------------------------------------------------------
-- 3. profiles — rozszerzenie ochrony pól (reszta funkcji bez zmian)
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_profiles_protect_sensitive_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_becomes_admin boolean := (NEW.role = 'admin' OR NEW.is_admin IS TRUE);
  v_creator boolean;
BEGIN
  IF current_setting('lso.sys', true) = 'on' THEN RETURN NEW; END IF;
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.is_admin IS TRUE THEN
      RAISE EXCEPTION 'Brak uprawnień do ustawienia is_admin';
    END IF;
    v_creator := NEW.parish_id IS NOT NULL
                 AND EXISTS (SELECT 1 FROM parishes WHERE id = NEW.parish_id AND created_by = v_uid);
    IF NEW.role = 'admin' AND NEW.parish_id IS NOT NULL AND NOT v_creator THEN
      RAISE EXCEPTION 'Brak uprawnień: administratorem można zostać tylko we własnej parafii';
    END IF;
    NEW.approved := NEW.parish_id IS NULL OR v_creator;
    RETURN NEW;
  END IF;

  IF OLD.id = v_uid THEN
    -- Pola ustawiane przez admina
    IF NOT is_parish_admin() AND (
         NEW.rank_id IS DISTINCT FROM OLD.rank_id
      OR NEW.is_active IS DISTINCT FROM OLD.is_active
      OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
    ) THEN
      RAISE EXCEPTION 'Brak uprawnień do zmiany rangi, aktywności lub przypisania rodzica';
    END IF;
    IF NEW.is_admin IS TRUE AND OLD.is_admin IS NOT TRUE THEN
      RAISE EXCEPTION 'Brak uprawnień do ustawienia is_admin';
    END IF;
    -- Pola systemowe: data stopnia, profil zarządzany, kod przejęcia, poprzednia parafia
    IF NEW.rank_since IS DISTINCT FROM OLD.rank_since
       OR NEW.managed IS DISTINCT FROM OLD.managed
       OR NEW.claim_code IS DISTINCT FROM OLD.claim_code
       OR NEW.former_parish_id IS DISTINCT FROM OLD.former_parish_id THEN
      RAISE EXCEPTION 'Brak uprawnień do zmiany tych pól profilu';
    END IF;

    IF OLD.parish_id IS NULL AND NEW.parish_id IS NOT NULL THEN
      -- Pierwsze dołączenie: admin i od razu zatwierdzony tylko we własnej parafii
      v_creator := EXISTS (SELECT 1 FROM parishes WHERE id = NEW.parish_id AND created_by = v_uid);
      IF v_becomes_admin AND NOT v_creator THEN
        RAISE EXCEPTION 'Brak uprawnień: administratorem można zostać tylko we własnej parafii';
      END IF;
      NEW.approved := v_creator;
      RETURN NEW;
    END IF;

    IF NEW.approved IS DISTINCT FROM OLD.approved THEN
      RAISE EXCEPTION 'Brak uprawnień do zmiany statusu zatwierdzenia';
    END IF;
    IF NEW.parish_id IS DISTINCT FROM OLD.parish_id AND NEW.parish_id IS NOT NULL THEN
      RAISE EXCEPTION 'Nie możesz samodzielnie zmienić parafii';
    END IF;
    IF NEW.role IS DISTINCT FROM OLD.role AND NEW.role = 'admin' THEN
      RAISE EXCEPTION 'Nie możesz nadać sobie roli administratora';
    END IF;
    -- Rola (ministrant ↔ rodzic) w parafii: tylko opiekun. Bez parafii (rejestracja, wybór kodu) — sam.
    IF NEW.role IS DISTINCT FROM OLD.role AND OLD.parish_id IS NOT NULL AND NOT is_parish_admin() THEN
      RAISE EXCEPTION 'Rolę w parafii zmienia opiekun';
    END IF;
    RETURN NEW;
  END IF;

  -- Cudzy profil (RLS: tylko admin tej samej parafii)
  IF NEW.parish_id IS NOT DISTINCT FROM OLD.parish_id
     AND NEW.role IS NOT DISTINCT FROM OLD.role
     AND NEW.is_admin IS NOT DISTINCT FROM OLD.is_admin THEN
    RETURN NEW;
  END IF;
  IF NOT (is_parish_admin() AND OLD.parish_id = my_parish_id()) THEN
    RAISE EXCEPTION 'Brak uprawnień do zmiany parish_id, role lub is_admin';
  END IF;
  IF NEW.parish_id IS DISTINCT FROM OLD.parish_id AND NEW.parish_id IS NOT NULL THEN
    RAISE EXCEPTION 'Nie można przenieść użytkownika do innej parafii';
  END IF;
  RETURN NEW;
END;
$function$;

-- -------------------------------------------------------------
-- 4. schedule_assignments — wypis tylko przed służbą (opiekun / pomocnik bez zmian)
-- -------------------------------------------------------------
DROP POLICY IF EXISTS "schedule_assignments_delete" ON schedule_assignments;
CREATE POLICY "schedule_assignments_delete" ON schedule_assignments
  FOR DELETE USING (
    (
      profile_id = (SELECT auth.uid())
      AND status = 'assigned'
      AND EXISTS (
        SELECT 1 FROM schedules s
         WHERE s.id = schedule_assignments.schedule_id
           AND s.parish_id = (SELECT my_parish_id())
           AND coalesce(s.service_mode, 'signup') = 'signup'
           AND ((s.date + coalesce(s."time", '00:00'::time)) AT TIME ZONE 'Europe/Warsaw') > now()
      )
    )
    OR (
      (SELECT can_manage_services())
      AND EXISTS (
        SELECT 1 FROM schedules s
         WHERE s.id = schedule_assignments.schedule_id AND s.parish_id = (SELECT my_parish_id())
      )
    )
  );

-- -------------------------------------------------------------
-- 5. trg_assignments_protect — nieobecność zgłaszana najpóźniej 30 min przed służbą
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_assignments_protect()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF auth.uid() IS NULL OR current_setting('lso.roles_rpc', true) = 'on' OR current_setting('lso.sys', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF can_manage_services() AND EXISTS (
    SELECT 1 FROM schedules s WHERE s.id = OLD.schedule_id AND s.parish_id = my_parish_id()
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.schedule_id IS DISTINCT FROM OLD.schedule_id
     OR NEW.profile_id IS DISTINCT FROM OLD.profile_id
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.slot_id IS DISTINCT FROM OLD.slot_id
     OR NEW.admin_note IS DISTINCT FROM OLD.admin_note
     OR NEW.recurring_assignment_id IS DISTINCT FROM OLD.recurring_assignment_id THEN
    RAISE EXCEPTION 'Brak uprawnień do zmiany przydziału';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF (OLD.status = 'assigned' AND NEW.status = 'excused' AND EXISTS (   -- zgłoszenie nieobecności (przed oknem meldowania)
             SELECT 1 FROM schedules s WHERE s.id = OLD.schedule_id
               AND ((s.date + coalesce(s."time", '00:00'::time)) AT TIME ZONE 'Europe/Warsaw') - interval '30 minutes' > now()))
       OR (OLD.status = 'excused' AND NEW.status = 'assigned')       -- wycofanie zgłoszenia
       OR (NEW.status = 'present' AND EXISTS (                       -- obecny tylko po zameldowaniu
             SELECT 1 FROM attendance a WHERE a.schedule_id = NEW.schedule_id AND a.profile_id = NEW.profile_id))
       OR (OLD.status = 'assigned' AND NEW.status = 'swapped' AND EXISTS (   -- przyjęta zamiana: proszący oddaje
             SELECT 1 FROM swap_offers o WHERE o.schedule_id = OLD.schedule_id AND o.from_profile_id = OLD.profile_id
               AND o.to_profile_id = auth.uid() AND o.status = 'accepted'))
       OR (OLD.status = 'swapped' AND NEW.status = 'assigned' AND NEW.profile_id = auth.uid() AND EXISTS ( -- przejmujący wraca
             SELECT 1 FROM swap_offers o WHERE o.schedule_id = OLD.schedule_id AND o.to_profile_id = auth.uid()
               AND o.status = 'accepted'))
    THEN
      RETURN NEW;
    END IF;
    IF OLD.status = 'assigned' AND NEW.status = 'excused' THEN
      RAISE EXCEPTION 'Nieobecność można zgłosić najpóźniej 30 minut przed służbą — napisz do opiekuna';
    END IF;
    RAISE EXCEPTION 'Brak uprawnień do zmiany statusu na %', NEW.status;
  END IF;
  RETURN NEW;
END;
$function$;

-- -------------------------------------------------------------
-- 6. Punkty za meldowanie: jeden wiersz na osobę i służbę
-- -------------------------------------------------------------
DO $$
DECLARE v_dups int;
BEGIN
  SELECT count(*) INTO v_dups FROM (
    SELECT 1 FROM points WHERE source = 'checkin' AND schedule_id IS NOT NULL
     GROUP BY profile_id, schedule_id HAVING count(*) > 1) d;
  IF v_dups > 0 THEN
    RAISE EXCEPTION 'Są zdublowane punkty za meldowanie (% par osoba+służba) — najpierw je przejrzyj i scal', v_dups;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS points_one_checkin_per_service
  ON points (profile_id, schedule_id) WHERE source = 'checkin' AND schedule_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.check_in_and_award_points_impl(p_schedule_id uuid, p_profile_id uuid, p_parish_id uuid,
  p_method text DEFAULT 'manual', p_lat double precision DEFAULT NULL, p_lng double precision DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_assignment_id uuid;
  v_assignment_status text;
  s schedules%ROWTYPE;
  v_service_type service_type_enum;
  v_pcat point_categories%ROWTYPE;
  v_pcat_id uuid;
  v_points integer;
  v_reason text := '';
  v_att uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM attendance WHERE schedule_id = p_schedule_id AND profile_id = p_profile_id) THEN
    RETURN jsonb_build_object('already_checked_in', true, 'points_awarded', 0, 'reason', '');
  END IF;

  SELECT * INTO s FROM schedules WHERE id = p_schedule_id;

  SELECT id, status INTO v_assignment_id, v_assignment_status
    FROM schedule_assignments WHERE schedule_id = p_schedule_id AND profile_id = p_profile_id;

  IF s.category = 'msza' THEN
    v_service_type := CASE WHEN v_assignment_id IS NOT NULL THEN 'msza_assigned'::service_type_enum ELSE 'msza_extra'::service_type_enum END;
  ELSIF s.category = 'nabozenstwo' THEN
    v_service_type := 'nabozenstwo'::service_type_enum;
  ELSIF s.category = 'zbiorka' THEN
    v_service_type := 'zbiorka'::service_type_enum;
  END IF;

  INSERT INTO attendance (schedule_id, profile_id, method, checked_at, parish_id, lat, lng, marked_by)
  VALUES (p_schedule_id, p_profile_id, p_method, now(), p_parish_id, NULL, NULL, coalesce(auth.uid(), p_profile_id))
  ON CONFLICT (schedule_id, profile_id) DO NOTHING
  RETURNING id INTO v_att;
  -- równoległe meldowanie (np. telefon + web) zdążyło pierwsze — bez drugich punktów
  IF v_att IS NULL THEN
    RETURN jsonb_build_object('already_checked_in', true, 'points_awarded', 0, 'reason', '');
  END IF;

  IF v_assignment_id IS NOT NULL THEN
    UPDATE schedule_assignments SET status = 'present' WHERE id = v_assignment_id;
  ELSE
    INSERT INTO schedule_assignments (schedule_id, profile_id, role, status)
    VALUES (p_schedule_id, p_profile_id, 'ministrant', 'present')
    ON CONFLICT (schedule_id, profile_id) DO UPDATE SET status = 'present';
  END IF;

  -- kategoria parafii: ustawiona na służbie, inaczej na pozycji rozkładu
  v_pcat_id := coalesce(s.point_category_id, (
    SELECT m.point_category_id FROM mass_slots(s.parish_id, s.date, s.date) m
     WHERE m.slot_time = s."time" AND m.category = s.category AND m.church_id IS NOT DISTINCT FROM s.church_id
     LIMIT 1));
  IF v_pcat_id IS NOT NULL THEN
    SELECT * INTO v_pcat FROM point_categories WHERE id = v_pcat_id AND parish_id = s.parish_id;
  END IF;

  IF v_pcat.id IS NOT NULL THEN
    v_points := v_pcat.points;
    v_reason := v_pcat.name;
  ELSE
    IF v_service_type IS NOT NULL THEN
      SELECT points INTO v_points FROM point_rules WHERE parish_id = p_parish_id AND service_type = v_service_type;
      IF NOT FOUND THEN v_points := 5; END IF;
    ELSE
      v_points := 5;
    END IF;
    v_reason := CASE v_service_type::text
      WHEN 'msza_assigned' THEN 'Msza (dyżur)'
      WHEN 'msza_extra'    THEN 'Msza (dodatkowa)'
      WHEN 'nabozenstwo'   THEN 'Nabożeństwo'
      WHEN 'zbiorka'       THEN 'Zbiórka'
      ELSE 'Służba'
    END;
  END IF;

  IF v_points > 0 THEN
    INSERT INTO points (profile_id, amount, reason, schedule_id, service_type, parish_id, awarded_by, source, point_category_id)
    VALUES (p_profile_id, v_points, v_reason, p_schedule_id, v_service_type, p_parish_id, p_profile_id, 'checkin', v_pcat.id)
    ON CONFLICT (profile_id, schedule_id) WHERE source = 'checkin' AND schedule_id IS NOT NULL DO NOTHING;
  END IF;

  RETURN jsonb_build_object('already_checked_in', false, 'points_awarded', v_points, 'reason', v_reason);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.check_in_and_award_points_impl(uuid, uuid, uuid, text, double precision, double precision)
  FROM PUBLIC, anon, authenticated;

-- -------------------------------------------------------------
-- 7. Indeksy kluczy obcych
-- -------------------------------------------------------------
CREATE INDEX IF NOT EXISTS points_schedule              ON points (schedule_id) WHERE schedule_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS swap_offers_schedule         ON swap_offers (schedule_id);
CREATE INDEX IF NOT EXISTS attendance_reports_schedule  ON attendance_reports (schedule_id) WHERE schedule_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS chat_messages_sender         ON chat_messages (sender_id);
CREATE INDEX IF NOT EXISTS chat_messages_reply_to       ON chat_messages (reply_to_id) WHERE reply_to_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS challenge_completions_profile ON challenge_completions (profile_id);
CREATE INDEX IF NOT EXISTS recurring_commitments_profile ON recurring_commitments (profile_id);

COMMIT;
