-- =============================================================
-- Z1: kilka metod potwierdzania obecności + metoda główna
--
-- parishes.attendance_methods  — włączone metody: qr / gps / button / admin (min. 1)
-- parishes.attendance_primary  — metoda otwierana jako pierwsza po „Potwierdź obecność”
-- parishes.attendance_mode     — ZOSTAJE dla starszych wersji aplikacji (1.1 na produkcji);
--                                trigger trzyma ją w zgodzie z nowymi kolumnami i odwrotnie.
--
-- Samodzielne potwierdzenie (RPC + bezpośredni zapis do attendance) jest zablokowane
-- tylko wtedy, gdy parafia nie ma żadnej metody „własnej” (qr/gps/button).
-- =============================================================

BEGIN;

ALTER TABLE parishes ADD COLUMN IF NOT EXISTS attendance_methods text[];
ALTER TABLE parishes ADD COLUMN IF NOT EXISTS attendance_primary text;

UPDATE parishes
   SET attendance_methods = ARRAY[coalesce(attendance_mode, 'button')],
       attendance_primary = coalesce(attendance_mode, 'button')
 WHERE attendance_methods IS NULL OR attendance_primary IS NULL;

ALTER TABLE parishes ALTER COLUMN attendance_methods SET NOT NULL;
ALTER TABLE parishes ALTER COLUMN attendance_primary SET NOT NULL;

ALTER TABLE parishes DROP CONSTRAINT IF EXISTS parishes_attendance_methods_check;
ALTER TABLE parishes ADD CONSTRAINT parishes_attendance_methods_check CHECK (
  cardinality(attendance_methods) >= 1
  AND attendance_methods <@ ARRAY['qr', 'gps', 'button', 'admin']::text[]
  AND attendance_primary = ANY (attendance_methods)
);

-- Stara kolumna ↔ nowe kolumny
CREATE OR REPLACE FUNCTION trg_parishes_attendance_sync()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_self text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.attendance_methods IS NULL THEN
      NEW.attendance_methods := ARRAY[coalesce(NEW.attendance_mode, 'button')];
      NEW.attendance_primary := coalesce(NEW.attendance_mode, 'button');
      RETURN NEW;
    END IF;
  ELSIF NEW.attendance_mode IS DISTINCT FROM OLD.attendance_mode
        AND NEW.attendance_methods IS NOT DISTINCT FROM OLD.attendance_methods
        AND NEW.attendance_primary IS NOT DISTINCT FROM OLD.attendance_primary THEN
    -- starsza aplikacja zmieniła pojedynczy tryb
    NEW.attendance_methods := ARRAY[NEW.attendance_mode];
    NEW.attendance_primary := NEW.attendance_mode;
    RETURN NEW;
  END IF;

  IF NEW.attendance_primary IS NULL OR NOT (NEW.attendance_primary = ANY (NEW.attendance_methods)) THEN
    NEW.attendance_primary := NEW.attendance_methods[1];
  END IF;
  -- attendance_mode dla starszych aplikacji: metoda „własna” (główna, jeśli własna), inaczej 'admin'
  v_self := ARRAY(SELECT m FROM unnest(NEW.attendance_methods) m WHERE m <> 'admin');
  NEW.attendance_mode := CASE
    WHEN cardinality(v_self) = 0 THEN 'admin'
    WHEN NEW.attendance_primary <> 'admin' THEN NEW.attendance_primary
    ELSE v_self[1]
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS parishes_attendance_sync ON parishes;
CREATE TRIGGER parishes_attendance_sync
  BEFORE INSERT OR UPDATE ON parishes
  FOR EACH ROW EXECUTE FUNCTION trg_parishes_attendance_sync();

-- Czy ministrant może sam potwierdzić obecność w danej parafii
CREATE OR REPLACE FUNCTION public.parish_allows_self_checkin(p_parish uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT attendance_methods && ARRAY['qr', 'gps', 'button']::text[] FROM parishes WHERE id = p_parish),
    false
  )
$$;
REVOKE EXECUTE ON FUNCTION public.parish_allows_self_checkin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parish_allows_self_checkin(uuid) TO authenticated;

-- RPC meldowania: blokada tylko przy braku metod własnych
CREATE OR REPLACE FUNCTION public.check_in_and_award_points(
  p_schedule_id uuid,
  p_profile_id  uuid,
  p_parish_id   uuid,
  p_method      text DEFAULT 'manual',
  p_lat         double precision DEFAULT NULL,
  p_lng         double precision DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_schedule_parish uuid;
  v_is_admin boolean;
BEGIN
  SELECT parish_id INTO v_schedule_parish FROM schedules WHERE id = p_schedule_id;
  IF v_schedule_parish IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono służby';
  END IF;
  IF v_schedule_parish IS DISTINCT FROM p_parish_id THEN
    RAISE EXCEPTION 'Służba należy do innej parafii';
  END IF;

  IF v_uid IS NOT NULL THEN
    v_is_admin := is_parish_admin() AND my_parish_id() = v_schedule_parish;
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_profile_id AND parish_id = v_schedule_parish) THEN
      RAISE EXCEPTION 'Ministrant nie należy do tej parafii';
    END IF;
    IF p_profile_id <> v_uid AND NOT v_is_admin THEN
      RAISE EXCEPTION 'Brak uprawnień do potwierdzenia obecności innej osoby';
    END IF;
    IF NOT v_is_admin AND NOT parish_allows_self_checkin(v_schedule_parish) THEN
      RAISE EXCEPTION 'W tej parafii obecność zaznacza administrator';
    END IF;
  END IF;

  RETURN check_in_and_award_points_impl(p_schedule_id, p_profile_id, p_parish_id, p_method, p_lat, p_lng);
END;
$$;

DROP POLICY IF EXISTS "attendance_insert" ON attendance;
CREATE POLICY "attendance_insert" ON attendance
  FOR INSERT WITH CHECK (
    parish_id = my_parish_id()
    AND (
      is_parish_admin()
      OR (profile_id = auth.uid() AND parish_allows_self_checkin(attendance.parish_id))
    )
  );

COMMIT;
