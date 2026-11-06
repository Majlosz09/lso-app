-- =============================================================
-- Stały dyżur = jedna rzecz (2026-11-06)
--
-- Błąd: zapis „co tydzień” ministranta tworzył zapisy na każdy tydzień do końca roku, ale bez powiązania
-- z cyklem (osobna tabela recurring_commitments). „Wypisz z całego cyklu” usuwało tylko klikniętą służbę
-- i sam cykl — reszta tygodni zostawała. Rodzic w ogóle nie mógł zatrzymać cyklu dziecka, a opiekun
-- nie widział takich zapisów w „Stałych dyżurach” (pomocnik nie widział ich nawet w auto-grafiku).
--
--  1. sign_up_for_slot('recurring') tworzy wiersz recurring_assignments (jak „Stałe dyżury” opiekuna)
--     i każdy tygodniowy zapis dostaje recurring_assignment_id.
--  2. assignment_cycle(): czy zapis należy do stałego dyżuru i czy można go zakończyć.
--  3. leave_recurring(): ministrant / rodzic / opiekun kończy cały cykl — wszystkie przyszłe zapisy.
--     Ministrant i rodzic mogą zakończyć tylko cykl, który ustawili sami; dyżur od opiekuna zmienia opiekun.
--  4. cancel_recurring_assignments(): nie kasuje dzisiejszych służb, które już się zaczęły.
--  5. Przeniesienie istniejących recurring_commitments do recurring_assignments z powiązaniem
--     przyszłych zapisów; tabela recurring_commitments zostaje pusta (stare wersje apki jej szukają).
-- =============================================================

BEGIN;

