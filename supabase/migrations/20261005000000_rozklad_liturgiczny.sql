-- =============================================================
-- Rozkład w rytmie roku liturgicznego (2026-10-05)
--  1. easter_date() / liturgical_anchor() — Wielkanoc i święta liczone na każdy rok (polskie zasady:
--     Wniebowstąpienie w 7. niedzielę Wielkanocy, Boże Ciało w czwartek, Objawienie 6 I).
--  2. mass_periods.rule: 'dates' (jak dotąd) | 'season' (od kotwicy do kotwicy, np. 1. niedziela Adwentu → 23 XII)
--     | 'feasts' (lista świąt, np. uroczystości nakazane). copy_dow = „jak w niedzielę”: w te dni obowiązuje
--     stały rozkład wybranego dnia tygodnia (zawsze aktualny).
--  3. mass_slots() z nowymi rodzajami; save_rozklad() zapisuje nowe pola.
-- =============================================================

BEGIN;

-- ── 1. Wielkanoc (algorytm Meeusa/Jonesa/Butchera, kalendarz gregoriański) ──
CREATE OR REPLACE FUNCTION public.easter_date(p_year int)
RETURNS date LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int; mon int; dy int;
BEGIN
  a := p_year % 19; b := p_year / 100; c := p_year % 100; d := b / 4; e := b % 4;
  f := (b + 8) / 25; g := (b - f + 1) / 3; h := (19 * a + b - d - g + 15) % 30;
  i := c / 4; k := c % 4; l := (32 + 2 * e + 2 * i - h - k) % 7; m := (a + 11 * h + 22 * l) / 451;
  mon := (h + l - 7 * m + 114) / 31; dy := ((h + l - 7 * m + 114) % 31) + 1;
  RETURN make_date(p_year, mon, dy);
END;
$$;

-- Kotwice roku liturgicznego (klucze używane w zmianach okresowych). Nieznany klucz → NULL.
CREATE OR REPLACE FUNCTION public.liturgical_anchor(p_year int, p_key text)
RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_key
    WHEN 'easter'          THEN easter_date(p_year)
    WHEN 'ash_wednesday'   THEN easter_date(p_year) - 46
    WHEN 'palm_sunday'     THEN easter_date(p_year) - 7
    WHEN 'holy_wednesday'  THEN easter_date(p_year) - 4
    WHEN 'holy_thursday'   THEN easter_date(p_year) - 3
    WHEN 'good_friday'     THEN easter_date(p_year) - 2
    WHEN 'holy_saturday'   THEN easter_date(p_year) - 1
    WHEN 'easter_monday'   THEN easter_date(p_year) + 1
    WHEN 'divine_mercy'    THEN easter_date(p_year) + 7
    WHEN 'ascension'       THEN easter_date(p_year) + 42
    WHEN 'pentecost'       THEN easter_date(p_year) + 49
    WHEN 'corpus_christi'  THEN easter_date(p_year) + 60
    WHEN 'sacred_heart'    THEN easter_date(p_year) + 68
    WHEN 'advent_start'    THEN make_date(p_year, 11, 27) + ((7 - extract(dow FROM make_date(p_year, 11, 27))::int) % 7)
    WHEN 'christ_king'     THEN make_date(p_year, 11, 27) + ((7 - extract(dow FROM make_date(p_year, 11, 27))::int) % 7) - 7
    WHEN 'jan1'            THEN make_date(p_year, 1, 1)
    WHEN 'jan6'            THEN make_date(p_year, 1, 6)
    WHEN 'feb2'            THEN make_date(p_year, 2, 2)
    WHEN 'may3'            THEN make_date(p_year, 5, 3)
    WHEN 'aug15'           THEN make_date(p_year, 8, 15)
    WHEN 'nov1'            THEN make_date(p_year, 11, 1)
    WHEN 'nov2'            THEN make_date(p_year, 11, 2)
    WHEN 'dec8'            THEN make_date(p_year, 12, 8)
    WHEN 'dec23'           THEN make_date(p_year, 12, 23)
    WHEN 'christmas_eve'   THEN make_date(p_year, 12, 24)
    WHEN 'christmas'       THEN make_date(p_year, 12, 25)
    WHEN 'dec26'           THEN make_date(p_year, 12, 26)
    WHEN 'dec31'           THEN make_date(p_year, 12, 31)
  END
$$;

