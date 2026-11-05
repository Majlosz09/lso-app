-- Audyt 2026-11-05, Etap 5: wydajność RLS.
-- Funkcje bez argumentów w politykach (auth.uid(), my_parish_id(), is_parish_admin() …) opakowane w ( SELECT … ) —
-- Postgres liczy je raz na zapytanie (initplan) zamiast dla każdego wiersza. Znaczenie polityk bez zmian.
-- Jak w 20260928020000_chat_perf_rodo.sql (dynamicznie, bo na bazie część polityk różni się od plików migracji),
-- tym razem z can_manage_services() i tymi, które powstały później (notifications, content_reads, swap_offers,
-- schedule_role_slots, chat_*_insert, attendance_reports_delete …). Funkcje z argumentem (chat_can_post(channel_id))
-- zostają bez zmian. Migracja idempotentna — wywołania już opakowane są pomijane.
DO $$
DECLARE
  r record;
  v_qual text;
  v_check text;
  fn text;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
      FROM pg_policies
     WHERE schemaname = 'public'
  LOOP
    v_qual := r.qual;
    v_check := r.with_check;
    FOREACH fn IN ARRAY array['my_parish_id', 'get_my_parish_id', 'is_parish_admin', 'can_manage_services', 'auth.uid', 'parish_allows_member_dm'] LOOP
      IF v_qual IS NOT NULL THEN
        v_qual := regexp_replace(v_qual, '(?<!SELECT )(?<![a-z_.])' || replace(fn, '.', '\.') || '\(\)', '( SELECT ' || fn || '() )', 'g');
      END IF;
      IF v_check IS NOT NULL THEN
        v_check := regexp_replace(v_check, '(?<!SELECT )(?<![a-z_.])' || replace(fn, '.', '\.') || '\(\)', '( SELECT ' || fn || '() )', 'g');
      END IF;
    END LOOP;

    IF v_qual IS DISTINCT FROM r.qual THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)', r.policyname, r.schemaname, r.tablename, v_qual);
    END IF;
    IF v_check IS DISTINCT FROM r.with_check THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I WITH CHECK (%s)', r.policyname, r.schemaname, r.tablename, v_check);
    END IF;
  END LOOP;
END $$;
