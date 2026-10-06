-- =============================================================
-- Rangi systemowe do wyboru przez parafię (2026-10-06)
-- Kandydat / Ministrant / Lektor Młodszy / Lektor Starszy / Ceremoniarz (ranks.parish_id IS NULL) są widoczne
-- tylko w parafiach z parishes.system_ranks_enabled. Domyślnie wyłączone; parafie, które już nadały komuś
-- rangę systemową albo ustawiły do niej wymagania, mają przełącznik włączony (nic im nie znika).
-- Wyłączenie nie kasuje nadanych rang — po ponownym włączeniu wracają.
-- =============================================================

BEGIN;

ALTER TABLE public.parishes ADD COLUMN IF NOT EXISTS system_ranks_enabled boolean NOT NULL DEFAULT false;

UPDATE public.parishes p SET system_ranks_enabled = true
 WHERE EXISTS (SELECT 1 FROM profiles pr JOIN ranks r ON r.id = pr.rank_id WHERE pr.parish_id = p.id AND r.parish_id IS NULL)
    OR EXISTS (SELECT 1 FROM rank_requirements q JOIN ranks r ON r.id = q.rank_id WHERE q.parish_id = p.id AND r.parish_id IS NULL);

-- czy ranga jest dostępna w danej parafii
CREATE OR REPLACE FUNCTION public.rank_available(p_rank_parish uuid, p_parish uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_rank_parish = p_parish
      OR (p_rank_parish IS NULL AND coalesce((SELECT system_ranks_enabled FROM parishes WHERE id = p_parish), false))
$$;
GRANT EXECUTE ON FUNCTION public.rank_available(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS ranks_select ON public.ranks;
CREATE POLICY ranks_select ON public.ranks FOR SELECT
  USING (rank_available(parish_id, (SELECT my_parish_id())));

-- ścieżka formacji i import: kolejny stopień / dopasowanie nazwy tylko spośród rang dostępnych w parafii
DO $do$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef('public._formation_progress(uuid)'::regprocedure);
  IF position('(parish_id IS NULL OR parish_id = me.parish_id)' IN v_def) = 0 THEN
    RAISE EXCEPTION '_formation_progress: nie znaleziono warunku rang';
  END IF;
  EXECUTE replace(v_def, '(parish_id IS NULL OR parish_id = me.parish_id)', 'rank_available(parish_id, me.parish_id)');

  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p
   WHERE p.proname = 'import_members' AND p.pronamespace = 'public'::regnamespace;
  IF position('(parish_id IS NULL OR parish_id = v_parish)' IN v_def) = 0 THEN
    RAISE EXCEPTION 'import_members: nie znaleziono warunku rang';
  END IF;
  EXECUTE replace(v_def, '(parish_id IS NULL OR parish_id = v_parish)', 'rank_available(parish_id, v_parish)');
END
$do$;

COMMIT;
