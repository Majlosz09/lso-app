-- =============================================================
-- Ministrant bez konta + import listy (2026-10-05)
--  1. profiles.managed: profil prowadzony przez parafię (bez logowania) — w grafiku, na tablecie, w punktach,
--     rodzic może go połączyć ze swoim kontem. profiles.id nie musi już być kontem logowania
--     (FK do auth.users zastąpiony wyzwalaczem kasującym profil przy usunięciu konta).
--  2. claim_code: osobisty kod — dziecko zakłada konto z kodem i przejmuje profil z całą historią.
--  3. import_members(): lista z Excela (imię i nazwisko, rocznik, funkcje, ranga) → profile bez konta + kody.
-- =============================================================

BEGIN;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS managed boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS claim_code text UNIQUE;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_managed_member;
ALTER TABLE profiles ADD CONSTRAINT profiles_managed_member CHECK (NOT managed OR role = 'member');

-- profil nie musi być kontem logowania
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();
CREATE OR REPLACE FUNCTION public.trg_auth_user_deleted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.profiles WHERE id = OLD.id;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
CREATE TRIGGER on_auth_user_deleted AFTER DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION public.trg_auth_user_deleted();

-- Wyzwalacze profili: pomiń profile bez konta (czat, powiadomienia o nowym koncie) i operacje systemowe (lso.sys)
DO $$
DECLARE
  r   record;
  def text;
  guard text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname IN (
       'add_profile_to_chat_channels', 'trg_fn_notify_new_user', 'trg_inapp_profiles', 'trg_profiles_protect_sensitive_fields')
  LOOP
    def := pg_get_functiondef(r.oid);
    IF position('lso.sys' IN def) > 0 THEN CONTINUE; END IF;
    guard := CASE WHEN r.proname = 'trg_profiles_protect_sensitive_fields'
      THEN E'BEGIN\n  IF current_setting(''lso.sys'', true) = ''on'' THEN RETURN NEW; END IF;\n'
      ELSE E'BEGIN\n  IF NEW.managed OR current_setting(''lso.sys'', true) = ''on'' THEN RETURN NEW; END IF;\n' END;
    -- pierwszy BEGIN = początek ciała funkcji
    EXECUTE regexp_replace(def, E'BEGIN\\s*\\n', guard);
  END LOOP;
END $$;

-- Ochrona przydziałów: operacja systemowa (przejęcie profilu) może przepisać przydział na nowe konto
DO $$
DECLARE def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'trg_assignments_protect';
  IF def IS NOT NULL AND position('lso.sys' IN def) = 0 THEN
    EXECUTE replace(def, 'current_setting(''lso.roles_rpc'', true) = ''on''',
                    'current_setting(''lso.roles_rpc'', true) = ''on'' OR current_setting(''lso.sys'', true) = ''on''');
  END IF;
END $$;

-- Kod osobisty: 8 znaków bez mylących (O/0, I/1)
CREATE OR REPLACE FUNCTION public.new_claim_code()
RETURNS text LANGUAGE plpgsql VOLATILE SET search_path = public, extensions AS $$
DECLARE
  v_alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code  text;
BEGIN
  LOOP
    v_code := '';
    FOR i IN 1..8 LOOP
      v_code := v_code || substr(v_alpha, 1 + (get_byte(gen_random_bytes(1), 0) % length(v_alpha)), 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM profiles WHERE claim_code = v_code);
  END LOOP;
  RETURN v_code;
END;
$$;

