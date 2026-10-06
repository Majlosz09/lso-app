-- =============================================================
-- Własne kategorie punktowania parafii (2026-10-06)
-- Parafia dodaje kategorie (np. „Roraty” 8 pkt, „Pogrzeb” 6 pkt, „Sprzątanie zakrystii” 3 pkt) z liczbą punktów:
--   for_services — do wyboru jako punktacja służby (jednorazowa służba, cykl, pozycja rozkładu Mszy);
--                  obecność na takiej służbie daje punkty kategorii (zapisany i bez zapisu tak samo),
--   for_manual   — gotowy powód w „Przyznaj punkty”.
-- Punktacja służby: schedules.point_category_id, inaczej kategoria pozycji rozkładu (liczona przy obecności,
-- więc zmiana rozkładu działa od razu), inaczej reguły domyślne (point_rules).
-- =============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.point_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parish_id   uuid NOT NULL REFERENCES parishes(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 40),
  icon        text NOT NULL DEFAULT 'star',
  points      int  NOT NULL DEFAULT 5 CHECK (points BETWEEN 0 AND 100),
  for_services boolean NOT NULL DEFAULT true,
  for_manual   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS point_categories_name_uq ON public.point_categories (parish_id, lower(btrim(name)));

ALTER TABLE public.point_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS point_categories_select ON public.point_categories;
CREATE POLICY point_categories_select ON public.point_categories FOR SELECT
  USING (parish_id = (SELECT my_parish_id()));
DROP POLICY IF EXISTS point_categories_write ON public.point_categories;
CREATE POLICY point_categories_write ON public.point_categories FOR ALL
  USING (parish_id = (SELECT my_parish_id()) AND (SELECT is_parish_admin()))
  WITH CHECK (parish_id = (SELECT my_parish_id()) AND (SELECT is_parish_admin()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.point_categories TO authenticated;

ALTER TABLE public.schedules           ADD COLUMN IF NOT EXISTS point_category_id uuid REFERENCES point_categories(id) ON DELETE SET NULL;
ALTER TABLE public.mass_templates      ADD COLUMN IF NOT EXISTS point_category_id uuid REFERENCES point_categories(id) ON DELETE SET NULL;
ALTER TABLE public.mass_period_entries ADD COLUMN IF NOT EXISTS point_category_id uuid REFERENCES point_categories(id) ON DELETE SET NULL;
ALTER TABLE public.points              ADD COLUMN IF NOT EXISTS point_category_id uuid REFERENCES point_categories(id) ON DELETE SET NULL;

-- kategoria z tej parafii albo NULL (dane z klienta)
CREATE OR REPLACE FUNCTION public._pcat(p_parish uuid, p_id text)
RETURNS uuid LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT id FROM point_categories WHERE parish_id = p_parish AND id::text = p_id AND for_services
$$;

-- schedules.point_category_id: tylko kategoria tej parafii
CREATE OR REPLACE FUNCTION public.trg_fn_schedules_pcat()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.point_category_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM point_categories WHERE id = NEW.point_category_id AND parish_id = NEW.parish_id) THEN
    RAISE EXCEPTION 'Kategoria punktowania z innej parafii';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_schedules_pcat ON public.schedules;
CREATE TRIGGER trg_schedules_pcat BEFORE INSERT OR UPDATE OF point_category_id ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION trg_fn_schedules_pcat();

-- ── rozkład: kategoria pozycji w wyniku mass_slots (nowa kolumna na końcu) ──
DROP FUNCTION IF EXISTS public.mass_slots(uuid, date, date);
CREATE FUNCTION public.mass_slots(p_parish uuid, p_from date, p_to date)
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
  )
  SELECT a.d, t."time", t.label, t.category, t.service_mode, t.id, t.id, a.pid, t.church_id, t.point_category_id
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
  ORDER BY 1, 2
$fn$;
REVOKE EXECUTE ON FUNCTION public.mass_slots(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mass_slots(uuid, date, date) TO authenticated;

-- ── save_rozklad zapisuje kategorię pozycji ──
DO $do$
DECLARE v_def text; v_n int;
BEGIN
  v_def := pg_get_functiondef('public.save_rozklad(text, uuid, jsonb, jsonb, text, boolean)'::regprocedure);
  v_n := (length(v_def) - length(replace(v_def, 'service_mode = coalesce(e->>''service_mode'', ''signup''),', ''))) / length('service_mode = coalesce(e->>''service_mode'', ''signup''),');
  IF v_n <> 2 THEN RAISE EXCEPTION 'save_rozklad: UPDATE %', v_n; END IF;
  v_def := replace(v_def, 'service_mode = coalesce(e->>''service_mode'', ''signup''),',
                          'service_mode = coalesce(e->>''service_mode'', ''signup''), point_category_id = _pcat(v_parish, e->>''point_category_id''),');
  v_n := (length(v_def) - length(replace(v_def, 'coalesce(e->>''category'', ''msza''), coalesce(e->>''service_mode'', ''signup''),', ''))) / length('coalesce(e->>''category'', ''msza''), coalesce(e->>''service_mode'', ''signup''),');
  IF v_n <> 2 THEN RAISE EXCEPTION 'save_rozklad: VALUES %', v_n; END IF;
  v_def := replace(v_def, 'coalesce(e->>''category'', ''msza''), coalesce(e->>''service_mode'', ''signup''),',
                          'coalesce(e->>''category'', ''msza''), coalesce(e->>''service_mode'', ''signup''), _pcat(v_parish, e->>''point_category_id''),');
  IF position('category, service_mode, church_id)' IN v_def) = 0 OR position('category, service_mode, base_template_id, church_id)' IN v_def) = 0 THEN
    RAISE EXCEPTION 'save_rozklad: kolumny INSERT';
  END IF;
  v_def := replace(v_def, 'category, service_mode, church_id)', 'category, service_mode, point_category_id, church_id)');
  v_def := replace(v_def, 'category, service_mode, base_template_id, church_id)', 'category, service_mode, point_category_id, base_template_id, church_id)');
  EXECUTE v_def;
END
$do$;

-- ── punkty za obecność: kategoria służby → kategoria pozycji rozkładu → reguły domyślne ──
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
  ON CONFLICT (schedule_id, profile_id) DO NOTHING;

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
    VALUES (p_profile_id, v_points, v_reason, p_schedule_id, v_service_type, p_parish_id, p_profile_id, 'checkin', v_pcat.id);
  END IF;

  RETURN jsonb_build_object('already_checked_in', false, 'points_awarded', v_points, 'reason', v_reason);
END;
$function$;

COMMIT;
