-- =============================================================
-- Rozkład Mszy: zmiany okresowe + tryb służby (2026-10-04)
-- Projekt: docs/redesign/2026-10-04-rozklad-okresowy.md. Najpierw LSO-dev.
--
--  1. Tryb służby (service_mode) na pozycjach rozkładu i na służbach:
--     signup (zapisy + obecność + punkty) | assigned (obsada od opiekuna; obecność + punkty) | none (bez obecności i punktów).
--  2. Pozycje rozkładu mają kategorię (msza / nabozenstwo) — np. różaniec w rozkładzie.
--  3. Okresy (mass_periods + mass_period_entries) zastępują stały rozkład w wybrane dni zakresu dat.
--     OSOBNE tabele: aplikacja 1.1 czyta mass_templates bezpośrednio.
--  4. mass_slots() — obowiązujący rozkład (ta sama logika co lib/massSchedule.ts).
--  5. save_rozklad() — zapis stałego rozkładu / okresu z podglądem skutków (dry run)
--     i przeniesieniem / odwołaniem zapisów na godzinach, które znikają.
--  6. sign_up_for_slot bez obejścia 17:00/17:30 (miesiące 5, 6, 10) — stały zapis idzie za pozycją rozkładu.
--     UWAGA rollout na prod: parafia, która na tym polegała, potrzebuje okresów maj/czerwiec/październik.
--  7. materialize_slot() — służba z rozkładu bez zapisu (meldowanie „bez zapisu”).
--  8. check_in_and_award_points: odmowa dla trybu none.
--  9. generate_schedules_from_templates i create_recurring_assignments liczą z mass_slots.
-- =============================================================

BEGIN;

