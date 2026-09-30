-- =============================================================
-- Z2: kara za odrzucone usprawiedliwienie — ustawiana w regułach punktów
--
-- parishes.rejected_excuse_penalty — ile punktów odjąć (0 = bez kary), domyślnie 2
-- reject_absence_request(id)       — admin odrzuca zgłoszenie: status 'absent' + notatka
--                                    + wpis w księdze punktów (source 'penalty', ze służbą)
-- Ponowne odrzucenie tej samej służby nie dubluje kary; przyjęcie usprawiedliwienia
-- lub potwierdzenie obecności na tej służbie kasuje karę.
-- =============================================================

BEGIN;

ALTER TABLE parishes ADD COLUMN IF NOT EXISTS rejected_excuse_penalty integer NOT NULL DEFAULT 2;
ALTER TABLE parishes DROP CONSTRAINT IF EXISTS parishes_rejected_excuse_penalty_check;
ALTER TABLE parishes ADD CONSTRAINT parishes_rejected_excuse_penalty_check
  CHECK (rejected_excuse_penalty BETWEEN 0 AND 100);

ALTER TABLE points DROP CONSTRAINT IF EXISTS points_source_check;
ALTER TABLE points ADD CONSTRAINT points_source_check CHECK (source IN ('manual', 'checkin', 'penalty'));

CREATE OR REPLACE FUNCTION public.reject_absence_request(p_assignment_id uuid, p_note text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile  uuid;
  v_schedule uuid;
  v_parish   uuid;
  v_status   text;
  v_penalty  integer;
BEGIN
  SELECT sa.profile_id, sa.schedule_id, s.parish_id, sa.status
    INTO v_profile, v_schedule, v_parish, v_status
    FROM schedule_assignments sa JOIN schedules s ON s.id = sa.schedule_id
   WHERE sa.id = p_assignment_id;
  IF v_schedule IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono zgłoszenia';
  END IF;
  IF NOT (is_parish_admin() AND my_parish_id() = v_parish) THEN
    RAISE EXCEPTION 'Brak uprawnień';
  END IF;
  IF v_status <> 'excused' THEN
    RAISE EXCEPTION 'To zgłoszenie zostało już rozpatrzone';
  END IF;

  UPDATE schedule_assignments
     SET status = 'absent',
         admin_note = coalesce(nullif(trim(p_note), ''),
           'Usprawiedliwienie nie zostało zatwierdzone. Skontaktuj się z księdzem, aby wyjaśnić sytuację.')
   WHERE id = p_assignment_id;

  SELECT rejected_excuse_penalty INTO v_penalty FROM parishes WHERE id = v_parish;
  DELETE FROM points WHERE source = 'penalty' AND profile_id = v_profile AND schedule_id = v_schedule;
  IF coalesce(v_penalty, 0) > 0 THEN
    INSERT INTO points (profile_id, amount, reason, schedule_id, awarded_by, parish_id, source)
    VALUES (v_profile, -v_penalty, 'Odrzucone usprawiedliwienie', v_schedule, auth.uid(), v_parish, 'penalty');
  END IF;
  RETURN coalesce(v_penalty, 0);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.reject_absence_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_absence_request(uuid, text) TO authenticated;

-- Przyjęcie usprawiedliwienia / obecność na służbie → kara znika
CREATE OR REPLACE FUNCTION trg_assignment_clear_penalty()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('confirmed', 'present') AND OLD.status IS DISTINCT FROM NEW.status THEN
    DELETE FROM points WHERE source = 'penalty' AND profile_id = NEW.profile_id AND schedule_id = NEW.schedule_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_assignment_clear_penalty ON schedule_assignments;
CREATE TRIGGER trg_assignment_clear_penalty
  AFTER UPDATE OF status ON schedule_assignments
  FOR EACH ROW EXECUTE FUNCTION trg_assignment_clear_penalty();

COMMIT;