-- Daty kotwic w danym roku (podgląd w aplikacji)
CREATE OR REPLACE FUNCTION public.liturgical_anchors(p_year int)
RETURNS TABLE (key text, day date) LANGUAGE sql IMMUTABLE AS $$
  SELECT k, liturgical_anchor(p_year, k) FROM unnest(ARRAY[
    'easter','ash_wednesday','palm_sunday','holy_wednesday','holy_thursday','good_friday','holy_saturday','easter_monday',
    'divine_mercy','ascension','pentecost','corpus_christi','sacred_heart','advent_start','christ_king','jan1','jan6','feb2',
    'may3','aug15','nov1','nov2','dec8','dec23','christmas_eve','christmas','dec26','dec31']) k
$$;
GRANT EXECUTE ON FUNCTION public.easter_date(int), public.liturgical_anchor(int, text), public.liturgical_anchors(int) TO authenticated;

-- ── 2. Rodzaje zmian okresowych ──
ALTER TABLE mass_periods ADD COLUMN IF NOT EXISTS rule text NOT NULL DEFAULT 'dates';
ALTER TABLE mass_periods ADD COLUMN IF NOT EXISTS feasts text[] NOT NULL DEFAULT '{}';
ALTER TABLE mass_periods ADD COLUMN IF NOT EXISTS season_from text;
ALTER TABLE mass_periods ADD COLUMN IF NOT EXISTS season_from_offset int NOT NULL DEFAULT 0;
ALTER TABLE mass_periods ADD COLUMN IF NOT EXISTS season_to text;
ALTER TABLE mass_periods ADD COLUMN IF NOT EXISTS season_to_offset int NOT NULL DEFAULT 0;
ALTER TABLE mass_periods ADD COLUMN IF NOT EXISTS copy_dow smallint CHECK (copy_dow BETWEEN 0 AND 6);
ALTER TABLE mass_periods ALTER COLUMN date_from DROP NOT NULL;
ALTER TABLE mass_periods ALTER COLUMN date_to DROP NOT NULL;
ALTER TABLE mass_periods DROP CONSTRAINT IF EXISTS mass_periods_check;
ALTER TABLE mass_periods DROP CONSTRAINT IF EXISTS mass_periods_check1;
ALTER TABLE mass_periods DROP CONSTRAINT IF EXISTS mass_periods_rule_check;
ALTER TABLE mass_periods ADD CONSTRAINT mass_periods_rule_check CHECK (
  CASE rule
    WHEN 'dates'  THEN date_from IS NOT NULL AND date_to IS NOT NULL AND date_to >= date_from
                       AND (NOT repeat_yearly OR date_to < date_from + 366)
    WHEN 'season' THEN liturgical_anchor(2000, season_from) IS NOT NULL AND liturgical_anchor(2000, season_to) IS NOT NULL
    WHEN 'feasts' THEN cardinality(feasts) >= 1
    ELSE false
  END
);

-- ── 3. Obowiązujący rozkład ──
-- Okres obejmuje dzień: 'dates' — jak dotąd; 'season' — dzień tygodnia pasuje i data między kotwicami tego roku;
-- 'feasts' — data to jedno ze świąt (dowolny dzień tygodnia). Kilka okresów: krótszy wygrywa
-- (święta: liczba świąt − 1, więc pojedyncze święto bije listę), przy remisie nowszy.
CREATE OR REPLACE FUNCTION public.mass_slots(p_parish uuid, p_from date, p_to date)
RETURNS TABLE (slot_date date, slot_time time, label text, category text, service_mode text,
               entry_id uuid, origin_id uuid, period_id uuid)
