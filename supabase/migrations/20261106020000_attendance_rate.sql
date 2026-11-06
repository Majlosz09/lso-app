-- =============================================================
-- Jedna frekwencja w całej aplikacji (decyzja właściciela 2026-11-06)
--
-- Wcześniej trzy różne wzory (lista Członków / Statystyki / raport miesięczny + ścieżka formacji).
-- Teraz: obecny ÷ (obecny + nieobecny + zapisany, którego po zamknięciu meldowania nikt nie odhaczył).
-- Nie liczą się: przyjęte usprawiedliwienie (confirmed), czekające zgłoszenie (excused), zamiana (swapped),
-- służby bez obecności (service_mode 'none'). Dane w grafiku się nie zmieniają — opiekun może dalej poprawić obecność.
-- Ta sama reguła jest w aplikacji: lib/serviceRules.ts → rateStatus().
-- =============================================================

BEGIN;

-- 'present' / 'absent' / NULL (= nie wchodzi do frekwencji). Meldowanie zamyka się 90 min po rozpoczęciu (+5 min zapasu).
CREATE OR REPLACE FUNCTION public.rate_status(p_status text, p_date date, p_time time, p_mode text DEFAULT NULL)
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE
    WHEN p_mode = 'none' THEN NULL
    WHEN p_status = 'present' THEN 'present'
    WHEN p_status = 'absent' THEN 'absent'
    WHEN p_status = 'assigned'
         AND ((p_date + coalesce(p_time, '00:00'::time)) AT TIME ZONE 'Europe/Warsaw') + interval '95 minutes' < now() THEN 'absent'
  END
$$;

-- Raport miesięczny i ścieżka formacji (warunek „frekwencja”) — podmiana wzoru w bieżących definicjach
DO $$
DECLARE
  f   text;
  def text;
  n   int;
BEGIN
  FOREACH f IN ARRAY ARRAY['public._monthly_report(uuid, date)', 'public._formation_progress(uuid)'] LOOP
    def := pg_get_functiondef(f::regprocedure);
    IF position('rate_status(' IN def) > 0 THEN CONTINUE; END IF;  -- już podmienione
    n := (SELECT count(*) FROM regexp_matches(def, $r$count\(\*\) FILTER \(WHERE a\.status = 'present'\)$r$, 'g'));
    IF n = 0 OR n <> (SELECT count(*) FROM regexp_matches(def, $r$count\(\*\) FILTER \(WHERE a\.status IN \('present', 'absent', 'excused', 'confirmed'\)\)$r$, 'g')) THEN
      RAISE EXCEPTION '%: nie znaleziono wzoru frekwencji do podmiany', f;
    END IF;
    def := regexp_replace(def, $r$count\(\*\) FILTER \(WHERE a\.status = 'present'\)$r$,
             $x$count(*) FILTER (WHERE rate_status(a.status, s.date, s."time", s.service_mode) = 'present')$x$, 'g');
    def := regexp_replace(def, $r$count\(\*\) FILTER \(WHERE a\.status IN \('present', 'absent', 'excused', 'confirmed'\)\)$r$,
             $x$count(*) FILTER (WHERE rate_status(a.status, s.date, s."time", s.service_mode) IS NOT NULL)$x$, 'g');
    EXECUTE def;
  END LOOP;
END $$;

COMMIT;
