-- =============================================================
-- PUNKTY, AKCEPTACJA CZŁONKÓW, DOSZCZELNIENIA (2026-09-28)
-- Uruchom PO 20260928000000_admin_tools.sql (najpierw LSO-dev).
--
--  1. Punkty: jedna księga (tabela points). Ranking = suma punktów.
--     Było: widok doliczał 5 pkt za każdą obecność, a potwierdzenie obecności
--     i tak zapisywało punkty z reguły → podwójne liczenie; odznaczenie obecności
--     nie cofało punktów.
--  2. Akceptacja nowych członków przez admina (dołączenie kodem → „oczekuje”).
--     Oczekujący nie widzi danych parafii, inni nie widzą jego.
--     Lista dzieci przy rejestracji rodzica: tylko imię + inicjał, po kodzie.
--     Nowe kody zaproszeń: 6 znaków A-Z0-9 zamiast szesnastkowych.
--  3. Powiadomienia: notify_push wysyła token dostępu Expo z Vault (jeśli ustawiony)
--     → po włączeniu „Enhanced push security” w Expo same tokeny urządzeń są bezużyteczne.
--  4. Profil: ministrant nie zmieni sobie rangi / aktywności / rodzica;
--     przydział: ministrant zmienia tylko status (zgłoszenie nieobecności,
--     obecny tylko przy zapisanej obecności).
-- =============================================================

BEGIN;

