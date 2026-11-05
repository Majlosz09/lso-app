-- Audyt 2026-11-05, Etap 6: opiekun zapisuje obecność na służbie jednym wywołaniem (w jednej transakcji) zamiast
-- pętli w app/(admin)/schedule-detail.tsx (2 zapytania na osobę; błąd w połowie zostawiał połowę zapisu).
-- p_present = pełna lista obecnych: brakującym dopisuje obecność (check_in_and_award_points — te same sprawdzenia
-- i punkty), pozostałym usuwa obecność (trigger cofa punkty) i ustawia przydział na „nieobecny”.
CREATE OR REPLACE FUNCTION public.set_service_attendance(p_schedule_id uuid, p_present uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_parish  uuid;
  v_pid     uuid;
  v_added   int := 0;
  v_removed int := 0;
BEGIN
  SELECT parish_id INTO v_parish FROM schedules WHERE id = p_schedule_id;
  IF v_parish IS NULL THEN RAISE EXCEPTION 'Nie znaleziono służby'; END IF;
  IF NOT can_manage_services() OR my_parish_id() IS DISTINCT FROM v_parish THEN
    RAISE EXCEPTION 'Obecność zaznacza opiekun parafii';
  END IF;

  FOR v_pid IN
    SELECT DISTINCT x FROM unnest(coalesce(p_present, '{}')) x
     WHERE NOT EXISTS (SELECT 1 FROM attendance a WHERE a.schedule_id = p_schedule_id AND a.profile_id = x)
  LOOP
    PERFORM check_in_and_award_points(p_schedule_id, v_pid, v_parish, 'manual');
    UPDATE schedule_assignments SET status = 'present'
     WHERE schedule_id = p_schedule_id AND profile_id = v_pid AND status <> 'present';
    v_added := v_added + 1;
  END LOOP;

  FOR v_pid IN
    SELECT a.profile_id FROM attendance a
     WHERE a.schedule_id = p_schedule_id AND NOT (a.profile_id = ANY (coalesce(p_present, '{}')))
  LOOP
    DELETE FROM attendance WHERE schedule_id = p_schedule_id AND profile_id = v_pid;
    UPDATE schedule_assignments SET status = 'absent'
     WHERE schedule_id = p_schedule_id AND profile_id = v_pid AND status <> 'absent';
    v_removed := v_removed + 1;
  END LOOP;

  RETURN jsonb_build_object('added', v_added, 'removed', v_removed);
END;
$function$;
REVOKE ALL ON FUNCTION public.set_service_attendance(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_service_attendance(uuid, uuid[]) TO authenticated;
