-- =============================================================
-- Funkcje liturgiczne członków (2026-10-05)
-- Rangi (Kandydat → Ceremoniarz) zostają jako stopnie. Funkcje to uprawnienia — jedna osoba może mieć kilka
-- (np. lektor + turyferariusz). Rola na Mszy o nazwie funkcji wymaga tej funkcji przy samodzielnym wyborze
-- (claim_role_slot); opiekun przydziela dowolnie (w aplikacji widzi ostrzeżenie).
-- =============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS parish_functions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parish_id   uuid NOT NULL REFERENCES parishes(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 40),
  description text CHECK (description IS NULL OR length(description) <= 160),
  sort_order  smallint NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS parish_functions_name ON parish_functions (parish_id, lower(btrim(name)));

CREATE TABLE IF NOT EXISTS member_functions (
  profile_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  function_id uuid NOT NULL REFERENCES parish_functions(id) ON DELETE CASCADE,
  parish_id   uuid NOT NULL REFERENCES parishes(id) ON DELETE CASCADE,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, function_id)
);
CREATE INDEX IF NOT EXISTS member_functions_parish ON member_functions (parish_id);

ALTER TABLE parish_functions ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_functions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "parish_functions_select" ON parish_functions;
CREATE POLICY "parish_functions_select" ON parish_functions FOR SELECT USING (parish_id = (SELECT my_parish_id()));
DROP POLICY IF EXISTS "parish_functions_write" ON parish_functions;
CREATE POLICY "parish_functions_write" ON parish_functions FOR ALL
  USING (parish_id = (SELECT my_parish_id()) AND (SELECT is_parish_admin()))
  WITH CHECK (parish_id = (SELECT my_parish_id()) AND (SELECT is_parish_admin()));
DROP POLICY IF EXISTS "member_functions_select" ON member_functions;
CREATE POLICY "member_functions_select" ON member_functions FOR SELECT USING (parish_id = (SELECT my_parish_id()));
DROP POLICY IF EXISTS "member_functions_write" ON member_functions;
CREATE POLICY "member_functions_write" ON member_functions FOR ALL
  USING (parish_id = (SELECT my_parish_id()) AND (SELECT is_parish_admin()))
  WITH CHECK (parish_id = (SELECT my_parish_id()) AND (SELECT is_parish_admin())
              AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = profile_id AND p.parish_id = member_functions.parish_id)
              AND EXISTS (SELECT 1 FROM parish_functions f WHERE f.id = function_id AND f.parish_id = member_functions.parish_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON parish_functions, member_functions TO authenticated;

-- Domyślne funkcje (każda parafia może je zmienić)
CREATE OR REPLACE FUNCTION public.seed_parish_functions(p_parish uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO parish_functions (parish_id, name, description, sort_order)
  SELECT p_parish, f.name, f.descr, f.ord FROM (VALUES
    ('Ceremoniarz',    'Prowadzi służbę liturgiczną przy ołtarzu', 1),
    ('Lektor',         'Czyta czytania i modlitwę wiernych', 2),
    ('Psałterzysta',   'Śpiewa psalm responsoryjny', 3),
    ('Akolita',        'Usługuje przy ołtarzu, pomaga w udzielaniu Komunii', 4),
    ('Krucyferariusz', 'Niesie krzyż w procesji', 5),
    ('Ceroferariusz',  'Niesie świecę', 6),
    ('Turyferariusz',  'Niesie kadzielnicę', 7),
    ('Nawikulariusz',  'Niesie łódkę z kadzidłem', 8)
  ) AS f(name, descr, ord)
  WHERE NOT EXISTS (SELECT 1 FROM parish_functions x WHERE x.parish_id = p_parish AND lower(x.name) = lower(f.name))
$$;
REVOKE EXECUTE ON FUNCTION public.seed_parish_functions(uuid) FROM PUBLIC, anon, authenticated;
SELECT seed_parish_functions(id) FROM parishes;

CREATE OR REPLACE FUNCTION trg_parishes_seed_functions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM seed_parish_functions(NEW.id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_parishes_seed_functions ON parishes;
CREATE TRIGGER trg_parishes_seed_functions AFTER INSERT ON parishes FOR EACH ROW EXECUTE FUNCTION trg_parishes_seed_functions();

-- Funkcja wymagana przez rolę (rola nazwana jak funkcja parafii)
CREATE OR REPLACE FUNCTION public.role_required_function(p_parish uuid, p_role_name text)
RETURNS uuid LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT id FROM parish_functions WHERE parish_id = p_parish AND lower(btrim(name)) = lower(btrim(p_role_name)) LIMIT 1
$$;

-- Samodzielny wybór roli: tylko z odpowiednią funkcją
CREATE OR REPLACE FUNCTION public.claim_role_slot(p_slot_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me     uuid := auth.uid();
  s        record;
  v_fn     uuid;
BEGIN
  SELECT sc.id, sc.parish_id, sc.roles_mode, r.name AS role_name, (sc.date + sc.time) AT TIME ZONE 'Europe/Warsaw' AS starts
    INTO s FROM schedule_role_slots r JOIN schedules sc ON sc.id = r.schedule_id WHERE r.id = p_slot_id;
  IF s.id IS NULL OR s.parish_id IS DISTINCT FROM my_parish_id() THEN
    RAISE EXCEPTION 'Nie znaleziono roli';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_me AND role = 'member' AND approved) THEN
    RAISE EXCEPTION 'Role wybierają ministranci';
  END IF;
  IF s.roles_mode IS DISTINCT FROM 'self' THEN
    RAISE EXCEPTION 'Na tej Mszy role przydziela opiekun';
  END IF;
  IF s.starts - interval '30 minutes' <= now() THEN
    RAISE EXCEPTION 'Za późno na wybór roli';
  END IF;
  IF EXISTS (SELECT 1 FROM schedule_assignments WHERE slot_id = p_slot_id) THEN
    RAISE EXCEPTION 'Ta rola jest już zajęta';
  END IF;
  IF EXISTS (SELECT 1 FROM schedule_assignments WHERE schedule_id = s.id AND profile_id = v_me
               AND status IN ('excused', 'confirmed', 'absent', 'present')) THEN
    RAISE EXCEPTION 'Nie możesz teraz wybrać roli na tej służbie';
  END IF;
  v_fn := role_required_function(s.parish_id, s.role_name);
  IF v_fn IS NOT NULL AND NOT EXISTS (SELECT 1 FROM member_functions WHERE profile_id = v_me AND function_id = v_fn) THEN
    RAISE EXCEPTION 'Rolę „%” pełnią osoby z tą funkcją — poproś opiekuna o jej nadanie', s.role_name;
  END IF;
  PERFORM _place_in_slot(p_slot_id, v_me);
END;
$$;

COMMIT;
