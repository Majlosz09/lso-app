-- =============================================================
-- Audyt 2026-11-05 — Etap 2: rodzic łączy się z dzieckiem za zgodą opiekuna
--
-- Wcześniej rodzic przy rejestracji (kod parafii + wybór z listy) był łączony z dziećmi od razu,
-- zanim opiekun go zatwierdził — każdy z kodem parafii mógł „przejąć” dowolne dziecko bez rodzica
-- (powiadomienia dziecka, zgłaszanie nieobecności, zapisy, punkty).
--
--  1. parent_link_requests — prośby rodzica o połączenie z dziećmi (tylko przez RPC).
--  2. link_parent_to_children: opiekun łączy od razu; rodzic czekający na zatwierdzenie
--     zapisuje prośby; zatwierdzony rodzic — „poproś opiekuna”.
--  3. approve_member: po zatwierdzeniu rodzica łączy go z dziećmi z próśb (tylko dzieci nadal
--     bez rodzica, z tej parafii) i czyści prośby.
--  4. get_pending_members: w polu children także dzieci wskazane w prośbach (opiekun widzi je
--     w karcie zatwierdzania).
--  5. Zmiana parafii rodzica (odrzucenie, wyjście z oczekiwania, usunięcie) czyści jego prośby.
--  6. unlink_my_child: rodzic odłącza swoje dziecko (wcześniej bezpośredni update blokował RLS
--     bez błędu — przycisk „Odłącz” nic nie robił).
-- =============================================================

BEGIN;

-- 1. Prośby
CREATE TABLE IF NOT EXISTS public.parent_link_requests (
  parent_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  child_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (parent_id, child_id)
);
CREATE INDEX IF NOT EXISTS parent_link_requests_child ON public.parent_link_requests (child_id);
ALTER TABLE public.parent_link_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parent_link_requests_select ON public.parent_link_requests;
CREATE POLICY parent_link_requests_select ON public.parent_link_requests
  FOR SELECT USING (
    parent_id = (SELECT auth.uid())
    OR ((SELECT is_parish_admin())
        AND EXISTS (SELECT 1 FROM profiles c WHERE c.id = parent_link_requests.child_id AND c.parish_id = (SELECT my_parish_id())))
  );
-- zapis tylko przez funkcje SECURITY DEFINER (brak polityk INSERT/UPDATE/DELETE)

-- 2. Łączenie
CREATE OR REPLACE FUNCTION public.link_parent_to_children(p_child_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid  uuid := auth.uid();
  me     profiles%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO me FROM profiles WHERE id = v_uid;
  IF me.parish_id IS NULL THEN RAISE EXCEPTION 'User has no parish assigned'; END IF;

  -- opiekun parafii: połączenie od razu (jak dotąd)
  IF (me.role = 'admin' OR me.is_admin) AND me.approved THEN
    UPDATE profiles SET parent_id = v_uid
     WHERE id = ANY(p_child_ids) AND parish_id = me.parish_id AND role = 'member'
       AND (parent_id IS NULL OR parent_id = v_uid);
    RETURN;
  END IF;

  IF me.role IS DISTINCT FROM 'parent' THEN
    RAISE EXCEPTION 'Only parents or admins can link children';
  END IF;
  IF me.approved THEN
    RAISE EXCEPTION 'Połączenie z dzieckiem ustawia opiekun parafii — poproś go o to';
  END IF;

  -- rodzic czekający na zatwierdzenie: tylko prośby, decyzja przy zatwierdzeniu
  DELETE FROM parent_link_requests WHERE parent_id = v_uid;
  INSERT INTO parent_link_requests (parent_id, child_id)
  SELECT v_uid, c.id FROM profiles c
   WHERE c.id = ANY(p_child_ids) AND c.parish_id = me.parish_id AND c.role = 'member' AND c.parent_id IS NULL
  ON CONFLICT DO NOTHING;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.link_parent_to_children(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_parent_to_children(uuid[]) TO authenticated;

-- 3. Zatwierdzenie
CREATE OR REPLACE FUNCTION public.approve_member(p_profile_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_token text;
  v_role  text;
BEGIN
  IF NOT is_parish_admin() THEN
    RAISE EXCEPTION 'Tylko administrator parafii może zatwierdzać członków';
  END IF;
  UPDATE profiles SET approved = true
   WHERE id = p_profile_id AND parish_id = my_parish_id() AND NOT approved
  RETURNING push_token, role INTO v_token, v_role;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nie znaleziono oczekującej osoby w Twojej parafii';
  END IF;

  IF v_role = 'parent' THEN
    UPDATE profiles c SET parent_id = p_profile_id
      FROM parent_link_requests r
     WHERE r.parent_id = p_profile_id AND c.id = r.child_id
       AND c.parish_id = my_parish_id() AND c.role = 'member' AND c.parent_id IS NULL;
  END IF;
  DELETE FROM parent_link_requests WHERE parent_id = p_profile_id;

  IF v_token IS NOT NULL THEN
    PERFORM notify_push(ARRAY[v_token], 'Witamy w parafii!', 'Administrator zatwierdził Twoje konto — możesz korzystać z aplikacji.');
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.approve_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_member(uuid) TO authenticated;

-- 4. Lista oczekujących: także dzieci z próśb
CREATE OR REPLACE FUNCTION public.get_pending_members()
RETURNS TABLE(id uuid, full_name text, role text, phone text, rocznik integer, created_at timestamp with time zone, email text, children text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.full_name, p.role, p.phone, p.rocznik, p.created_at, u.email::text,
         (SELECT string_agg(k.full_name, ', ' ORDER BY k.full_name) FROM (
            SELECT c.full_name FROM profiles c WHERE c.parent_id = p.id
            UNION
            SELECT c.full_name FROM parent_link_requests r JOIN profiles c ON c.id = r.child_id
             WHERE r.parent_id = p.id AND c.parish_id = my_parish_id() AND c.parent_id IS NULL
          ) k)
    FROM profiles p
    JOIN auth.users u ON u.id = p.id
   WHERE is_parish_admin()
     AND p.parish_id = my_parish_id()
     AND NOT p.approved
   ORDER BY p.created_at;
$$;
REVOKE EXECUTE ON FUNCTION public.get_pending_members() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pending_members() TO authenticated;

-- 5. Zmiana parafii rodzica → prośby znikają
CREATE OR REPLACE FUNCTION public.trg_profiles_clear_link_requests()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM parent_link_requests WHERE parent_id = NEW.id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_profiles_clear_link_requests ON profiles;
CREATE TRIGGER trg_profiles_clear_link_requests AFTER UPDATE OF parish_id ON profiles
  FOR EACH ROW WHEN (OLD.parish_id IS DISTINCT FROM NEW.parish_id)
  EXECUTE FUNCTION public.trg_profiles_clear_link_requests();

-- 6. Rodzic odłącza swoje dziecko
CREATE OR REPLACE FUNCTION public.unlink_my_child(p_child_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Zaloguj się'; END IF;
  UPDATE profiles SET parent_id = NULL WHERE id = p_child_id AND parent_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'To dziecko nie jest połączone z Twoim kontem'; END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.unlink_my_child(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlink_my_child(uuid) TO authenticated;

COMMIT;
