-- ============================================================
-- LSO Push Notifications — uruchom JEDNORAZOWO w Supabase SQL Editor
-- Projekt: kvqjaoprxxiemynyihfs — klucze już uzupełnione
-- ============================================================

-- 1. Kolumna push_token w profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS push_token text;

-- 2. Włącz rozszerzenia (jeśli jeszcze nie włączone)
-- W Dashboard: Database > Extensions > włącz "pg_net" i "pg_cron"

-- 3. Funkcja pomocnicza: wywołuje Edge Function z tablicą tokenów + treścią
CREATE OR REPLACE FUNCTION notify_push(
  tokens text[],
  title  text,
  body   text,
  data   jsonb DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  messages jsonb := '[]'::jsonb;
  token    text;
BEGIN
  IF tokens IS NULL OR array_length(tokens, 1) IS NULL THEN RETURN; END IF;

  FOREACH token IN ARRAY tokens LOOP
    IF token IS NOT NULL AND length(token) > 0 THEN
      messages := messages || jsonb_build_array(jsonb_build_object(
        'to',    token,
        'title', title,
        'body',  body,
        'data',  data,
        'sound', 'default'
      ));
    END IF;
  END LOOP;

  IF jsonb_array_length(messages) = 0 THEN RETURN; END IF;

  PERFORM net.http_post(
    url     := 'https://kvqjaoprxxiemynyihfs.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2cWphb3ByeHhpZW15bnlpaGZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNDQ3ODAsImV4cCI6MjA5MzYyMDc4MH0.55gjfeRl-xBsw_fdinSlxfPiao3BFwVNlo_cCVAQvzY'
    ),
    body    := jsonb_build_object('messages', messages)::text
  );
END;
$$;


-- ============================================================
-- TRIGGER 1: Przypisanie do służby → ministrant + rodzic
-- ============================================================
CREATE OR REPLACE FUNCTION trg_fn_notify_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_token      text;
  v_name       text;
  v_parent_id  uuid;
  v_p_token    text;
  v_title      text;
  v_date_str   text;