-- ── Import (i dodanie pojedynczego ministranta bez konta) ──
-- p_rows: [{full_name, rocznik?, functions?: [nazwy], rank?: nazwa}]
CREATE OR REPLACE FUNCTION public.import_members(p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_parish uuid := my_parish_id();
  r        jsonb;
  v_name   text;
  v_id     uuid;
  v_code   text;
  v_out    jsonb := '[]'::jsonb;
  fn       text;
BEGIN
  IF NOT is_parish_admin() OR v_parish IS NULL THEN RAISE EXCEPTION 'Tylko opiekun parafii'; END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 300 THEN RAISE EXCEPTION 'Niepoprawna lista (max 300 osób)'; END IF;
  PERFORM set_config('lso.sys', 'on', true);

  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_name := regexp_replace(btrim(coalesce(r->>'full_name', '')), '\s+', ' ', 'g');
    IF length(v_name) < 3 OR position(' ' IN v_name) = 0 THEN
      v_out := v_out || jsonb_build_object('full_name', v_name, 'status', 'invalid');
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM profiles WHERE parish_id = v_parish AND lower(full_name) = lower(v_name)) THEN
      v_out := v_out || jsonb_build_object('full_name', v_name, 'status', 'exists');
      CONTINUE;
    END IF;
    v_code := new_claim_code();
    INSERT INTO profiles (id, full_name, role, parish_id, rocznik, rank_id, is_active, approved, managed, claim_code, onboarding_completed)
    VALUES (gen_random_uuid(), left(v_name, 80), 'member', v_parish,
            CASE WHEN (r->>'rocznik') ~ '^(19|20)\d\d$' THEN (r->>'rocznik')::int END,
            (SELECT id FROM ranks WHERE (parish_id IS NULL OR parish_id = v_parish) AND lower(name) = lower(btrim(r->>'rank'))
              ORDER BY parish_id NULLS LAST LIMIT 1),
            true, true, true, v_code, true)
    RETURNING id INTO v_id;
    IF jsonb_typeof(r->'functions') = 'array' THEN
      FOR fn IN SELECT jsonb_array_elements_text(r->'functions') LOOP
        INSERT INTO member_functions (profile_id, function_id, parish_id)
        SELECT v_id, f.id, v_parish FROM parish_functions f
         WHERE f.parish_id = v_parish AND lower(f.name) = lower(btrim(fn))
        ON CONFLICT DO NOTHING;
      END LOOP;
    END IF;
    v_out := v_out || jsonb_build_object('full_name', v_name, 'status', 'created', 'id', v_id, 'claim_code', v_code);
  END LOOP;

  PERFORM set_config('lso.sys', 'off', true);
  RETURN v_out;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.import_members(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_members(jsonb) TO authenticated;

-- Nowy kod (np. zgubiony) — opiekun
CREATE OR REPLACE FUNCTION public.regenerate_claim_code(p_profile uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code text;
BEGIN
  IF NOT is_parish_admin() OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_profile AND managed AND parish_id = my_parish_id()) THEN
    RAISE EXCEPTION 'Nie znaleziono ministranta bez konta';
  END IF;
  v_code := new_claim_code();
  PERFORM set_config('lso.sys', 'on', true);
  UPDATE profiles SET claim_code = v_code WHERE id = p_profile;
  PERFORM set_config('lso.sys', 'off', true);
  RETURN v_code;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.regenerate_claim_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regenerate_claim_code(uuid) TO authenticated;

-- ── Rejestracja z kodem osobistym ──
-- Formularz: po wpisaniu kodu podpowiada parafię (kod zaproszenia) i imię i nazwisko
CREATE OR REPLACE FUNCTION public.claim_code_info(p_code text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('full_name', p.full_name, 'rocznik', p.rocznik, 'parish', pa.name, 'invite_code', pa.invite_code)
    FROM profiles p JOIN parishes pa ON pa.id = p.parish_id
   WHERE p.managed AND p.claim_code = upper(replace(btrim(p_code), '-', '')) AND length(btrim(p_code)) >= 8
$$;
REVOKE EXECUTE ON FUNCTION public.claim_code_info(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_code_info(text) TO anon, authenticated;

-- Nowe konto przejmuje profil bez konta: historia przechodzi na konto, profil bez konta znika
CREATE OR REPLACE FUNCTION public.claim_member_profile(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  me    profiles%ROWTYPE;
  m     profiles%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Zaloguj się'; END IF;
  SELECT * INTO me FROM profiles WHERE id = v_uid;
  SELECT * INTO m FROM profiles WHERE managed AND claim_code = upper(replace(btrim(p_code), '-', ''));
  IF m.id IS NULL THEN RAISE EXCEPTION 'Nieznany kod osobisty'; END IF;
  IF me.id IS NULL OR me.role IS DISTINCT FROM 'member' THEN RAISE EXCEPTION 'Kod osobisty jest dla konta ministranta'; END IF;
  IF me.parish_id IS NOT NULL AND me.parish_id <> m.parish_id THEN RAISE EXCEPTION 'Kod jest z innej parafii'; END IF;
  IF EXISTS (SELECT 1 FROM schedule_assignments WHERE profile_id = v_uid)
     OR EXISTS (SELECT 1 FROM points WHERE profile_id = v_uid) THEN
    RAISE EXCEPTION 'To konto ma już swoją historię — poproś opiekuna o połączenie';
  END IF;

  PERFORM set_config('lso.sys', 'on', true);
  UPDATE attendance            SET profile_id = v_uid WHERE profile_id = m.id;
  UPDATE extra_attendance      SET profile_id = v_uid WHERE profile_id = m.id;
  UPDATE group_members         SET profile_id = v_uid WHERE profile_id = m.id;
  UPDATE member_badges         SET profile_id = v_uid WHERE profile_id = m.id;
  UPDATE points                SET profile_id = v_uid WHERE profile_id = m.id;
  UPDATE recurring_commitments SET profile_id = v_uid WHERE profile_id = m.id;
  UPDATE recurring_assignments SET profile_id = v_uid WHERE profile_id = m.id;
  UPDATE schedule_assignments  SET profile_id = v_uid WHERE profile_id = m.id;
  UPDATE swap_offers           SET from_profile_id = v_uid WHERE from_profile_id = m.id;
  UPDATE swap_offers           SET to_profile_id = v_uid WHERE to_profile_id = m.id;
  UPDATE attendance_reports    SET profile_id = v_uid WHERE profile_id = m.id;
  UPDATE notifications         SET profile_id = v_uid WHERE profile_id = m.id;
  INSERT INTO member_functions (profile_id, function_id, parish_id)
  SELECT v_uid, function_id, parish_id FROM member_functions WHERE profile_id = m.id ON CONFLICT DO NOTHING;
  DELETE FROM member_functions WHERE profile_id = m.id;

  DELETE FROM profiles WHERE id = m.id;
  UPDATE profiles SET parish_id = m.parish_id, rocznik = coalesce(me.rocznik, m.rocznik), rank_id = coalesce(m.rank_id, me.rank_id),
         parent_id = coalesce(m.parent_id, me.parent_id), is_active = true, approved = true
   WHERE id = v_uid;
  PERFORM set_config('lso.sys', 'off', true);
  -- czat parafii jak przy zwykłym zatwierdzeniu ministranta
  INSERT INTO chat_members (channel_id, user_id)
  SELECT id, v_uid FROM chat_channels WHERE parish_id = m.parish_id AND slug = 'ministranci'
  ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('claimed', m.full_name);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_member_profile(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_member_profile(text) TO authenticated;

COMMIT;
