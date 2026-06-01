-- Parish data isolation: Row Level Security dla wszystkich tabel danych

-- ============================================================
-- Funkcje pomocnicze (SECURITY DEFINER omija RLS — bezpieczne)
-- ============================================================

-- Zwraca parish_id zalogowanego użytkownika
CREATE OR REPLACE FUNCTION my_parish_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT parish_id FROM profiles WHERE id = auth.uid()
$$;

-- Sprawdza czy zalogowany user jest adminem swojej parafii
CREATE OR REPLACE FUNCTION is_parish_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS(
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND (role = 'admin' OR is_admin = true)
  )
$$;

-- ============================================================
-- profiles
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Własny profil ALBO inni z tej samej parafii
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (
    id = auth.uid() OR parish_id = my_parish_id()
  );

-- Tylko własny profil można inserować (rejestracja)
CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- Własny profil ALBO admin tej samej parafii
CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE USING (
    id = auth.uid()
    OR (is_parish_admin() AND parish_id = my_parish_id())
  ) WITH CHECK (
    id = auth.uid()
    OR (is_parish_admin() AND parish_id = my_parish_id())
  );

-- ============================================================
-- schedules
-- ============================================================
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedules_select" ON schedules
  FOR SELECT USING (parish_id = my_parish_id());

CREATE POLICY "schedules_insert" ON schedules
  FOR INSERT WITH CHECK (parish_id = my_parish_id() AND is_parish_admin());

CREATE POLICY "schedules_update" ON schedules
  FOR UPDATE USING (parish_id = my_parish_id() AND is_parish_admin())
  WITH CHECK (parish_id = my_parish_id() AND is_parish_admin());

CREATE POLICY "schedules_delete" ON schedules
  FOR DELETE USING (parish_id = my_parish_id() AND is_parish_admin());

-- ============================================================
-- schedule_assignments (brak parish_id — filtruj przez schedules)
-- ============================================================
ALTER TABLE schedule_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedule_assignments_select" ON schedule_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM schedules s
      WHERE s.id = schedule_assignments.schedule_id
        AND s.parish_id = my_parish_id()
    )
  );

CREATE POLICY "schedule_assignments_insert" ON schedule_assignments
  FOR INSERT WITH CHECK (
    is_parish_admin()
    AND EXISTS (
      SELECT 1 FROM schedules s
      WHERE s.id = schedule_assignments.schedule_id
        AND s.parish_id = my_parish_id()
    )
  );

-- Własny check-in (profile_id = auth.uid()) ALBO admin parafii
CREATE POLICY "schedule_assignments_update" ON schedule_assignments
  FOR UPDATE USING (
    profile_id = auth.uid()
    OR (
      is_parish_admin()
      AND EXISTS (
        SELECT 1 FROM schedules s
        WHERE s.id = schedule_assignments.schedule_id
          AND s.parish_id = my_parish_id()
      )
    )
  ) WITH CHECK (
    profile_id = auth.uid()
    OR (
      is_parish_admin()
      AND EXISTS (
        SELECT 1 FROM schedules s
        WHERE s.id = schedule_assignments.schedule_id
          AND s.parish_id = my_parish_id()
      )
    )
  );

CREATE POLICY "schedule_assignments_delete" ON schedule_assignments
  FOR DELETE USING (
    is_parish_admin()
    AND EXISTS (
      SELECT 1 FROM schedules s
      WHERE s.id = schedule_assignments.schedule_id
        AND s.parish_id = my_parish_id()
    )
  );

-- ============================================================
-- attendance
-- ============================================================
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attendance_select" ON attendance
  FOR SELECT USING (parish_id = my_parish_id());

-- Własna obecność (check-in) ALBO admin parafii
CREATE POLICY "attendance_insert" ON attendance
  FOR INSERT WITH CHECK (
    parish_id = my_parish_id()
    AND (profile_id = auth.uid() OR is_parish_admin())
  );

