-- =============================================================
-- N17: role na wybranej Mszy (uroczystości, święta)
--
-- Domyślnie bez zmian: każda służba to lista ministrantów (min. 1 na Mszę).
-- Opiekun może na KONKRETNEJ służbie włączyć role:
--   schedules.roles_mode  NULL      — bez ról (jak dotąd)
--                         'admin'   — opiekun przydziela osoby do ról
--                         'self'    — ministranci sami wybierają wolną rolę
--   schedule_role_slots   — role tej służby (np. Ceremoniarz, Lektor ×2, Akolita), kolejność
--   schedule_assignments.slot_id — kto zajmuje rolę (ten sam przydział co zawsze →
--                                  obecność, punkty, statystyki działają bez zmian)
-- Zmiany ról tylko przez RPC:
--   set_schedule_roles(schedule, roles[], mode)   — opiekun; mode NULL = wyłącz role
--   assign_role_slot(slot, profile|NULL)          — opiekun przydziela / zwalnia
--   claim_role_slot(slot) / release_role_slot(slot) — ministrant w trybie 'self'
-- =============================================================

BEGIN;

ALTER TABLE schedules ADD COLUMN IF NOT EXISTS roles_mode text;
ALTER TABLE schedules DROP CONSTRAINT IF EXISTS schedules_roles_mode_check;
ALTER TABLE schedules ADD CONSTRAINT schedules_roles_mode_check CHECK (roles_mode IS NULL OR roles_mode IN ('admin', 'self'));

CREATE TABLE IF NOT EXISTS schedule_role_slots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS schedule_role_slots_schedule_idx ON schedule_role_slots (schedule_id, position);

