-- =============================================================
-- SPRZĄTANIE STARYCH POLITYK RLS (audyt 2026-09-27)
-- Uruchom PO 20260927000000_security_hardening.sql.
--
-- Na produkcji wisiało ~160 polityk, w tym stare wyklikane w panelu, np.
-- "Profile widoczny dla zalogowanych" USING (true). Polityki PERMISSIVE się sumują,
-- więc każda taka otwierała dane WSZYSTKICH parafii każdemu zalogowanemu
-- (profile z telefonami i rocznikami dzieci, obecności, punkty, przydziały,
-- kody zaproszeń parafii), a polityki typu "Admin can update any assignment"
-- dawały adminowi dowolnej parafii zapis w cudzych danych.
--
-- Zostawiamy WYŁĄCZNIE polityki z migracji w repo (lista KEEP), wszystkie inne
-- polityki na tych tabelach są usuwane. Zweryfikowane z zapytaniami w apce.
-- =============================================================

BEGIN;

DO $$
DECLARE
  keep text[] := array[
    'announcements.announcements_select', 'announcements.announcements_insert',
    'announcements.announcements_update', 'announcements.announcements_delete',
    'attendance.attendance_select', 'attendance.attendance_insert',
    'attendance.attendance_update', 'attendance.attendance_delete',
    'badge_definitions.badge_definitions_select', 'badge_definitions.badge_definitions_admin_write',
    'chat_channels.chat_channels_select', 'chat_channels.chat_channels_insert',
    'chat_members.chat_members_select', 'chat_members.chat_members_insert', 'chat_members.chat_members_update',
    'chat_messages.chat_messages_select', 'chat_messages.chat_messages_insert', 'chat_messages.chat_messages_update',
    'chat_poll_options.chat_poll_options_select', 'chat_poll_options.chat_poll_options_insert',
    'chat_poll_votes.chat_poll_votes_select', 'chat_poll_votes.chat_poll_votes_insert', 'chat_poll_votes.chat_poll_votes_delete',
    'chat_polls.chat_polls_select', 'chat_polls.chat_polls_insert', 'chat_polls.chat_polls_update',
    'chat_reactions.chat_reactions_select', 'chat_reactions.chat_reactions_insert',
    'chat_reactions.chat_reactions_update', 'chat_reactions.chat_reactions_delete',
    'extra_attendance.member insert own', 'extra_attendance.member view own',
    'group_members.group_members: admin manage', 'group_members.group_members: see own parish',
    'groups.groups: admin manage', 'groups.groups: see own parish',
    'mass_templates.mass_templates_select', 'mass_templates.mass_templates_admin_write',
    'member_badges.member_badges_select', 'member_badges.member_badges_member_write',
    'member_badges.member_badges_member_update', 'member_badges.member_badges_admin_write',
    'parishes.parishes_select_own', 'parishes.parishes_insert', 'parishes.parishes_admin_update',
    'point_rules.point_rules_select', 'point_rules.point_rules_admin_write',
    'points.points_select', 'points.points_insert', 'points.points_update', 'points.points_delete',
    'profiles.profiles_select', 'profiles.profiles_insert', 'profiles.profiles_update',
    'ranks.ranks_select', 'ranks.ranks_admin_write',
    'recurring_commitments.recurring_commitments_self', 'recurring_commitments.recurring: admin',
    'schedule_assignments.schedule_assignments_select', 'schedule_assignments.schedule_assignments_insert',
    'schedule_assignments.schedule_assignments_update', 'schedule_assignments.schedule_assignments_delete',
    'schedules.schedules_select', 'schedules.schedules_insert', 'schedules.schedules_update', 'schedules.schedules_delete',
    'swap_offers.Twórz własne oferty zastępstw', 'swap_offers.Edytuj własne oferty zastępstw',
    'wiedza_entries.wiedza_entries_read', 'wiedza_entries.wiedza_entries_admin_write'
  ];
  r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN (
         'announcements', 'attendance', 'badge_definitions', 'chat_channels', 'chat_members',
         'chat_messages', 'chat_poll_options', 'chat_poll_votes', 'chat_polls', 'chat_reactions',
         'extra_attendance', 'group_members', 'groups', 'mass_templates', 'member_badges',
         'parishes', 'point_rules', 'points', 'profiles', 'ranks', 'recurring_commitments',
         'schedule_assignments', 'schedules', 'swap_offers', 'wiedza_entries')
       AND (tablename || '.' || policyname) <> ALL (keep)
  LOOP
    RAISE NOTICE 'DROP POLICY % ON %', r.policyname, r.tablename;
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- parishes: założyciel musi widzieć parafię zaraz po utworzeniu (insert ... returning),
-- zanim ustawi sobie parish_id — wcześniej działało tylko dzięki staremu "Read own parish"
DROP POLICY IF EXISTS "parishes_select_own" ON parishes;
CREATE POLICY "parishes_select_own" ON parishes
  FOR SELECT USING (id = my_parish_id() OR created_by = auth.uid());

-- extra_attendance: admin widzi tylko swoją parafię (stare "admin view all" = wszystkie parafie)
CREATE POLICY "extra_attendance_admin_select" ON extra_attendance
  FOR SELECT USING (
    is_parish_admin()
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = extra_attendance.profile_id AND p.parish_id = my_parish_id())
  );

-- swap_offers (giełda zastępstw): tylko własna parafia (było USING (true))
CREATE POLICY "swap_offers_select" ON swap_offers
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM schedules s WHERE s.id = swap_offers.schedule_id AND s.parish_id = my_parish_id())
  );

-- record_extra_attendance: nieużywane w apce, a pozwalało dopisywać sobie 5 pkt bez limitu
REVOKE EXECUTE ON FUNCTION record_extra_attendance(text, date, time without time zone) FROM PUBLIC, anon, authenticated;

-- -------------------------------------------------------------
-- storage: awatary — każdy zapisuje/usuwa tylko swój plik "<user_id>.jpg"
-- (było: każdy zalogowany mógł nadpisać lub skasować cudzy awatar).
-- Odczyt działa przez publiczny URL bucketu.
-- -------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can update avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Full access for authenticated users in avatars" ON storage.objects;

CREATE POLICY "avatars_own_select" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'avatars' AND name = auth.uid()::text || '.jpg');
CREATE POLICY "avatars_own_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars' AND name = auth.uid()::text || '.jpg');
CREATE POLICY "avatars_own_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND name = auth.uid()::text || '.jpg')
  WITH CHECK (bucket_id = 'avatars' AND name = auth.uid()::text || '.jpg');
CREATE POLICY "avatars_own_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'avatars' AND name = auth.uid()::text || '.jpg');

COMMIT;