-- ── 1. Zapis na służbę (jednorazowo / co tydzień) ──────────────
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
  v_rule     uuid;
  v_rule_t   time;
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

  IF p_mode = 'recurring' THEN
    -- stały zapis pamięta pozycję stałego rozkładu: w okresach idzie za jej zastępczą godziną
    -- (tylko tej samej kategorii — Msza nie przechodzi na różaniec)
    v_origin := v_slot.origin_id;
    v_cat := coalesce(v_slot.category, (SELECT category FROM schedules WHERE id = v_sched), 'msza');
    IF v_origin IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mass_templates WHERE id = v_origin AND category = v_cat) THEN
      v_origin := NULL; -- pozycja tylko z okresu — co tydzień o tej samej godzinie
    END IF;
    v_rule_t := coalesce((SELECT "time" FROM mass_templates WHERE id = v_origin), v_time);
    v_end := (date_trunc('year', p_date) + interval '1 year' - interval '1 day')::date;

    -- ten sam stały zapis (własny albo od rodzica) — dopinamy do niego; dyżurów od opiekuna nie ruszamy
    SELECT id INTO v_rule FROM recurring_assignments
     WHERE profile_id = v_uid AND parish_id = v_parish AND day_of_week = v_dow AND "time" = v_rule_t
       AND end_date >= p_date AND start_date <= p_date
       AND created_by IN (v_uid, auth.uid())
     LIMIT 1;
    IF v_rule IS NULL THEN
      INSERT INTO recurring_assignments (parish_id, profile_id, day_of_week, "time", start_date, end_date, created_by)
      VALUES (v_parish, v_uid, v_dow, v_rule_t, p_date, v_end, auth.uid())
      RETURNING id INTO v_rule;
    END IF;
  END IF;

  INSERT INTO schedule_assignments (schedule_id, profile_id, role, status, recurring_assignment_id)
  VALUES (v_sched, v_uid, 'ministrant', 'assigned', v_rule);
  v_first := v_sched;
  v_count := 1;

  IF p_mode = 'recurring' THEN
    -- kolejne tygodnie bez osobnego powiadomienia o każdej służbie
    PERFORM set_config('lso.bulk', 'on', true);
    v_cur := p_date + 7;
    WHILE v_cur <= v_end LOOP
      SELECT * INTO v_slot FROM _recurring_slot(v_parish, v_cur, v_origin, v_time, v_church, v_cat);
      IF v_slot.kind IN ('ok', 'moved') AND v_slot.service_mode = 'signup' THEN
        v_sched := _slot_schedule(v_parish, v_cur, v_slot.slot_time, v_slot.label, v_slot.category, v_slot.service_mode, NULL, v_slot.church_id);
        IF (SELECT service_mode FROM schedules WHERE id = v_sched) = 'signup' THEN
          INSERT INTO schedule_assignments (schedule_id, profile_id, role, status, recurring_assignment_id)
          VALUES (v_sched, v_uid, 'ministrant', 'assigned', v_rule)
          ON CONFLICT (schedule_id, profile_id) DO NOTHING;
          IF FOUND THEN v_count := v_count + 1; END IF;
        END IF;
      END IF;
      v_cur := v_cur + 7;
    END LOOP;
    PERFORM set_config('lso.bulk', 'off', true);
  END IF;

  RETURN json_build_object('schedule_id', v_first, 'count', v_count, 'rule_id', v_rule);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sign_up_for_slot(date, text, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sign_up_for_slot(date, text, text, uuid, uuid) TO authenticated;

-- ── 2./3. Stały dyżur przy wypisie ─────────────────────────────
-- Kto może zakończyć cykl tego zapisu: opiekun/pomocnik parafii zawsze; ministrant albo jego rodzic —
-- gdy cykl ustawili sami (nie opiekun).
CREATE OR REPLACE FUNCTION public._cycle_access(p_assignment_id uuid)
RETURNS TABLE (rule_id uuid, profile_id uuid, is_mine boolean, can_leave boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a        record;
  r        recurring_assignments%ROWTYPE;
  v_parent uuid;
  v_mine   boolean;
  v_admin  boolean;
BEGIN
  SELECT sa.id, sa.profile_id, sa.recurring_assignment_id, s.parish_id INTO a
    FROM schedule_assignments sa JOIN schedules s ON s.id = sa.schedule_id
   WHERE sa.id = p_assignment_id;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Nie znaleziono zapisu'; END IF;
  SELECT parent_id INTO v_parent FROM profiles WHERE id = a.profile_id;
  v_mine := a.profile_id = auth.uid() OR (v_parent IS NOT NULL AND v_parent = auth.uid());
  v_admin := can_manage_services() AND a.parish_id = my_parish_id();
  IF NOT v_mine AND NOT v_admin THEN RAISE EXCEPTION 'Nie znaleziono zapisu'; END IF;
  IF a.recurring_assignment_id IS NOT NULL THEN
    SELECT * INTO r FROM recurring_assignments WHERE id = a.recurring_assignment_id;
  END IF;
  RETURN QUERY SELECT r.id, a.profile_id, v_mine,
    coalesce(r.id IS NOT NULL AND (v_admin OR (v_mine AND (r.created_by = a.profile_id OR r.created_by = v_parent))), false);
END;
$$;
REVOKE EXECUTE ON FUNCTION public._cycle_access(uuid) FROM PUBLIC, anon, authenticated;

-- Informacja do okna „Wypisać się?”: NULL = zwykła służba
CREATE OR REPLACE FUNCTION public.assignment_cycle(p_assignment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c record;
  r recurring_assignments%ROWTYPE;
BEGIN
  SELECT * INTO c FROM _cycle_access(p_assignment_id);
  IF c.rule_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO r FROM recurring_assignments WHERE id = c.rule_id;
  RETURN jsonb_build_object(
    'rule_id', r.id,
    'day_of_week', r.day_of_week,
    'time', to_char(r."time", 'HH24:MI'),
    'end_date', r.end_date,
    'can_leave', c.can_leave,
    'future', (SELECT count(*) FROM schedule_assignments sa JOIN schedules s ON s.id = sa.schedule_id
                WHERE sa.recurring_assignment_id = r.id AND sa.status IN ('assigned', 'excused')
                  AND ((s.date + coalesce(s."time", '00:00'::time)) AT TIME ZONE 'Europe/Warsaw') > now())
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.assignment_cycle(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assignment_cycle(uuid) TO authenticated;

-- Zakończenie całego cyklu: wszystkie przyszłe zapisy z niego + sam stały dyżur (historia zostaje)
CREATE OR REPLACE FUNCTION public.leave_recurring(p_assignment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c       record;
  v_count int;
BEGIN
  SELECT * INTO c FROM _cycle_access(p_assignment_id);
  IF c.rule_id IS NULL THEN RAISE EXCEPTION 'Ta służba nie jest częścią stałego dyżuru'; END IF;
  IF NOT c.can_leave THEN
    RAISE EXCEPTION 'Ten stały dyżur ustawił opiekun — poproś go o zmianę albo wypisz się z pojedynczej służby';
  END IF;

  PERFORM set_config('lso.sys', 'on', true);
  DELETE FROM schedule_assignments sa
   USING schedules s
   WHERE s.id = sa.schedule_id
     AND sa.recurring_assignment_id = c.rule_id
     AND sa.status IN ('assigned', 'excused')
     AND ((s.date + coalesce(s."time", '00:00'::time)) AT TIME ZONE 'Europe/Warsaw') > now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  DELETE FROM recurring_assignments WHERE id = c.rule_id;
  PERFORM set_config('lso.sys', 'off', true);

  RETURN jsonb_build_object('removed_assignments', v_count);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.leave_recurring(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_recurring(uuid) TO authenticated;

-- ── 4. Cofnięcie stałych dyżurów przez opiekuna ────────────────
CREATE OR REPLACE FUNCTION public.cancel_recurring_assignments(p_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_parish uuid := my_parish_id();
  v_count  int;
BEGIN
  IF NOT can_manage_services() OR v_parish IS NULL THEN
    RAISE EXCEPTION 'Tylko administrator parafii może cofać stałe dyżury';
  END IF;
  IF EXISTS (SELECT 1 FROM recurring_assignments WHERE id = ANY(p_ids) AND parish_id <> v_parish) THEN
    RAISE EXCEPTION 'Brak uprawnień';
  END IF;

  DELETE FROM schedule_assignments sa
   USING schedules s
   WHERE s.id = sa.schedule_id
     AND sa.recurring_assignment_id = ANY(p_ids)
     AND ((s.date + coalesce(s."time", '00:00'::time)) AT TIME ZONE 'Europe/Warsaw') > now()
     AND sa.status IN ('assigned', 'excused');
  GET DIAGNOSTICS v_count = ROW_COUNT;

  DELETE FROM recurring_assignments WHERE id = ANY(p_ids) AND parish_id = v_parish;

  RETURN jsonb_build_object('removed_assignments', v_count);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cancel_recurring_assignments(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_recurring_assignments(uuid[]) TO authenticated;

-- ── 5. Przeniesienie starych zapisów „co tydzień” ──────────────
DO $$
DECLARE
  c        record;
  v_parish uuid;
  v_today  date := (now() AT TIME ZONE 'Europe/Warsaw')::date;
  v_ids    uuid[];
  v_from   date;
  v_to     date;
  v_rule   uuid;
BEGIN
  PERFORM set_config('lso.sys', 'on', true);
  FOR c IN SELECT rc.*, p.parish_id AS profile_parish FROM recurring_commitments rc
             JOIN profiles p ON p.id = rc.profile_id LOOP
    v_parish := coalesce(c.profile_parish, c.parish_id);
    CONTINUE WHEN v_parish IS NULL OR c.time_slot IS NULL OR c.day_of_week IS NULL;

    -- przyszłe zapisy tej osoby, które wypadają na ten tygodniowy termin
    SELECT array_agg(sa.id), min(s.date), max(s.date) INTO v_ids, v_from, v_to
      FROM schedule_assignments sa JOIN schedules s ON s.id = sa.schedule_id
     WHERE sa.profile_id = c.profile_id AND s.parish_id = v_parish
       AND sa.recurring_assignment_id IS NULL
       AND sa.status IN ('assigned', 'excused')
       AND s.date >= v_today
       AND extract(dow FROM s.date)::int = c.day_of_week
       AND s."time" = (SELECT x.slot_time FROM _recurring_slot(v_parish, s.date, c.template_id, c.time_slot, NULL, coalesce(s.category, 'msza')) x);

    v_from := coalesce(v_from, v_today);
    v_to := least(greatest(coalesce(v_to, (date_trunc('year', v_today) + interval '1 year' - interval '1 day')::date), v_from), v_from + 400);
    INSERT INTO recurring_assignments (parish_id, profile_id, day_of_week, "time", start_date, end_date, created_by)
    VALUES (v_parish, c.profile_id, c.day_of_week, c.time_slot, v_from, v_to, c.profile_id)
    RETURNING id INTO v_rule;
    IF v_ids IS NOT NULL THEN
      UPDATE schedule_assignments SET recurring_assignment_id = v_rule WHERE id = ANY(v_ids);
    END IF;
  END LOOP;
  DELETE FROM recurring_commitments;
  PERFORM set_config('lso.sys', 'off', true);
END $$;

COMMIT;