-- =============================================================
-- 1. PUNKTY
-- =============================================================
ALTER TABLE points ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';
DO $$ BEGIN
  ALTER TABLE points ADD CONSTRAINT points_source_check CHECK (source IN ('manual', 'checkin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1a. Istniejące punkty z potwierdzenia obecności: powiąż ze służbą.
--     check_in zapisywał obecność i punkty w jednej transakcji → ten sam now().
UPDATE points p
   SET schedule_id = a.schedule_id, source = 'checkin'
  FROM attendance a
 WHERE p.schedule_id IS NULL
   AND p.source = 'manual'
   AND p.awarded_by = p.profile_id
   AND a.profile_id = p.profile_id
   AND a.checked_at = p.created_at
   AND p.reason IN ('Msza (dyżur)', 'Msza (dodatkowa)', 'Nabożeństwo', 'Zbiórka', 'Służba');

-- 1b. Obecności bez punktów (parafie bez reguł) dostawały w rankingu 5 pkt z widoku —
--     zapisujemy je w księdze, żeby sumy się nie zmieniły. Bez powiadomień push.
ALTER TABLE points DISABLE TRIGGER trg_notify_points;
INSERT INTO points (profile_id, amount, reason, schedule_id, awarded_by, parish_id, source, created_at)
SELECT a.profile_id, 5, 'Służba', a.schedule_id, a.profile_id, a.parish_id, 'checkin', a.checked_at
  FROM attendance a
 WHERE NOT EXISTS (
   SELECT 1 FROM points p
    WHERE p.source = 'checkin' AND p.profile_id = a.profile_id AND p.schedule_id = a.schedule_id
 );
ALTER TABLE points ENABLE TRIGGER trg_notify_points;

-- 1c. Potwierdzenie obecności: punkty z reguły parafii (domyślnie 5, gdy reguły brak),
--     zawsze powiązane ze służbą
CREATE OR REPLACE FUNCTION public.check_in_and_award_points_impl(
  p_schedule_id uuid, p_profile_id uuid, p_parish_id uuid,
  p_method text DEFAULT 'manual', p_lat double precision DEFAULT NULL, p_lng double precision DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_assignment_id uuid;
  v_assignment_status text;
  v_schedule_category text;
  v_service_type service_type_enum;
  v_points integer;
  v_reason text := '';
BEGIN
  IF EXISTS (SELECT 1 FROM attendance WHERE schedule_id = p_schedule_id AND profile_id = p_profile_id) THEN
    RETURN jsonb_build_object('already_checked_in', true, 'points_awarded', 0, 'reason', '');
  END IF;

  SELECT category INTO v_schedule_category FROM schedules WHERE id = p_schedule_id;

  SELECT id, status INTO v_assignment_id, v_assignment_status
    FROM schedule_assignments WHERE schedule_id = p_schedule_id AND profile_id = p_profile_id;

  IF v_schedule_category = 'msza' THEN
    v_service_type := CASE WHEN v_assignment_id IS NOT NULL THEN 'msza_assigned'::service_type_enum ELSE 'msza_extra'::service_type_enum END;
  ELSIF v_schedule_category = 'nabozenstwo' THEN
    v_service_type := 'nabozenstwo'::service_type_enum;
  ELSIF v_schedule_category = 'zbiorka' THEN
    v_service_type := 'zbiorka'::service_type_enum;
  END IF;

  INSERT INTO attendance (schedule_id, profile_id, method, checked_at, parish_id, lat, lng, marked_by)
  VALUES (p_schedule_id, p_profile_id, p_method, now(), p_parish_id, NULL, NULL, coalesce(auth.uid(), p_profile_id))
  ON CONFLICT (schedule_id, profile_id) DO NOTHING;

  IF v_assignment_id IS NOT NULL THEN
    UPDATE schedule_assignments SET status = 'present' WHERE id = v_assignment_id;
  ELSE
    INSERT INTO schedule_assignments (schedule_id, profile_id, role, status)
    VALUES (p_schedule_id, p_profile_id, 'ministrant', 'present')
    ON CONFLICT (schedule_id, profile_id) DO UPDATE SET status = 'present';
  END IF;

  IF v_service_type IS NOT NULL THEN
    SELECT points INTO v_points FROM point_rules
     WHERE parish_id = p_parish_id AND service_type = v_service_type;
    IF NOT FOUND THEN
      v_points := 5;
    END IF;
  ELSE
    v_points := 5;
  END IF;

  v_reason := CASE v_service_type::text
    WHEN 'msza_assigned' THEN 'Msza (dyżur)'
    WHEN 'msza_extra'    THEN 'Msza (dodatkowa)'
    WHEN 'nabozenstwo'   THEN 'Nabożeństwo'
    WHEN 'zbiorka'       THEN 'Zbiórka'
    ELSE 'Służba'
  END;

  IF v_points > 0 THEN
    INSERT INTO points (profile_id, amount, reason, schedule_id, service_type, parish_id, awarded_by, source)
    VALUES (p_profile_id, v_points, v_reason, p_schedule_id, v_service_type, p_parish_id, p_profile_id, 'checkin');
  END IF;

  RETURN jsonb_build_object('already_checked_in', false, 'points_awarded', v_points, 'reason', v_reason);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.check_in_and_award_points_impl(uuid, uuid, uuid, text, double precision, double precision)
  FROM PUBLIC, anon, authenticated;

-- 1d. Odznaczenie obecności cofa punkty za tę służbę
CREATE OR REPLACE FUNCTION trg_attendance_revoke_points()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM points
   WHERE source = 'checkin' AND profile_id = OLD.profile_id AND schedule_id = OLD.schedule_id;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_attendance_revoke_points ON attendance;
CREATE TRIGGER trg_attendance_revoke_points
  AFTER DELETE ON attendance
  FOR EACH ROW EXECUTE FUNCTION trg_attendance_revoke_points();

-- 1e. Ranking = suma księgi punktów (bez doliczania 5 pkt za obecność)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT true;

CREATE OR REPLACE VIEW public.points_summary WITH (security_invoker = true) AS
SELECT p.id AS profile_id,
       p.full_name,
       p.parish_id,
       COALESCE(a.services_count, 0) AS services_count,
       COALESCE(pt.total, 0) AS total_points
  FROM profiles p
  LEFT JOIN (SELECT profile_id, count(*)::integer AS services_count FROM attendance GROUP BY profile_id) a
         ON a.profile_id = p.id
  LEFT JOIN (SELECT profile_id, COALESCE(sum(amount), 0)::integer AS total FROM points GROUP BY profile_id) pt
         ON pt.profile_id = p.id
 WHERE p.is_active = true AND p.role = 'member' AND p.approved = true;

-- =============================================================
-- 2. AKCEPTACJA CZŁONKÓW
-- =============================================================
-- Parafia „moja” tylko po zatwierdzeniu — od tej funkcji zależy całe RLS
CREATE OR REPLACE FUNCTION my_parish_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT parish_id FROM profiles WHERE id = auth.uid() AND approved
$$;
CREATE OR REPLACE FUNCTION get_my_parish_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT parish_id FROM profiles WHERE id = auth.uid() AND approved
$$;
CREATE OR REPLACE FUNCTION is_parish_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND approved AND (role = 'admin' OR is_admin = true)
  )
$$;

-- Oczekujących widzi tylko on sam (admin — przez get_pending_members)
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (id = auth.uid() OR (parish_id = my_parish_id() AND approved));

-- Rejestracja z kodem → oczekuje (założyciel parafii nie przechodzi tędy)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_meta    jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role    text  := CASE WHEN v_meta->>'role' IN ('member', 'parent') THEN v_meta->>'role' ELSE 'member' END;
  v_parish  uuid;
  v_rocznik int;
BEGIN
  IF coalesce(v_meta->>'invite_code', '') <> '' THEN
    SELECT id INTO v_parish FROM parishes WHERE invite_code = upper(trim(v_meta->>'invite_code')) LIMIT 1;
  END IF;
  BEGIN
    v_rocznik := nullif(v_meta->>'rocznik', '')::int;
  EXCEPTION WHEN others THEN
    v_rocznik := NULL;
  END;

  INSERT INTO public.profiles (id, full_name, role, phone, rocznik, parish_id, approved)
  VALUES (
    new.id,
    coalesce(nullif(trim(v_meta->>'full_name'), ''), new.email),
    v_role,
    nullif(trim(v_meta->>'phone'), ''),
    CASE WHEN v_role = 'member' THEN v_rocznik END,
    v_parish,
    v_parish IS NULL
  );
  RETURN new;
END;
$$;

-- Ochrona profilu (zastępuje wersję z 20260927000000)
CREATE OR REPLACE FUNCTION trg_profiles_protect_sensitive_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_becomes_admin boolean := (NEW.role = 'admin' OR NEW.is_admin IS TRUE);
  v_creator boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.is_admin IS TRUE THEN
      RAISE EXCEPTION 'Brak uprawnień do ustawienia is_admin';
    END IF;
    v_creator := NEW.parish_id IS NOT NULL
                 AND EXISTS (SELECT 1 FROM parishes WHERE id = NEW.parish_id AND created_by = v_uid);
    IF NEW.role = 'admin' AND NEW.parish_id IS NOT NULL AND NOT v_creator THEN
      RAISE EXCEPTION 'Brak uprawnień: administratorem można zostać tylko we własnej parafii';
    END IF;
    NEW.approved := NEW.parish_id IS NULL OR v_creator;
    RETURN NEW;
  END IF;

  IF OLD.id = v_uid THEN
    -- Pola ustawiane przez admina
    IF NOT is_parish_admin() AND (
         NEW.rank_id IS DISTINCT FROM OLD.rank_id
      OR NEW.is_active IS DISTINCT FROM OLD.is_active
      OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
    ) THEN
      RAISE EXCEPTION 'Brak uprawnień do zmiany rangi, aktywności lub przypisania rodzica';
    END IF;
    IF NEW.is_admin IS TRUE AND OLD.is_admin IS NOT TRUE THEN
      RAISE EXCEPTION 'Brak uprawnień do ustawienia is_admin';
    END IF;

    IF OLD.parish_id IS NULL AND NEW.parish_id IS NOT NULL THEN
      -- Pierwsze dołączenie: admin i od razu zatwierdzony tylko we własnej parafii
      v_creator := EXISTS (SELECT 1 FROM parishes WHERE id = NEW.parish_id AND created_by = v_uid);
      IF v_becomes_admin AND NOT v_creator THEN
        RAISE EXCEPTION 'Brak uprawnień: administratorem można zostać tylko we własnej parafii';
      END IF;
      NEW.approved := v_creator;
      RETURN NEW;
    END IF;

    IF NEW.approved IS DISTINCT FROM OLD.approved THEN
      RAISE EXCEPTION 'Brak uprawnień do zmiany statusu zatwierdzenia';
    END IF;
    IF NEW.parish_id IS DISTINCT FROM OLD.parish_id AND NEW.parish_id IS NOT NULL THEN
      RAISE EXCEPTION 'Nie możesz samodzielnie zmienić parafii';
    END IF;
    IF NEW.role IS DISTINCT FROM OLD.role AND NEW.role = 'admin' THEN
      RAISE EXCEPTION 'Nie możesz nadać sobie roli administratora';
    END IF;
    RETURN NEW;
  END IF;

  -- Cudzy profil (RLS: tylko admin tej samej parafii)
  IF NEW.parish_id IS NOT DISTINCT FROM OLD.parish_id
     AND NEW.role IS NOT DISTINCT FROM OLD.role
     AND NEW.is_admin IS NOT DISTINCT FROM OLD.is_admin THEN
    RETURN NEW;
  END IF;
  IF NOT (is_parish_admin() AND OLD.parish_id = my_parish_id()) THEN
    RAISE EXCEPTION 'Brak uprawnień do zmiany parish_id, role lub is_admin';
  END IF;
  IF NEW.parish_id IS DISTINCT FROM OLD.parish_id AND NEW.parish_id IS NOT NULL THEN
    RAISE EXCEPTION 'Nie można przenieść użytkownika do innej parafii';
  END IF;
  RETURN NEW;
END;
$$;

-- Czat: oczekujący nie trafiają do kanałów; po zatwierdzeniu — tak
CREATE OR REPLACE FUNCTION public.add_profile_to_chat_channels()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.parish_id IS NULL OR NOT NEW.approved THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.parish_id IS NOT NULL AND OLD.parish_id = NEW.parish_id
     AND OLD.role = NEW.role AND OLD.is_admin = NEW.is_admin
     AND OLD.approved = NEW.approved THEN
    RETURN NEW;
  END IF;

  IF NEW.role = 'member' THEN
    INSERT INTO chat_members(channel_id, user_id)
    SELECT id, NEW.id FROM chat_channels WHERE parish_id = NEW.parish_id AND slug = 'ministranci'
    ON CONFLICT DO NOTHING;
  END IF;
  IF NEW.role = 'parent' THEN
    INSERT INTO chat_members(channel_id, user_id)
    SELECT id, NEW.id FROM chat_channels WHERE parish_id = NEW.parish_id AND slug = 'rodzice'
    ON CONFLICT DO NOTHING;
  END IF;
  IF NEW.role = 'admin' OR NEW.is_admin = TRUE THEN
    INSERT INTO chat_members(channel_id, user_id)
    SELECT id, NEW.id FROM chat_channels WHERE parish_id = NEW.parish_id AND slug IN ('ministranci', 'rodzice')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_add_profile_to_chat_channels ON profiles;
CREATE TRIGGER trg_add_profile_to_chat_channels
  AFTER INSERT OR UPDATE OF parish_id, role, is_admin, approved ON profiles
  FOR EACH ROW EXECUTE FUNCTION add_profile_to_chat_channels();

-- Powiadomienie adminów o nowej osobie (było: tylko is_admin, bez ról 'admin'; tylko INSERT)
CREATE OR REPLACE FUNCTION public.trg_fn_notify_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tokens text[];
BEGIN
  IF NEW.parish_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.parish_id IS NOT DISTINCT FROM NEW.parish_id THEN RETURN NEW; END IF;

  SELECT array_agg(push_token) INTO v_tokens
    FROM profiles
   WHERE parish_id = NEW.parish_id AND approved
     AND (role = 'admin' OR is_admin = true)
     AND push_token IS NOT NULL AND id <> NEW.id;

  IF v_tokens IS NOT NULL THEN
    IF NEW.approved THEN
      PERFORM notify_push(v_tokens, 'Nowy użytkownik', NEW.full_name || ' dołączył do parafii');
    ELSE
      PERFORM notify_push(v_tokens, 'Prośba o dołączenie',
        NEW.full_name || ' chce dołączyć do parafii — zatwierdź w zakładce Ministranci',
        jsonb_build_object('screen', 'members'));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_new_user ON profiles;
CREATE TRIGGER trg_notify_new_user
  AFTER INSERT OR UPDATE OF parish_id ON profiles
  FOR EACH ROW EXECUTE FUNCTION trg_fn_notify_new_user();

-- Lista oczekujących dla admina (z informacją, do których dzieci zgłasza się rodzic)
CREATE OR REPLACE FUNCTION get_pending_members()
RETURNS TABLE (id uuid, full_name text, role text, phone text, rocznik int, created_at timestamptz, email text, children text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.full_name, p.role, p.phone, p.rocznik, p.created_at, u.email::text,
         (SELECT string_agg(c.full_name, ', ') FROM profiles c WHERE c.parent_id = p.id)
    FROM profiles p
    JOIN auth.users u ON u.id = p.id
   WHERE is_parish_admin()
     AND p.parish_id = my_parish_id()
     AND NOT p.approved
   ORDER BY p.created_at;
$$;

CREATE OR REPLACE FUNCTION approve_member(p_profile_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_token text;
BEGIN
  IF NOT is_parish_admin() THEN
    RAISE EXCEPTION 'Tylko administrator parafii może zatwierdzać członków';
  END IF;
  UPDATE profiles SET approved = true
   WHERE id = p_profile_id AND parish_id = my_parish_id() AND NOT approved
  RETURNING push_token INTO v_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nie znaleziono oczekującej osoby w Twojej parafii';
  END IF;
  IF v_token IS NOT NULL THEN
    PERFORM notify_push(ARRAY[v_token], 'Witamy w parafii!', 'Administrator zatwierdził Twoje konto — możesz korzystać z aplikacji.');
  END IF;
END;
$$;

-- Odrzucenie = usunięcie z parafii (remove_member_from_parish działa też dla oczekujących).
-- Po usunięciu konto wraca do stanu „bez parafii”.
CREATE OR REPLACE FUNCTION public.remove_member_from_parish(p_profile_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_parish uuid := my_parish_id();
  v_target profiles%ROWTYPE;
BEGIN
  IF NOT is_parish_admin() OR v_parish IS NULL THEN
    RAISE EXCEPTION 'Tylko administrator parafii może usuwać osoby z parafii';
  END IF;
  SELECT * INTO v_target FROM profiles WHERE id = p_profile_id;
  IF v_target.id IS NULL OR v_target.parish_id IS DISTINCT FROM v_parish THEN
    RAISE EXCEPTION 'Ta osoba nie należy do Twojej parafii';
  END IF;
  IF p_profile_id = auth.uid() THEN
    RAISE EXCEPTION 'Nie możesz usunąć samego siebie';
  END IF;
  IF v_target.role = 'admin' OR v_target.is_admin THEN
    RAISE EXCEPTION 'Najpierw odbierz tej osobie uprawnienia administratora';
  END IF;

  DELETE FROM schedule_assignments sa USING schedules s
   WHERE s.id = sa.schedule_id AND sa.profile_id = p_profile_id
     AND s.date >= current_date AND sa.status IN ('assigned', 'excused');
  DELETE FROM recurring_assignments WHERE profile_id = p_profile_id;
  DELETE FROM recurring_commitments WHERE profile_id = p_profile_id;
  DELETE FROM chat_members cm USING chat_channels cc
   WHERE cc.id = cm.channel_id AND cc.parish_id = v_parish AND cm.user_id = p_profile_id;

  UPDATE profiles SET parent_id = NULL WHERE parent_id = p_profile_id;
  UPDATE profiles SET parish_id = NULL, parent_id = NULL, rank_id = NULL, approved = true
   WHERE id = p_profile_id;
END;
$$;

-- Lista dzieci przy rejestracji rodzica: tylko po kodzie, imię + inicjał + rocznik
CREATE OR REPLACE FUNCTION get_parish_children_by_code(code text)
RETURNS TABLE (id uuid, display_name text, rocznik int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id,
         split_part(p.full_name, ' ', 1)
           || CASE WHEN split_part(p.full_name, ' ', 2) <> '' THEN ' ' || left(split_part(p.full_name, ' ', 2), 1) || '.' ELSE '' END,
         p.rocznik
    FROM profiles p
    JOIN parishes pa ON pa.id = p.parish_id
   WHERE pa.invite_code = upper(trim(code))
     AND p.role = 'member' AND p.is_active AND p.approved
     AND length(trim(code)) = 6
   ORDER BY p.full_name;
$$;
GRANT EXECUTE ON FUNCTION get_parish_children_by_code(text) TO anon, authenticated;

-- Stara funkcja (pełne imiona po samym ID parafii): tylko dla admina własnej parafii
CREATE OR REPLACE FUNCTION public.get_parish_members(p_parish_id uuid)
RETURNS TABLE(id uuid, full_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, full_name FROM profiles
   WHERE parish_id = p_parish_id AND p_parish_id = my_parish_id()
     AND role = 'member' AND is_active AND approved
   ORDER BY full_name;
$$;
REVOKE EXECUTE ON FUNCTION public.get_parish_members(uuid) FROM PUBLIC, anon;

-- Nowe kody zaproszeń: 6 znaków A-Z0-9 bez mylących (0/O, 1/I/L) → ~700 mln kombinacji
CREATE OR REPLACE FUNCTION gen_invite_code()
RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
    FROM generate_series(1, 6);
$$;
ALTER TABLE parishes ALTER COLUMN invite_code SET DEFAULT gen_invite_code();

-- =============================================================
-- 3. POWIADOMIENIA: token dostępu Expo z Vault
--    Ustaw w Supabase → Project Settings → Vault: sekret o nazwie expo_access_token
--    (Expo → Account → Access tokens), potem w Expo włącz „Enhanced push security”.
-- =============================================================
CREATE OR REPLACE FUNCTION notify_push(
  tokens text[],
  title  text,
  body   text,
  data   jsonb DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  batch   jsonb := '[]'::jsonb;
  token   text;
  headers jsonb := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json');
  v_secret text;
BEGIN
  IF tokens IS NULL OR array_length(tokens, 1) IS NULL THEN RETURN; END IF;

  BEGIN
    SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'expo_access_token' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_secret := NULL;
  END;
  IF v_secret IS NOT NULL THEN
    headers := headers || jsonb_build_object('Authorization', 'Bearer ' || v_secret);
  END IF;

  FOREACH token IN ARRAY tokens LOOP
    CONTINUE WHEN token IS NULL OR length(token) = 0;
    batch := batch || jsonb_build_array(jsonb_build_object(
      'to', token, 'title', title, 'body', left(body, 500), 'data', data, 'sound', 'default'
    ));
    IF jsonb_array_length(batch) = 100 THEN
      BEGIN
        PERFORM net.http_post(url := 'https://exp.host/--/api/v2/push/send', headers := headers, body := batch);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
      batch := '[]'::jsonb;
    END IF;
  END LOOP;

  IF jsonb_array_length(batch) > 0 THEN
    BEGIN
      PERFORM net.http_post(url := 'https://exp.host/--/api/v2/push/send', headers := headers, body := batch);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION notify_push(text[], text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- =============================================================
-- 4. PRZYDZIAŁY: ministrant zmienia tylko status we własnym przydziale
-- =============================================================
CREATE OR REPLACE FUNCTION trg_assignments_protect()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF is_parish_admin() AND EXISTS (
    SELECT 1 FROM schedules s WHERE s.id = OLD.schedule_id AND s.parish_id = my_parish_id()
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.schedule_id IS DISTINCT FROM OLD.schedule_id
     OR NEW.profile_id IS DISTINCT FROM OLD.profile_id
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.admin_note IS DISTINCT FROM OLD.admin_note
     OR NEW.recurring_assignment_id IS DISTINCT FROM OLD.recurring_assignment_id THEN
    RAISE EXCEPTION 'Brak uprawnień do zmiany przydziału';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF (OLD.status = 'assigned' AND NEW.status = 'excused')          -- zgłoszenie nieobecności
       OR (OLD.status = 'excused' AND NEW.status = 'assigned')       -- wycofanie zgłoszenia
       OR (NEW.status = 'present' AND EXISTS (                       -- obecny tylko po zameldowaniu
             SELECT 1 FROM attendance a WHERE a.schedule_id = NEW.schedule_id AND a.profile_id = NEW.profile_id))
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Brak uprawnień do zmiany statusu na %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_assignments_protect ON schedule_assignments;
CREATE TRIGGER trg_assignments_protect
  BEFORE UPDATE ON schedule_assignments
  FOR EACH ROW EXECUTE FUNCTION trg_assignments_protect();

-- =============================================================
-- Uprawnienia
-- =============================================================
REVOKE EXECUTE ON FUNCTION get_pending_members() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION approve_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_pending_members() TO authenticated;
GRANT EXECUTE ON FUNCTION approve_member(uuid) TO authenticated;

COMMIT;
