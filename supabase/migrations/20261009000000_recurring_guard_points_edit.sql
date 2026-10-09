-- =============================================================
-- Stały dyżur w okresach + korekta punktów za obecność (2026-10-09)
--
--  1. _recurring_slot(): wspólna reguła „gdzie wypada stały dyżur / stały zapis tego dnia”.
--     Pozycja okresu powiązana z pozycją stałą (base_template_id) liczy się tylko, gdy ma
--     tę samą kategorię — np. w październiku 17:30 Msza → 17:30 Różaniec: dyżur na Mszę
--     NIE trafia na różaniec (wcześniej trafiał i tworzył służbę o 17:30).
--     Zastępcza godzina tej samej Mszy (17:30 → 17:00) dalej działa.
--     Gdy powiązania brak: ta sama godzina, kategoria i kościół. Inaczej dzień pominięty.
--  2. preview_recurring_assignments(): podgląd dat przed zapisaniem stałego dyżuru.
--  3. create_recurring_assignments / sign_up_for_slot (zapis „co tydzień”) korzystają z (1).
--  4. set_attendance_points(): opiekun zmienia liczbę punktów za zaznaczoną obecność.
-- =============================================================

BEGIN;

-- ── 1. Reguła dopasowania ─────────────────────────────────────
-- p_tpl = pozycja stałego rozkładu; NULL = ta sama godzina co tydzień (p_time, p_category;
-- dla Mszy spoza rozkładu wynik 'extra' = służbę trzeba utworzyć)
CREATE OR REPLACE FUNCTION public._recurring_slot(p_parish uuid, p_date date, p_tpl uuid, p_time time,
                                                  p_church uuid DEFAULT NULL, p_category text DEFAULT 'msza')