LANGUAGE sql STABLE SET search_path = public AS $fn$
  WITH days AS (
    SELECT d::date AS d, extract(dow FROM d)::int AS dow, extract(year FROM d)::int AS y
      FROM generate_series(p_from, p_to, interval '1 day') d
  ), act AS (
    SELECT days.d, days.dow, (
      SELECT p.id
        FROM mass_periods p
        CROSS JOIN LATERAL (SELECT
          liturgical_anchor(days.y, p.season_from) + p.season_from_offset AS sf,
          liturgical_anchor(days.y, p.season_to) + p.season_to_offset AS st) b
       WHERE p.parish_id = p_parish
         AND CASE p.rule
           WHEN 'feasts' THEN EXISTS (SELECT 1 FROM unnest(p.feasts) k WHERE liturgical_anchor(days.y, k) = days.d)
           WHEN 'season' THEN days.dow = ANY (p.days_of_week) AND days.d BETWEEN b.sf AND b.st
           ELSE days.dow = ANY (p.days_of_week) AND CASE
               WHEN NOT p.repeat_yearly THEN days.d BETWEEN p.date_from AND p.date_to
               WHEN to_char(p.date_from, 'MMDD') <= to_char(p.date_to, 'MMDD')
                 THEN to_char(days.d, 'MMDD') BETWEEN to_char(p.date_from, 'MMDD') AND to_char(p.date_to, 'MMDD')
               ELSE to_char(days.d, 'MMDD') >= to_char(p.date_from, 'MMDD') OR to_char(days.d, 'MMDD') <= to_char(p.date_to, 'MMDD')
             END
         END
       ORDER BY CASE p.rule
                  WHEN 'feasts' THEN cardinality(p.feasts) - 1
                  WHEN 'season' THEN b.st - b.sf
                  ELSE p.date_to - p.date_from END,
                p.created_at DESC
       LIMIT 1
    ) AS pid
    FROM days
  )
  -- okres „jak w <dniu>”: stały rozkład wskazanego dnia tygodnia
  SELECT a.d, t."time", t.label, t.category, t.service_mode, t.id, t.id, a.pid
    FROM act a
    JOIN mass_periods pp ON pp.id = a.pid AND pp.copy_dow IS NOT NULL
    JOIN mass_templates t ON t.parish_id = p_parish AND t.day_of_week = pp.copy_dow
  UNION ALL
  -- okres z własnymi godzinami (święta: te same godziny w każde ze świąt)
  SELECT a.d, e."time", e.label, e.category, e.service_mode, e.id, coalesce(e.base_template_id, e.id), a.pid
    FROM act a
    JOIN mass_periods pp ON pp.id = a.pid AND pp.copy_dow IS NULL
    JOIN mass_period_entries e ON e.period_id = a.pid AND (pp.rule = 'feasts' OR e.day_of_week = a.dow)
  UNION ALL
  SELECT a.d, t."time", t.label, t.category, t.service_mode, t.id, t.id, NULL::uuid
    FROM act a JOIN mass_templates t ON t.parish_id = p_parish AND t.day_of_week = a.dow
   WHERE a.pid IS NULL
  ORDER BY 1, 2
$fn$;

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
        INSERT INTO mass_periods (parish_id, name, date_from, date_to, repeat_yearly, days_of_week, created_by,
                                  rule, feasts, season_from, season_from_offset, season_to, season_to_offset, copy_dow)
        VALUES (v_parish, btrim(p_period->>'name'), (p_period->>'date_from')::date, (p_period->>'date_to')::date,
                coalesce((p_period->>'repeat_yearly')::boolean, false),
                ARRAY(SELECT jsonb_array_elements_text(coalesce(p_period->'days_of_week', '[0,1,2,3,4,5,6]'))::smallint), v_uid,
                coalesce(p_period->>'rule', 'dates'),
                ARRAY(SELECT jsonb_array_elements_text(coalesce(p_period->'feasts', '[]'))),
                p_period->>'season_from', coalesce((p_period->>'season_from_offset')::int, 0),
                p_period->>'season_to', coalesce((p_period->>'season_to_offset')::int, 0),
                (p_period->>'copy_dow')::smallint)
        RETURNING id INTO v_pid;
      ELSE
        UPDATE mass_periods SET name = btrim(p_period->>'name'), date_from = (p_period->>'date_from')::date,
               date_to = (p_period->>'date_to')::date, repeat_yearly = coalesce((p_period->>'repeat_yearly')::boolean, false),
               days_of_week = ARRAY(SELECT jsonb_array_elements_text(coalesce(p_period->'days_of_week', '[0,1,2,3,4,5,6]'))::smallint),
               rule = coalesce(p_period->>'rule', 'dates'),
               feasts = ARRAY(SELECT jsonb_array_elements_text(coalesce(p_period->'feasts', '[]'))),
               season_from = p_period->>'season_from', season_from_offset = coalesce((p_period->>'season_from_offset')::int, 0),
               season_to = p_period->>'season_to', season_to_offset = coalesce((p_period->>'season_to_offset')::int, 0),
               copy_dow = (p_period->>'copy_dow')::smallint
         WHERE id = v_pid;
      END IF;
      v_ids := ARRAY(SELECT (x->>'id')::uuid FROM jsonb_array_elements(p_entries) x WHERE x->>'id' IS NOT NULL);
      DELETE FROM mass_period_entries WHERE period_id = v_pid AND NOT (id = ANY (v_ids));
      IF (SELECT copy_dow FROM mass_periods WHERE id = v_pid) IS NOT NULL AND jsonb_array_length(p_entries) > 0 THEN
        RAISE EXCEPTION 'Okres „jak w niedzielę” nie ma własnych godzin';
      END IF;
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