-- ── 1–2. Kolumny ─────────────────────────────────────────────
ALTER TABLE mass_templates ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'msza';
ALTER TABLE mass_templates ADD COLUMN IF NOT EXISTS service_mode text NOT NULL DEFAULT 'signup';
DO $$ BEGIN
  ALTER TABLE mass_templates ADD CONSTRAINT mass_templates_category_check CHECK (category IN ('msza', 'nabozenstwo'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE mass_templates ADD CONSTRAINT mass_templates_service_mode_check CHECK (service_mode IN ('signup', 'assigned', 'none'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- dotychczas niedziele obsadzał grafik parafii
UPDATE mass_templates SET service_mode = 'assigned' WHERE day_of_week = 0 AND service_mode = 'signup';

ALTER TABLE schedules ADD COLUMN IF NOT EXISTS service_mode text;
UPDATE schedules SET service_mode = CASE
    WHEN category <> 'msza' OR extract(dow FROM date) = 0 THEN 'assigned'
    ELSE 'signup' END
 WHERE service_mode IS NULL;
DO $$ BEGIN
  ALTER TABLE schedules ADD CONSTRAINT schedules_service_mode_check CHECK (service_mode IN ('signup', 'assigned', 'none'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE recurring_commitments ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES mass_templates(id) ON DELETE SET NULL;

-- ── 3. Okresy ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mass_periods (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parish_id     uuid NOT NULL REFERENCES parishes(id) ON DELETE CASCADE,
  name          text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  date_from     date NOT NULL,
  date_to       date NOT NULL,
  repeat_yearly boolean NOT NULL DEFAULT false,
  days_of_week  smallint[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
  created_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (date_to >= date_from),
  CHECK (NOT repeat_yearly OR date_to < date_from + 366),
  CHECK (cardinality(days_of_week) >= 1 AND days_of_week <@ '{0,1,2,3,4,5,6}'::smallint[])
);
CREATE INDEX IF NOT EXISTS mass_periods_parish ON mass_periods (parish_id);

CREATE TABLE IF NOT EXISTS mass_period_entries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id        uuid NOT NULL REFERENCES mass_periods(id) ON DELETE CASCADE,
  parish_id        uuid NOT NULL REFERENCES parishes(id) ON DELETE CASCADE,
  day_of_week      smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  "time"           time NOT NULL,
  label            text,
  category         text NOT NULL DEFAULT 'msza' CHECK (category IN ('msza', 'nabozenstwo')),
  service_mode     text NOT NULL DEFAULT 'signup' CHECK (service_mode IN ('signup', 'assigned', 'none')),
  base_template_id uuid REFERENCES mass_templates(id) ON DELETE SET NULL,
  UNIQUE (period_id, day_of_week, "time")
);
CREATE INDEX IF NOT EXISTS mass_period_entries_parish ON mass_period_entries (parish_id);

ALTER TABLE mass_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE mass_period_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mass_periods_select" ON mass_periods;
CREATE POLICY "mass_periods_select" ON mass_periods FOR SELECT USING (parish_id = (SELECT my_parish_id()));
DROP POLICY IF EXISTS "mass_period_entries_select" ON mass_period_entries;
CREATE POLICY "mass_period_entries_select" ON mass_period_entries FOR SELECT USING (parish_id = (SELECT my_parish_id()));
-- zapis wyłącznie przez save_rozklad()
GRANT SELECT ON mass_periods, mass_period_entries TO authenticated;

-- ── 4. Obowiązujący rozkład ──────────────────────────────────
-- Okres obejmuje dzień, jeśli dzień tygodnia pasuje i data jest w zakresie (co roku: porównanie MM-DD,
-- także przez Nowy Rok). Kilka okresów: krótszy wygrywa, przy równej długości nowszy.
CREATE OR REPLACE FUNCTION public.mass_slots(p_parish uuid, p_from date, p_to date)
RETURNS TABLE (slot_date date, slot_time time, label text, category text, service_mode text,
               entry_id uuid, origin_id uuid, period_id uuid)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH days AS (
    SELECT d::date AS d, extract(dow FROM d)::int AS dow
      FROM generate_series(p_from, p_to, interval '1 day') d
  ), act AS (
    SELECT days.d, days.dow, (
      SELECT p.id FROM mass_periods p
       WHERE p.parish_id = p_parish
         AND days.dow = ANY (p.days_of_week)
         AND CASE
               WHEN NOT p.repeat_yearly THEN days.d BETWEEN p.date_from AND p.date_to
               WHEN to_char(p.date_from, 'MMDD') <= to_char(p.date_to, 'MMDD')
                 THEN to_char(days.d, 'MMDD') BETWEEN to_char(p.date_from, 'MMDD') AND to_char(p.date_to, 'MMDD')
               ELSE to_char(days.d, 'MMDD') >= to_char(p.date_from, 'MMDD') OR to_char(days.d, 'MMDD') <= to_char(p.date_to, 'MMDD')
             END
       ORDER BY (p.date_to - p.date_from), p.created_at DESC
       LIMIT 1
    ) AS pid
    FROM days
  )
  SELECT a.d, e."time", e.label, e.category, e.service_mode, e.id, coalesce(e.base_template_id, e.id), a.pid
    FROM act a JOIN mass_period_entries e ON e.period_id = a.pid AND e.day_of_week = a.dow
  UNION ALL
  SELECT a.d, t."time", t.label, t.category, t.service_mode, t.id, t.id, NULL::uuid
    FROM act a JOIN mass_templates t ON t.parish_id = p_parish AND t.day_of_week = a.dow
   WHERE a.pid IS NULL
  ORDER BY 1, 2
$$;
REVOKE EXECUTE ON FUNCTION public.mass_slots(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mass_slots(uuid, date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.slot_title(p_label text, p_category text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(nullif(btrim(p_label), ''), CASE WHEN p_category = 'nabozenstwo' THEN 'Nabożeństwo' ELSE 'Msza Święta' END)
$$;

-- Nowa służba bez podanego trybu: tryb pozycji rozkładu o tej porze, inaczej Msza = zapisy, reszta = grafik
CREATE OR REPLACE FUNCTION trg_schedules_service_mode()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.service_mode IS NULL THEN
    SELECT s.service_mode INTO NEW.service_mode
      FROM mass_slots(NEW.parish_id, NEW.date, NEW.date) s
     WHERE s.slot_time = NEW."time" AND s.category = coalesce(NEW.category, 'msza')
     LIMIT 1;
    NEW.service_mode := coalesce(NEW.service_mode,
      CASE WHEN coalesce(NEW.category, 'msza') = 'msza' AND extract(dow FROM NEW.date) <> 0 THEN 'signup' ELSE 'assigned' END);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_schedules_service_mode ON schedules;
CREATE TRIGGER trg_schedules_service_mode BEFORE INSERT ON schedules
  FOR EACH ROW EXECUTE FUNCTION trg_schedules_service_mode();
ALTER TABLE schedules ALTER COLUMN service_mode SET NOT NULL;

-- ── Służba dla pozycji rozkładu (znajdź albo utwórz) ─────────
CREATE OR REPLACE FUNCTION public._slot_schedule(p_parish uuid, p_date date, p_time time, p_label text,
                                                p_category text, p_mode text, p_by uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM schedules
   WHERE parish_id = p_parish AND date = p_date AND "time" = p_time AND category = p_category
   LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO schedules (title, date, "time", location, gps_radius, parish_id, category, service_mode, created_by)
    VALUES (slot_title(p_label, p_category), p_date, p_time, '', 100, p_parish, p_category, p_mode, p_by)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._slot_schedule(uuid, date, time, text, text, text, uuid) FROM PUBLIC, anon, authenticated;

-- ── 9a. Generowanie służb z rozkładu ─────────────────────────
CREATE OR REPLACE FUNCTION public.generate_schedules_from_templates(p_parish_id uuid, p_from_date date, p_to_date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND my_parish_id() IS DISTINCT FROM p_parish_id THEN
    RAISE EXCEPTION 'Brak uprawnień';
  END IF;
  SELECT id INTO v_admin FROM profiles WHERE parish_id = p_parish_id AND role = 'admin' LIMIT 1;
  INSERT INTO schedules (parish_id, title, date, "time", category, service_mode, created_by)
  SELECT p_parish_id, slot_title(s.label, s.category), s.slot_date, s.slot_time, s.category, s.service_mode, v_admin
    FROM mass_slots(p_parish_id, p_from_date, least(p_to_date, p_from_date + 400)) s
   WHERE NOT EXISTS (
     SELECT 1 FROM schedules x
      WHERE x.parish_id = p_parish_id AND x.date = s.slot_date AND x."time" = s.slot_time AND x.category = s.category
   );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.generate_schedules_from_templates(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_schedules_from_templates(uuid, date, date) TO authenticated;

-- ── 6. Zapis ministranta ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sign_up_for_slot(p_date date, p_time_label text, p_mode text DEFAULT 'once')
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
BEGIN
  IF (SELECT role FROM profiles WHERE id = v_uid) IS DISTINCT FROM 'member' THEN
    RAISE EXCEPTION 'Brak uprawnień';
  END IF;
  v_parish := my_parish_id();
  IF v_parish IS NULL THEN RAISE EXCEPTION 'Brak uprawnień'; END IF;
  IF p_date < (now() AT TIME ZONE 'Europe/Warsaw')::date THEN RAISE EXCEPTION 'Ta służba już minęła'; END IF;
  v_time := make_time(split_part(p_time_label, ':', 1)::int, split_part(p_time_label, ':', 2)::int, 0);

  SELECT * INTO v_slot FROM mass_slots(v_parish, p_date, p_date) s WHERE s.slot_time = v_time
   ORDER BY (s.category = 'msza') DESC LIMIT 1;
  SELECT id, service_mode INTO v_sched, v_mode FROM schedules
   WHERE parish_id = v_parish AND date = p_date AND "time" = v_time
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
    v_sched := _slot_schedule(v_parish, p_date, v_time, v_slot.label, v_slot.category, v_slot.service_mode, NULL);
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
       WHERE (v_origin IS NOT NULL AND s.origin_id = v_origin) OR (v_origin IS NULL AND s.slot_time = v_time)
       ORDER BY (s.category = 'msza') DESC LIMIT 1;
      IF FOUND AND v_slot.service_mode = 'signup' THEN
        v_sched := _slot_schedule(v_parish, v_cur, v_slot.slot_time, v_slot.label, v_slot.category, v_slot.service_mode, NULL);
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
REVOKE EXECUTE ON FUNCTION public.sign_up_for_slot(date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sign_up_for_slot(date, text, text) TO authenticated;

-- ── 7. Służba z rozkładu bez zapisu (do meldowania) ──────────
CREATE OR REPLACE FUNCTION public.materialize_slot(p_date date, p_time_label text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_parish uuid := my_parish_id();
  v_time   time;
  v_id     uuid;
  v_slot   record;
BEGIN
  IF v_parish IS NULL THEN RAISE EXCEPTION 'Brak uprawnień'; END IF;
  IF p_date < (now() AT TIME ZONE 'Europe/Warsaw')::date - 2 OR p_date > (now() AT TIME ZONE 'Europe/Warsaw')::date + 1 THEN
    RAISE EXCEPTION 'Niedozwolona data';
  END IF;
  v_time := make_time(split_part(p_time_label, ':', 1)::int, split_part(p_time_label, ':', 2)::int, 0);
  SELECT id INTO v_id FROM schedules
   WHERE parish_id = v_parish AND date = p_date AND "time" = v_time
   ORDER BY (category = 'msza') DESC LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  SELECT * INTO v_slot FROM mass_slots(v_parish, p_date, p_date) s WHERE s.slot_time = v_time
   ORDER BY (s.category = 'msza') DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tej godziny nie ma w rozkładzie'; END IF;
  RETURN _slot_schedule(v_parish, p_date, v_time, v_slot.label, v_slot.category, v_slot.service_mode, NULL);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.materialize_slot(date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.materialize_slot(date, text) TO authenticated;

-- ── 8. Meldowanie: bez obecności na służbach „none” ──────────
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
  v_mode text;
  v_is_admin boolean;
BEGIN
  SELECT parish_id, service_mode INTO v_schedule_parish, v_mode FROM schedules WHERE id = p_schedule_id;
  IF v_schedule_parish IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono służby';
  END IF;
  IF v_schedule_parish IS DISTINCT FROM p_parish_id THEN
    RAISE EXCEPTION 'Służba należy do innej parafii';
  END IF;
  IF v_mode = 'none' THEN
    RAISE EXCEPTION 'Na tej służbie nie sprawdzamy obecności';
  END IF;

  IF v_uid IS NOT NULL THEN
    v_is_admin := is_parish_admin() AND my_parish_id() = v_schedule_parish;
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_profile_id AND parish_id = v_schedule_parish) THEN
      RAISE EXCEPTION 'Ministrant nie należy do tej parafii';
    END IF;
    IF p_profile_id <> v_uid AND NOT v_is_admin THEN
      RAISE EXCEPTION 'Brak uprawnień do potwierdzenia obecności innej osoby';
    END IF;
    IF NOT v_is_admin AND NOT parish_allows_self_checkin(v_schedule_parish) THEN
      RAISE EXCEPTION 'W tej parafii obecność zaznacza administrator';
    END IF;
  END IF;

  RETURN check_in_and_award_points_impl(p_schedule_id, p_profile_id, p_parish_id, p_method, p_lat, p_lng);
END;
$$;

-- ── 9b. Stałe dyżury od opiekuna: godzina z obowiązującego rozkładu ──
-- p_time to godzina ze STAŁEGO rozkładu; w okresie dyżur trafia na zastępczą godzinę (albo przepada, gdy odwołana).
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

  SELECT id INTO v_tpl FROM mass_templates
   WHERE parish_id = v_parish AND day_of_week = p_day_of_week AND "time" = p_time
   ORDER BY (category = 'msza') DESC LIMIT 1;

  FOREACH v_pid IN ARRAY p_profile_ids LOOP
    INSERT INTO recurring_assignments (parish_id, profile_id, day_of_week, "time", start_date, end_date, created_by)
    VALUES (v_parish, v_pid, p_day_of_week, p_time, p_start, p_end, v_uid)
    RETURNING id INTO v_rule;
    v_rules := v_rules + 1;

    v_date := p_start + ((p_day_of_week - extract(dow FROM p_start)::int + 7) % 7);
    WHILE v_date <= p_end LOOP
      v_schedule := NULL;
      IF v_tpl IS NOT NULL THEN
        SELECT * INTO v_slot FROM mass_slots(v_parish, v_date, v_date) s WHERE s.origin_id = v_tpl LIMIT 1;
        IF FOUND AND v_slot.service_mode <> 'none' THEN
          v_schedule := _slot_schedule(v_parish, v_date, v_slot.slot_time, v_slot.label, v_slot.category, v_slot.service_mode, v_uid);
        END IF;
      ELSE
        -- godzina spoza rozkładu (jak dotychczas)
        SELECT id INTO v_schedule FROM schedules
         WHERE parish_id = v_parish AND date = v_date AND "time" = p_time
         ORDER BY (category = 'msza') DESC LIMIT 1;
        IF v_schedule IS NULL THEN
          INSERT INTO schedules (title, date, "time", location, gps_radius, parish_id, category, created_by)
          VALUES ('Msza Święta', v_date, p_time, '', 100, v_parish, 'msza', v_uid)
          RETURNING id INTO v_schedule;
        END IF;
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

  RETURN jsonb_build_object('rules', v_rules, 'assignments', v_count);
END;
$$;

-- ── 5. Zapis rozkładu z podglądem skutków ────────────────────
-- p_target: 'base' (stały rozkład) | 'period' (okres; p_period_id NULL = nowy) | 'delete_period'
-- p_period: {name, date_from, date_to, repeat_yearly, days_of_week}
-- p_entries: [{id, day_of_week, time, label, category, service_mode, base_template_id}]
-- p_policy: zapisy na godzinach, które znikają (albo przechodzą w „none”):
--   'move' — na pozycję, która je zastępuje (ta sama pozycja stała), inaczej najbliższą godzinę tego dnia; brak → odwołanie
--   'cancel' — odwołanie;  'keep' — służba zostaje jako dodatkowa
-- p_dry_run = true: nic nie zapisuje, zwraca skutki.
CREATE OR REPLACE FUNCTION public.save_rozklad(
  p_target    text,
  p_period_id uuid DEFAULT NULL,
  p_period    jsonb DEFAULT NULL,
  p_entries   jsonb DEFAULT '[]'::jsonb,
  p_policy    text DEFAULT 'move',
  p_dry_run   boolean DEFAULT true
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_parish  uuid := my_parish_id();
  v_from    date := (now() AT TIME ZONE 'Europe/Warsaw')::date;
  v_nowt    time := (now() AT TIME ZONE 'Europe/Warsaw')::time;
  v_to      date := (now() AT TIME ZONE 'Europe/Warsaw')::date + 400;
  v_pid     uuid := p_period_id;
  v_result  jsonb;
  v_changes jsonb := '[]'::jsonb;
  v_moved   int := 0;
  v_cancel  int := 0;
  v_kept    int := 0;
  v_ids     uuid[];
  e         jsonb;
  r         record;
  n         record;
  a         record;
  v_target  uuid;
  v_people  jsonb;
  v_action  text;
  v_when    text;
BEGIN
  IF NOT is_parish_admin() OR v_parish IS NULL THEN
    RAISE EXCEPTION 'Tylko opiekun parafii może zmieniać rozkład';
  END IF;
  IF p_target NOT IN ('base', 'period', 'delete_period') THEN RAISE EXCEPTION 'Nieznany cel zapisu'; END IF;
  IF p_policy NOT IN ('move', 'cancel', 'keep') THEN RAISE EXCEPTION 'Nieznana opcja dla zapisów'; END IF;
  IF jsonb_typeof(p_entries) <> 'array' THEN RAISE EXCEPTION 'Niepoprawne pozycje'; END IF;
  IF v_pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mass_periods WHERE id = v_pid AND parish_id = v_parish) THEN
    RAISE EXCEPTION 'Nie znaleziono okresu';
  END IF;
  IF (SELECT count(*) FROM (
        SELECT DISTINCT (x->>'day_of_week')::int, left(x->>'time', 5) FROM jsonb_array_elements(p_entries) x) d)
     <> jsonb_array_length(p_entries) THEN
    RAISE EXCEPTION 'Dwie pozycje o tej samej godzinie tego samego dnia';
  END IF;

  DROP TABLE IF EXISTS _rozklad_old;
  CREATE TEMP TABLE _rozklad_old ON COMMIT DROP AS SELECT * FROM mass_slots(v_parish, v_from, v_to);

  BEGIN
    -- ── zapis zmian ──
    IF p_target = 'base' THEN
      v_ids := ARRAY(SELECT (x->>'id')::uuid FROM jsonb_array_elements(p_entries) x WHERE x->>'id' IS NOT NULL);
      DELETE FROM mass_templates WHERE parish_id = v_parish AND NOT (id = ANY (v_ids));
      FOR e IN SELECT * FROM jsonb_array_elements(p_entries) LOOP
        IF e->>'id' IS NOT NULL THEN
          UPDATE mass_templates SET day_of_week = (e->>'day_of_week')::smallint, "time" = (e->>'time')::time,
                 label = nullif(btrim(e->>'label'), ''), category = coalesce(e->>'category', 'msza'),
                 service_mode = coalesce(e->>'service_mode', 'signup')
           WHERE id = (e->>'id')::uuid AND parish_id = v_parish;
        ELSE
          INSERT INTO mass_templates (parish_id, day_of_week, "time", label, category, service_mode)
          VALUES (v_parish, (e->>'day_of_week')::smallint, (e->>'time')::time, nullif(btrim(e->>'label'), ''),
                  coalesce(e->>'category', 'msza'), coalesce(e->>'service_mode', 'signup'));
        END IF;
      END LOOP;
    ELSIF p_target = 'delete_period' THEN
      DELETE FROM mass_periods WHERE id = v_pid AND parish_id = v_parish;
    ELSE
      IF p_period IS NULL THEN RAISE EXCEPTION 'Brak danych okresu'; END IF;
      IF v_pid IS NULL THEN
        INSERT INTO mass_periods (parish_id, name, date_from, date_to, repeat_yearly, days_of_week, created_by)
        VALUES (v_parish, btrim(p_period->>'name'), (p_period->>'date_from')::date, (p_period->>'date_to')::date,
                coalesce((p_period->>'repeat_yearly')::boolean, false),
                ARRAY(SELECT jsonb_array_elements_text(p_period->'days_of_week')::smallint), v_uid)
        RETURNING id INTO v_pid;
      ELSE
        UPDATE mass_periods SET name = btrim(p_period->>'name'), date_from = (p_period->>'date_from')::date,
               date_to = (p_period->>'date_to')::date, repeat_yearly = coalesce((p_period->>'repeat_yearly')::boolean, false),
               days_of_week = ARRAY(SELECT jsonb_array_elements_text(p_period->'days_of_week')::smallint)
         WHERE id = v_pid;
      END IF;
      v_ids := ARRAY(SELECT (x->>'id')::uuid FROM jsonb_array_elements(p_entries) x WHERE x->>'id' IS NOT NULL);
      DELETE FROM mass_period_entries WHERE period_id = v_pid AND NOT (id = ANY (v_ids));
      FOR e IN SELECT * FROM jsonb_array_elements(p_entries) LOOP
        IF e->>'id' IS NOT NULL THEN
          UPDATE mass_period_entries SET day_of_week = (e->>'day_of_week')::smallint, "time" = (e->>'time')::time,
                 label = nullif(btrim(e->>'label'), ''), category = coalesce(e->>'category', 'msza'),
                 service_mode = coalesce(e->>'service_mode', 'signup'),
                 base_template_id = (SELECT id FROM mass_templates WHERE id = (e->>'base_template_id')::uuid AND parish_id = v_parish)
           WHERE id = (e->>'id')::uuid AND period_id = v_pid;
        ELSE
          INSERT INTO mass_period_entries (period_id, parish_id, day_of_week, "time", label, category, service_mode, base_template_id)
          VALUES (v_pid, v_parish, (e->>'day_of_week')::smallint, (e->>'time')::time, nullif(btrim(e->>'label'), ''),
                  coalesce(e->>'category', 'msza'), coalesce(e->>'service_mode', 'signup'),
                  (SELECT id FROM mass_templates WHERE id = (e->>'base_template_id')::uuid AND parish_id = v_parish));
        END IF;
      END LOOP;
    END IF;

    DROP TABLE IF EXISTS _rozklad_new;
    CREATE TEMP TABLE _rozklad_new ON COMMIT DROP AS SELECT * FROM mass_slots(v_parish, v_from, v_to);

    -- ── pozycje, które zniknęły (albo przeszły w „none”) ──
    FOR r IN
      SELECT o.*, s.id AS schedule_id, s.title
        FROM _rozklad_old o
        JOIN schedules s ON s.parish_id = v_parish AND s.date = o.slot_date AND s."time" = o.slot_time AND s.category = o.category
       WHERE (o.slot_date > v_from OR o.slot_time > v_nowt)
         -- pozycja zniknęła albo przeszła w „none”
         AND NOT EXISTS (SELECT 1 FROM _rozklad_new x
                          WHERE x.slot_date = o.slot_date AND x.slot_time = o.slot_time AND x.category = o.category
                            AND (x.service_mode <> 'none' OR o.service_mode = 'none'))
         AND NOT EXISTS (SELECT 1 FROM attendance at WHERE at.schedule_id = s.id)
       ORDER BY o.slot_date, o.slot_time
    LOOP
      v_people := coalesce((
        SELECT jsonb_agg(p.full_name ORDER BY p.full_name)
          FROM schedule_assignments sa JOIN profiles p ON p.id = sa.profile_id
         WHERE sa.schedule_id = r.schedule_id AND sa.status IN ('assigned', 'excused')), '[]'::jsonb);

      -- zastępstwo: ta sama pozycja stała, inaczej najbliższa godzina tego dnia
      SELECT * INTO n FROM _rozklad_new x
       WHERE x.slot_date = r.slot_date AND x.service_mode <> 'none'
         AND NOT (x.slot_time = r.slot_time AND x.category = r.category)
       ORDER BY (x.origin_id = r.origin_id) DESC, (x.category = r.category) DESC,
                abs(extract(epoch FROM x.slot_time - r.slot_time)), x.slot_time
       LIMIT 1;

      v_action := CASE
        WHEN jsonb_array_length(v_people) = 0 THEN 'remove'
        WHEN p_policy = 'keep' THEN 'keep'
        WHEN p_policy = 'move' AND n.slot_date IS NOT NULL THEN 'move'
        ELSE 'cancel' END;

      IF jsonb_array_length(v_people) > 0 THEN
        v_changes := v_changes || jsonb_build_object(
          'date', r.slot_date, 'time', to_char(r.slot_time, 'HH24:MI'), 'title', r.title, 'people', v_people,
          'action', v_action, 'to_time', CASE WHEN v_action = 'move' THEN to_char(n.slot_time, 'HH24:MI') END);
      END IF;

      v_when := to_char(r.slot_date, 'DD.MM') || ' ' || to_char(r.slot_time, 'HH24:MI');
      IF v_action = 'move' THEN
        v_target := _slot_schedule(v_parish, n.slot_date, n.slot_time, n.label, n.category, n.service_mode, v_uid);
        FOR a IN SELECT * FROM schedule_assignments WHERE schedule_id = r.schedule_id AND status IN ('assigned', 'excused') LOOP
          IF EXISTS (SELECT 1 FROM schedule_assignments WHERE schedule_id = v_target AND profile_id = a.profile_id) THEN
            DELETE FROM schedule_assignments WHERE id = a.id;
          ELSE
            UPDATE schedule_assignments SET schedule_id = v_target, slot_id = NULL WHERE id = a.id;
          END IF;
          PERFORM add_notification_with_parent(a.profile_id, 'schedule_change', 'Zmiana godziny służby',
            r.title || ' ' || v_when || ' → ' || to_char(n.slot_time, 'HH24:MI'),
            jsonb_build_object('schedule_id', v_target, 'date', n.slot_date, 'time', to_char(n.slot_time, 'HH24:MI')));
          v_moved := v_moved + 1;
        END LOOP;
      ELSIF v_action = 'cancel' THEN
        FOR a IN SELECT * FROM schedule_assignments WHERE schedule_id = r.schedule_id AND status IN ('assigned', 'excused') LOOP
          DELETE FROM schedule_assignments WHERE id = a.id;
          PERFORM add_notification_with_parent(a.profile_id, 'schedule_change', 'Służba odwołana',
            r.title || ' ' || v_when || ' — zmiana rozkładu', jsonb_build_object('date', r.slot_date));
          v_cancel := v_cancel + 1;
        END LOOP;
      ELSIF v_action = 'keep' THEN
        v_kept := v_kept + jsonb_array_length(v_people);
      END IF;

      IF v_action <> 'keep' THEN
        IF EXISTS (SELECT 1 FROM _rozklad_new x WHERE x.slot_date = r.slot_date AND x.slot_time = r.slot_time
                      AND x.category = r.category) THEN
          UPDATE schedules SET service_mode = 'none' WHERE id = r.schedule_id;   -- pozycja została, ale bez punktów
        ELSIF NOT EXISTS (SELECT 1 FROM schedule_assignments WHERE schedule_id = r.schedule_id) THEN
          BEGIN
            DELETE FROM schedules WHERE id = r.schedule_id;
          EXCEPTION WHEN foreign_key_violation THEN NULL;
          END;
        END IF;
      END IF;
    END LOOP;

    -- ── pozycje, które zostały, ale zmienił się tryb / nazwa ──
    UPDATE schedules s
       SET service_mode = x.service_mode,
           title = CASE WHEN s.title = slot_title(o.label, o.category) THEN slot_title(x.label, x.category) ELSE s.title END
      FROM _rozklad_new x
      JOIN _rozklad_old o ON o.slot_date = x.slot_date AND o.slot_time = x.slot_time AND o.category = x.category
     WHERE s.parish_id = v_parish AND s.date = x.slot_date AND s."time" = x.slot_time AND s.category = x.category
       AND (o.service_mode IS DISTINCT FROM x.service_mode OR o.label IS DISTINCT FROM x.label)
       AND NOT (x.service_mode = 'none' AND EXISTS (SELECT 1 FROM attendance at WHERE at.schedule_id = s.id));

    -- ── nowe pozycje: utwórz służby (aplikacja trzyma rok do przodu) ──
    IF EXISTS (SELECT 1 FROM schedules WHERE parish_id = v_parish AND category = 'msza' AND date > v_from + 30) THEN
      PERFORM generate_schedules_from_templates(v_parish, v_from, (SELECT max(date) FROM schedules WHERE parish_id = v_parish));
    END IF;

    v_result := jsonb_build_object(
      'period_id', v_pid, 'dry_run', p_dry_run, 'changes', v_changes,
      'moved', v_moved, 'cancelled', v_cancel, 'kept', v_kept);

    IF p_dry_run THEN
      RAISE EXCEPTION USING ERRCODE = 'LS001', MESSAGE = 'dry run';
    END IF;
  EXCEPTION WHEN SQLSTATE 'LS001' THEN
    -- podgląd: wszystkie zmiany z bloku wycofane, wynik zostaje w zmiennej
    NULL;
  END;

  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.save_rozklad(text, uuid, jsonb, jsonb, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_rozklad(text, uuid, jsonb, jsonb, text, boolean) TO authenticated;

COMMIT;
