-- =============================================================
-- Kilka kościołów w parafii: kościół parafialny, filie, kaplice (2026-10-05)
--  1. churches (nazwa, GPS, promień, główny). Każda parafia ma dokładnie jeden kościół główny —
--     jego GPS = parishes.lat/lng/gps_radius (synchronizacja w obie strony dla aplikacji 1.1).
--  2. church_id na pozycjach rozkładu, pozycjach okresów, służbach i zgłoszeniach obecności
--     (brak = kościół główny — stara aplikacja działa bez zmian).
--  3. Służba z rozkładu = data + godzina + rodzaj + KOŚCIÓŁ (w filii i w kościele może być Msza o tej samej porze).
--  4. delete_church(): usuwa kościół, którego nie używa rozkład; przyszłe puste służby znikają, historia → kościół główny.
-- =============================================================

BEGIN;

-- ── 1. Kościoły ──
CREATE TABLE IF NOT EXISTS churches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parish_id   uuid NOT NULL REFERENCES parishes(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  short_name  text CHECK (short_name IS NULL OR length(btrim(short_name)) BETWEEN 1 AND 24),
  is_main     boolean NOT NULL DEFAULT false,
  lat         double precision,
  lng         double precision,
  gps_radius  integer NOT NULL DEFAULT 200 CHECK (gps_radius BETWEEN 20 AND 5000),
  sort_order  smallint NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS churches_parish ON churches (parish_id);
CREATE UNIQUE INDEX IF NOT EXISTS churches_one_main ON churches (parish_id) WHERE is_main;

ALTER TABLE churches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "churches_select" ON churches;
CREATE POLICY "churches_select" ON churches FOR SELECT USING (parish_id = (SELECT my_parish_id()));
DROP POLICY IF EXISTS "churches_insert" ON churches;
CREATE POLICY "churches_insert" ON churches FOR INSERT
  WITH CHECK (parish_id = (SELECT my_parish_id()) AND (SELECT is_parish_admin()) AND NOT is_main);
DROP POLICY IF EXISTS "churches_update" ON churches;
CREATE POLICY "churches_update" ON churches FOR UPDATE
  USING (parish_id = (SELECT my_parish_id()) AND (SELECT is_parish_admin()))
  WITH CHECK (parish_id = (SELECT my_parish_id()) AND (SELECT is_parish_admin()));
GRANT SELECT, INSERT, UPDATE ON churches TO authenticated;

-- główny kościół nie może przestać być główny ani zmienić parafii
CREATE OR REPLACE FUNCTION trg_churches_protect()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parish_id IS DISTINCT FROM OLD.parish_id OR NEW.is_main IS DISTINCT FROM OLD.is_main THEN
    RAISE EXCEPTION 'Nie można zmienić parafii ani kościoła głównego';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_churches_protect ON churches;
CREATE TRIGGER trg_churches_protect BEFORE UPDATE ON churches FOR EACH ROW EXECUTE FUNCTION trg_churches_protect();

-- kościół główny dla każdej parafii (z GPS parafii)
INSERT INTO churches (parish_id, name, is_main, lat, lng, gps_radius)
SELECT p.id, 'Kościół parafialny', true, p.lat, p.lng, greatest(20, least(5000, coalesce(p.gps_radius, 200)))
  FROM parishes p
 WHERE NOT EXISTS (SELECT 1 FROM churches c WHERE c.parish_id = p.id AND c.is_main);

CREATE OR REPLACE FUNCTION public.main_church(p_parish uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM churches WHERE parish_id = p_parish AND is_main LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.main_church(uuid) TO authenticated;

-- nowa parafia → kościół główny
CREATE OR REPLACE FUNCTION trg_parishes_main_church()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO churches (parish_id, name, is_main, lat, lng, gps_radius)
  VALUES (NEW.id, 'Kościół parafialny', true, NEW.lat, NEW.lng, greatest(20, least(5000, coalesce(NEW.gps_radius, 200))));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_parishes_main_church ON parishes;
CREATE TRIGGER trg_parishes_main_church AFTER INSERT ON parishes FOR EACH ROW EXECUTE FUNCTION trg_parishes_main_church();

-- GPS: parafia ↔ kościół główny (aplikacja 1.1 zapisuje GPS w parishes)
CREATE OR REPLACE FUNCTION trg_parishes_gps_to_church()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE churches SET lat = NEW.lat, lng = NEW.lng, gps_radius = greatest(20, least(5000, coalesce(NEW.gps_radius, 200)))
   WHERE parish_id = NEW.id AND is_main
     AND (lat IS DISTINCT FROM NEW.lat OR lng IS DISTINCT FROM NEW.lng OR gps_radius IS DISTINCT FROM greatest(20, least(5000, coalesce(NEW.gps_radius, 200))));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_parishes_gps_to_church ON parishes;
CREATE TRIGGER trg_parishes_gps_to_church AFTER UPDATE OF lat, lng, gps_radius ON parishes
  FOR EACH ROW EXECUTE FUNCTION trg_parishes_gps_to_church();

CREATE OR REPLACE FUNCTION trg_church_gps_to_parish()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_main THEN
    UPDATE parishes SET lat = NEW.lat, lng = NEW.lng, gps_radius = NEW.gps_radius
     WHERE id = NEW.parish_id
       AND (lat IS DISTINCT FROM NEW.lat OR lng IS DISTINCT FROM NEW.lng OR gps_radius IS DISTINCT FROM NEW.gps_radius);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_church_gps_to_parish ON churches;
CREATE TRIGGER trg_church_gps_to_parish AFTER UPDATE OF lat, lng, gps_radius ON churches
  FOR EACH ROW EXECUTE FUNCTION trg_church_gps_to_parish();

-- ── 2. church_id ──
ALTER TABLE mass_templates      ADD COLUMN IF NOT EXISTS church_id uuid REFERENCES churches(id);
ALTER TABLE mass_period_entries ADD COLUMN IF NOT EXISTS church_id uuid REFERENCES churches(id);
ALTER TABLE schedules           ADD COLUMN IF NOT EXISTS church_id uuid REFERENCES churches(id);
ALTER TABLE attendance_reports  ADD COLUMN IF NOT EXISTS church_id uuid REFERENCES churches(id) ON DELETE SET NULL;

UPDATE mass_templates t      SET church_id = main_church(t.parish_id) WHERE church_id IS NULL;
UPDATE mass_period_entries e SET church_id = main_church(e.parish_id) WHERE church_id IS NULL;
UPDATE schedules s           SET church_id = main_church(s.parish_id) WHERE church_id IS NULL;
UPDATE attendance_reports r  SET church_id = main_church(r.parish_id) WHERE church_id IS NULL;

-- domyślnie kościół główny (aplikacja 1.1 nie wysyła church_id)
CREATE OR REPLACE FUNCTION trg_default_church()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.church_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM churches c WHERE c.id = NEW.church_id AND c.parish_id = NEW.parish_id) THEN
    NEW.church_id := main_church(NEW.parish_id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_default_church ON mass_templates;
CREATE TRIGGER trg_default_church BEFORE INSERT OR UPDATE OF church_id ON mass_templates
  FOR EACH ROW EXECUTE FUNCTION trg_default_church();
DROP TRIGGER IF EXISTS trg_default_church ON mass_period_entries;
CREATE TRIGGER trg_default_church BEFORE INSERT OR UPDATE OF church_id ON mass_period_entries
  FOR EACH ROW EXECUTE FUNCTION trg_default_church();
DROP TRIGGER IF EXISTS trg_default_church_upd ON schedules;
CREATE TRIGGER trg_default_church_upd BEFORE UPDATE OF church_id ON schedules
  FOR EACH ROW EXECUTE FUNCTION trg_default_church();

ALTER TABLE mass_templates      ALTER COLUMN church_id SET NOT NULL;
ALTER TABLE mass_period_entries ALTER COLUMN church_id SET NOT NULL;
ALTER TABLE schedules           ALTER COLUMN church_id SET NOT NULL;

ALTER TABLE mass_period_entries DROP CONSTRAINT IF EXISTS mass_period_entries_period_id_day_of_week_time_key;
CREATE UNIQUE INDEX IF NOT EXISTS mass_period_entries_slot_unique ON mass_period_entries (period_id, day_of_week, "time", church_id);

-- ── 3. Usunięcie kościoła ──
CREATE OR REPLACE FUNCTION public.delete_church(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_parish uuid := my_parish_id();
  c        churches%ROWTYPE;
  v_main   uuid;
  v_del    int;
BEGIN
  IF NOT is_parish_admin() OR v_parish IS NULL THEN RAISE EXCEPTION 'Tylko opiekun parafii'; END IF;
  SELECT * INTO c FROM churches WHERE id = p_id AND parish_id = v_parish;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Nie znaleziono kościoła'; END IF;
  IF c.is_main THEN RAISE EXCEPTION 'Kościoła parafialnego nie można usunąć'; END IF;
  IF EXISTS (SELECT 1 FROM mass_templates WHERE church_id = p_id) OR EXISTS (SELECT 1 FROM mass_period_entries WHERE church_id = p_id) THEN
    RAISE EXCEPTION 'Ten kościół jest w rozkładzie Mszy — najpierw usuń lub przenieś jego godziny';
  END IF;
  v_main := main_church(v_parish);
  -- przyszłe służby bez obsady i obecności znikają, pozostałe (historia) przechodzą do kościoła głównego
  DELETE FROM schedules s
   WHERE s.church_id = p_id AND s.date >= (now() AT TIME ZONE 'Europe/Warsaw')::date
     AND NOT EXISTS (SELECT 1 FROM schedule_assignments a WHERE a.schedule_id = s.id)
     AND NOT EXISTS (SELECT 1 FROM attendance at WHERE at.schedule_id = s.id);
  GET DIAGNOSTICS v_del = ROW_COUNT;
  UPDATE schedules SET church_id = v_main WHERE church_id = p_id;
  UPDATE attendance_reports SET church_id = v_main WHERE church_id = p_id;
  DELETE FROM churches WHERE id = p_id;
  RETURN jsonb_build_object('deleted_services', v_del);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.delete_church(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_church(uuid) TO authenticated;


-- ── 4. Funkcje rozkładu z kościołem ──

DROP FUNCTION IF EXISTS public.mass_slots(uuid, date, date);

CREATE OR REPLACE FUNCTION public.mass_slots(p_parish uuid, p_from date, p_to date)
RETURNS TABLE (slot_date date, slot_time time, label text, category text, service_mode text,
               entry_id uuid, origin_id uuid, period_id uuid, church_id uuid)
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
  SELECT a.d, t."time", t.label, t.category, t.service_mode, t.id, t.id, a.pid, t.church_id
    FROM act a
    JOIN mass_periods pp ON pp.id = a.pid AND pp.copy_dow IS NOT NULL
    JOIN mass_templates t ON t.parish_id = p_parish AND t.day_of_week = pp.copy_dow
  UNION ALL
  -- okres z własnymi godzinami (święta: te same godziny w każde ze świąt)
  SELECT a.d, e."time", e.label, e.category, e.service_mode, e.id, coalesce(e.base_template_id, e.id), a.pid, e.church_id
    FROM act a
    JOIN mass_periods pp ON pp.id = a.pid AND pp.copy_dow IS NULL
    JOIN mass_period_entries e ON e.period_id = a.pid AND (pp.rule = 'feasts' OR e.day_of_week = a.dow)
  UNION ALL
  SELECT a.d, t."time", t.label, t.category, t.service_mode, t.id, t.id, NULL::uuid, t.church_id
    FROM act a JOIN mass_templates t ON t.parish_id = p_parish AND t.day_of_week = a.dow
   WHERE a.pid IS NULL
  ORDER BY 1, 2
$fn$;

REVOKE EXECUTE ON FUNCTION public.mass_slots(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mass_slots(uuid, date, date) TO authenticated;

CREATE OR REPLACE FUNCTION trg_schedules_service_mode()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.church_id := coalesce(NEW.church_id, main_church(NEW.parish_id));
  IF NEW.service_mode IS NULL THEN
    SELECT s.service_mode INTO NEW.service_mode
      FROM mass_slots(NEW.parish_id, NEW.date, NEW.date) s
     WHERE s.slot_time = NEW."time" AND s.category = coalesce(NEW.category, 'msza') AND s.church_id = NEW.church_id
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

DROP FUNCTION IF EXISTS public._slot_schedule(uuid, date, time, text, text, text, uuid);

CREATE OR REPLACE FUNCTION public._slot_schedule(p_parish uuid, p_date date, p_time time, p_label text,
                                                p_category text, p_mode text, p_by uuid, p_church uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id     uuid;
  v_church uuid := coalesce(p_church, main_church(p_parish));
BEGIN
  SELECT id INTO v_id FROM schedules
   WHERE parish_id = p_parish AND date = p_date AND "time" = p_time AND category = p_category AND church_id = v_church
   LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO schedules (title, date, "time", location, gps_radius, parish_id, category, service_mode, created_by, church_id)
    VALUES (slot_title(p_label, p_category), p_date, p_time, '', 100, p_parish, p_category, p_mode, p_by, v_church)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._slot_schedule(uuid, date, time, text, text, text, uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.generate_schedules_from_templates(p_parish_id uuid, p_from_date date, p_to_date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND my_parish_id() IS DISTINCT FROM p_parish_id THEN
    RAISE EXCEPTION 'Brak uprawnień';
  END IF;
  SELECT id INTO v_admin FROM profiles WHERE parish_id = p_parish_id AND role = 'admin' LIMIT 1;
  INSERT INTO schedules (parish_id, title, date, "time", category, service_mode, created_by, church_id)
  SELECT p_parish_id, slot_title(s.label, s.category), s.slot_date, s.slot_time, s.category, s.service_mode, v_admin, s.church_id
    FROM mass_slots(p_parish_id, p_from_date, least(p_to_date, p_from_date + 400)) s
   WHERE NOT EXISTS (
     SELECT 1 FROM schedules x
      WHERE x.parish_id = p_parish_id AND x.date = s.slot_date AND x."time" = s.slot_time AND x.category = s.category
        AND x.church_id = s.church_id
   );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.generate_schedules_from_templates(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_schedules_from_templates(uuid, date, date) TO authenticated;

DROP FUNCTION IF EXISTS public.sign_up_for_slot(date, text, text);

CREATE OR REPLACE FUNCTION public.sign_up_for_slot(p_date date, p_time_label text, p_mode text DEFAULT 'once', p_church_id uuid DEFAULT NULL)
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
  IF (SELECT role FROM profiles WHERE id = v_uid) IS DISTINCT FROM 'member' THEN
    RAISE EXCEPTION 'Brak uprawnień';
  END IF;
  v_parish := my_parish_id();
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
REVOKE EXECUTE ON FUNCTION public.sign_up_for_slot(date, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sign_up_for_slot(date, text, text, uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.materialize_slot(date, text);

CREATE OR REPLACE FUNCTION public.materialize_slot(p_date date, p_time_label text, p_church_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_parish uuid := my_parish_id();
  v_time   time;
  v_id     uuid;
  v_slot   record;
  v_church uuid;
BEGIN
  IF v_parish IS NULL THEN RAISE EXCEPTION 'Brak uprawnień'; END IF;
  IF p_date < (now() AT TIME ZONE 'Europe/Warsaw')::date - 2 OR p_date > (now() AT TIME ZONE 'Europe/Warsaw')::date + 1 THEN
    RAISE EXCEPTION 'Niedozwolona data';
  END IF;
  v_time := make_time(split_part(p_time_label, ':', 1)::int, split_part(p_time_label, ':', 2)::int, 0);
  v_church := coalesce((SELECT id FROM churches WHERE id = p_church_id AND parish_id = v_parish), main_church(v_parish));
  SELECT id INTO v_id FROM schedules
   WHERE parish_id = v_parish AND date = p_date AND "time" = v_time AND church_id = v_church
   ORDER BY (category = 'msza') DESC LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  SELECT * INTO v_slot FROM mass_slots(v_parish, p_date, p_date) s WHERE s.slot_time = v_time AND s.church_id = v_church
   ORDER BY (s.category = 'msza') DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tej godziny nie ma w rozkładzie'; END IF;
  RETURN _slot_schedule(v_parish, p_date, v_time, v_slot.label, v_slot.category, v_slot.service_mode, NULL, v_church);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.materialize_slot(date, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.materialize_slot(date, text, uuid) TO authenticated;

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
          v_schedule := _slot_schedule(v_parish, v_date, v_slot.slot_time, v_slot.label, v_slot.category, v_slot.service_mode, v_uid, v_slot.church_id);
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

DROP FUNCTION IF EXISTS public.report_attendance(date, text, text, text, text);

CREATE OR REPLACE FUNCTION public.report_attendance(
  p_date     date,
  p_time     text,
  p_title    text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_note     text DEFAULT NULL,
  p_church_id uuid DEFAULT NULL
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
REVOKE EXECUTE ON FUNCTION public.report_attendance(date, text, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_attendance(date, text, text, text, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.decide_attendance_report(p_id uuid, p_approve boolean, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_parish uuid := my_parish_id();
  r        attendance_reports%ROWTYPE;
  v_sid    uuid;
  v_mode   text;
  v_res    jsonb := '{}'::jsonb;
  v_when   text;
BEGIN
  IF NOT is_parish_admin() OR v_parish IS NULL THEN RAISE EXCEPTION 'Tylko opiekun parafii'; END IF;
  SELECT * INTO r FROM attendance_reports WHERE id = p_id AND parish_id = v_parish FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Nie znaleziono zgłoszenia'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Zgłoszenie jest już rozpatrzone'; END IF;
  v_when := r.title || ' · ' || to_char(r.service_date, 'DD.MM') || ' ' || to_char(r.service_time, 'HH24:MI');

  IF p_approve THEN
    v_sid := r.schedule_id;
    IF v_sid IS NULL THEN
      SELECT s.service_mode INTO v_mode FROM mass_slots(v_parish, r.service_date, r.service_date) s
       WHERE s.slot_time = r.service_time AND s.category = r.category AND s.church_id = r.church_id LIMIT 1;
      v_sid := _slot_schedule(v_parish, r.service_date, r.service_time, r.title, r.category,
                              coalesce(v_mode, 'assigned'), v_uid, r.church_id);
    END IF;
    v_res := check_in_and_award_points_impl(v_sid, r.profile_id, v_parish, 'report', NULL, NULL);
    UPDATE attendance_reports SET status = 'approved', schedule_id = v_sid, decided_by = v_uid, decided_at = now(),
           admin_note = nullif(btrim(p_note), '') WHERE id = p_id;
    PERFORM add_notification_with_parent(r.profile_id, 'attendance_report_decision', 'Obecność przyjęta',
      v_when || CASE WHEN (v_res->>'points_awarded')::int > 0 THEN ' · +' || (v_res->>'points_awarded') || ' pkt' ELSE '' END,
      jsonb_build_object('report_id', p_id, 'accepted', true));
  ELSE
    UPDATE attendance_reports SET status = 'rejected', decided_by = v_uid, decided_at = now(),
           admin_note = nullif(btrim(p_note), '') WHERE id = p_id;
    PERFORM add_notification_with_parent(r.profile_id, 'attendance_report_decision', 'Zgłoszenie obecności odrzucone',
      v_when || coalesce(' — ' || nullif(btrim(p_note), ''), ''), jsonb_build_object('report_id', p_id, 'accepted', false));
  END IF;
  RETURN v_res || jsonb_build_object('approved', p_approve);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.decide_attendance_report(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_attendance_report(uuid, boolean, text) TO authenticated;

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
        SELECT DISTINCT (x->>'day_of_week')::int, left(x->>'time', 5), coalesce(x->>'church_id', '') FROM jsonb_array_elements(p_entries) x) d)
     <> jsonb_array_length(p_entries) THEN
    RAISE EXCEPTION 'Dwie pozycje o tej samej godzinie tego samego dnia w tym samym kościele';
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
                 service_mode = coalesce(e->>'service_mode', 'signup'),
                 church_id = coalesce((SELECT id FROM churches WHERE id = (e->>'church_id')::uuid AND parish_id = v_parish), main_church(v_parish))
           WHERE id = (e->>'id')::uuid AND parish_id = v_parish;
        ELSE
          INSERT INTO mass_templates (parish_id, day_of_week, "time", label, category, service_mode, church_id)
          VALUES (v_parish, (e->>'day_of_week')::smallint, (e->>'time')::time, nullif(btrim(e->>'label'), ''),
                  coalesce(e->>'category', 'msza'), coalesce(e->>'service_mode', 'signup'), coalesce((SELECT id FROM churches WHERE id = (e->>'church_id')::uuid AND parish_id = v_parish), main_church(v_parish)));
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
                 base_template_id = (SELECT id FROM mass_templates WHERE id = (e->>'base_template_id')::uuid AND parish_id = v_parish),
                 church_id = coalesce((SELECT id FROM churches WHERE id = (e->>'church_id')::uuid AND parish_id = v_parish), main_church(v_parish))
           WHERE id = (e->>'id')::uuid AND period_id = v_pid;
        ELSE
          INSERT INTO mass_period_entries (period_id, parish_id, day_of_week, "time", label, category, service_mode, base_template_id, church_id)
          VALUES (v_pid, v_parish, (e->>'day_of_week')::smallint, (e->>'time')::time, nullif(btrim(e->>'label'), ''),
                  coalesce(e->>'category', 'msza'), coalesce(e->>'service_mode', 'signup'),
                  (SELECT id FROM mass_templates WHERE id = (e->>'base_template_id')::uuid AND parish_id = v_parish),
                  coalesce((SELECT id FROM churches WHERE id = (e->>'church_id')::uuid AND parish_id = v_parish), main_church(v_parish)));
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
                        AND s.church_id = o.church_id
       WHERE (o.slot_date > v_from OR o.slot_time > v_nowt)
         -- pozycja zniknęła albo przeszła w „none”
         AND NOT EXISTS (SELECT 1 FROM _rozklad_new x
                          WHERE x.slot_date = o.slot_date AND x.slot_time = o.slot_time AND x.category = o.category
                            AND x.church_id = o.church_id
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
         AND NOT (x.slot_time = r.slot_time AND x.category = r.category AND x.church_id = r.church_id)
       ORDER BY (x.origin_id = r.origin_id) DESC, (x.church_id = r.church_id) DESC, (x.category = r.category) DESC,
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
        v_target := _slot_schedule(v_parish, n.slot_date, n.slot_time, n.label, n.category, n.service_mode, v_uid, n.church_id);
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
                      AND x.category = r.category AND x.church_id = r.church_id) THEN
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
                         AND o.church_id = x.church_id
     WHERE s.parish_id = v_parish AND s.date = x.slot_date AND s."time" = x.slot_time AND s.category = x.category
       AND s.church_id = x.church_id
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

