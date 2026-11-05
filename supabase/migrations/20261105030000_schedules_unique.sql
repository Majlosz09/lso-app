-- Audyt 2026-11-05, Etap 4: grafik bez zdublowanych służb.
-- 1) Unikalny indeks: jedna służba z rozkładu na (parafia, dzień, godzina, rodzaj, kościół). Nie dotyczy służb dodanych
--    ręcznie (manual) ani cykli (series_id) — te opiekun dodaje świadomie.
-- 2) _slot_schedule / generate_schedules_from_templates / create_recurring_assignments: INSERT … ON CONFLICT DO NOTHING
--    (wcześniej „sprawdź, potem wstaw” — dwa równoczesne wywołania, np. dwa telefony przy meldowaniu, robiły duplikat).
-- 3) Przedłużanie grafiku na rok: pg_cron raz na dobę (extend_schedule_coverage) zamiast telefonu każdego członka przy
--    logowaniu (stores/authStore.ts). Publiczny grafik, ICS, wydruk i kalendarz czytają tylko z schedules — musi być pokryty.

-- bezpiecznik: z duplikatami indeks się nie zbuduje — wtedy najpierw „Porządkuj grafik” (tidy_schedules) / ręczne scalenie
DO $$
DECLARE v_n int; v_list text;
BEGIN
  SELECT count(*), string_agg(format('%s %s %s %s (%s×)', parish_id, date, "time", category, n), '; ')
    INTO v_n, v_list
    FROM (SELECT parish_id, date, "time", category, church_id, count(*) n FROM schedules
           WHERE NOT manual AND series_id IS NULL
           GROUP BY 1, 2, 3, 4, 5 HAVING count(*) > 1 ORDER BY date LIMIT 20) d;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'Zdublowane służby w grafiku (%): %', v_n, v_list;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS schedules_one_per_slot
  ON public.schedules (parish_id, date, "time", category, church_id)
  WHERE NOT manual AND series_id IS NULL;

CREATE OR REPLACE FUNCTION public._slot_schedule(p_parish uuid, p_date date, p_time time without time zone, p_label text, p_category text, p_mode text, p_by uuid, p_church uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id     uuid;
  v_church uuid := coalesce(p_church, main_church(p_parish));
BEGIN
  SELECT id INTO v_id FROM schedules
   WHERE parish_id = p_parish AND date = p_date AND "time" = p_time AND category = p_category AND church_id = v_church
   ORDER BY (NOT manual AND series_id IS NULL) DESC
   LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO schedules (title, date, "time", location, gps_radius, parish_id, category, service_mode, created_by, church_id)
    VALUES (slot_title(p_label, p_category), p_date, p_time, '', 100, p_parish, p_category, p_mode, p_by, v_church)
    ON CONFLICT (parish_id, date, "time", category, church_id) WHERE NOT manual AND series_id IS NULL DO NOTHING
    RETURNING id INTO v_id;
    -- równoległe wywołanie zdążyło pierwsze
    IF v_id IS NULL THEN
      SELECT id INTO v_id FROM schedules
       WHERE parish_id = p_parish AND date = p_date AND "time" = p_time AND category = p_category AND church_id = v_church
         AND NOT manual AND series_id IS NULL;
    END IF;
  END IF;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_schedules_from_templates(p_parish_id uuid, p_from_date date, p_to_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
   )
  ON CONFLICT (parish_id, date, "time", category, church_id) WHERE NOT manual AND series_id IS NULL DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_recurring_assignments(p_profile_ids uuid[], p_day_of_week integer, p_time time without time zone, p_start date, p_end date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
          ON CONFLICT (parish_id, date, "time", category, church_id) WHERE NOT manual AND series_id IS NULL DO NOTHING
          RETURNING id INTO v_schedule;
          IF v_schedule IS NULL THEN
            SELECT id INTO v_schedule FROM schedules
             WHERE parish_id = v_parish AND date = v_date AND "time" = p_time AND category = 'msza'
               AND church_id = v_slot.church_id AND NOT manual AND series_id IS NULL;
          END IF;
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
$function$;

-- Przedłużanie grafiku na rok (jak ensureSchedulesCoverage w aplikacji): gdy ostatnia Msza w grafiku parafii jest
-- bliżej niż 60 dni przed „za rok”, dopisz brakujące dni z rozkładu.
CREATE OR REPLACE FUNCTION public.extend_schedule_coverage()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'Europe/Warsaw')::date;
  v_year  date := ((now() AT TIME ZONE 'Europe/Warsaw')::date + interval '1 year')::date;
  v_last  date;
  v_n     int := 0;
  p       record;
BEGIN
  FOR p IN SELECT id FROM parishes WHERE setup_done LOOP
    SELECT max(date) INTO v_last FROM schedules WHERE parish_id = p.id AND category = 'msza';
    IF v_last IS NULL OR v_last < v_year - 60 THEN
      BEGIN
        PERFORM generate_schedules_from_templates(p.id, greatest(coalesce(v_last + 1, v_today), v_today), v_year);
        v_n := v_n + 1;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'extend_schedule_coverage %: %', p.id, SQLERRM;
      END;
    END IF;
  END LOOP;
  RETURN v_n;
END;
$function$;
REVOKE ALL ON FUNCTION public.extend_schedule_coverage() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'lso-extend-schedules';
SELECT cron.schedule('lso-extend-schedules', '20 2 * * *', $cron$SELECT public.extend_schedule_coverage()$cron$);
