-- =============================================================
-- N4: prośba o zamianę dyżuru z konkretną osobą
--
-- Tabela swap_offers (istniała, nieużywana). Zapis tylko przez RPC:
--   request_swap(schedule, to_profile, message) — mam przydział 'assigned' na przyszłej służbie,
--       adresat: zatwierdzony ministrant tej parafii bez aktywnego przydziału na tej służbie;
--       poprzednia otwarta prośba o tę służbę jest anulowana. Push do adresata.
--   respond_swap(offer, accept) — adresat przyjmuje/odrzuca. Przyjęcie: mój przydział → 'swapped',
--       adresat dostaje przydział 'assigned' (ta sama rola). Push do proszącego.
--   cancel_swap(offer) — proszący wycofuje otwartą prośbę.
-- Widoczność: proszący, adresat i opiekun parafii.
-- =============================================================

BEGIN;

CREATE INDEX IF NOT EXISTS swap_offers_to_open_idx ON swap_offers (to_profile_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS swap_offers_from_open_idx ON swap_offers (from_profile_id) WHERE status = 'open';

DROP POLICY IF EXISTS "swap_offers_select" ON swap_offers;
CREATE POLICY "swap_offers_select" ON swap_offers
  FOR SELECT USING (
    from_profile_id = auth.uid()
    OR to_profile_id = auth.uid()
    OR (is_parish_admin() AND EXISTS (
      SELECT 1 FROM schedules s WHERE s.id = swap_offers.schedule_id AND s.parish_id = my_parish_id()))
  );

-- Przydziały: dopuszczamy zmiany statusu wynikające z przyjętej zamiany
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
       OR (OLD.status = 'assigned' AND NEW.status = 'swapped' AND EXISTS (   -- przyjęta zamiana: proszący oddaje
             SELECT 1 FROM swap_offers o WHERE o.schedule_id = OLD.schedule_id AND o.from_profile_id = OLD.profile_id
               AND o.to_profile_id = auth.uid() AND o.status = 'accepted'))
       OR (OLD.status = 'swapped' AND NEW.status = 'assigned' AND NEW.profile_id = auth.uid() AND EXISTS ( -- przejmujący wraca
             SELECT 1 FROM swap_offers o WHERE o.schedule_id = OLD.schedule_id AND o.to_profile_id = auth.uid()
               AND o.status = 'accepted'))
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Brak uprawnień do zmiany statusu na %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_swap(p_schedule_id uuid, p_to_profile_id uuid, p_message text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me     uuid := auth.uid();
  v_parish uuid;
  v_start  timestamptz;
  v_title  text;
  v_date   date;
  v_time   time;
  v_name   text;
  v_token  text;
  v_id     uuid;
BEGIN
  SELECT s.parish_id, (s.date + s.time) AT TIME ZONE 'Europe/Warsaw', s.title, s.date, s.time
    INTO v_parish, v_start, v_title, v_date, v_time
    FROM schedules s WHERE s.id = p_schedule_id;
  IF v_parish IS NULL OR v_parish IS DISTINCT FROM my_parish_id() THEN
    RAISE EXCEPTION 'Nie znaleziono służby';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM schedule_assignments
                  WHERE schedule_id = p_schedule_id AND profile_id = v_me AND status = 'assigned') THEN
    RAISE EXCEPTION 'Nie masz przydziału na tej służbie';
  END IF;
  IF v_start - interval '30 minutes' <= now() THEN
    RAISE EXCEPTION 'Za późno na zamianę — skontaktuj się z opiekunem';
  END IF;
  IF p_to_profile_id = v_me OR NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_to_profile_id AND parish_id = v_parish
      AND role = 'member' AND approved AND is_active) THEN
    RAISE EXCEPTION 'Wybierz ministranta z parafii';
  END IF;
  IF EXISTS (SELECT 1 FROM schedule_assignments WHERE schedule_id = p_schedule_id
              AND profile_id = p_to_profile_id AND status <> 'swapped') THEN
    RAISE EXCEPTION 'Ta osoba ma już przydział na tej służbie';
  END IF;

  UPDATE swap_offers SET status = 'cancelled', resolved_at = now()
   WHERE schedule_id = p_schedule_id AND from_profile_id = v_me AND status = 'open';

  INSERT INTO swap_offers (schedule_id, from_profile_id, to_profile_id, message, status)
  VALUES (p_schedule_id, v_me, p_to_profile_id, nullif(left(trim(coalesce(p_message, '')), 300), ''), 'open')
  RETURNING id INTO v_id;

  SELECT full_name INTO v_name FROM profiles WHERE id = v_me;
  SELECT push_token INTO v_token FROM profiles WHERE id = p_to_profile_id;
  IF v_token IS NOT NULL THEN
    PERFORM notify_push(ARRAY[v_token], 'Prośba o zamianę',
      v_name || ' prosi o zastępstwo: ' || v_title || ' ' || to_char(v_date, 'DD.MM') || ' ' || to_char(v_time, 'HH24:MI'),
      jsonb_build_object('type', 'swap', 'offer_id', v_id));
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_swap(p_offer_id uuid, p_accept boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me    uuid := auth.uid();
  o       swap_offers%ROWTYPE;
  v_role  text;
  v_start timestamptz;
  v_title text;
  v_name  text;
  v_token text;
BEGIN
  SELECT * INTO o FROM swap_offers WHERE id = p_offer_id FOR UPDATE;
  IF o.id IS NULL OR o.to_profile_id IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'Nie znaleziono prośby';
  END IF;
  IF o.status <> 'open' THEN
    RAISE EXCEPTION 'Prośba nie jest już aktualna';
  END IF;

  IF p_accept THEN
    SELECT (s.date + s.time) AT TIME ZONE 'Europe/Warsaw', s.title INTO v_start, v_title
      FROM schedules s WHERE s.id = o.schedule_id;
    IF v_start <= now() THEN
      RAISE EXCEPTION 'Służba już się rozpoczęła';
    END IF;
    SELECT role INTO v_role FROM schedule_assignments
     WHERE schedule_id = o.schedule_id AND profile_id = o.from_profile_id AND status = 'assigned';
    IF v_role IS NULL THEN
      UPDATE swap_offers SET status = 'cancelled', resolved_at = now() WHERE id = o.id;
      RAISE EXCEPTION 'Osoba prosząca nie ma już tego przydziału';
    END IF;
    IF EXISTS (SELECT 1 FROM schedule_assignments WHERE schedule_id = o.schedule_id
                AND profile_id = v_me AND status <> 'swapped') THEN
      RAISE EXCEPTION 'Masz już przydział na tej służbie';
    END IF;

    UPDATE swap_offers SET status = 'accepted', resolved_at = now() WHERE id = o.id;
    UPDATE schedule_assignments SET status = 'swapped'
     WHERE schedule_id = o.schedule_id AND profile_id = o.from_profile_id;
    IF EXISTS (SELECT 1 FROM schedule_assignments WHERE schedule_id = o.schedule_id AND profile_id = v_me) THEN
      UPDATE schedule_assignments SET status = 'assigned'
       WHERE schedule_id = o.schedule_id AND profile_id = v_me;
    ELSE
      INSERT INTO schedule_assignments (schedule_id, profile_id, role, status)
      VALUES (o.schedule_id, v_me, v_role, 'assigned');
    END IF;
    -- inne otwarte prośby o tę służbę od tej osoby tracą sens
    UPDATE swap_offers SET status = 'cancelled', resolved_at = now()
     WHERE schedule_id = o.schedule_id AND from_profile_id = o.from_profile_id AND status = 'open';
  ELSE
    UPDATE swap_offers SET status = 'rejected', resolved_at = now() WHERE id = o.id;
  END IF;

  SELECT full_name INTO v_name FROM profiles WHERE id = v_me;
  SELECT push_token INTO v_token FROM profiles WHERE id = o.from_profile_id;
  IF v_token IS NOT NULL THEN
    PERFORM notify_push(ARRAY[v_token], 'Zamiana dyżuru',
      v_name || CASE WHEN p_accept THEN ' przejmuje Twój dyżur' ELSE ' nie może Cię zastąpić' END,
      jsonb_build_object('type', 'swap', 'offer_id', o.id));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_swap(p_offer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE swap_offers SET status = 'cancelled', resolved_at = now()
   WHERE id = p_offer_id AND from_profile_id = auth.uid() AND status = 'open';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prośba nie jest już aktualna';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_swap(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.respond_swap(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_swap(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_swap(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_swap(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_swap(uuid) TO authenticated;

COMMIT;
