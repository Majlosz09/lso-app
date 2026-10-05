-- =============================================================
-- Meldowanie bez zasięgu (2026-10-05)
-- Telefon zapisuje potwierdzenie obecności (QR / GPS / przycisk działają bez sieci) z godziną meldowania
-- i wysyła je później. check_in_offline przyjmuje je tylko, gdy:
--   godzina meldowania mieści się w oknie służby (−30 min … +90 min, ±10 min tolerancji zegara telefonu),
--   nie jest z przyszłości i wysłano ją najpóźniej 48 h później.
-- Obecność dostaje godzinę meldowania (nie wysłania). Reszta jak zwykłe meldowanie (uprawnienia, punkty, tryb „bez punktów”).
-- =============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.check_in_offline(
  p_date        date,
  p_time        text,
  p_client_time timestamptz,
  p_method      text DEFAULT 'manual',
  p_schedule_id uuid DEFAULT NULL,
  p_church_id   uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_parish uuid := my_parish_id();
  v_sid    uuid;
  v_start  timestamptz;
  v_res    jsonb;
BEGIN
  IF v_uid IS NULL OR v_parish IS NULL THEN RAISE EXCEPTION 'Zaloguj się'; END IF;
  IF p_method NOT IN ('manual', 'qr', 'gps') THEN RAISE EXCEPTION 'Nieznana metoda'; END IF;
  IF p_client_time > now() + interval '5 minutes' THEN RAISE EXCEPTION 'Godzina meldowania z przyszłości'; END IF;
  IF now() - p_client_time > interval '48 hours' THEN
    RAISE EXCEPTION 'Minęło ponad 48 godzin — zgłoś obecność opiekunowi';
  END IF;

  v_sid := (SELECT id FROM schedules WHERE id = p_schedule_id AND parish_id = v_parish);
  IF v_sid IS NULL THEN
    v_sid := materialize_slot(p_date, p_time, p_church_id);
  END IF;
  SELECT (s.date + s."time") AT TIME ZONE 'Europe/Warsaw' INTO v_start FROM schedules s WHERE s.id = v_sid;
  IF p_client_time < v_start - interval '40 minutes' OR p_client_time > v_start + interval '100 minutes' THEN
    RAISE EXCEPTION 'Meldowanie poza czasem tej służby';
  END IF;

  v_res := check_in_and_award_points(v_sid, v_uid, v_parish, p_method);
  IF NOT coalesce((v_res->>'already_checked_in')::boolean, false) THEN
    UPDATE attendance SET checked_at = p_client_time WHERE schedule_id = v_sid AND profile_id = v_uid;
  END IF;
  RETURN v_res || jsonb_build_object('schedule_id', v_sid, 'offline', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.check_in_offline(date, text, timestamptz, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_in_offline(date, text, timestamptz, text, uuid, uuid) TO authenticated;

COMMIT;
