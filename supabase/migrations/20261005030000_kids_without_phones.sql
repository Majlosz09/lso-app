-- =============================================================
-- Dzieci bez telefonu (2026-10-05)
--  1. Rodzic za dziecko: sign_up_for_slot / report_attendance z p_for_child, unsign_child.
--  2. Tryb zakrystii (tablet): opiekun melduje dzieci na wspólnym urządzeniu — metoda 'kiosk'
--     (check_in_and_award_points już pozwala opiekunowi zameldować kogoś z parafii).
-- =============================================================

BEGIN;

ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_method_check;
ALTER TABLE attendance ADD CONSTRAINT attendance_method_check CHECK (method IN ('gps', 'qr', 'manual', 'report', 'kiosk'));

DROP FUNCTION IF EXISTS public.sign_up_for_slot(date, text, text, uuid);
CREATE OR REPLACE FUNCTION public.sign_up_for_slot(p_date date, p_time_label text, p_mode text DEFAULT 'once', p_church_id uuid DEFAULT NULL, p_for_child uuid DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_parish   uuid;
  v_time     time;
  v_sched    uuid;
  v_first    uuid;
  v_mode     text;
  v_slot     record;
  v_origin   uuid;
  v_dow      int := extract(dow FROM p_date)::int;
  v_count    int := 0;
  v_cur      date;
  v_end      date;
  v_church   uuid;
BEGIN
  -- rodzic działa za dziecko (dziecko bez telefonu)
  IF p_for_child IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_for_child AND parent_id = auth.uid() AND approved) THEN
      RAISE EXCEPTION 'To konto nie jest połączone z Twoim kontem rodzica';
    END IF;
    v_uid := p_for_child;
  END IF;
  IF (SELECT role FROM profiles WHERE id = v_uid) IS DISTINCT FROM 'member' THEN
    RAISE EXCEPTION 'Brak uprawnień';
  END IF;
  v_parish := CASE WHEN p_for_child IS NULL THEN my_parish_id() ELSE (SELECT parish_id FROM profiles WHERE id = v_uid) END;
  IF v_parish IS NULL THEN RAISE EXCEPTION 'Brak uprawnień'; END IF;
  IF p_date < (now() AT TIME ZONE 'Europe/Warsaw')::date THEN RAISE EXCEPTION 'Ta służba już minęła'; END IF;
  v_time := make_time(split_part(p_time_label, ':', 1)::int, split_part(p_time_label, ':', 2)::int, 0);
  v_church := coalesce((SELECT id FROM churches WHERE id = p_church_id AND parish_id = v_parish), main_church(v_parish));

  SELECT * INTO v_slot FROM mass_slots(v_parish, p_date, p_date) s WHERE s.slot_time = v_time AND s.church_id = v_church
   ORDER BY (s.category = 'msza') DESC LIMIT 1;
  SELECT id, service_mode INTO v_sched, v_mode FROM schedules
   WHERE parish_id = v_parish AND date = p_date AND "time" = v_time AND church_id = v_church
   ORDER BY (category = 'msza') DESC LIMIT 1;

  IF v_sched IS NULL THEN
    IF v_slot.entry_id IS NULL THEN
      RAISE EXCEPTION 'Tej godziny nie ma w rozkładzie';
    END IF;
    v_mode := v_slot.service_mode;
  END IF;
  IF v_mode = 'assigned' THEN
    RAISE EXCEPTION 'Na tę służbę nie ma zapisów — obsadę ustala opiekun';
  ELSIF v_mode = 'none' THEN
    RAISE EXCEPTION 'Na tę służbę nie ma zapisów';
  END IF;
  IF v_sched IS NULL THEN
    v_sched := _slot_schedule(v_parish, p_date, v_time, v_slot.label, v_slot.category, v_slot.service_mode, NULL, v_church);
  END IF;

  IF EXISTS (SELECT 1 FROM schedule_assignments WHERE schedule_id = v_sched AND profile_id = v_uid) THEN
    RAISE EXCEPTION 'Już jesteś zapisany na tę służbę';
  END IF;
  INSERT INTO schedule_assignments (schedule_id, profile_id, role, status)
  VALUES (v_sched, v_uid, 'ministrant', 'assigned');
  v_first := v_sched;
  v_count := 1;

  IF p_mode = 'recurring' THEN
    -- stały zapis pamięta pozycję stałego rozkładu: w okresach idzie za jej zastępczą godziną
    v_origin := v_slot.origin_id;
    IF v_origin IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mass_templates WHERE id = v_origin) THEN
      v_origin := NULL; -- pozycja tylko z okresu — co tydzień o tej samej godzinie
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM recurring_commitments
       WHERE profile_id = v_uid AND (template_id = v_origin OR (day_of_week = v_dow AND time_slot = v_time))
    ) THEN
      INSERT INTO recurring_commitments (profile_id, day_of_week, time_slot, parish_id, template_id)
      VALUES (v_uid, v_dow,
              coalesce((SELECT "time" FROM mass_templates WHERE id = v_origin), v_time),
              v_parish, v_origin);
    END IF;

    v_end := (date_trunc('year', p_date) + interval '1 year' - interval '1 day')::date;
    v_cur := p_date + 7;
    WHILE v_cur <= v_end LOOP
      SELECT * INTO v_slot FROM mass_slots(v_parish, v_cur, v_cur) s
       WHERE (v_origin IS NOT NULL AND s.origin_id = v_origin) OR (v_origin IS NULL AND s.slot_time = v_time AND s.church_id = v_church)
       ORDER BY (s.category = 'msza') DESC LIMIT 1;
      IF FOUND AND v_slot.service_mode = 'signup' THEN
        v_sched := _slot_schedule(v_parish, v_cur, v_slot.slot_time, v_slot.label, v_slot.category, v_slot.service_mode, NULL, v_slot.church_id);
        IF (SELECT service_mode FROM schedules WHERE id = v_sched) = 'signup' THEN
          INSERT INTO schedule_assignments (schedule_id, profile_id, role, status)
          VALUES (v_sched, v_uid, 'ministrant', 'assigned')
          ON CONFLICT (schedule_id, profile_id) DO NOTHING;
          IF FOUND THEN v_count := v_count + 1; END IF;
        END IF;
      END IF;
      v_cur := v_cur + 7;
    END LOOP;
  END IF;

  RETURN json_build_object('schedule_id', v_first, 'count', v_count);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sign_up_for_slot(date, text, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sign_up_for_slot(date, text, text, uuid, uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.report_attendance(date, text, text, text, text, uuid);
CREATE OR REPLACE FUNCTION public.report_attendance(
  p_date     date,
  p_time     text,
  p_title    text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_note     text DEFAULT NULL,
  p_church_id uuid DEFAULT NULL,
  p_for_child uuid DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_parish uuid := my_parish_id();
  v_time   time;
  v_start  timestamptz;
  v_sched  record;
  v_slot   record;
  v_cat    text;
  v_title  text;
  v_sid    uuid;
  v_id     uuid;
  v_name   text;
  v_church uuid;
BEGIN
  -- rodzic działa za dziecko (dziecko bez telefonu)
  IF p_for_child IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_for_child AND parent_id = auth.uid() AND approved) THEN
      RAISE EXCEPTION 'To konto nie jest połączone z Twoim kontem rodzica';
    END IF;
    v_uid := p_for_child;
  END IF;
  IF p_for_child IS NOT NULL THEN v_parish := (SELECT parish_id FROM profiles WHERE id = v_uid); END IF;
  IF v_parish IS NULL OR (SELECT role FROM profiles WHERE id = v_uid) IS DISTINCT FROM 'member' THEN
    RAISE EXCEPTION 'Obecność zgłasza ministrant';
  END IF;
  v_time  := make_time(split_part(p_time, ':', 1)::int, split_part(p_time, ':', 2)::int, 0);
  v_start := (p_date + v_time) AT TIME ZONE 'Europe/Warsaw';
  v_church := coalesce((SELECT id FROM churches WHERE id = p_church_id AND parish_id = v_parish), main_church(v_parish));
  IF now() < v_start - interval '30 minutes' THEN
    RAISE EXCEPTION 'Obecność można zgłosić dopiero od 30 minut przed rozpoczęciem';
  END IF;
  IF now() > v_start + interval '48 hours' THEN
    RAISE EXCEPTION 'Minęło ponad 48 godzin — porozmawiaj z opiekunem';
  END IF;

  SELECT id, title, category, service_mode INTO v_sched FROM schedules
   WHERE parish_id = v_parish AND date = p_date AND "time" = v_time AND church_id = v_church
     AND (p_category IS NULL OR category = p_category)
   ORDER BY (category = 'msza') DESC LIMIT 1;
  IF v_sched.id IS NOT NULL THEN
    IF v_sched.service_mode = 'none' THEN RAISE EXCEPTION 'Na tej służbie nie sprawdzamy obecności'; END IF;
    IF EXISTS (SELECT 1 FROM attendance WHERE schedule_id = v_sched.id AND profile_id = v_uid) THEN
      RAISE EXCEPTION 'Obecność na tej służbie jest już zapisana';
    END IF;
    v_sid := v_sched.id; v_cat := v_sched.category; v_title := v_sched.title;
  ELSE
    SELECT * INTO v_slot FROM mass_slots(v_parish, p_date, p_date) s
     WHERE s.slot_time = v_time AND s.church_id = v_church AND (p_category IS NULL OR s.category = p_category)
     ORDER BY (s.category = 'msza') DESC LIMIT 1;
    IF FOUND THEN
      IF v_slot.service_mode = 'none' THEN RAISE EXCEPTION 'Na tej służbie nie sprawdzamy obecności'; END IF;
      v_cat := v_slot.category; v_title := slot_title(v_slot.label, v_slot.category);
    ELSE
      IF nullif(btrim(p_title), '') IS NULL THEN RAISE EXCEPTION 'Napisz, na czym byłeś'; END IF;
      v_cat := coalesce(p_category, 'nabozenstwo'); v_title := left(btrim(p_title), 80);
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM attendance_reports WHERE profile_id = v_uid AND service_date = p_date
               AND service_time = v_time AND status <> 'rejected') THEN
    RAISE EXCEPTION 'To zgłoszenie już czeka na opiekuna';
  END IF;

  INSERT INTO attendance_reports (parish_id, profile_id, schedule_id, service_date, service_time, category, title, note, church_id)
  VALUES (v_parish, v_uid, v_sid, p_date, v_time, v_cat, v_title, nullif(left(btrim(p_note), 300), ''), v_church)
  RETURNING id INTO v_id;

  SELECT full_name INTO v_name FROM profiles WHERE id = v_uid;
  PERFORM add_notification_admins(v_parish, 'attendance_report', 'Zgłoszenie obecności',
    v_name || ' · ' || v_title || ' ' || to_char(p_date, 'DD.MM') || ' ' || to_char(v_time, 'HH24:MI'),
    jsonb_build_object('report_id', v_id));
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.report_attendance(date, text, text, text, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_attendance(date, text, text, text, text, uuid, uuid) TO authenticated;

-- Rodzic wypisuje dziecko (zapis z aplikacji, przed służbą)
CREATE OR REPLACE FUNCTION public.unsign_child(p_assignment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a record;
BEGIN
  SELECT sa.id, sa.status, sa.profile_id, s.date, s."time", s.service_mode INTO a
    FROM schedule_assignments sa JOIN schedules s ON s.id = sa.schedule_id
   WHERE sa.id = p_assignment_id;
  IF a.id IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = a.profile_id AND parent_id = auth.uid()) THEN
    RAISE EXCEPTION 'Nie znaleziono zapisu dziecka';
  END IF;
  IF a.status <> 'assigned' OR a.service_mode <> 'signup' THEN
    RAISE EXCEPTION 'Tego dyżuru nie można wypisać — zgłoś nieobecność';
  END IF;
  IF (a.date + a."time") AT TIME ZONE 'Europe/Warsaw' < now() + interval '30 minutes' THEN
    RAISE EXCEPTION 'Za późno na wypisanie — zgłoś nieobecność';
  END IF;
  DELETE FROM schedule_assignments WHERE id = p_assignment_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.unsign_child(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unsign_child(uuid) TO authenticated;

COMMIT;
