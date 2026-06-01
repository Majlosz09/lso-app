-- Poprawki do migracji parish_rls

-- ============================================================
-- C7: schedule_assignments_delete — zezwól na self-delete (wypisanie)
-- ============================================================
DROP POLICY IF EXISTS "schedule_assignments_delete" ON schedule_assignments;

CREATE POLICY "schedule_assignments_delete" ON schedule_assignments
  FOR DELETE USING (
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

-- ============================================================
-- C1: parishes — dodaj RLS (rejestracja używa SECURITY DEFINER RPC)
-- ============================================================
ALTER TABLE parishes ENABLE ROW LEVEL SECURITY;

-- Zalogowany user widzi tylko swoją parafię (rejestracja używa RPC get_parish_by_invite_code)
CREATE POLICY "parishes_select_own" ON parishes
  FOR SELECT USING (id = my_parish_id());

-- Admin może aktualizować ustawienia swojej parafii
CREATE POLICY "parishes_admin_update" ON parishes
  FOR UPDATE USING (id = my_parish_id() AND is_parish_admin())
  WITH CHECK (id = my_parish_id() AND is_parish_admin());

-- Nowy admin może tworzyć parafię (onboarding)
CREATE POLICY "parishes_insert" ON parishes
  FOR INSERT WITH CHECK (created_by = auth.uid());

-- ============================================================
-- C2: profiles_insert — blokuj self-elevation do admin przy rejestracji
-- ============================================================
DROP POLICY IF EXISTS "profiles_insert" ON profiles;

CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT WITH CHECK (
    id = auth.uid()
    AND (role IS NULL OR role IN ('member', 'parent', 'admin'))
    AND is_admin IS NOT TRUE
  );

-- ============================================================
-- C3: recurring_commitments — tylko własne rekordy
-- ============================================================
ALTER TABLE recurring_commitments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recurring_commitments_self" ON recurring_commitments
  FOR ALL USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

-- ============================================================
-- C4: groups — widoczne tylko w kontekście własnej parafii
-- (brak parish_id, filtrujemy przez created_by który jest adminem parafii)
-- ============================================================
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "groups_select" ON groups
  FOR SELECT USING (
    created_by IS NULL
    OR created_by IN (
      SELECT id FROM profiles WHERE parish_id = my_parish_id()
    )
  );

CREATE POLICY "groups_admin_write" ON groups
  FOR ALL USING (
    created_by IN (
      SELECT id FROM profiles
      WHERE id = auth.uid() AND (role = 'admin' OR is_admin = true)
    )
  ) WITH CHECK (
    created_by IN (
      SELECT id FROM profiles
      WHERE id = auth.uid() AND (role = 'admin' OR is_admin = true)
    )
  );

-- ============================================================
-- I1: schedule_assignments_insert — sprawdź że profile_id jest z tej parafii
-- ============================================================
DROP POLICY IF EXISTS "schedule_assignments_insert" ON schedule_assignments;

CREATE POLICY "schedule_assignments_insert" ON schedule_assignments
  FOR INSERT WITH CHECK (
    is_parish_admin()
    AND EXISTS (
      SELECT 1 FROM schedules s
      WHERE s.id = schedule_assignments.schedule_id
        AND s.parish_id = my_parish_id()
    )
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = schedule_assignments.profile_id
        AND p.parish_id = my_parish_id()
    )
  );
