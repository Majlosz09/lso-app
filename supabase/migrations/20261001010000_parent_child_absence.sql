-- =============================================================
-- N14: rodzic zgłasza nieobecność dziecka na dyżurze
--
-- report_child_absence(id, reason)  — przydział dziecka (profiles.parent_id = auth.uid()),
--                                     status 'assigned', służba jeszcze przed oknem meldowania
--                                     → 'excused' + powód; trafia do usprawiedliwień opiekuna
--                                     (powiadomienie: istniejący trigger trg_fn_notify_excused).
-- withdraw_child_absence(id)        — wycofanie, dopóki opiekun nie rozpatrzył ('excused' → 'assigned').
-- =============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.report_child_absence(p_assignment_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text;
  v_start  timestamptz;
  v_reason text := left(trim(coalesce(p_reason, '')), 500);
BEGIN
  SELECT sa.status, ((s.date + coalesce(s.time, '00:00'::time)) AT TIME ZONE 'Europe/Warsaw')
    INTO v_status, v_start
    FROM schedule_assignments sa
    JOIN schedules s ON s.id = sa.schedule_id
    JOIN profiles child ON child.id = sa.profile_id
   WHERE sa.id = p_assignment_id AND child.parent_id = auth.uid();
  IF v_start IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono dyżuru dziecka';
  END IF;
  IF v_reason = '' THEN
    RAISE EXCEPTION 'Podaj powód nieobecności';
  END IF;
  IF v_status <> 'assigned' THEN
    RAISE EXCEPTION 'Nieobecność na tym dyżurze została już zgłoszona albo rozpatrzona';
  END IF;
  IF v_start - interval '30 minutes' <= now() THEN
    RAISE EXCEPTION 'Za późno na zgłoszenie — skontaktuj się z opiekunem';
  END IF;

  UPDATE schedule_assignments
     SET status = 'excused', absence_reason = v_reason || ' (zgłosił rodzic)'
   WHERE id = p_assignment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_child_absence(p_assignment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text;
BEGIN
  SELECT sa.status INTO v_status
    FROM schedule_assignments sa
    JOIN profiles child ON child.id = sa.profile_id
   WHERE sa.id = p_assignment_id AND child.parent_id = auth.uid();
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono dyżuru dziecka';
  END IF;
  IF v_status <> 'excused' THEN
    RAISE EXCEPTION 'Zgłoszenie zostało już rozpatrzone przez opiekuna';
  END IF;
  UPDATE schedule_assignments SET status = 'assigned', absence_reason = NULL WHERE id = p_assignment_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.report_child_absence(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.withdraw_child_absence(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_child_absence(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_child_absence(uuid) TO authenticated;

COMMIT;
