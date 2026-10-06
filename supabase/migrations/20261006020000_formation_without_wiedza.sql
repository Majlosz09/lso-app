-- =============================================================
-- Wiedza bez „przeczytane” (2026-10-06)
-- Aplikacja nie zaznacza już przeczytanych haseł Wiedzy, więc ścieżka formacji nie może tego wymagać:
-- czyścimy wymagania „przeczytane działy Wiedzy” i usuwamy ten punkt z _formation_progress.
-- Kolumny wiedza_categories / wiedza_keys zostają (puste), tabela content_reads dalej służy ogłoszeniom.
-- =============================================================

BEGIN;

UPDATE public.rank_requirements SET wiedza_categories = '{}', wiedza_keys = '{}'
 WHERE cardinality(wiedza_categories) > 0 OR cardinality(wiedza_keys) > 0;

DO $do$
DECLARE v_def text; v_from int; v_to int;
BEGIN
  v_def := pg_get_functiondef('public._formation_progress(uuid)'::regprocedure);
  v_from := position('    IF cardinality(req.wiedza_keys) > 0 THEN' IN v_def);
  IF v_from = 0 THEN RAISE EXCEPTION '_formation_progress: brak bloku Wiedzy'; END IF;
  v_to := position('    END IF;' IN substr(v_def, v_from));
  IF v_to = 0 THEN RAISE EXCEPTION '_formation_progress: brak końca bloku Wiedzy'; END IF;
  -- wycinamy cały blok IF … END IF; (wewnątrz nie ma zagnieżdżonych IF)
  v_def := substr(v_def, 1, v_from - 1) || substr(v_def, v_from + v_to - 1 + length('    END IF;') + 1);
  EXECUTE v_def;
END
$do$;

COMMIT;