CREATE POLICY "attendance_update" ON attendance
  FOR UPDATE USING (parish_id = my_parish_id() AND is_parish_admin())
  WITH CHECK (parish_id = my_parish_id() AND is_parish_admin());

CREATE POLICY "attendance_delete" ON attendance
  FOR DELETE USING (parish_id = my_parish_id() AND is_parish_admin());

-- ============================================================
-- points
-- ============================================================
ALTER TABLE points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "points_select" ON points
  FOR SELECT USING (parish_id = my_parish_id());

CREATE POLICY "points_insert" ON points
  FOR INSERT WITH CHECK (parish_id = my_parish_id() AND is_parish_admin());

CREATE POLICY "points_update" ON points
  FOR UPDATE USING (parish_id = my_parish_id() AND is_parish_admin())
  WITH CHECK (parish_id = my_parish_id() AND is_parish_admin());

CREATE POLICY "points_delete" ON points
  FOR DELETE USING (parish_id = my_parish_id() AND is_parish_admin());

-- ============================================================
-- announcements
-- ============================================================
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "announcements_select" ON announcements
  FOR SELECT USING (parish_id = my_parish_id());

CREATE POLICY "announcements_insert" ON announcements
  FOR INSERT WITH CHECK (parish_id = my_parish_id() AND is_parish_admin());

CREATE POLICY "announcements_update" ON announcements
  FOR UPDATE USING (parish_id = my_parish_id() AND is_parish_admin())
  WITH CHECK (parish_id = my_parish_id() AND is_parish_admin());

CREATE POLICY "announcements_delete" ON announcements
  FOR DELETE USING (parish_id = my_parish_id() AND is_parish_admin());

-- ============================================================
-- point_rules
-- ============================================================
ALTER TABLE point_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "point_rules_select" ON point_rules
  FOR SELECT USING (parish_id = my_parish_id());

CREATE POLICY "point_rules_admin_write" ON point_rules
  FOR ALL USING (parish_id = my_parish_id() AND is_parish_admin())
  WITH CHECK (parish_id = my_parish_id() AND is_parish_admin());

-- ============================================================
-- mass_templates
-- ============================================================
ALTER TABLE mass_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mass_templates_select" ON mass_templates
  FOR SELECT USING (parish_id = my_parish_id());

CREATE POLICY "mass_templates_admin_write" ON mass_templates
  FOR ALL USING (parish_id = my_parish_id() AND is_parish_admin())
  WITH CHECK (parish_id = my_parish_id() AND is_parish_admin());

-- ============================================================
-- ranks (parish_id nullable — systemowe rangi mają NULL)
-- ============================================================
ALTER TABLE ranks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ranks_select" ON ranks
  FOR SELECT USING (
    parish_id IS NULL OR parish_id = my_parish_id()
  );

-- Admin może zarządzać tylko własnymi rangami parafii (nie systemowymi)
CREATE POLICY "ranks_admin_write" ON ranks
  FOR ALL USING (
    parish_id = my_parish_id() AND is_parish_admin()
  ) WITH CHECK (
    parish_id = my_parish_id() AND is_parish_admin()
  );

-- ============================================================
-- Trigger: blokuj zmianę parish_id / role / is_admin przez non-admina
-- ============================================================
CREATE OR REPLACE FUNCTION trg_profiles_protect_sensitive_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Sprawdź czy zmieniane są chronione pola
  IF (NEW.parish_id IS DISTINCT FROM OLD.parish_id
      OR NEW.role IS DISTINCT FROM OLD.role
      OR NEW.is_admin IS DISTINCT FROM OLD.is_admin)
  THEN
    -- Tylko admin może zmieniać te pola
    IF NOT EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND (role = 'admin' OR is_admin = true)
    ) THEN
      RAISE EXCEPTION 'Brak uprawnień do zmiany parish_id, role lub is_admin';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_protect_sensitive
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION trg_profiles_protect_sensitive_fields();
