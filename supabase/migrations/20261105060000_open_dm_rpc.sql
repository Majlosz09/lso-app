-- Audyt 2026-11-05, Etap 6: „znajdź albo załóż rozmowę prywatną” jednym wywołaniem (app/chat/new-dm.tsx).
-- Wcześniej telefon przeglądał wszystkie swoje DM po kolei (N zapytań), a zakładanie szło w dwóch krokach — gdy dopisanie
-- osób się nie udało, zostawał pusty kanał; dwa równoczesne kliknięcia mogły założyć dwie rozmowy.
-- Uprawnienia jak w politykach chat_channels_insert / chat_members_insert: opiekun zawsze, inni gdy parafia pozwala na DM;
-- obie osoby zatwierdzone w tej samej parafii.
CREATE OR REPLACE FUNCTION public.open_dm(p_target uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_parish uuid := my_parish_id();
  v_ch     uuid;
BEGIN
  IF v_uid IS NULL OR v_parish IS NULL THEN RAISE EXCEPTION 'Zaloguj się'; END IF;
  IF p_target IS NULL OR p_target = v_uid THEN RAISE EXCEPTION 'Wybierz inną osobę'; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_target AND parish_id = v_parish AND approved) THEN
    RAISE EXCEPTION 'Ta osoba nie należy do Twojej parafii';
  END IF;

  -- ta sama para nie założy dwóch rozmów naraz
  PERFORM pg_advisory_xact_lock(hashtextextended('dm:' || least(v_uid, p_target)::text || ':' || greatest(v_uid, p_target)::text, 0));

  SELECT c.id INTO v_ch
    FROM chat_channels c
   WHERE c.parish_id = v_parish AND c.type = 'dm'
     AND EXISTS (SELECT 1 FROM chat_members m WHERE m.channel_id = c.id AND m.user_id = v_uid)
     AND EXISTS (SELECT 1 FROM chat_members m WHERE m.channel_id = c.id AND m.user_id = p_target)
   ORDER BY c.created_at
   LIMIT 1;
  IF v_ch IS NOT NULL THEN RETURN v_ch; END IF;

  IF NOT (is_parish_admin() OR parish_allows_member_dm()) THEN
    RAISE EXCEPTION 'W tej parafii wiadomości prywatne wysyła tylko opiekun';
  END IF;

  INSERT INTO chat_channels (parish_id, type, name) VALUES (v_parish, 'dm', NULL) RETURNING id INTO v_ch;
  INSERT INTO chat_members (channel_id, user_id) VALUES (v_ch, v_uid), (v_ch, p_target);
  RETURN v_ch;
END;
$function$;
REVOKE ALL ON FUNCTION public.open_dm(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_dm(uuid) TO authenticated;