RETURNS TABLE (slot_time time, label text, category text, service_mode text, church_id uuid, period_id uuid, kind text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t mass_templates%ROWTYPE;
  s record;
BEGIN
  IF p_tpl IS NOT NULL THEN
    SELECT * INTO t FROM mass_templates WHERE id = p_tpl AND parish_id = p_parish;
  END IF;

  IF t.id IS NOT NULL THEN
    -- ta sama pozycja (także przeniesiona w okresie na inną godzinę), ale tylko tej samej kategorii
    SELECT * INTO s FROM mass_slots(p_parish, p_date, p_date) m
     WHERE m.origin_id = t.id AND m.category = t.category
     LIMIT 1;
    IF NOT FOUND THEN
      -- pozycja okresu bez powiązania: ta sama godzina, kategoria i kościół
      SELECT * INTO s FROM mass_slots(p_parish, p_date, p_date) m
       WHERE m.slot_time = t."time" AND m.category = t.category AND m.church_id = t.church_id
       LIMIT 1;
    END IF;
    IF NOT FOUND OR s.service_mode = 'none' THEN
      SELECT m.period_id INTO s FROM mass_slots(p_parish, p_date, p_date) m WHERE m.period_id IS NOT NULL LIMIT 1;
      RETURN QUERY SELECT t."time", NULL::text, t.category, NULL::text, t.church_id, s.period_id, 'skipped'::text;
      RETURN;
    END IF;
    RETURN QUERY SELECT s.slot_time, s.label, s.category, s.service_mode, s.church_id, s.period_id,
                        CASE WHEN s.slot_time = t."time" THEN 'ok' ELSE 'moved' END;
    RETURN;
  END IF;

  -- ta sama godzina co tydzień; o tej porze jest coś innego (np. różaniec zamiast Mszy) → dzień pominięty
  SELECT * INTO s FROM mass_slots(p_parish, p_date, p_date) m
   WHERE m.slot_time = p_time AND m.church_id = coalesce(p_church, main_church(p_parish))
   ORDER BY (m.category = p_category) DESC
   LIMIT 1;
  IF FOUND AND (s.category <> p_category OR s.service_mode = 'none') THEN
    RETURN QUERY SELECT p_time, NULL::text, p_category, NULL::text, s.church_id, s.period_id, 'skipped'::text;
    RETURN;
  END IF;
  IF FOUND THEN
    RETURN QUERY SELECT s.slot_time, s.label, s.category, s.service_mode, s.church_id, s.period_id, 'ok'::text;
    RETURN;
  END IF;
  RETURN QUERY SELECT p_time, NULL::text, p_category, NULL::text, coalesce(p_church, main_church(p_parish)),
                      NULL::uuid, CASE WHEN p_category = 'msza' THEN 'extra' ELSE 'skipped' END;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._recurring_slot(uuid, date, uuid, time, uuid, text) FROM PUBLIC, anon, authenticated;

-- pozycja stałego rozkładu dla „dzień + godzina” (Msza przed nabożeństwem)
CREATE OR REPLACE FUNCTION public._recurring_template(p_parish uuid, p_day_of_week int, p_time time)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM mass_templates
   WHERE parish_id = p_parish AND day_of_week = p_day_of_week AND "time" = p_time
   ORDER BY (category = 'msza') DESC, (church_id = main_church(p_parish)) DESC
   LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public._recurring_template(uuid, int, time) FROM PUBLIC, anon, authenticated;

-- ── 2. Podgląd ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.preview_recurring_assignments(p_day_of_week integer, p_time time, p_start date, p_end date)
RETURNS TABLE (day date, slot_time text, title text, kind text, period_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_parish uuid := my_parish_id();
  v_tpl    uuid;
  v_date   date;
  r        record;
BEGIN
  IF NOT can_manage_services() OR v_parish IS NULL THEN
    RAISE EXCEPTION 'Tylko opiekun parafii może ustawiać stałe dyżury';
  END IF;
  IF p_day_of_week NOT BETWEEN 0 AND 6 OR p_start IS NULL OR p_end IS NULL OR p_end < p_start OR p_end > p_start + 400 THEN
    RAISE EXCEPTION 'Nieprawidłowy zakres';
  END IF;
  v_tpl := _recurring_template(v_parish, p_day_of_week, p_time);
  v_date := p_start + ((p_day_of_week - extract(dow FROM p_start)::int + 7) % 7);
  WHILE v_date <= p_end LOOP
    SELECT * INTO r FROM _recurring_slot(v_parish, v_date, v_tpl, p_time);
    day := v_date;
    slot_time := to_char(r.slot_time, 'HH24:MI');
    title := CASE WHEN r.kind = 'skipped' THEN NULL ELSE slot_title(r.label, r.category) END;
    kind := r.kind;
    period_name := (SELECT name FROM mass_periods WHERE id = r.period_id);
    RETURN NEXT;
    v_date := v_date + 7;
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.preview_recurring_assignments(integer, time, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_recurring_assignments(integer, time, date, date) TO authenticated;

-- ── 3a. Stały dyżur (opiekun) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_recurring_assignments(p_profile_ids uuid[], p_day_of_week integer, p_time time, p_start date, p_end date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_parish   uuid := my_parish_id();
  v_pid      uuid;
  v_rule     uuid;
  v_date     date;
  v_schedule uuid;
  v_tpl      uuid;
  v_slot     record;
  v_rules    int := 0;
  v_count    int := 0;
  v_skipped  int := 0;
  v_rows     int;
  v_days     text[] := array['niedzielę', 'poniedziałek', 'wtorek', 'środę', 'czwartek', 'piątek', 'sobotę'];
  v_token    text;
  v_name     text;
  v_parent   uuid;
  v_p_token  text;
  v_msg      text;
BEGIN
  IF NOT can_manage_services() OR v_parish IS NULL THEN
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

  v_tpl := _recurring_template(v_parish, p_day_of_week, p_time);

  FOREACH v_pid IN ARRAY p_profile_ids LOOP
    INSERT INTO recurring_assignments (parish_id, profile_id, day_of_week, "time", start_date, end_date, created_by)
    VALUES (v_parish, v_pid, p_day_of_week, p_time, p_start, p_end, v_uid)
    RETURNING id INTO v_rule;
    v_rules := v_rules + 1;

    v_date := p_start + ((p_day_of_week - extract(dow FROM p_start)::int + 7) % 7);
    WHILE v_date <= p_end LOOP
      v_schedule := NULL;
      SELECT * INTO v_slot FROM _recurring_slot(v_parish, v_date, v_tpl, p_time);
      IF v_slot.kind = 'extra' THEN
        -- godzina spoza rozkładu (jak dotychczas)
        SELECT id INTO v_schedule FROM schedules
         WHERE parish_id = v_parish AND date = v_date AND "time" = p_time AND category = 'msza'
           AND church_id = v_slot.church_id
         LIMIT 1;
        IF v_schedule IS NULL THEN
          INSERT INTO schedules (title, date, "time", location, gps_radius, parish_id, category, created_by, church_id)
          VALUES ('Msza Święta', v_date, p_time, '', 100, v_parish, 'msza', v_uid, v_slot.church_id)
          RETURNING id INTO v_schedule;
        END IF;
      ELSIF v_slot.kind IN ('ok', 'moved') THEN
        v_schedule := _slot_schedule(v_parish, v_date, v_slot.slot_time, v_slot.label, v_slot.category, v_slot.service_mode, v_uid, v_slot.church_id);
      ELSIF v_rules = 1 THEN
        v_skipped := v_skipped + 1;
      END IF;

      IF v_schedule IS NOT NULL THEN
        INSERT INTO schedule_assignments (schedule_id, profile_id, role, status, recurring_assignment_id)
        VALUES (v_schedule, v_pid, 'ministrant', 'assigned', v_rule)
        ON CONFLICT (schedule_id, profile_id) DO NOTHING;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_count := v_count + v_rows;
      END IF;

      v_date := v_date + 7;
    END LOOP;

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

  RETURN jsonb_build_object('rules', v_rules, 'assignments', v_count, 'skipped_days', v_skipped);
END;
$$;

-- ── 3b. Zapis „co tydzień” (ministrant / rodzic za dziecko) ───
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
  v_cat      text;
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
    -- (tylko tej samej kategorii — Msza nie przechodzi na różaniec)
    v_origin := v_slot.origin_id;
    v_cat := coalesce(v_slot.category, (SELECT category FROM schedules WHERE id = v_first), 'msza');
    IF v_origin IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mass_templates WHERE id = v_origin AND category = v_cat) THEN
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
      SELECT * INTO v_slot FROM _recurring_slot(v_parish, v_cur, v_origin, v_time, v_church, v_cat);
      IF v_slot.kind IN ('ok', 'moved') AND v_slot.service_mode = 'signup' THEN
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

-- ── 4. Korekta punktów za obecność ────────────────────────────
-- Punkty za obecność = wiersze points(source 'checkin') tej osoby na tej służbie.
-- Ustawia jedną wartość (0 = bez punktów, obecność zostaje).
CREATE OR REPLACE FUNCTION public.set_attendance_points(p_schedule_id uuid, p_profile_id uuid, p_amount integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_parish uuid := my_parish_id();
  s        schedules%ROWTYPE;
  v_keep   uuid;
  v_reason text;
BEGIN
  IF NOT is_parish_admin() OR v_parish IS NULL THEN
    RAISE EXCEPTION 'Punkty za obecność zmienia opiekun parafii';
  END IF;
  IF p_amount IS NULL OR p_amount NOT BETWEEN -100 AND 500 THEN
    RAISE EXCEPTION 'Liczba punktów musi być między -100 a 500';
  END IF;
  SELECT * INTO s FROM schedules WHERE id = p_schedule_id AND parish_id = v_parish;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Nie znaleziono służby'; END IF;
  IF NOT EXISTS (SELECT 1 FROM attendance WHERE schedule_id = p_schedule_id AND profile_id = p_profile_id) THEN
    RAISE EXCEPTION 'Najpierw zaznacz obecność';
  END IF;

  SELECT id, reason INTO v_keep, v_reason FROM points
   WHERE source = 'checkin' AND schedule_id = p_schedule_id AND profile_id = p_profile_id
   ORDER BY created_at LIMIT 1;
  DELETE FROM points
   WHERE source = 'checkin' AND schedule_id = p_schedule_id AND profile_id = p_profile_id
     AND (p_amount = 0 OR id IS DISTINCT FROM v_keep);

  IF p_amount <> 0 THEN
    IF v_keep IS NOT NULL THEN
      UPDATE points SET amount = p_amount WHERE id = v_keep;
    ELSE
      INSERT INTO points (profile_id, amount, reason, schedule_id, parish_id, awarded_by, source)
      VALUES (p_profile_id, p_amount, slot_title(NULL, s.category), p_schedule_id, v_parish, auth.uid(), 'checkin');
    END IF;
  END IF;
  RETURN p_amount;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_attendance_points(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_attendance_points(uuid, uuid, integer) TO authenticated;

COMMIT;
