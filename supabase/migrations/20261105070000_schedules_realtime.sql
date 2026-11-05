-- Audyt 2026-11-05, Etap 7 (decyzja właściciela): zmiany służb na żywo. Tabela schedules nie była w publikacji
-- supabase_realtime, więc dodana / zmieniona / usunięta służba docierała do innych dopiero po ponownym pobraniu
-- (aplikacja słucha jej od dawna — hooks/useServices.ts, osobny kanał). Realtime sprawdza RLS (schedules_select:
-- własna parafia), a aplikacja filtruje INSERT/UPDATE po parish_id; seria zmian = jedno odświeżenie po 1,5 s.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'schedules') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.schedules;
  END IF;
END $$;
