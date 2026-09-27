-- =============================================================
-- Usuwanie konta przez użytkownika (RODO art. 17 + wymóg Google Play / App Store)
-- Uruchom w: Supabase Dashboard → SQL Editor (po 20260927000000_security_hardening.sql)
-- =============================================================

CREATE OR REPLACE FUNCTION delete_my_account()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_parish_id uuid;
  v_is_admin  boolean;
  r           record;
  v_rows      bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT parish_id, (role = 'admin' OR is_admin IS TRUE)
    INTO v_parish_id, v_is_admin
    FROM profiles WHERE id = v_uid;

  -- Nie zostawiaj parafii z ludźmi, ale bez administratora
  IF v_is_admin AND v_parish_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM profiles WHERE parish_id = v_parish_id AND id <> v_uid)
     AND NOT EXISTS (
       SELECT 1 FROM profiles
        WHERE parish_id = v_parish_id AND id <> v_uid AND (role = 'admin' OR is_admin IS TRUE)
     ) THEN
    RAISE EXCEPTION 'Jesteś jedynym administratorem parafii. Nadaj uprawnienia administratora innej osobie, a potem usuń konto.';
  END IF;

  -- Odłącz dzieci (konto rodzica)
  UPDATE profiles SET parent_id = NULL WHERE parent_id = v_uid;

  -- Klucze obce bez ON DELETE CASCADE / SET NULL:
  --  * kolumna nullable            → SET NULL (np. created_by, marked_by)
  --  * kolumna „właściciela” wiersza → DELETE (dane tej osoby)
  --  * inna NOT NULL               → przerwij (lepiej błąd niż skasowane dane parafii)
  FOR r IN
    SELECT c.conrelid::regclass AS tbl, a.attname AS col, a.attnotnull AS notnull
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f'
       AND array_length(c.conkey, 1) = 1
       AND c.confrelid IN ('public.profiles'::regclass, 'auth.users'::regclass)
       AND c.confdeltype NOT IN ('c', 'n', 'd')
       AND c.conrelid::regclass::text NOT LIKE 'auth.%'
       AND NOT (c.conrelid = 'public.profiles'::regclass AND a.attname = 'id')
  LOOP
    IF NOT r.notnull THEN
      EXECUTE format('UPDATE %s SET %I = NULL WHERE %I = $1', r.tbl, r.col, r.col) USING v_uid;
    ELSIF r.col IN ('profile_id', 'user_id', 'sender_id', 'member_id', 'creator_id', 'voter_id') THEN
      EXECUTE format('DELETE FROM %s WHERE %I = $1', r.tbl, r.col) USING v_uid;
    ELSE
      EXECUTE format('SELECT 1 FROM %s WHERE %I = $1 LIMIT 1', r.tbl, r.col) USING v_uid;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows > 0 THEN
        RAISE EXCEPTION 'Nie można automatycznie usunąć konta (%.%). Napisz na lsoapp@parafia-borzapilski.pl.', r.tbl, r.col;
      END IF;
    END IF;
  END LOOP;

  DELETE FROM profiles WHERE id = v_uid;
  DELETE FROM auth.users WHERE id = v_uid;
END;
$$;

REVOKE EXECUTE ON FUNCTION delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION delete_my_account() TO authenticated;
