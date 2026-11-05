-- Audyt 2026-11-05, Etap 3: meldowanie sprawdzane przez serwer.
-- 1) check_in_and_award_points: osoba bez uprawnień opiekuna melduje się tylko w oknie służby
--    (−30/+90 min jak w lib/dates.ts isCheckInWindowOpen, +5 min zapasu na rozjechany zegar telefonu; Europe/Warsaw).
--    Opiekun / pomocnik bez okna (zaznacza obecność po fakcie, kiosk).
-- 2) check_in_offline: własne sprawdzenia (okno względem godziny z telefonu, ≤ 48 h) i woła _impl —
--    przez wrapper odrzucałby spóźnione meldunki z kolejki offline.
-- 3) attendance_insert: bez gałęzi „własna obecność” — ministrant melduje się tylko przez RPC
--    (wcześniej mógł wstawić obecność bezpośrednio, w dowolnym czasie; punktów to nie dawało, ale obecność tak).

CREATE OR REPLACE FUNCTION public.check_in_and_award_points(p_schedule_id uuid, p_profile_id uuid, p_parish_id uuid, p_method text DEFAULT 'manual'::text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_schedule_parish uuid;
  v_mode text;
  v_start timestamptz;
  v_is_admin boolean;
BEGIN
  SELECT parish_id, service_mode, (date + "time") AT TIME ZONE 'Europe/Warsaw'
    INTO v_schedule_parish, v_mode, v_start
    FROM schedules WHERE id = p_schedule_id;
  IF v_schedule_parish IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono służby';
  END IF;
  IF v_schedule_parish IS DISTINCT FROM p_parish_id THEN
    RAISE EXCEPTION 'Służba należy do innej parafii';
  END IF;
  IF v_mode = 'none' THEN
    RAISE EXCEPTION 'Na tej służbie nie sprawdzamy obecności';
  END IF;

  IF v_uid IS NOT NULL THEN
    v_is_admin := can_manage_services() AND my_parish_id() = v_schedule_parish;
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_profile_id AND parish_id = v_schedule_parish) THEN
      RAISE EXCEPTION 'Ministrant nie należy do tej parafii';
    END IF;
    IF p_profile_id <> v_uid AND NOT v_is_admin THEN
      RAISE EXCEPTION 'Brak uprawnień do potwierdzenia obecności innej osoby';
    END IF;
    IF NOT v_is_admin AND NOT parish_allows_self_checkin(v_schedule_parish) THEN
      RAISE EXCEPTION 'W tej parafii obecność zaznacza administrator';
    END IF;
    IF NOT v_is_admin AND (now() < v_start - interval '35 minutes' OR now() > v_start + interval '95 minutes') THEN
      RAISE EXCEPTION 'Meldowanie jest możliwe od 30 minut przed do 90 minut po rozpoczęciu służby';
    END IF;
  END IF;

  RETURN check_in_and_award_points_impl(p_schedule_id, p_profile_id, p_parish_id, p_method, p_lat, p_lng);
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_in_offline(p_date date, p_time text, p_client_time timestamp with time zone, p_method text DEFAULT 'manual'::text, p_schedule_id uuid DEFAULT NULL::uuid, p_church_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_parish uuid := my_parish_id();
  v_sid    uuid;
  v_start  timestamptz;
  v_mode   text;
  v_res    jsonb;
BEGIN
  IF v_uid IS NULL OR v_parish IS NULL THEN RAISE EXCEPTION 'Zaloguj się'; END IF;
  IF p_method NOT IN ('manual', 'qr', 'gps') THEN RAISE EXCEPTION 'Nieznana metoda'; END IF;
  IF p_client_time > now() + interval '5 minutes' THEN RAISE EXCEPTION 'Godzina meldowania z przyszłości'; END IF;
  IF now() - p_client_time > interval '48 hours' THEN
    RAISE EXCEPTION 'Minęło ponad 48 godzin — zgłoś obecność opiekunowi';
  END IF;
  IF NOT (can_manage_services() OR parish_allows_self_checkin(v_parish)) THEN
    RAISE EXCEPTION 'W tej parafii obecność zaznacza administrator';
  END IF;

  v_sid := (SELECT id FROM schedules WHERE id = p_schedule_id AND parish_id = v_parish);
  IF v_sid IS NULL THEN
    v_sid := materialize_slot(p_date, p_time, p_church_id);
  END IF;
  SELECT (s.date + s."time") AT TIME ZONE 'Europe/Warsaw', s.service_mode INTO v_start, v_mode
    FROM schedules s WHERE s.id = v_sid AND s.parish_id = v_parish;
  IF v_start IS NULL THEN RAISE EXCEPTION 'Nie znaleziono służby'; END IF;
  IF v_mode = 'none' THEN RAISE EXCEPTION 'Na tej służbie nie sprawdzamy obecności'; END IF;
  IF p_client_time < v_start - interval '40 minutes' OR p_client_time > v_start + interval '100 minutes' THEN
    RAISE EXCEPTION 'Meldowanie poza czasem tej służby';
  END IF;

  -- bez wrappera: jego okno liczy się od now(), a meldunek offline wysyłamy po powrocie zasięgu
  v_res := check_in_and_award_points_impl(v_sid, v_uid, v_parish, p_method, NULL, NULL);
  IF NOT coalesce((v_res->>'already_checked_in')::boolean, false) THEN
    UPDATE attendance SET checked_at = p_client_time WHERE schedule_id = v_sid AND profile_id = v_uid;
  END IF;
  RETURN v_res || jsonb_build_object('schedule_id', v_sid, 'offline', true);
END;
$function$;

DROP POLICY IF EXISTS attendance_insert ON public.attendance;
CREATE POLICY attendance_insert ON public.attendance FOR INSERT TO authenticated
  WITH CHECK (parish_id = (SELECT my_parish_id()) AND (SELECT can_manage_services()));
