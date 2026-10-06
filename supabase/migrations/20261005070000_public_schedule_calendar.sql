-- =============================================================
-- Grafik bez logowania (link dla rodziców) + kalendarz w telefonie (ICS) — 2026-10-05
--  1. parishes.public_token — tajny link do grafiku; public_schedule() dla anon: imię + inicjał nazwiska (RODO).
--  2. profiles.calendar_token — osobisty link do kalendarza; calendar_feed(token) zwraca text/calendar
--     (domena "*/*" = PostgREST oddaje plik przy każdym nagłówku Accept, jak potrzebują aplikacje kalendarza).
--     Ministrant: swoje dyżury; rodzic: dyżury dzieci; opiekun / pomocnik: wszystkie służby parafii.
-- =============================================================

BEGIN;

DROP FUNCTION IF EXISTS public._ics_probe();
DROP FUNCTION IF EXISTS public._ics_probe2();
DO $$ BEGIN CREATE DOMAIN "*/*" AS bytea; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP DOMAIN IF EXISTS "text/calendar";

ALTER TABLE parishes ADD COLUMN IF NOT EXISTS public_token text UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS calendar_token text UNIQUE;

-- „Kuba W.”
CREATE OR REPLACE FUNCTION public.short_name(p_full text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN position(' ' IN btrim(p_full)) > 0
    THEN split_part(btrim(p_full), ' ', 1) || ' ' || left(split_part(btrim(p_full), ' ', 2), 1) || '.'
    ELSE btrim(p_full) END
$$;

-- ── 1. Publiczny grafik ──
CREATE OR REPLACE FUNCTION public.set_public_schedule(p_enabled boolean, p_regenerate boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_parish uuid := my_parish_id();
  v_token  text;
BEGIN
  IF NOT is_parish_admin() OR v_parish IS NULL THEN RAISE EXCEPTION 'Tylko opiekun parafii'; END IF;
  IF NOT p_enabled THEN
    UPDATE parishes SET public_token = NULL WHERE id = v_parish;
    RETURN NULL;
  END IF;
  SELECT public_token INTO v_token FROM parishes WHERE id = v_parish;
  IF v_token IS NULL OR p_regenerate THEN
    v_token := encode(gen_random_bytes(12), 'hex');
    UPDATE parishes SET public_token = v_token WHERE id = v_parish;
  END IF;
  RETURN v_token;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_public_schedule(boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_public_schedule(boolean, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.public_schedule(p_token text, p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_parish parishes%ROWTYPE;
  v_to     date := least(p_to, p_from + 41);
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN RETURN NULL; END IF;
  SELECT * INTO v_parish FROM parishes WHERE public_token = p_token;
  IF v_parish.id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'parish', v_parish.name,
    'city', v_parish.city,
    'services', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'date', s.date, 'time', to_char(s."time", 'HH24:MI'), 'title', s.title, 'category', s.category,
        'mode', s.service_mode,
        'church', CASE WHEN c.is_main THEN NULL ELSE coalesce(c.short_name, c.name) END,
        'people', coalesce((
          SELECT jsonb_agg(jsonb_build_object('name', short_name(p.full_name), 'role', NULLIF(a.role, 'ministrant')) ORDER BY p.full_name)
            FROM schedule_assignments a JOIN profiles p ON p.id = a.profile_id
           WHERE a.schedule_id = s.id AND a.status NOT IN ('absent', 'excused', 'confirmed', 'swapped')), '[]'::jsonb)
      ) ORDER BY s.date, s."time")
        FROM schedules s LEFT JOIN churches c ON c.id = s.church_id
       WHERE s.parish_id = v_parish.id AND s.date BETWEEN p_from AND v_to), '[]'::jsonb)
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.public_schedule(text, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_schedule(text, date, date) TO anon, authenticated;

-- ── 2. Kalendarz w telefonie ──
CREATE OR REPLACE FUNCTION public.my_calendar_token(p_regenerate boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_token text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Zaloguj się'; END IF;
  SELECT calendar_token INTO v_token FROM profiles WHERE id = auth.uid();
  IF v_token IS NULL OR p_regenerate THEN
    v_token := encode(gen_random_bytes(16), 'hex');
    UPDATE profiles SET calendar_token = v_token WHERE id = auth.uid();
  END IF;
  RETURN v_token;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.my_calendar_token(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_calendar_token(boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.ics_escape(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT replace(replace(replace(replace(coalesce(p, ''), '\', '\\'), ';', '\;'), ',', '\,'), E'\n', '\n')
$$;

-- RFC 5545: linie najwyżej 75 bajtów, dalszy ciąg w nowej linii od spacji
CREATE OR REPLACE FUNCTION public.ics_fold(p text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_out  text := '';
  v_rest text := p;
  n      int;
BEGIN
  WHILE octet_length(v_rest) > 74 LOOP
    n := 72;
    WHILE octet_length(left(v_rest, n)) > 73 LOOP n := n - 1; END LOOP;
    v_out := v_out || left(v_rest, n) || E'\r\n ';
    v_rest := substr(v_rest, n + 1);
  END LOOP;
  RETURN v_out || v_rest;
END;
$$;

CREATE OR REPLACE FUNCTION public.calendar_feed(token text)
RETURNS "*/*" LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me       profiles%ROWTYPE;
  v_staff  boolean;
  v_lines  text[] := ARRAY['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LSO App//Grafik//PL', 'CALSCALE:GREGORIAN',
                           'METHOD:PUBLISH', 'X-WR-TIMEZONE:Europe/Warsaw'];
  v_name   text;
  r        record;
  v_stamp  text := to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS"Z"');
  v_from   date := (now() AT TIME ZONE 'Europe/Warsaw')::date - 14;
  v_to     date := (now() AT TIME ZONE 'Europe/Warsaw')::date + 90;
BEGIN
  PERFORM set_config('response.headers',
    '[{"Content-Type": "text/calendar; charset=utf-8"}, {"Content-Disposition": "inline; filename=lso-grafik.ics"}, {"Cache-Control": "max-age=900"}]', true);
  SELECT * INTO me FROM profiles WHERE calendar_token = token AND length(token) >= 24;
  IF me.id IS NULL OR NOT me.approved THEN
    RETURN convert_to(array_to_string(ARRAY(SELECT ics_fold(x) FROM unnest(v_lines || ARRAY['END:VCALENDAR']) x), E'\r\n'), 'UTF8');
  END IF;
  v_staff := me.role = 'admin' OR me.is_admin OR me.is_helper;
  SELECT name INTO v_name FROM parishes WHERE id = me.parish_id;
  v_lines := v_lines || ('X-WR-CALNAME:' || ics_escape(CASE WHEN v_staff THEN 'LSO · ' || v_name ELSE 'LSO · dyżury' END));

  FOR r IN
    SELECT s.id, s.date, s."time", s.title, s.notes, coalesce(c.name, '') AS church,
           CASE WHEN v_staff THEN NULL ELSE p.full_name END AS who,
           CASE WHEN v_staff THEN (SELECT string_agg(short_name(pp.full_name), ', ' ORDER BY pp.full_name)
                                     FROM schedule_assignments aa JOIN profiles pp ON pp.id = aa.profile_id
                                    WHERE aa.schedule_id = s.id AND aa.status NOT IN ('absent', 'excused', 'confirmed', 'swapped'))
           END AS crew,
           coalesce(a.profile_id, me.id) AS pid
      FROM schedules s
      LEFT JOIN churches c ON c.id = s.church_id
      LEFT JOIN schedule_assignments a ON a.schedule_id = s.id AND NOT v_staff
      LEFT JOIN profiles p ON p.id = a.profile_id
     WHERE s.parish_id = me.parish_id AND s.date BETWEEN v_from AND v_to
       AND (v_staff OR (a.status IN ('assigned', 'present')
            AND (a.profile_id = me.id OR (me.role = 'parent' AND p.parent_id = me.id))))
     ORDER BY s.date, s."time"
  LOOP
    v_lines := v_lines || ARRAY[
      'BEGIN:VEVENT',
      'UID:' || r.id || '-' || r.pid || '@lsoapp.com',
      'DTSTAMP:' || v_stamp,
      'DTSTART;TZID=Europe/Warsaw:' || to_char(r.date, 'YYYYMMDD') || 'T' || to_char(r."time", 'HH24MISS'),
      'DURATION:PT1H',
      'SUMMARY:' || ics_escape(CASE WHEN me.role = 'parent' THEN split_part(r.who, ' ', 1) || ': ' || r.title ELSE r.title END),
      'LOCATION:' || ics_escape(r.church),
      'DESCRIPTION:' || ics_escape(concat_ws(E'\n', CASE WHEN r.crew IS NOT NULL THEN 'Obsada: ' || r.crew END, r.notes)),
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Służba', 'TRIGGER:-PT30M', 'END:VALARM',
      'END:VEVENT'];
  END LOOP;
  RETURN convert_to(array_to_string(ARRAY(SELECT ics_fold(x) FROM unnest(v_lines || ARRAY['END:VCALENDAR']) x), E'\r\n'), 'UTF8');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.calendar_feed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calendar_feed(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
