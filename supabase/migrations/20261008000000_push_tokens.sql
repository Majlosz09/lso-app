-- =============================================================
-- Powiadomienia push: jeden telefon = jedno konto (2026-10-08)
-- Problem: wylogowanie nie odpinało telefonu, więc po zalogowaniu kilku osób na jednym telefonie
-- ten sam token był na kilku kontach i telefon dostawał powiadomienia wszystkich tych osób.
--   claim_push_token(token)  — przypina token do mnie i odpina go od innych kont,
--   release_push_token()     — odpina mój telefon (wylogowanie, „wyłącz powiadomienia”),
--   send_test_push()         — powiadomienie testowe na mój telefon (Profil → Powiadomienia).
-- Jednorazowo: tokeny zdublowane między kontami są czyszczone (aplikacja przypnie je ponownie
-- właściwej osobie przy najbliższym uruchomieniu).
-- =============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.claim_push_token(p_token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Zaloguj się'; END IF;
  IF p_token IS NULL OR p_token !~ '^Expo(nent)?PushToken\[.+\]$' THEN RAISE EXCEPTION 'Nieprawidłowy token powiadomień'; END IF;
  PERFORM set_config('lso.sys', 'on', true);  -- odpięcie z cudzych profili omija ochronę profili
  UPDATE profiles SET push_token = NULL WHERE push_token = p_token AND id <> auth.uid();
  UPDATE profiles SET push_token = p_token WHERE id = auth.uid() AND push_token IS DISTINCT FROM p_token;
  PERFORM set_config('lso.sys', 'off', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_push_token()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  UPDATE profiles SET push_token = NULL WHERE id = auth.uid() AND push_token IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_test_push()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_token text;
BEGIN
  SELECT push_token INTO v_token FROM profiles WHERE id = auth.uid();
  IF v_token IS NULL THEN RETURN false; END IF;
  PERFORM notify_push(ARRAY[v_token], 'Powiadomienia działają ✅', 'To jest testowe powiadomienie z LSO App.', '{}'::jsonb);
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_push_token(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.release_push_token() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.send_test_push() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_push_token(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_push_token() TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_test_push() TO authenticated;

-- jednorazowo: token przypięty do kilku kont → odpinamy wszędzie
SELECT set_config('lso.sys', 'on', true);
UPDATE profiles SET push_token = NULL
 WHERE push_token IN (SELECT push_token FROM profiles WHERE push_token IS NOT NULL GROUP BY push_token HAVING count(*) > 1);
SELECT set_config('lso.sys', 'off', true);

COMMIT;
