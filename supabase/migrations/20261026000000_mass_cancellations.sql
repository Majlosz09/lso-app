-- =============================================================
-- Odwołane Msze z rozkładu (2026-10-26)
--
-- Problem: grafik pokazuje „wolne miejsce z rozkładu” dla każdej godziny z rozkładu, dla której
-- nie ma służby w bazie. Usunięcie służby (bo Msza wyjątkowo się nie odbywa) sprawiało, że
-- ta sama Msza od razu wracała jako pozycja z rozkładu.
--
--  1. mass_cancellations — „ta pozycja rozkładu w tym dniu się nie odbywa” (dzień, godzina, kościół, rodzaj).
--  2. mass_slots() pomija odwołane pozycje → znikają z grafiku, zapisów, stałych dyżurów, auto-grafiku itd.
--  3. cancel_service(id)            — usuwa służbę; jeśli to pozycja rozkładu, zapamiętuje odwołanie
--                                     i powiadamia zapisanych (od dziś w przód).
--     cancel_mass_slot(d, t, ch, cat) — odwołuje pozycję rozkładu, dla której służba jeszcze nie powstała.
--     restore_mass_slot(d, t, ch, cat) — przywraca odwołaną pozycję.
--  4. Ręczne dodanie służby w odwołanym terminie (ten sam rodzaj) przywraca pozycję rozkładu.
-- =============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.mass_cancellations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parish_id   uuid NOT NULL REFERENCES parishes(id) ON DELETE CASCADE,
  church_id   uuid NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  date        date NOT NULL,
  "time"      time NOT NULL,
  category    text NOT NULL DEFAULT 'msza',
  title       text,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parish_id, date, "time", church_id, category)
);

ALTER TABLE public.mass_cancellations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mass_cancellations_select" ON public.mass_cancellations;
CREATE POLICY "mass_cancellations_select" ON public.mass_cancellations
  FOR SELECT USING (parish_id = (SELECT my_parish_id()));
-- zapis wyłącznie przez funkcje poniżej
REVOKE ALL ON public.mass_cancellations FROM anon;
GRANT SELECT ON public.mass_cancellations TO authenticated;

-- ── mass_slots bez odwołanych pozycji (treść jak w 20261006010000, opakowana filtrem) ──
CREATE OR REPLACE FUNCTION public.mass_slots(p_parish uuid, p_from date, p_to date)
RETURNS TABLE (slot_date date, slot_time time, label text, category text, service_mode text,
               entry_id uuid, origin_id uuid, period_id uuid, church_id uuid, point_category_id uuid)
LANGUAGE sql STABLE SET search_path = public AS $fn$
  WITH days AS (
    SELECT d::date AS d, extract(dow FROM d)::int AS dow, extract(year FROM d)::int AS y
      FROM generate_series(p_from, p_to, interval '1 day') d
  ), ch AS (
    SELECT id FROM churches WHERE parish_id = p_parish
  ), act AS (
    SELECT days.d, days.dow, ch.id AS cid, (
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
         AND period_covers_church(p.id, ch.id)
       ORDER BY CASE p.rule
                  WHEN 'feasts' THEN cardinality(p.feasts) - 1
                  WHEN 'season' THEN b.st - b.sf
                  ELSE p.date_to - p.date_from END,
                p.created_at DESC
       LIMIT 1
    ) AS pid
    FROM days CROSS JOIN ch
  ), slots AS (
    SELECT a.d AS slot_date, t."time" AS slot_time, t.label, t.category, t.service_mode, t.id AS entry_id, t.id AS origin_id,
           a.pid AS period_id, t.church_id, t.point_category_id
      FROM act a
      JOIN mass_periods pp ON pp.id = a.pid AND pp.copy_dow IS NOT NULL
      JOIN mass_templates t ON t.parish_id = p_parish AND t.day_of_week = pp.copy_dow AND t.church_id = a.cid
    UNION ALL
    SELECT a.d, e."time", e.label, e.category, e.service_mode, e.id, coalesce(e.base_template_id, e.id), a.pid, e.church_id, e.point_category_id
      FROM act a
      JOIN mass_periods pp ON pp.id = a.pid AND pp.copy_dow IS NULL
      JOIN mass_period_entries e ON e.period_id = a.pid AND e.church_id = a.cid AND (pp.rule = 'feasts' OR e.day_of_week = a.dow)
    UNION ALL
    SELECT a.d, t."time", t.label, t.category, t.service_mode, t.id, t.id, NULL::uuid, t.church_id, t.point_category_id
      FROM act a JOIN mass_templates t ON t.parish_id = p_parish AND t.day_of_week = a.dow AND t.church_id = a.cid
     WHERE a.pid IS NULL
  )
  SELECT s.* FROM slots s
   WHERE NOT EXISTS (SELECT 1 FROM mass_cancellations mc
                      WHERE mc.parish_id = p_parish AND mc.date = s.slot_date AND mc."time" = s.slot_time
                        AND mc.church_id = s.church_id AND mc.category = s.category)
   ORDER BY 1, 2