ALTER TABLE schedule_assignments ADD COLUMN IF NOT EXISTS slot_id uuid REFERENCES schedule_role_slots(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS schedule_assignments_slot_unique ON schedule_assignments (slot_id) WHERE slot_id IS NOT NULL;

ALTER TABLE schedule_role_slots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "schedule_role_slots_select" ON schedule_role_slots;
CREATE POLICY "schedule_role_slots_select" ON schedule_role_slots FOR SELECT USING (
  EXISTS (SELECT 1 FROM schedules s WHERE s.id = schedule_role_slots.schedule_id AND s.parish_id = my_parish_id())
);
GRANT SELECT ON schedule_role_slots TO authenticated;

-- Zmiany roli / slotu tylko przez RPC (flaga transakcji) albo przez opiekuna
CREATE OR REPLACE FUNCTION trg_assignments_protect()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR current_setting('lso.roles_rpc', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF is_parish_admin() AND EXISTS (
    SELECT 1 FROM schedules s WHERE s.id = OLD.schedule_id AND s.parish_id = my_parish_id()
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.schedule_id IS DISTINCT FROM OLD.schedule_id
     OR NEW.profile_id IS DISTINCT FROM OLD.profile_id
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.slot_id IS DISTINCT FROM OLD.slot_id
     OR NEW.admin_note IS DISTINCT FROM OLD.admin_note
     OR NEW.recurring_assignment_id IS DISTINCT FROM OLD.recurring_assignment_id THEN
    RAISE EXCEPTION 'Brak uprawnień do zmiany przydziału';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF (OLD.status = 'assigned' AND NEW.status = 'excused')          -- zgłoszenie nieobecności
       OR (OLD.status = 'excused' AND NEW.status = 'assigned')       -- wycofanie zgłoszenia
       OR (NEW.status = 'present' AND EXISTS (                       -- obecny tylko po zameldowaniu
             SELECT 1 FROM attendance a WHERE a.schedule_id = NEW.schedule_id AND a.profile_id = NEW.profile_id))
       OR (OLD.status = 'assigned' AND NEW.status = 'swapped' AND EXISTS (   -- przyjęta zamiana: proszący oddaje
             SELECT 1 FROM swap_offers o WHERE o.schedule_id = OLD.schedule_id AND o.from_profile_id = OLD.profile_id
               AND o.to_profile_id = auth.uid() AND o.status = 'accepted'))
       OR (OLD.status = 'swapped' AND NEW.status = 'assigned' AND NEW.profile_id = auth.uid() AND EXISTS ( -- przejmujący wraca
             SELECT 1 FROM swap_offers o WHERE o.schedule_id = OLD.schedule_id AND o.to_profile_id = auth.uid()
               AND o.status = 'accepted'))
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Brak uprawnień do zmiany statusu na %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

-- Nowy przydział ze slotem tylko przez RPC / opiekuna
CREATE OR REPLACE FUNCTION trg_assignments_slot_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.slot_id IS NOT NULL AND auth.uid() IS NOT NULL
     AND coalesce(current_setting('lso.roles_rpc', true), '') <> 'on'
     AND NOT (is_parish_admin() AND EXISTS (SELECT 1 FROM schedules s WHERE s.id = NEW.schedule_id AND s.parish_id = my_parish_id())) THEN
    RAISE EXCEPTION 'Rolę wybiera się przyciskiem „Zajmij”';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_assignments_slot_insert ON schedule_assignments;
CREATE TRIGGER trg_assignments_slot_insert BEFORE INSERT ON schedule_assignments
  FOR EACH ROW EXECUTE FUNCTION trg_assignments_slot_insert();

-- Przydziel osobę do roli (NULL = zwolnij). Poprzedni zajmujący zostaje w obsadzie jako „Ministrant”.
CREATE OR REPLACE FUNCTION public._place_in_slot(p_slot uuid, p_profile uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_schedule uuid;
  v_name     text;
BEGIN
  SELECT schedule_id, name INTO v_schedule, v_name FROM schedule_role_slots WHERE id = p_slot;
  PERFORM set_config('lso.roles_rpc', 'on', true);
  UPDATE schedule_assignments SET slot_id = NULL, role = 'ministrant' WHERE slot_id = p_slot;
  IF p_profile IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM schedule_assignments WHERE schedule_id = v_schedule AND profile_id = p_profile) THEN
      UPDATE schedule_assignments
         SET slot_id = p_slot, role = v_name,
             status = CASE WHEN status IN ('swapped', 'excused', 'confirmed') THEN 'assigned' ELSE status END
       WHERE schedule_id = v_schedule AND profile_id = p_profile;
    ELSE
      INSERT INTO schedule_assignments (schedule_id, profile_id, role, status, slot_id)
      VALUES (v_schedule, p_profile, v_name, 'assigned', p_slot);
    END IF;
  END IF;
  PERFORM set_config('lso.roles_rpc', 'off', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public._place_in_slot(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_schedule_roles(p_schedule_id uuid, p_roles text[], p_mode text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_parish uuid;
  v_old    uuid[];
  i        integer;
  v_slot   uuid;
  v_holder uuid;
BEGIN
  SELECT parish_id INTO v_parish FROM schedules WHERE id = p_schedule_id;
  IF v_parish IS NULL OR NOT (is_parish_admin() AND v_parish = my_parish_id()) THEN
    RAISE EXCEPTION 'Brak uprawnień';
  END IF;
  IF p_mode IS NOT NULL AND p_mode NOT IN ('admin', 'self') THEN
    RAISE EXCEPTION 'Nieznany tryb ról';
  END IF;
  IF p_mode IS NOT NULL AND coalesce(cardinality(p_roles), 0) = 0 THEN
    RAISE EXCEPTION 'Dodaj co najmniej jedną rolę';
  END IF;
  IF coalesce(cardinality(p_roles), 0) > 30 THEN
    RAISE EXCEPTION 'Za dużo ról (max 30)';
  END IF;

  UPDATE schedules SET roles_mode = p_mode WHERE id = p_schedule_id;

  -- Istniejące sloty po kolei; zajmujący zostają na slocie o tej samej pozycji, o ile nazwa się nie zmieniła
  v_old := ARRAY(SELECT id FROM schedule_role_slots WHERE schedule_id = p_schedule_id ORDER BY position, created_at);
  PERFORM set_config('lso.roles_rpc', 'on', true);
  IF p_mode IS NULL THEN
    UPDATE schedule_assignments SET slot_id = NULL, role = 'ministrant' WHERE schedule_id = p_schedule_id AND slot_id IS NOT NULL;
    DELETE FROM schedule_role_slots WHERE schedule_id = p_schedule_id;
    PERFORM set_config('lso.roles_rpc', 'off', true);
    RETURN;
  END IF;

  FOR i IN 1 .. cardinality(p_roles) LOOP
    IF trim(p_roles[i]) = '' THEN RAISE EXCEPTION 'Pusta nazwa roli'; END IF;
    IF i <= coalesce(cardinality(v_old), 0) THEN
      v_slot := v_old[i];
      UPDATE schedule_role_slots SET position = i WHERE id = v_slot;
      IF (SELECT name FROM schedule_role_slots WHERE id = v_slot) IS DISTINCT FROM trim(p_roles[i]) THEN
        UPDATE schedule_role_slots SET name = trim(p_roles[i]) WHERE id = v_slot;
        UPDATE schedule_assignments SET role = trim(p_roles[i]) WHERE slot_id = v_slot;
      END IF;
    ELSE
      INSERT INTO schedule_role_slots (schedule_id, name, position) VALUES (p_schedule_id, trim(p_roles[i]), i);
    END IF;
  END LOOP;
  -- nadmiarowe sloty: zajmujący zostają jako „Ministrant”
  IF coalesce(cardinality(v_old), 0) > cardinality(p_roles) THEN
    FOR i IN cardinality(p_roles) + 1 .. cardinality(v_old) LOOP
      UPDATE schedule_assignments SET slot_id = NULL, role = 'ministrant' WHERE slot_id = v_old[i];
      DELETE FROM schedule_role_slots WHERE id = v_old[i];
    END LOOP;
  END IF;
  PERFORM set_config('lso.roles_rpc', 'off', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_role_slot(p_slot_id uuid, p_profile_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_parish uuid;
  v_schedule uuid;
BEGIN
  SELECT s.parish_id, s.id INTO v_parish, v_schedule
    FROM schedule_role_slots r JOIN schedules s ON s.id = r.schedule_id WHERE r.id = p_slot_id;
  IF v_parish IS NULL OR NOT (is_parish_admin() AND v_parish = my_parish_id()) THEN
    RAISE EXCEPTION 'Brak uprawnień';
  END IF;
  IF p_profile_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_profile_id AND parish_id = v_parish AND role = 'member' AND approved) THEN
    RAISE EXCEPTION 'Wybierz ministranta z parafii';
  END IF;
  -- ta osoba w innej roli tej służby → najpierw ją stamtąd zdejmij (przejdzie na nowy slot)
  PERFORM _place_in_slot(p_slot_id, p_profile_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_role_slot(p_slot_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me     uuid := auth.uid();
  s        record;
BEGIN
  SELECT sc.id, sc.parish_id, sc.roles_mode, (sc.date + sc.time) AT TIME ZONE 'Europe/Warsaw' AS starts
    INTO s FROM schedule_role_slots r JOIN schedules sc ON sc.id = r.schedule_id WHERE r.id = p_slot_id;
  IF s.id IS NULL OR s.parish_id IS DISTINCT FROM my_parish_id() THEN
    RAISE EXCEPTION 'Nie znaleziono roli';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_me AND role = 'member' AND approved) THEN
    RAISE EXCEPTION 'Role wybierają ministranci';
  END IF;
  IF s.roles_mode IS DISTINCT FROM 'self' THEN
    RAISE EXCEPTION 'Na tej Mszy role przydziela opiekun';
  END IF;
  IF s.starts - interval '30 minutes' <= now() THEN
    RAISE EXCEPTION 'Za późno na wybór roli';
  END IF;
  IF EXISTS (SELECT 1 FROM schedule_assignments WHERE slot_id = p_slot_id) THEN
    RAISE EXCEPTION 'Ta rola jest już zajęta';
  END IF;
  IF EXISTS (SELECT 1 FROM schedule_assignments WHERE schedule_id = s.id AND profile_id = v_me
               AND status IN ('excused', 'confirmed', 'absent', 'present')) THEN
    RAISE EXCEPTION 'Nie możesz teraz wybrać roli na tej służbie';
  END IF;
  PERFORM _place_in_slot(p_slot_id, v_me);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_role_slot(p_slot_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mode text;
BEGIN
  SELECT sc.roles_mode INTO v_mode FROM schedule_role_slots r JOIN schedules sc ON sc.id = r.schedule_id WHERE r.id = p_slot_id;
  IF v_mode IS DISTINCT FROM 'self' THEN
    RAISE EXCEPTION 'Na tej Mszy role przydziela opiekun';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM schedule_assignments WHERE slot_id = p_slot_id AND profile_id = auth.uid()) THEN
    RAISE EXCEPTION 'To nie jest Twoja rola';
  END IF;
  PERFORM _place_in_slot(p_slot_id, NULL);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_schedule_roles(uuid, text[], text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.assign_role_slot(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_role_slot(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.release_role_slot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_schedule_roles(uuid, text[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_role_slot(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_role_slot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_role_slot(uuid) TO authenticated;

COMMIT;
