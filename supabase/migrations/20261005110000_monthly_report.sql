-- =============================================================
-- Miesięczny raport dla proboszcza (2026-10-05)
--  monthly_report(miesiąc): liczby z porównaniem do poprzedniego miesiąca, najlepsi, „kto znika”, braki obsady,
--  awanse, wyzwania, usprawiedliwienia / zgłoszenia, podział na rodzaje służb.
--  Cron 1. dnia miesiąca (9:00 PL): powiadomienie opiekunów „Raport za … jest gotowy” (push).
-- =============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public._monthly_report(p_parish uuid, p_month date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_from  date := date_trunc('month', p_month)::date;
  v_to    date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  p_from  date := (date_trunc('month', p_month) - interval '1 month')::date;
  p_to    date := (date_trunc('month', p_month) - interval '1 day')::date;
  v_today date := (now() AT TIME ZONE 'Europe/Warsaw')::date;
  stats   jsonb;
  prev    jsonb;
BEGIN
  -- liczby miesiąca i poprzedniego (ta sama definicja)
  SELECT jsonb_object_agg(k, v) INTO stats FROM (
    SELECT 'services' k, count(*)::numeric v FROM schedules s WHERE s.parish_id = p_parish AND s.date BETWEEN v_from AND v_to AND s.service_mode <> 'none' AND s.category <> 'zbiorka'
    UNION ALL
    SELECT 'staffed', count(*) FROM schedules s WHERE s.parish_id = p_parish AND s.date BETWEEN v_from AND v_to AND s.service_mode <> 'none' AND s.category <> 'zbiorka'
      AND (EXISTS (SELECT 1 FROM schedule_assignments a WHERE a.schedule_id = s.id AND a.status NOT IN ('absent', 'excused', 'confirmed', 'swapped'))
           OR EXISTS (SELECT 1 FROM attendance at WHERE at.schedule_id = s.id))
    UNION ALL
    SELECT 'attendance', count(*) FROM attendance a JOIN schedules s ON s.id = a.schedule_id WHERE s.parish_id = p_parish AND s.date BETWEEN v_from AND v_to
    UNION ALL
    SELECT 'active_members', count(DISTINCT a.profile_id) FROM attendance a JOIN schedules s ON s.id = a.schedule_id WHERE s.parish_id = p_parish AND s.date BETWEEN v_from AND v_to
    UNION ALL
    SELECT 'points', coalesce(sum(amount), 0) FROM points WHERE parish_id = p_parish AND amount > 0
      AND (created_at AT TIME ZONE 'Europe/Warsaw')::date BETWEEN v_from AND v_to
    UNION ALL
    SELECT 'rate', coalesce(round(100.0 * count(*) FILTER (WHERE a.status = 'present')
                     / nullif(count(*) FILTER (WHERE a.status IN ('present', 'absent', 'excused', 'confirmed')), 0)), -1)
      FROM schedule_assignments a JOIN schedules s ON s.id = a.schedule_id
     WHERE s.parish_id = p_parish AND s.date BETWEEN v_from AND least(v_to, v_today - 1)
    UNION ALL
    SELECT 'new_members', count(*) FROM profiles WHERE parish_id = p_parish AND role = 'member' AND approved
      AND (created_at AT TIME ZONE 'Europe/Warsaw')::date BETWEEN v_from AND v_to
    UNION ALL
    SELECT 'members', count(*) FROM profiles WHERE parish_id = p_parish AND role = 'member' AND approved AND is_active
  ) x;

  SELECT jsonb_object_agg(k, v) INTO prev FROM (
    SELECT 'attendance' k, count(*)::numeric v FROM attendance a JOIN schedules s ON s.id = a.schedule_id WHERE s.parish_id = p_parish AND s.date BETWEEN p_from AND p_to
    UNION ALL
    SELECT 'services', count(*) FROM schedules s WHERE s.parish_id = p_parish AND s.date BETWEEN p_from AND p_to AND s.service_mode <> 'none' AND s.category <> 'zbiorka'
    UNION ALL
    SELECT 'active_members', count(DISTINCT a.profile_id) FROM attendance a JOIN schedules s ON s.id = a.schedule_id WHERE s.parish_id = p_parish AND s.date BETWEEN p_from AND p_to
    UNION ALL
    SELECT 'rate', coalesce(round(100.0 * count(*) FILTER (WHERE a.status = 'present')
                     / nullif(count(*) FILTER (WHERE a.status IN ('present', 'absent', 'excused', 'confirmed')), 0)), -1)
      FROM schedule_assignments a JOIN schedules s ON s.id = a.schedule_id WHERE s.parish_id = p_parish AND s.date BETWEEN p_from AND p_to
  ) y;

  RETURN jsonb_build_object(
    'from', v_from, 'to', v_to,
    'parish', (SELECT name FROM parishes WHERE id = p_parish),
    'stats', stats, 'prev', prev,
    'by_category', coalesce((
      SELECT jsonb_object_agg(cat, n) FROM (
        SELECT s.category cat, count(*) n FROM attendance a JOIN schedules s ON s.id = a.schedule_id
         WHERE s.parish_id = p_parish AND s.date BETWEEN v_from AND v_to GROUP BY s.category) c), '{}'::jsonb),
    'top', coalesce((
      SELECT jsonb_agg(t ORDER BY t.cnt DESC, t.name) FROM (
        SELECT p.full_name name, count(*) cnt,
               (SELECT coalesce(sum(amount), 0) FROM points pt WHERE pt.profile_id = p.id
                  AND (pt.created_at AT TIME ZONE 'Europe/Warsaw')::date BETWEEN v_from AND v_to) pts
          FROM attendance a JOIN schedules s ON s.id = a.schedule_id JOIN profiles p ON p.id = a.profile_id
         WHERE s.parish_id = p_parish AND s.date BETWEEN v_from AND v_to
         GROUP BY p.id, p.full_name ORDER BY count(*) DESC, p.full_name LIMIT 10) t), '[]'::jsonb),
    -- służyli w 2 poprzednich miesiącach (min. 2 razy), w tym ani razu
    'fading', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'before', b.cnt,
               'last', (SELECT max(s2.date) FROM attendance a2 JOIN schedules s2 ON s2.id = a2.schedule_id WHERE a2.profile_id = p.id)) ORDER BY b.cnt DESC)
        FROM profiles p
        JOIN LATERAL (SELECT count(*) cnt FROM attendance a JOIN schedules s ON s.id = a.schedule_id
                       WHERE a.profile_id = p.id AND s.date BETWEEN (v_from - interval '2 months')::date AND v_from - 1) b ON b.cnt >= 2
       WHERE p.parish_id = p_parish AND p.role = 'member' AND p.approved AND p.is_active
         AND NOT EXISTS (SELECT 1 FROM attendance a JOIN schedules s ON s.id = a.schedule_id
                          WHERE a.profile_id = p.id AND s.date BETWEEN v_from AND v_to)), '[]'::jsonb),
    'unstaffed', coalesce((
      SELECT jsonb_agg(jsonb_build_object('date', s.date, 'time', to_char(s."time", 'HH24:MI'), 'title', s.title) ORDER BY s.date, s."time")
        FROM (SELECT * FROM schedules s WHERE s.parish_id = p_parish AND s.date BETWEEN v_from AND least(v_to, v_today - 1)
                AND s.service_mode <> 'none' AND s.category <> 'zbiorka'
                AND NOT EXISTS (SELECT 1 FROM schedule_assignments a WHERE a.schedule_id = s.id AND a.status NOT IN ('excused', 'confirmed', 'swapped'))
                AND NOT EXISTS (SELECT 1 FROM attendance at WHERE at.schedule_id = s.id)
              ORDER BY s.date, s."time" LIMIT 30) s), '[]'::jsonb),
    'promotions', coalesce((
      SELECT jsonb_agg(jsonb_build_object('name', p.full_name, 'rank', r.name) ORDER BY p.rank_since)
        FROM profiles p JOIN ranks r ON r.id = p.rank_id
       WHERE p.parish_id = p_parish AND (p.rank_since AT TIME ZONE 'Europe/Warsaw')::date BETWEEN v_from AND v_to
         AND p.rank_since > p.created_at + interval '1 day'), '[]'::jsonb),
    'challenges', coalesce((
      SELECT jsonb_agg(jsonb_build_object('name', c.name, 'done', (SELECT count(*) FROM challenge_completions cc WHERE cc.challenge_id = c.id)))
        FROM challenges c WHERE c.parish_id = p_parish AND c.date_from <= v_to AND c.date_to >= v_from), '[]'::jsonb),
    'absences', jsonb_build_object(
      'accepted', (SELECT count(*) FROM schedule_assignments a JOIN schedules s ON s.id = a.schedule_id WHERE s.parish_id = p_parish AND s.date BETWEEN v_from AND v_to AND a.status = 'confirmed'),
      'absent',   (SELECT count(*) FROM schedule_assignments a JOIN schedules s ON s.id = a.schedule_id WHERE s.parish_id = p_parish AND s.date BETWEEN v_from AND v_to AND a.status = 'absent'),
      'reports',  (SELECT count(*) FROM attendance_reports r WHERE r.parish_id = p_parish AND r.service_date BETWEEN v_from AND v_to AND r.status = 'approved'))
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public._monthly_report(uuid, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.monthly_report(p_month date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_parish_admin() OR my_parish_id() IS NULL THEN RAISE EXCEPTION 'Tylko opiekun parafii'; END IF;
  RETURN _monthly_report(my_parish_id(), p_month);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.monthly_report(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.monthly_report(date) TO authenticated;

-- 1. dnia miesiąca: powiadomienie opiekunów o raporcie za poprzedni miesiąc
CREATE OR REPLACE FUNCTION public.notify_monthly_reports()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_month date := (date_trunc('month', now() AT TIME ZONE 'Europe/Warsaw') - interval '1 month')::date;
  v_names text[] := ARRAY['styczeń','luty','marzec','kwiecień','maj','czerwiec','lipiec','sierpień','wrzesień','październik','listopad','grudzień'];
  r record;
  rep jsonb;
  n int := 0;
BEGIN
  FOR r IN SELECT id FROM parishes WHERE setup_done LOOP
    rep := _monthly_report(r.id, v_month);
    IF coalesce((rep->'stats'->>'services')::int, 0) = 0 THEN CONTINUE; END IF;
    PERFORM add_notification_admins(r.id, 'monthly_report',
      'Raport za ' || v_names[extract(month FROM v_month)::int] || ' jest gotowy',
      (rep->'stats'->>'attendance') || ' obecności · ' ||
        CASE WHEN (rep->'stats'->>'rate')::int >= 0 THEN 'frekwencja ' || (rep->'stats'->>'rate') || '%' ELSE 'bez frekwencji' END ||
        CASE WHEN jsonb_array_length(rep->'fading') > 0 THEN ' · ' || jsonb_array_length(rep->'fading') || ' do zauważenia' ELSE '' END,
      jsonb_build_object('month', v_month));
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.notify_monthly_reports() FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
  PERFORM cron.unschedule('lso-monthly-report');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('lso-monthly-report', '0 7 1 * *', 'SELECT public.notify_monthly_reports()');

-- Push także dla raportu
CREATE OR REPLACE FUNCTION public.trg_notifications_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_token text;
BEGIN
  IF NEW.type NOT IN ('schedule_change', 'attendance_report', 'attendance_report_decision', 'assignment_batch', 'promotion',
                      'challenge_done', 'monthly_report') THEN
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

COMMIT;