$fn$;
REVOKE EXECUTE ON FUNCTION public.mass_slots(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mass_slots(uuid, date, date) TO authenticated;

-- ── odwołanie istniejącej służby ──
CREATE OR REPLACE FUNCTION public.cancel_service(p_schedule_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_parish   uuid := my_parish_id();
  v_today    date := (now() AT TIME ZONE 'Europe/Warsaw')::date;
  s          record;
  a          record;
  v_church   uuid;
  v_slot     boolean := false;
  v_notified int := 0;
BEGIN
  IF NOT can_manage_services() OR v_parish IS NULL THEN
    RAISE EXCEPTION 'Tylko opiekun parafii może odwoływać służby';
  END IF;
  SELECT * INTO s FROM schedules WHERE id = p_schedule_id AND parish_id = v_parish;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nie znaleziono służby'; END IF;
  v_church := coalesce(s.church_id, main_church(v_parish));

  -- pozycja rozkładu? (cykle służb to osobne terminy — nie z rozkładu)
  IF s.series_id IS NULL THEN
    v_slot := EXISTS (SELECT 1 FROM mass_slots(v_parish, s.date, s.date) m
                       WHERE m.slot_time = s."time" AND m.church_id = v_church
                         AND m.category = coalesce(s.category, 'msza'));
  END IF;
  IF v_slot THEN
    INSERT INTO mass_cancellations (parish_id, church_id, date, "time", category, title, created_by)
    VALUES (v_parish, v_church, s.date, s."time", coalesce(s.category, 'msza'), s.title, auth.uid())
    ON CONFLICT DO NOTHING;
  END IF;

  IF s.date >= v_today THEN
    FOR a IN SELECT DISTINCT profile_id FROM schedule_assignments
              WHERE schedule_id = s.id AND status IN ('assigned', 'excused') LOOP
      PERFORM add_notification_with_parent(a.profile_id, 'schedule_change', 'Służba odwołana',
        s.title || ' ' || to_char(s.date, 'DD.MM') || ' ' || to_char(s."time", 'HH24:MI') || ' się nie odbędzie',
        jsonb_build_object('date', s.date));
      v_notified := v_notified + 1;
    END LOOP;
  END IF;

  DELETE FROM schedules WHERE id = s.id;
  RETURN jsonb_build_object('from_rozklad', v_slot, 'notified', v_notified);
END;
$$;

-- ── odwołanie pozycji rozkładu bez służby w bazie ──
CREATE OR REPLACE FUNCTION public.cancel_mass_slot(p_date date, p_time time, p_church_id uuid DEFAULT NULL, p_category text DEFAULT 'msza')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_parish uuid := my_parish_id();
  v_church uuid := coalesce(p_church_id, main_church(my_parish_id()));
  v_id     uuid;
  m        record;
BEGIN
  IF NOT can_manage_services() OR v_parish IS NULL THEN
    RAISE EXCEPTION 'Tylko opiekun parafii może odwoływać służby';
  END IF;
  -- jeśli służba w tym terminie już powstała — zwykłe odwołanie (z powiadomieniami)
  SELECT id INTO v_id FROM schedules
   WHERE parish_id = v_parish AND date = p_date AND "time" = p_time AND church_id = v_church
     AND coalesce(category, 'msza') = p_category AND series_id IS NULL
   LIMIT 1;
  IF v_id IS NOT NULL THEN PERFORM cancel_service(v_id); RETURN; END IF;

  SELECT * INTO m FROM mass_slots(v_parish, p_date, p_date) x
   WHERE x.slot_time = p_time AND x.church_id = v_church AND x.category = p_category LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tej Mszy nie ma w rozkładzie'; END IF;
  INSERT INTO mass_cancellations (parish_id, church_id, date, "time", category, title, created_by)
  VALUES (v_parish, v_church, p_date, p_time, p_category, slot_title(m.label, m.category), auth.uid())
  ON CONFLICT DO NOTHING;
END;
$$;

-- ── przywrócenie ──
CREATE OR REPLACE FUNCTION public.restore_mass_slot(p_date date, p_time time, p_church_id uuid DEFAULT NULL, p_category text DEFAULT 'msza')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT can_manage_services() OR my_parish_id() IS NULL THEN
    RAISE EXCEPTION 'Tylko opiekun parafii może przywracać służby';
  END IF;
  DELETE FROM mass_cancellations
   WHERE parish_id = my_parish_id() AND date = p_date AND "time" = p_time
     AND church_id = coalesce(p_church_id, main_church(my_parish_id())) AND category = p_category;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_service(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_mass_slot(date, time, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.restore_mass_slot(date, time, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_service(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_mass_slot(date, time, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_mass_slot(date, time, uuid, text) TO authenticated;

-- ── ręczne dodanie służby w odwołanym terminie przywraca pozycję rozkładu ──
-- (nazwa „trg_a_…”: wyzwalacze BEFORE idą alfabetycznie — ten przed trg_schedules_service_mode,
--  żeby tamten znalazł już pozycję rozkładu i ustawił jej tryb służby)
CREATE OR REPLACE FUNCTION public.trg_fn_schedules_uncancel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.series_id IS NULL THEN
    DELETE FROM mass_cancellations
     WHERE parish_id = NEW.parish_id AND date = NEW.date AND "time" = NEW."time"
       AND church_id = coalesce(NEW.church_id, main_church(NEW.parish_id))
       AND category = coalesce(NEW.category, 'msza');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_a_schedules_uncancel ON public.schedules;
CREATE TRIGGER trg_a_schedules_uncancel BEFORE INSERT ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION trg_fn_schedules_uncancel();

COMMIT;