BEGIN
  SELECT push_token, full_name, parent_id
    INTO v_token, v_name, v_parent_id
    FROM profiles WHERE id = NEW.profile_id;

  SELECT title,
         to_char(date::date, 'DD.MM') || ' ' || left(time::text, 5)
    INTO v_title, v_date_str
    FROM schedules WHERE id = NEW.schedule_id;

  IF v_token IS NOT NULL THEN
    PERFORM notify_push(
      ARRAY[v_token], 'Nowy dyżur',
      'Zostałeś przypisany do: ' || v_title || ' (' || v_date_str || ')'
    );
  END IF;

  IF v_parent_id IS NOT NULL THEN
    SELECT push_token INTO v_p_token FROM profiles WHERE id = v_parent_id;
    IF v_p_token IS NOT NULL THEN
      PERFORM notify_push(
        ARRAY[v_p_token], 'Dyżur dziecka',
        v_name || ' przypisany do: ' || v_title || ' (' || v_date_str || ')'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_assignment ON schedule_assignments;
CREATE TRIGGER trg_notify_assignment
  AFTER INSERT ON schedule_assignments
  FOR EACH ROW EXECUTE FUNCTION trg_fn_notify_assignment();


-- ============================================================
-- TRIGGER 2: Nowe ogłoszenie → ministranci i/lub rodzice wg target_audience
-- ============================================================
CREATE OR REPLACE FUNCTION trg_fn_notify_announcement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tokens text[];
BEGIN
  IF NEW.target_audience IN ('members', 'all') THEN
    SELECT array_agg(push_token) INTO v_tokens
      FROM profiles
      WHERE parish_id = NEW.parish_id
        AND role = 'member' AND is_active = true AND push_token IS NOT NULL;
    IF v_tokens IS NOT NULL THEN
      PERFORM notify_push(v_tokens, 'Nowe ogłoszenie', NEW.title);
    END IF;
  END IF;

  IF NEW.target_audience IN ('parents', 'all') THEN
    SELECT array_agg(push_token) INTO v_tokens
      FROM profiles
      WHERE parish_id = NEW.parish_id
        AND role = 'parent' AND is_active = true AND push_token IS NOT NULL;
    IF v_tokens IS NOT NULL THEN
      PERFORM notify_push(v_tokens, 'Nowe ogłoszenie', NEW.title);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_announcement ON announcements;
CREATE TRIGGER trg_notify_announcement
  AFTER INSERT ON announcements
  FOR EACH ROW EXECUTE FUNCTION trg_fn_notify_announcement();


-- ============================================================
-- TRIGGER 3: Przyznanie punktów → ministrant + rodzic
-- ============================================================
CREATE OR REPLACE FUNCTION trg_fn_notify_points()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_token     text;
  v_name      text;
  v_parent_id uuid;
  v_p_token   text;
  v_body      text;
BEGIN
  SELECT push_token, full_name, parent_id
    INTO v_token, v_name, v_parent_id
    FROM profiles WHERE id = NEW.profile_id;

  v_body := CASE WHEN NEW.amount > 0 THEN '+' ELSE '' END
    || NEW.amount::text || ' pkt — ' || NEW.reason;

  IF v_token IS NOT NULL THEN
    PERFORM notify_push(ARRAY[v_token], 'Punkty', v_body);
  END IF;

  IF v_parent_id IS NOT NULL THEN
    SELECT push_token INTO v_p_token FROM profiles WHERE id = v_parent_id;
    IF v_p_token IS NOT NULL THEN
      PERFORM notify_push(ARRAY[v_p_token], 'Punkty dziecka', v_name || ': ' || v_body);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_points ON points;
CREATE TRIGGER trg_notify_points
  AFTER INSERT ON points
  FOR EACH ROW EXECUTE FUNCTION trg_fn_notify_points();


-- ============================================================
-- TRIGGER 4: Prośba o usprawiedliwienie (status → 'excused') → admin
-- ============================================================
CREATE OR REPLACE FUNCTION trg_fn_notify_excused()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tokens    text[];
  v_name      text;
  v_parish_id uuid;
BEGIN
  IF NEW.status <> 'excused' OR OLD.status = 'excused' THEN RETURN NEW; END IF;

  SELECT p.full_name, s.parish_id
    INTO v_name, v_parish_id
    FROM profiles p
    JOIN schedules s ON s.id = NEW.schedule_id
    WHERE p.id = NEW.profile_id;

  SELECT array_agg(push_token) INTO v_tokens
    FROM profiles
    WHERE parish_id = v_parish_id AND is_admin = true AND push_token IS NOT NULL;

  IF v_tokens IS NOT NULL THEN
    PERFORM notify_push(v_tokens, 'Prośba o usprawiedliwienie', 'Od: ' || v_name);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_excused ON schedule_assignments;
CREATE TRIGGER trg_notify_excused
  AFTER UPDATE ON schedule_assignments
  FOR EACH ROW EXECUTE FUNCTION trg_fn_notify_excused();


-- ============================================================
-- TRIGGER 5: Decyzja admina (excused → confirmed/absent) → ministrant + rodzic
-- ============================================================
CREATE OR REPLACE FUNCTION trg_fn_notify_absence_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_token     text;
  v_name      text;
  v_parent_id uuid;
  v_p_token   text;
  v_result    text;
BEGIN
  IF OLD.status <> 'excused' THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('confirmed', 'absent') THEN RETURN NEW; END IF;

  v_result := CASE NEW.status WHEN 'confirmed' THEN 'zatwierdzona ✓' ELSE 'odrzucona ✗' END;

  SELECT push_token, full_name, parent_id
    INTO v_token, v_name, v_parent_id
    FROM profiles WHERE id = NEW.profile_id;

  IF v_token IS NOT NULL THEN
    PERFORM notify_push(
      ARRAY[v_token], 'Usprawiedliwienie', 'Twoja prośba została ' || v_result
    );
  END IF;

  IF v_parent_id IS NOT NULL THEN
    SELECT push_token INTO v_p_token FROM profiles WHERE id = v_parent_id;
    IF v_p_token IS NOT NULL THEN
      PERFORM notify_push(
        ARRAY[v_p_token], 'Usprawiedliwienie dziecka',
        'Prośba ' || v_name || ' została ' || v_result
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_absence_decision ON schedule_assignments;
CREATE TRIGGER trg_notify_absence_decision
  AFTER UPDATE ON schedule_assignments
  FOR EACH ROW EXECUTE FUNCTION trg_fn_notify_absence_decision();


-- ============================================================
-- TRIGGER 6: Nowy użytkownik → admin parafii
-- ============================================================
CREATE OR REPLACE FUNCTION trg_fn_notify_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tokens text[];
BEGIN
  IF NEW.parish_id IS NULL THEN RETURN NEW; END IF;

  SELECT array_agg(push_token) INTO v_tokens
    FROM profiles
    WHERE parish_id = NEW.parish_id
      AND is_admin = true AND push_token IS NOT NULL AND id <> NEW.id;

  IF v_tokens IS NOT NULL THEN
    PERFORM notify_push(v_tokens, 'Nowy użytkownik', NEW.full_name || ' dołączył do parafii');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_user ON profiles;
CREATE TRIGGER trg_notify_new_user
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION trg_fn_notify_new_user();


-- ============================================================
-- CRON 1: 08:00 — przypomnienie o służbach DZIŚ po 12:00
-- ============================================================
SELECT cron.schedule(
  'lso-reminder-morning',
  '0 8 * * *',
  $cron$
  DO $inner$
  DECLARE
    r record;
  BEGIN
    FOR r IN
      SELECT DISTINCT ON (sa.profile_id)
        p.push_token,
        p.full_name,
        p.parent_id,
        s.title,
        left(s.time::text, 5) AS time_str
      FROM schedule_assignments sa
      JOIN schedules s ON s.id = sa.schedule_id
      JOIN profiles p ON p.id = sa.profile_id
      WHERE s.date = CURRENT_DATE
        AND s.time >= '12:00:00'
        AND sa.status NOT IN ('absent', 'excused')
        AND p.push_token IS NOT NULL
      ORDER BY sa.profile_id, s.time
    LOOP
      PERFORM notify_push(
        ARRAY[r.push_token],
        'Przypomnienie o dyżurze',
        'Dziś: ' || r.title || ' o ' || r.time_str
      );

      IF r.parent_id IS NOT NULL THEN
        PERFORM notify_push(
          ARRAY[(SELECT push_token FROM profiles WHERE id = r.parent_id AND push_token IS NOT NULL)],
          'Dyżur dziecka dziś',
          r.full_name || ': ' || r.title || ' o ' || r.time_str
        );
      END IF;
    END LOOP;
  END;
  $inner$
  $cron$
);

-- ============================================================
-- CRON 2: 20:00 — przypomnienie o służbach JUTRO przed 12:00
-- ============================================================
SELECT cron.schedule(
  'lso-reminder-evening',
  '0 20 * * *',
  $cron$
  DO $inner$
  DECLARE
    r record;
  BEGIN
    FOR r IN
      SELECT DISTINCT ON (sa.profile_id)
        p.push_token,
        p.full_name,
        p.parent_id,
        s.title,
        left(s.time::text, 5) AS time_str
      FROM schedule_assignments sa
      JOIN schedules s ON s.id = sa.schedule_id
      JOIN profiles p ON p.id = sa.profile_id
      WHERE s.date = CURRENT_DATE + 1
        AND s.time < '12:00:00'
        AND sa.status NOT IN ('absent', 'excused')
        AND p.push_token IS NOT NULL
      ORDER BY sa.profile_id, s.time
    LOOP
      PERFORM notify_push(
        ARRAY[r.push_token],
        'Przypomnienie o dyżurze',
        'Jutro: ' || r.title || ' o ' || r.time_str
      );

      IF r.parent_id IS NOT NULL THEN
        PERFORM notify_push(
          ARRAY[(SELECT push_token FROM profiles WHERE id = r.parent_id AND push_token IS NOT NULL)],
          'Dyżur dziecka jutro',
          r.full_name || ': ' || r.title || ' o ' || r.time_str
        );
      END IF;
    END LOOP;
  END;
  $inner$
  $cron$
);
