-- =============================================================
-- „Ułóż grafik za mnie” + porządek w powiadomieniach o dyżurach (2026-10-05)
--  1. apply_auto_schedule(): zatwierdzenie propozycji grafiku — przydziały w jednej transakcji,
--     JEDNO zbiorcze powiadomienie na ministranta (typ assignment_batch, z push).
--  2. Push „Nowy dyżur” tylko, gdy przydziela ktoś inny: bez push przy własnym zapisie
--     (stały zapis „co tydzień” dawał kilkadziesiąt powiadomień), rodzic nie dostaje push o własnym zapisie dziecka,
--     w trybie zbiorczym (lso.bulk) pojedyncze push / wpisy w dzwonku są pomijane.
-- =============================================================

BEGIN;

-- ── 2. Push przy przydziale ──
CREATE OR REPLACE FUNCTION public.trg_fn_notify_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_token      text;
  v_name       text;
  v_parent_id  uuid;
  v_p_token    text;
  v_title      text;
  v_date_str   text;
BEGIN
  IF NEW.recurring_assignment_id IS NOT NULL OR current_setting('lso.bulk', true) = 'on' THEN
    RETURN NEW;
  END IF;
  -- własny zapis ministranta — nie powiadamiamy go o tym, co sam zrobił
  IF auth.uid() IS NOT NULL AND auth.uid() = NEW.profile_id THEN
    RETURN NEW;
  END IF;

  SELECT push_token, full_name, parent_id
    INTO v_token, v_name, v_parent_id
    FROM profiles WHERE id = NEW.profile_id;

  SELECT title,
         to_char(date::date, 'DD.MM') || ' ' || left(time::text, 5)
    INTO v_title, v_date_str
    FROM schedules WHERE id = NEW.schedule_id;

  IF v_token IS NOT NULL THEN
    PERFORM notify_push(
      ARRAY[v_token], 'Nowy dyżur',
      'Zostałeś przypisany do: ' || v_title || ' (' || v_date_str || ')'
    );
  END IF;

  -- rodzic — chyba że to on zapisał dziecko
  IF v_parent_id IS NOT NULL AND auth.uid() IS DISTINCT FROM v_parent_id THEN
    SELECT push_token INTO v_p_token FROM profiles WHERE id = v_parent_id;
    IF v_p_token IS NOT NULL THEN
      PERFORM notify_push(
        ARRAY[v_p_token], 'Dyżur dziecka',
        v_name || ' przypisany do: ' || v_title || ' (' || v_date_str || ')'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Wpis w dzwonku przy przydziale (jak dotąd), ale bez wpisów pojedynczych w trybie zbiorczym
CREATE OR REPLACE FUNCTION public.trg_inapp_assignments()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  s      record;
  v_name text;
  v_when text;
BEGIN
  SELECT id, title, date, time, parish_id INTO s FROM schedules WHERE id = NEW.schedule_id;
  IF s.id IS NULL THEN RETURN NEW; END IF;
  v_when := s.title || ' · ' || to_char(s.date, 'DD.MM') || ' ' || to_char(s.time, 'HH24:MI');

  IF TG_OP = 'INSERT' THEN
    IF current_setting('lso.bulk', true) = 'on' THEN RETURN NEW; END IF;
    IF NEW.status = 'assigned' AND auth.uid() IS DISTINCT FROM NEW.profile_id AND s.date >= current_date THEN
      PERFORM add_notification_with_parent(NEW.profile_id, 'assignment', 'Nowy dyżur', v_when,
        jsonb_build_object('schedule_id', s.id, 'date', s.date, 'time', to_char(s.time, 'HH24:MI')));
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status = 'excused' THEN
    SELECT full_name INTO v_name FROM profiles WHERE id = NEW.profile_id;
    PERFORM add_notification_admins(s.parish_id, 'excuse_request', 'Prośba o usprawiedliwienie',
      v_name || ' · ' || v_when || coalesce(' — ' || NEW.absence_reason, ''),
      jsonb_build_object('schedule_id', s.id, 'assignment_id', NEW.id));
  ELSIF OLD.status = 'excused' AND NEW.status = 'confirmed' THEN
    PERFORM add_notification_with_parent(NEW.profile_id, 'excuse_decision', 'Usprawiedliwienie przyjęte', v_when,
      jsonb_build_object('schedule_id', s.id, 'accepted', true));
  ELSIF OLD.status = 'excused' AND NEW.status = 'absent' THEN
    PERFORM add_notification_with_parent(NEW.profile_id, 'excuse_decision', 'Usprawiedliwienie odrzucone', v_when,
      jsonb_build_object('schedule_id', s.id, 'accepted', false));
  END IF;
  RETURN NEW;
END;
$function$;

-- Push także dla zbiorczego powiadomienia o grafiku
CREATE OR REPLACE FUNCTION public.trg_notifications_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_token text;
BEGIN
  IF NEW.type NOT IN ('schedule_change', 'attendance_report', 'attendance_report_decision', 'assignment_batch') THEN
    RETURN NEW;
  END IF;
  SELECT push_token INTO v_token FROM profiles WHERE id = NEW.profile_id;
  IF v_token IS NOT NULL THEN
    PERFORM notify_push(ARRAY[v_token], NEW.title, coalesce(NEW.body, ''),
                        coalesce(NEW.data, '{}'::jsonb) || jsonb_build_object('type', NEW.type));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

-- ── 1. Zatwierdzenie propozycji grafiku ──
-- p_items: [{schedule_id | null, date, time, church_id, category, title, service_mode, profile_ids: [...]}]
CREATE OR REPLACE FUNCTION public.apply_auto_schedule(p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_parish uuid := my_parish_id();
  it       jsonb;
  v_sid    uuid;
  v_pid    uuid;
  v_rows   int;
  v_count  int := 0;
  r        record;
  v_days   text[] := array['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb'];
BEGIN
  IF NOT is_parish_admin() OR v_parish IS NULL THEN RAISE EXCEPTION 'Tylko opiekun parafii'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) > 500 THEN RAISE EXCEPTION 'Niepoprawna propozycja'; END IF;

  CREATE TEMP TABLE IF NOT EXISTS _auto_new (profile_id uuid, schedule_id uuid) ON COMMIT DROP;
  PERFORM set_config('lso.bulk', 'on', true);

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_sid := (SELECT id FROM schedules WHERE id = (it->>'schedule_id')::uuid AND parish_id = v_parish);
    IF v_sid IS NULL THEN
      v_sid := _slot_schedule(v_parish, (it->>'date')::date, (it->>'time')::time, it->>'title',
                              coalesce(it->>'category', 'msza'), coalesce(it->>'service_mode', 'assigned'), v_uid,
                              (SELECT id FROM churches WHERE id = (it->>'church_id')::uuid AND parish_id = v_parish));
    END IF;
    FOR v_pid IN SELECT (x)::uuid FROM jsonb_array_elements_text(it->'profile_ids') x LOOP
      IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_pid AND parish_id = v_parish AND role = 'member' AND approved) THEN
        CONTINUE;
      END IF;
      INSERT INTO schedule_assignments (schedule_id, profile_id, role, status)
      VALUES (v_sid, v_pid, 'ministrant', 'assigned')
      ON CONFLICT (schedule_id, profile_id) DO NOTHING;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows > 0 THEN
        v_count := v_count + 1;
        INSERT INTO _auto_new VALUES (v_pid, v_sid);
      END IF;
    END LOOP;
  END LOOP;

  PERFORM set_config('lso.bulk', 'off', true);

  -- jedno powiadomienie na osobę: „3 nowe dyżury: wt 6.10 18:00, …”
  FOR r IN
    SELECT n.profile_id, count(*) AS cnt,
           string_agg(v_days[extract(dow FROM s.date)::int + 1] || ' ' || to_char(s.date, 'DD.MM') || ' ' || to_char(s."time", 'HH24:MI'),
                      ', ' ORDER BY s.date, s."time") AS list
      FROM _auto_new n JOIN schedules s ON s.id = n.schedule_id
     GROUP BY n.profile_id
  LOOP
    PERFORM add_notification_with_parent(r.profile_id, 'assignment_batch',
      CASE WHEN r.cnt = 1 THEN 'Nowy dyżur'
           WHEN r.cnt % 10 BETWEEN 2 AND 4 AND r.cnt % 100 NOT BETWEEN 12 AND 14 THEN r.cnt || ' nowe dyżury'
           ELSE r.cnt || ' nowych dyżurów' END,
      left(r.list, 480), '{}'::jsonb);
  END LOOP;

  RETURN jsonb_build_object('assignments', v_count, 'members', (SELECT count(DISTINCT profile_id) FROM _auto_new));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.apply_auto_schedule(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_auto_schedule(jsonb) TO authenticated;

COMMIT;
