-- Zezwól rodzicowi na odczyt danych swojego dziecka.
-- Relacja: child.parent_id = parent.id (kolumna w tabeli profiles).
--
-- Problem: member_badges_select nie obejmuje roli 'parent', przez co PostgREST
-- zwraca błąd przy embedded join w member-profile.tsx i rodzic widzi
-- "Nie znaleziono profilu" zamiast karty dziecka.

-- ============================================================
-- member_badges: dodaj dostęp dla rodzica
-- ============================================================
DROP POLICY IF EXISTS "member_badges_select" ON member_badges;

CREATE POLICY "member_badges_select" ON member_badges
  FOR SELECT USING (
    -- Ministrant widzi własne odznaki
    profile_id = auth.uid()

    -- Admin parafii widzi odznaki wszystkich w swojej parafii
    OR EXISTS (
      SELECT 1 FROM profiles a
      JOIN profiles m ON m.id = member_badges.profile_id
      WHERE a.id = auth.uid()
        AND (a.role = 'admin' OR a.is_admin = true)
        AND a.parish_id = m.parish_id
    )

    -- Rodzic widzi odznaki swojego dziecka
    OR EXISTS (
      SELECT 1 FROM profiles child
      WHERE child.id = member_badges.profile_id
        AND child.parent_id = auth.uid()
    )
  );

-- ============================================================
-- points: dodaj dostęp dla rodzica (podgląd punktów dziecka)
-- Obecnie points_select używa tylko parish_id = my_parish_id()
-- co powinno działać, ale dodajemy explicit dla pewności.
-- ============================================================
-- (points_select jest już oparty na parish_id — rodzic w tej samej parafii
--  co dziecko ma już dostęp, nie trzeba zmieniać)

-- ============================================================
-- schedule_assignments: rodzic może widzieć zapisy swojego dziecka
-- Obecnie select filtruje przez parish_id — powinno działać.
-- ============================================================
-- (schedule_assignments_select jest oparty na parish_id przez schedules — OK)
