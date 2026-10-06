-- =============================================================
-- Pomocnik opiekuna (animator, starszy ceremoniarz) — 2026-10-05
-- Ministrant z flagą is_helper może: układać grafik i obsadę, zaznaczać obecność (także tablet w zakrystii),
-- rozpatrywać zgłoszenia obecności i usprawiedliwienia, przydzielać role na Mszy.
-- NIE może: członkowie, ustawienia, rozkład Mszy, punkty ręczne, czat/ogłoszenia jako admin.
-- Wybrane reguły RLS i funkcje dostają can_manage_services() zamiast is_parish_admin()
-- (podmiana na bieżących definicjach — działa tak samo na produkcji).
-- =============================================================

BEGIN;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_helper boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.can_manage_services()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND approved AND (role = 'admin' OR is_admin = true OR is_helper = true)
  )
$$;
REVOKE EXECUTE ON FUNCTION public.can_manage_services() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_services() TO authenticated;

-- is_helper nadaje tylko opiekun (nie sam ministrant)
CREATE OR REPLACE FUNCTION trg_profiles_protect_helper()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_helper THEN RAISE EXCEPTION 'Brak uprawnień do ustawienia pomocnika'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.is_helper IS DISTINCT FROM OLD.is_helper
     AND NOT (is_parish_admin() AND OLD.parish_id = my_parish_id()) THEN
    RAISE EXCEPTION 'Pomocnika opiekuna wyznacza opiekun parafii';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_profiles_protect_helper ON profiles;
CREATE TRIGGER trg_profiles_protect_helper BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION trg_profiles_protect_helper();

-- Funkcje: grafik, obsada, obecność, zgłoszenia, role
DO $$
DECLARE
  r   record;
  def text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = ANY (ARRAY[
       'apply_auto_schedule', 'assign_role_slot', 'cancel_recurring_assignments', 'check_in_and_award_points',
       'create_recurring_assignments', 'decide_attendance_report', 'reject_absence_request', 'set_schedule_roles',
       'trg_assignments_protect', 'trg_assignments_slot_insert'])
  LOOP
    def := pg_get_functiondef(r.oid);
    IF position('is_parish_admin()' IN def) > 0 THEN
      EXECUTE replace(def, 'is_parish_admin()', 'can_manage_services()');
    END IF;
  END LOOP;
END $$;

-- Reguły RLS: służby, przydziały, obecność, zgłoszenia, stałe dyżury
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies
     WHERE schemaname = 'public'
       AND (tablename, policyname) IN (
         ('schedules', 'schedules_insert'), ('schedules', 'schedules_update'), ('schedules', 'schedules_delete'),
         ('schedule_assignments', 'schedule_assignments_insert'), ('schedule_assignments', 'schedule_assignments_update'),
         ('schedule_assignments', 'schedule_assignments_delete'),
         ('attendance', 'attendance_insert'), ('attendance', 'attendance_update'), ('attendance', 'attendance_delete'),
         ('attendance_reports', 'attendance_reports_select'), ('recurring_assignments', 'recurring_assignments_select'))
  LOOP
    IF r.qual IS NOT NULL AND position('is_parish_admin()' IN r.qual) > 0 THEN
      EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)', r.policyname, r.tablename, replace(r.qual, 'is_parish_admin()', 'can_manage_services()'));
    END IF;
    IF r.with_check IS NOT NULL AND position('is_parish_admin()' IN r.with_check) > 0 THEN
      EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (%s)', r.policyname, r.tablename, replace(r.with_check, 'is_parish_admin()', 'can_manage_services()'));
    END IF;
  END LOOP;
END $$;

COMMIT;
