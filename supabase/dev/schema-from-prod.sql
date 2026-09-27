-- Schemat wygenerowany z produkcji LSO 2026-09-27 — uruchom w projekcie LSO-dev

set check_function_bodies = off;

-- rozszerzenia
do $x$ begin create extension if not exists pg_cron with schema pg_catalog; exception when others then raise notice 'pominięto rozszerzenie pg_cron'; end $x$;
do $x$ begin create extension if not exists pg_net with schema extensions; exception when others then raise notice 'pominięto rozszerzenie pg_net'; end $x$;
do $x$ begin create extension if not exists pg_stat_statements with schema extensions; exception when others then raise notice 'pominięto rozszerzenie pg_stat_statements'; end $x$;
do $x$ begin create extension if not exists pgcrypto with schema extensions; exception when others then raise notice 'pominięto rozszerzenie pgcrypto'; end $x$;
do $x$ begin create extension if not exists supabase_vault with schema vault; exception when others then raise notice 'pominięto rozszerzenie supabase_vault'; end $x$;
do $x$ begin create extension if not exists "uuid-ossp" with schema extensions; exception when others then raise notice 'pominięto rozszerzenie uuid-ossp'; end $x$;

-- typy
create type public.service_type_enum as enum ('msza_assigned', 'msza_extra', 'nabozenstwo', 'zbiorka');

-- sekwencje


-- tabele
create table public.announcements (id uuid not null, title text not null, content text not null, author_id uuid, is_pinned boolean, created_at timestamp with time zone, target_audience text not null, parish_id uuid);
create table public.attendance (id uuid not null, schedule_id uuid not null, profile_id uuid not null, method text not null, lat double precision, lng double precision, checked_at timestamp with time zone not null, marked_by uuid, parish_id uuid);
create table public.badge_definitions (id uuid not null, parish_id uuid, name text not null, icon text not null, type text not null, persistence text not null, criteria_key text not null, created_at timestamp with time zone);
create table public.chat_channels (id uuid not null, parish_id uuid not null, type text not null, name text, slug text, created_at timestamp with time zone not null);
create table public.chat_members (channel_id uuid not null, user_id uuid not null, last_read_at timestamp with time zone);
create table public.chat_messages (id uuid not null, channel_id uuid not null, sender_id uuid not null, content text not null, created_at timestamp with time zone not null, deleted_at timestamp with time zone, type text, reply_to_id uuid, edited_at timestamp with time zone, poll_id uuid);
create table public.chat_poll_options (id uuid not null, poll_id uuid, text text not null, "position" integer not null);
create table public.chat_poll_votes (id uuid not null, option_id uuid, user_id uuid, created_at timestamp with time zone);
create table public.chat_polls (id uuid not null, channel_id uuid, creator_id uuid, question text not null, allow_multiple boolean, closed_at timestamp with time zone, created_at timestamp with time zone);
create table public.chat_reactions (id uuid not null, message_id uuid, user_id uuid, emoji text not null, created_at timestamp with time zone);
create table public.extra_attendance (id uuid not null, profile_id uuid not null, event_type text not null, event_date date not null, event_time time without time zone not null, checked_at timestamp with time zone not null);
create table public.group_members (id uuid not null, group_id uuid not null, profile_id uuid not null, "position" text, joined_at timestamp with time zone not null);
create table public.groups (id uuid not null, name text not null, description text, created_by uuid, created_at timestamp with time zone not null, parish_id uuid);
create table public.mass_templates (id uuid not null, parish_id uuid not null, day_of_week smallint not null, "time" time without time zone not null, label text, sort_order smallint, created_at timestamp with time zone);
create table public.member_badges (id uuid not null, profile_id uuid not null, badge_definition_id uuid not null, awarded_at timestamp with time zone not null, awarded_by uuid, note text, is_active boolean not null);
create table public.parishes (id uuid not null, name text not null, city text, invite_code text not null, created_at timestamp with time zone, created_by uuid, setup_done boolean not null, lat double precision, lng double precision, gps_radius integer not null, attendance_mode text not null, allow_member_dm boolean not null);
create table public.point_rules (id uuid not null, parish_id uuid not null, points integer not null, created_at timestamp with time zone, service_type service_type_enum not null);
create table public.points (id uuid not null, profile_id uuid not null, amount integer not null, reason text not null, schedule_id uuid, awarded_by uuid, created_at timestamp with time zone not null, parish_id uuid, service_type service_type_enum);
create table public.profiles (id uuid not null, full_name text not null, role text not null, phone text, avatar_url text, parent_id uuid, is_active boolean not null, created_at timestamp with time zone not null, rocznik integer, is_admin boolean not null, rank_id uuid, parish_id uuid, push_token text, onboarding_completed boolean, role_before_admin text);
create table public.ranks (id uuid not null, name text not null, "order" integer not null, is_system boolean not null, created_at timestamp with time zone, parish_id uuid);
create table public.recurring_commitments (id uuid not null, profile_id uuid, day_of_week smallint not null, time_slot time without time zone, created_at timestamp with time zone, parish_id uuid);
create table public.schedule_assignments (id uuid not null, schedule_id uuid not null, profile_id uuid not null, role text not null, status text not null, absence_reason text, admin_note text);
create table public.schedules (id uuid not null, group_id uuid, title text not null, date date not null, "time" time without time zone not null, location text, lat double precision, lng double precision, gps_radius integer, notes text, created_by uuid, created_at timestamp with time zone not null, parish_id uuid, series_id uuid, category text not null);
create table public.swap_offers (id uuid not null, schedule_id uuid not null, from_profile_id uuid not null, to_profile_id uuid, message text, status text not null, created_at timestamp with time zone not null, resolved_at timestamp with time zone);
create table public.wiedza_entries (id uuid not null, parish_id uuid not null, category_id text not null, section text not null, title text not null, content text not null, subtitle text, display_order integer not null, created_at timestamp with time zone not null);

-- widoki
create or replace view public.points_summary with (security_invoker=true) as  SELECT p.id AS profile_id,
    p.full_name,
    p.parish_id,
    COALESCE(a.services_count, 0) AS services_count,
    ((COALESCE(a.services_count, 0) * 5) + COALESCE(pt.manual_points, 0)) AS total_points
   FROM ((profiles p
     LEFT JOIN ( SELECT attendance.profile_id,
            (count(*))::integer AS services_count
           FROM attendance
          GROUP BY attendance.profile_id) a ON ((a.profile_id = p.id)))
     LEFT JOIN ( SELECT points.profile_id,
            (COALESCE(sum(points.amount), (0)::bigint))::integer AS manual_points
           FROM points
          GROUP BY points.profile_id) pt ON ((pt.profile_id = p.id)))
  WHERE ((p.is_active = true) AND (p.role = 'member'::text));

-- funkcje
CREATE OR REPLACE FUNCTION public.add_profile_to_chat_channels()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF NEW.parish_id IS NULL THEN RETURN NEW; END IF;
  IF OLD IS NOT NULL AND OLD.parish_id IS NOT NULL
     AND OLD.parish_id = NEW.parish_id
     AND OLD.role = NEW.role
     AND OLD.is_admin = NEW.is_admin THEN
    RETURN NEW;
  END IF;

  IF NEW.role = 'member' THEN
    INSERT INTO chat_members(channel_id, user_id)
    SELECT id, NEW.id FROM chat_channels
    WHERE parish_id = NEW.parish_id AND slug = 'ministranci'
    ON CONFLICT DO NOTHING;
  END IF;

  IF NEW.role = 'parent' THEN
    INSERT INTO chat_members(channel_id, user_id)
    SELECT id, NEW.id FROM chat_channels
    WHERE parish_id = NEW.parish_id AND slug = 'rodzice'
    ON CONFLICT DO NOTHING;
  END IF;

  IF NEW.role = 'admin' OR NEW.is_admin = TRUE THEN
    INSERT INTO chat_members(channel_id, user_id)
    SELECT id, NEW.id FROM chat_channels
    WHERE parish_id = NEW.parish_id AND slug IN ('ministranci', 'rodzice')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.award_points_on_presence()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_schedule RECORD;
  v_rule     RECORD;
  v_stype    text;
BEGIN
  IF NEW.status = 'present' AND (OLD.status IS DISTINCT FROM 'present') THEN
    SELECT * INTO v_schedule FROM schedules WHERE id = NEW.schedule_id;

    v_stype := CASE v_schedule.category
      WHEN 'msza'        THEN 'msza_assigned'
      WHEN 'nabozenstwo' THEN 'nabozenstwo'
      WHEN 'zbiorka'     THEN 'zbiorka'
      ELSE 'msza_assigned'
    END;

    SELECT * INTO v_rule FROM point_rules
    WHERE parish_id = v_schedule.parish_id AND service_type = v_stype
    LIMIT 1;

    IF v_rule IS NOT NULL THEN
      INSERT INTO points (profile_id, amount, reason, schedule_id, service_type, awarded_by, parish_id)
      SELECT
        NEW.profile_id,
        v_rule.points,
        'Służba: ' || v_schedule.title,
        NEW.schedule_id,
        v_stype,
        NULL,
        v_schedule.parish_id
      WHERE NOT EXISTS (
        SELECT 1 FROM points
        WHERE profile_id = NEW.profile_id
          AND schedule_id = NEW.schedule_id
          AND awarded_by IS NULL
      );
    END IF;
  END IF;

  IF OLD.status = 'present' AND NEW.status != 'present' THEN
    DELETE FROM points
    WHERE profile_id = NEW.profile_id
      AND schedule_id = NEW.schedule_id
      AND awarded_by IS NULL;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_in_and_award_points(p_schedule_id uuid, p_profile_id uuid, p_parish_id uuid, p_method text DEFAULT 'manual'::text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_assignment_id uuid;
  v_assignment_status text;
  v_schedule_category text;
  v_service_type service_type_enum;
  v_points integer := 0;
  v_reason text := '';
BEGIN
  -- Idempotency: already checked in
  IF EXISTS (
    SELECT 1 FROM attendance
    WHERE schedule_id = p_schedule_id AND profile_id = p_profile_id
  ) THEN
    RETURN jsonb_build_object('already_checked_in', true, 'points_awarded', 0, 'reason', '');
  END IF;

  -- Determine service category
  SELECT category INTO v_schedule_category
  FROM schedules WHERE id = p_schedule_id;

  -- Existing assignment (any status)
  SELECT id, status INTO v_assignment_id, v_assignment_status
  FROM schedule_assignments
  WHERE schedule_id = p_schedule_id AND profile_id = p_profile_id;

  -- Map to point_rules service_type
  IF v_schedule_category = 'msza' THEN
    v_service_type := CASE WHEN v_assignment_id IS NOT NULL THEN 'msza_assigned'::service_type_enum ELSE 'msza_extra'::service_type_enum END;
  ELSIF v_schedule_category = 'nabozenstwo' THEN
    v_service_type := 'nabozenstwo'::service_type_enum;
  ELSIF v_schedule_category = 'zbiorka' THEN
    v_service_type := 'zbiorka'::service_type_enum;
  END IF;

  -- Record attendance
  INSERT INTO attendance (schedule_id, profile_id, method, checked_at, parish_id, lat, lng, marked_by)
  VALUES (p_schedule_id, p_profile_id, p_method, now(), p_parish_id, p_lat, p_lng, p_profile_id)
  ON CONFLICT (schedule_id, profile_id) DO NOTHING;

  -- Update or create assignment
  IF v_assignment_id IS NOT NULL THEN
    UPDATE schedule_assignments SET status = 'present' WHERE id = v_assignment_id;
  ELSE
    INSERT INTO schedule_assignments (schedule_id, profile_id, role, status)
    VALUES (p_schedule_id, p_profile_id, 'ministrant', 'present')
    ON CONFLICT (schedule_id, profile_id) DO UPDATE SET status = 'present';
  END IF;

  -- Award points per parish rules
  IF v_service_type IS NOT NULL THEN
    SELECT points INTO v_points
    FROM point_rules
    WHERE parish_id = p_parish_id AND service_type = v_service_type;

    IF COALESCE(v_points, 0) > 0 THEN
      v_reason := CASE v_service_type::text
        WHEN 'msza_assigned' THEN 'Msza (dyżur)'
        WHEN 'msza_extra'    THEN 'Msza (dodatkowa)'
        WHEN 'nabozenstwo'   THEN 'Nabożeństwo'
        WHEN 'zbiorka'       THEN 'Zbiórka'
        ELSE 'Służba'
      END;
      INSERT INTO points (profile_id, amount, reason, parish_id, awarded_by)
      VALUES (p_profile_id, v_points, v_reason, p_parish_id, p_profile_id);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'already_checked_in', false,
    'points_awarded', COALESCE(v_points, 0),
    'reason', COALESCE(v_reason, '')
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_parish_chat_channels()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO chat_channels(parish_id, type, name, slug)
  VALUES
    (NEW.id, 'group', 'Ministranci', 'ministranci'),
    (NEW.id, 'group', 'Rodzice',     'rodzice');
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_schedules_from_templates(p_parish_id uuid, p_from_date date, p_to_date date)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_date    date;
  v_tmpl    RECORD;
BEGIN
  v_date := p_from_date;

  WHILE v_date <= p_to_date LOOP
    FOR v_tmpl IN
      SELECT *
      FROM   mass_templates
      WHERE  parish_id    = p_parish_id
        AND  day_of_week  = EXTRACT(DOW FROM v_date)::int
    LOOP
      INSERT INTO schedules (
        parish_id, title, date, time, category, created_by
      )
      SELECT
        p_parish_id,
        COALESCE(v_tmpl.label, 'Msza Święta'),
        v_date,
        v_tmpl.time,
        'msza',
        (SELECT id FROM profiles WHERE parish_id = p_parish_id AND role = 'admin' LIMIT 1)
      WHERE NOT EXISTS (
        SELECT 1 FROM schedules s
        WHERE  s.parish_id = p_parish_id
          AND  s.date      = v_date
          AND  s.time      = v_tmpl.time
          AND  s.category  = 'msza'
      );
    END LOOP;

    v_date := v_date + 1;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_chat_channels_with_meta()
 RETURNS TABLE(id uuid, parish_id uuid, type text, name text, slug text, created_at timestamp with time zone, last_message_content text, last_message_at timestamp with time zone, last_message_type text, unread_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT
    cc.id,
    cc.parish_id,
    cc.type,
    cc.name,
    cc.slug,
    cc.created_at,
    last_msg.content       AS last_message_content,
    last_msg.created_at    AS last_message_at,
    last_msg.type          AS last_message_type,
    (
      SELECT COUNT(*)
      FROM chat_messages m
      WHERE m.channel_id = cc.id
        AND m.created_at > COALESCE(cm.last_read_at, '1970-01-01'::timestamptz)
        AND m.deleted_at IS NULL
        AND m.sender_id != auth.uid()
    ) AS unread_count
  FROM chat_channels cc
  JOIN chat_members cm
    ON cm.channel_id = cc.id AND cm.user_id = auth.uid()
  LEFT JOIN LATERAL (
    SELECT m.content, m.created_at, m.type
    FROM chat_messages m
    WHERE m.channel_id = cc.id AND m.deleted_at IS NULL
    ORDER BY m.created_at DESC
    LIMIT 1
  ) last_msg ON true
  ORDER BY COALESCE(last_msg.created_at, cc.created_at) DESC;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_parish_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT parish_id FROM profiles WHERE id = auth.uid()
$function$
;

CREATE OR REPLACE FUNCTION public.get_parish_by_invite_code(code text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT id FROM parishes WHERE invite_code = upper(trim(code)) LIMIT 1
$function$
;

CREATE OR REPLACE FUNCTION public.get_parish_members(p_parish_id uuid)
 RETURNS TABLE(id uuid, full_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT id, full_name
  FROM profiles
  WHERE parish_id = p_parish_id
    AND role = 'member'
    AND is_active = true
  ORDER BY full_name;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', new.email),
    'member'
  );
  RETURN new;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_parish_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS(
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND (role = 'admin' OR is_admin = true)
  )
$function$
;

CREATE OR REPLACE FUNCTION public.link_parent_to_children(p_child_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_id   uuid := auth.uid();
  v_parish_id uuid;
  v_role      text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Pobierz parish_id i role wywołującego użytkownika
  SELECT parish_id, role INTO v_parish_id, v_role
    FROM profiles WHERE id = v_user_id;

  IF v_role NOT IN ('parent', 'admin') THEN
    RAISE EXCEPTION 'Only parents or admins can link children';
  END IF;

  IF v_parish_id IS NULL THEN
    RAISE EXCEPTION 'User has no parish assigned';
  END IF;

  -- Ustaw parent_id tylko na dzieciach z tej samej parafii o roli member
  UPDATE profiles
    SET parent_id = v_user_id
    WHERE id = ANY(p_child_ids)
      AND parish_id = v_parish_id
      AND role = 'member';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.my_parish_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT parish_id FROM profiles WHERE id = auth.uid()
$function$
;

CREATE OR REPLACE FUNCTION public.notify_chat_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_sender_name  text;
  v_channel_name text;
  v_tokens       text[];
BEGIN
  SELECT full_name INTO v_sender_name FROM profiles WHERE id = NEW.sender_id;
  SELECT name      INTO v_channel_name FROM chat_channels WHERE id = NEW.channel_id;

  SELECT ARRAY_AGG(p.push_token) INTO v_tokens
  FROM chat_members cm
  JOIN profiles p ON p.id = cm.user_id
  WHERE cm.channel_id = NEW.channel_id
    AND cm.user_id != NEW.sender_id
    AND p.push_token IS NOT NULL;

  IF v_tokens IS NOT NULL AND array_length(v_tokens, 1) > 0 THEN
    PERFORM notify_push(
      v_tokens,
      v_sender_name || ' • ' || COALESCE(v_channel_name, 'Wiadomość'),
      CASE WHEN NEW.type = 'poll' THEN '📊 Nowa ankieta' ELSE NEW.content END,
      jsonb_build_object('screen', 'chat', 'channelId', NEW.channel_id::text)
    );
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_push(tokens text[], title text, body text, data jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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

  BEGIN
    PERFORM net.http_post(
      url     := 'https://kvqjaoprxxiemynyihfs.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2cWphb3ByeHhpZW15bnlpaGZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNDQ3ODAsImV4cCI6MjA5MzYyMDc4MH0.55gjfeRl-xBsw_fdinSlxfPiao3BFwVNlo_cCVAQvzY'
      ),
      body    := jsonb_build_object('messages', messages)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL; -- push notification failure must never abort attendance/points writes
  END;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.record_extra_attendance(p_event_type text, p_event_date date, p_event_time time without time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO extra_attendance (profile_id, event_type, event_date, event_time)
  VALUES (auth.uid(), p_event_type, p_event_date, p_event_time);

  INSERT INTO points (profile_id, amount, reason, schedule_id, awarded_by)
  VALUES (
    auth.uid(),
    5,
    p_event_type || ' poza grafikiem (' || to_char(p_event_time, 'HH24:MI') || ')',
    NULL,
    NULL
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sign_up_for_slot(p_date date, p_time_label text, p_mode text DEFAULT 'once'::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid        uuid := auth.uid();
  v_parish_id  uuid;
  v_schedule_id uuid;
  v_time_db    time;
  v_h          int;
  v_m          int;
  v_dow        int;
  v_count      int := 0;
  v_cur_date   date;
  v_end_date   date;
  v_slot_h     int;
  v_slot_m     int;
  v_slot_time  time;
BEGIN
  IF (SELECT role FROM profiles WHERE id = v_uid) <> 'member' THEN
    RAISE EXCEPTION 'Brak uprawnień';
  END IF;

  SELECT parish_id INTO v_parish_id FROM profiles WHERE id = v_uid;

  v_h       := split_part(p_time_label, ':', 1)::int;
  v_m       := split_part(p_time_label, ':', 2)::int;
  v_time_db := make_time(v_h, v_m, 0);
  v_dow     := EXTRACT(DOW FROM p_date)::int;

  SELECT id INTO v_schedule_id
  FROM schedules
  WHERE parish_id = v_parish_id
    AND date = p_date
    AND EXTRACT(HOUR   FROM time) = v_h
    AND EXTRACT(MINUTE FROM time) = v_m
  LIMIT 1;

  IF v_schedule_id IS NULL THEN
    INSERT INTO schedules (title, date, time, location, gps_radius, parish_id, category)
    VALUES ('Msza Święta', p_date, v_time_db, '', 100, v_parish_id, 'msza')
    RETURNING id INTO v_schedule_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM schedule_assignments
    WHERE schedule_id = v_schedule_id AND profile_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Już jesteś zapisany na tę służbę';
  END IF;

  INSERT INTO schedule_assignments (schedule_id, profile_id, role, status)
  VALUES (v_schedule_id, v_uid, 'ministrant', 'assigned');
  v_count := 1;

  IF p_mode = 'recurring' THEN
    IF NOT EXISTS (
      SELECT 1 FROM recurring_commitments
      WHERE profile_id = v_uid AND day_of_week = v_dow AND time_slot = v_time_db
    ) THEN
      INSERT INTO recurring_commitments (profile_id, day_of_week, time_slot)
      VALUES (v_uid, v_dow, v_time_db);
    END IF;

    v_end_date := date_trunc('year', p_date)::date + interval '1 year' - interval '1 day';
    v_cur_date := p_date + interval '7 days';

    WHILE v_cur_date <= v_end_date LOOP
      IF v_h = 17 AND v_m IN (0, 30) THEN
        IF EXTRACT(MONTH FROM v_cur_date) IN (5, 6, 10) THEN
          v_slot_h := 17; v_slot_m := 0;
        ELSE
          v_slot_h := 17; v_slot_m := 30;
        END IF;
      ELSE
        v_slot_h := v_h; v_slot_m := v_m;
      END IF;

      v_slot_time := make_time(v_slot_h, v_slot_m, 0);

      SELECT id INTO v_schedule_id
      FROM schedules
      WHERE parish_id = v_parish_id
        AND date = v_cur_date
        AND EXTRACT(HOUR   FROM time) = v_slot_h
        AND EXTRACT(MINUTE FROM time) = v_slot_m
      LIMIT 1;

      IF v_schedule_id IS NULL THEN
        INSERT INTO schedules (title, date, time, location, gps_radius, parish_id, category)
        VALUES ('Msza Święta', v_cur_date, v_slot_time, '', 100, v_parish_id, 'msza')
        RETURNING id INTO v_schedule_id;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM schedule_assignments
        WHERE schedule_id = v_schedule_id AND profile_id = v_uid
      ) THEN
        INSERT INTO schedule_assignments (schedule_id, profile_id, role, status)
        VALUES (v_schedule_id, v_uid, 'ministrant', 'assigned');
        v_count := v_count + 1;
      END IF;

      v_cur_date := v_cur_date + interval '7 days';
    END LOOP;
  END IF;

  RETURN json_build_object('schedule_id', v_schedule_id, 'count', v_count);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_fn_notify_absence_decision()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.trg_fn_notify_announcement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.trg_fn_notify_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.trg_fn_notify_excused()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.trg_fn_notify_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.trg_fn_notify_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.trg_profiles_protect_sensitive_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF (NEW.parish_id IS DISTINCT FROM OLD.parish_id
      OR NEW.role IS DISTINCT FROM OLD.role
      OR NEW.is_admin IS DISTINCT FROM OLD.is_admin)
  THEN
    -- Zezwól na pierwszą rejestrację: gdy parish_id było NULL (user dopiero dołącza)
    -- is_admin musi pozostać false (blokuje self-elevation)
    IF OLD.parish_id IS NULL AND NEW.is_admin IS NOT TRUE THEN
      RETURN NEW;
    END IF;

    -- W pozostałych przypadkach wymagaj uprawnień admina
    IF NOT EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND (role = 'admin' OR is_admin = true)
    ) THEN
      RAISE EXCEPTION 'Brak uprawnień do zmiany parish_id, role lub is_admin';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

-- wartości domyślne
alter table public.announcements alter column id set default gen_random_uuid();
alter table public.announcements alter column is_pinned set default false;
alter table public.announcements alter column created_at set default now();
alter table public.announcements alter column target_audience set default 'all'::text;
alter table public.attendance alter column id set default uuid_generate_v4();
alter table public.attendance alter column checked_at set default now();
alter table public.badge_definitions alter column id set default gen_random_uuid();
alter table public.badge_definitions alter column created_at set default now();
alter table public.chat_channels alter column id set default gen_random_uuid();
alter table public.chat_channels alter column created_at set default now();
alter table public.chat_messages alter column id set default gen_random_uuid();
alter table public.chat_messages alter column created_at set default now();
alter table public.chat_messages alter column type set default 'text'::text;
alter table public.chat_poll_options alter column id set default gen_random_uuid();
alter table public.chat_poll_votes alter column id set default gen_random_uuid();
alter table public.chat_poll_votes alter column created_at set default now();
alter table public.chat_polls alter column id set default gen_random_uuid();
alter table public.chat_polls alter column allow_multiple set default false;
alter table public.chat_polls alter column created_at set default now();
alter table public.chat_reactions alter column id set default gen_random_uuid();
alter table public.chat_reactions alter column created_at set default now();
alter table public.extra_attendance alter column id set default gen_random_uuid();
alter table public.extra_attendance alter column checked_at set default now();
alter table public.group_members alter column id set default uuid_generate_v4();
alter table public.group_members alter column joined_at set default now();
alter table public.groups alter column id set default uuid_generate_v4();
alter table public.groups alter column created_at set default now();
alter table public.mass_templates alter column id set default gen_random_uuid();
alter table public.mass_templates alter column sort_order set default 0;
alter table public.mass_templates alter column created_at set default now();
alter table public.member_badges alter column id set default gen_random_uuid();
alter table public.member_badges alter column awarded_at set default now();
alter table public.member_badges alter column is_active set default true;
alter table public.parishes alter column id set default gen_random_uuid();
alter table public.parishes alter column invite_code set default upper(substr(md5((random())::text), 1, 6));
alter table public.parishes alter column created_at set default now();
alter table public.parishes alter column setup_done set default false;
alter table public.parishes alter column gps_radius set default 200;
alter table public.parishes alter column attendance_mode set default 'button'::text;
alter table public.parishes alter column allow_member_dm set default false;
alter table public.point_rules alter column id set default gen_random_uuid();
alter table public.point_rules alter column points set default 1;
alter table public.point_rules alter column created_at set default now();
alter table public.points alter column id set default uuid_generate_v4();
alter table public.points alter column created_at set default now();
alter table public.profiles alter column is_active set default true;
alter table public.profiles alter column created_at set default now();
alter table public.profiles alter column is_admin set default false;
alter table public.profiles alter column onboarding_completed set default false;
alter table public.ranks alter column id set default gen_random_uuid();
alter table public.ranks alter column "order" set default 0;
alter table public.ranks alter column is_system set default false;
alter table public.ranks alter column created_at set default now();
alter table public.recurring_commitments alter column id set default gen_random_uuid();
alter table public.recurring_commitments alter column created_at set default now();
alter table public.schedule_assignments alter column id set default uuid_generate_v4();
alter table public.schedule_assignments alter column status set default 'assigned'::text;
alter table public.schedules alter column id set default uuid_generate_v4();
alter table public.schedules alter column gps_radius set default 100;
alter table public.schedules alter column created_at set default now();
alter table public.schedules alter column category set default 'msza'::text;
alter table public.swap_offers alter column id set default uuid_generate_v4();
alter table public.swap_offers alter column status set default 'open'::text;
alter table public.swap_offers alter column created_at set default now();
alter table public.wiedza_entries alter column id set default gen_random_uuid();
alter table public.wiedza_entries alter column section set default ''::text;
alter table public.wiedza_entries alter column display_order set default 0;
alter table public.wiedza_entries alter column created_at set default now();

-- klucze i ograniczenia
alter table public.announcements add constraint announcements_pkey PRIMARY KEY (id);
alter table public.attendance add constraint attendance_method_check CHECK ((method = ANY (ARRAY['gps'::text, 'qr'::text, 'manual'::text])));
alter table public.attendance add constraint attendance_pkey PRIMARY KEY (id);
alter table public.attendance add constraint attendance_schedule_id_profile_id_key UNIQUE (schedule_id, profile_id);
alter table public.badge_definitions add constraint badge_definitions_persistence_check CHECK ((persistence = ANY (ARRAY['status'::text, 'permanent'::text])));
alter table public.badge_definitions add constraint badge_definitions_pkey PRIMARY KEY (id);
alter table public.badge_definitions add constraint badge_definitions_type_check CHECK ((type = ANY (ARRAY['auto'::text, 'manual'::text])));
alter table public.chat_channels add constraint chat_channels_pkey PRIMARY KEY (id);
alter table public.chat_channels add constraint chat_channels_type_check CHECK ((type = ANY (ARRAY['group'::text, 'dm'::text])));
alter table public.chat_members add constraint chat_members_pkey PRIMARY KEY (channel_id, user_id);
alter table public.chat_messages add constraint chat_messages_pkey PRIMARY KEY (id);
alter table public.chat_poll_options add constraint chat_poll_options_pkey PRIMARY KEY (id);
alter table public.chat_poll_votes add constraint chat_poll_votes_option_id_user_id_key UNIQUE (option_id, user_id);
alter table public.chat_poll_votes add constraint chat_poll_votes_pkey PRIMARY KEY (id);
alter table public.chat_polls add constraint chat_polls_pkey PRIMARY KEY (id);
alter table public.chat_reactions add constraint chat_reactions_message_id_user_id_key UNIQUE (message_id, user_id);
alter table public.chat_reactions add constraint chat_reactions_pkey PRIMARY KEY (id);
alter table public.extra_attendance add constraint extra_attendance_event_type_check CHECK ((event_type = ANY (ARRAY['msza'::text, 'nabożeństwo'::text])));
alter table public.extra_attendance add constraint extra_attendance_pkey PRIMARY KEY (id);
alter table public.extra_attendance add constraint extra_attendance_profile_id_event_date_event_time_key UNIQUE (profile_id, event_date, event_time);
alter table public.group_members add constraint group_members_group_id_profile_id_key UNIQUE (group_id, profile_id);
alter table public.group_members add constraint group_members_pkey PRIMARY KEY (id);
alter table public.groups add constraint groups_pkey PRIMARY KEY (id);
alter table public.mass_templates add constraint mass_templates_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6)));
alter table public.mass_templates add constraint mass_templates_pkey PRIMARY KEY (id);
alter table public.member_badges add constraint member_badges_pkey PRIMARY KEY (id);
alter table public.member_badges add constraint member_badges_profile_id_badge_definition_id_key UNIQUE (profile_id, badge_definition_id);
alter table public.parishes add constraint parishes_attendance_mode_check CHECK ((attendance_mode = ANY (ARRAY['button'::text, 'qr'::text, 'gps'::text, 'admin'::text])));
alter table public.parishes add constraint parishes_invite_code_key UNIQUE (invite_code);
alter table public.parishes add constraint parishes_pkey PRIMARY KEY (id);
alter table public.point_rules add constraint point_rules_parish_service_unique UNIQUE (parish_id, service_type);
alter table public.point_rules add constraint point_rules_pkey PRIMARY KEY (id);
alter table public.points add constraint points_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'member'::text, 'parent'::text])));
alter table public.ranks add constraint ranks_pkey PRIMARY KEY (id);
alter table public.recurring_commitments add constraint recurring_commitments_pkey PRIMARY KEY (id);
alter table public.schedule_assignments add constraint schedule_assignments_pkey PRIMARY KEY (id);
alter table public.schedule_assignments add constraint schedule_assignments_schedule_id_profile_id_key UNIQUE (schedule_id, profile_id);
alter table public.schedule_assignments add constraint schedule_assignments_status_check CHECK ((status = ANY (ARRAY['assigned'::text, 'present'::text, 'confirmed'::text, 'absent'::text, 'excused'::text, 'swapped'::text])));
alter table public.schedules add constraint schedules_category_check CHECK ((category = ANY (ARRAY['msza'::text, 'nabozenstwo'::text, 'zbiorka'::text])));
alter table public.schedules add constraint schedules_pkey PRIMARY KEY (id);
alter table public.swap_offers add constraint swap_offers_pkey PRIMARY KEY (id);
alter table public.swap_offers add constraint swap_offers_status_check CHECK ((status = ANY (ARRAY['open'::text, 'accepted'::text, 'rejected'::text, 'cancelled'::text])));
alter table public.wiedza_entries add constraint wiedza_entries_pkey PRIMARY KEY (id);
alter table public.announcements add constraint announcements_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.announcements add constraint announcements_parish_id_fkey FOREIGN KEY (parish_id) REFERENCES parishes(id);
alter table public.attendance add constraint attendance_marked_by_fkey FOREIGN KEY (marked_by) REFERENCES profiles(id);
alter table public.attendance add constraint attendance_parish_id_fkey FOREIGN KEY (parish_id) REFERENCES parishes(id);
alter table public.attendance add constraint attendance_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.attendance add constraint attendance_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE;
alter table public.badge_definitions add constraint badge_definitions_parish_id_fkey FOREIGN KEY (parish_id) REFERENCES parishes(id) ON DELETE CASCADE;
alter table public.chat_channels add constraint chat_channels_parish_id_fkey FOREIGN KEY (parish_id) REFERENCES parishes(id) ON DELETE CASCADE;
alter table public.chat_members add constraint chat_members_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES chat_channels(id) ON DELETE CASCADE;
alter table public.chat_members add constraint chat_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.chat_messages add constraint chat_messages_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES chat_channels(id) ON DELETE CASCADE;
alter table public.chat_messages add constraint chat_messages_poll_id_fkey FOREIGN KEY (poll_id) REFERENCES chat_polls(id) ON DELETE SET NULL;
alter table public.chat_messages add constraint chat_messages_reply_to_id_fkey FOREIGN KEY (reply_to_id) REFERENCES chat_messages(id);
alter table public.chat_messages add constraint chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.chat_poll_options add constraint chat_poll_options_poll_id_fkey FOREIGN KEY (poll_id) REFERENCES chat_polls(id) ON DELETE CASCADE;
alter table public.chat_poll_votes add constraint chat_poll_votes_option_id_fkey FOREIGN KEY (option_id) REFERENCES chat_poll_options(id) ON DELETE CASCADE;
alter table public.chat_poll_votes add constraint chat_poll_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.chat_polls add constraint chat_polls_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES chat_channels(id);
alter table public.chat_polls add constraint chat_polls_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES profiles(id);
alter table public.chat_reactions add constraint chat_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE;
alter table public.chat_reactions add constraint chat_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.extra_attendance add constraint extra_attendance_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id);
alter table public.group_members add constraint group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
alter table public.group_members add constraint group_members_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.groups add constraint groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.groups add constraint groups_parish_id_fkey FOREIGN KEY (parish_id) REFERENCES parishes(id);
alter table public.mass_templates add constraint mass_templates_parish_id_fkey FOREIGN KEY (parish_id) REFERENCES parishes(id) ON DELETE CASCADE;
alter table public.member_badges add constraint member_badges_awarded_by_fkey FOREIGN KEY (awarded_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.member_badges add constraint member_badges_badge_definition_id_fkey FOREIGN KEY (badge_definition_id) REFERENCES badge_definitions(id) ON DELETE CASCADE;
alter table public.member_badges add constraint member_badges_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.parishes add constraint parishes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.point_rules add constraint point_rules_parish_id_fkey FOREIGN KEY (parish_id) REFERENCES parishes(id) ON DELETE CASCADE;
alter table public.points add constraint points_awarded_by_fkey FOREIGN KEY (awarded_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.points add constraint points_parish_id_fkey FOREIGN KEY (parish_id) REFERENCES parishes(id);
alter table public.points add constraint points_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.points add constraint points_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE SET NULL;
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.profiles add constraint profiles_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.profiles add constraint profiles_parish_id_fkey FOREIGN KEY (parish_id) REFERENCES parishes(id);
alter table public.profiles add constraint profiles_rank_id_fkey FOREIGN KEY (rank_id) REFERENCES ranks(id);
alter table public.ranks add constraint ranks_parish_id_fkey FOREIGN KEY (parish_id) REFERENCES parishes(id);
alter table public.recurring_commitments add constraint recurring_commitments_parish_id_fkey FOREIGN KEY (parish_id) REFERENCES parishes(id);
alter table public.recurring_commitments add constraint recurring_commitments_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.schedule_assignments add constraint schedule_assignments_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.schedule_assignments add constraint schedule_assignments_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE;
alter table public.schedules add constraint schedules_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.schedules add constraint schedules_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
alter table public.schedules add constraint schedules_parish_id_fkey FOREIGN KEY (parish_id) REFERENCES parishes(id);
alter table public.swap_offers add constraint swap_offers_from_profile_id_fkey FOREIGN KEY (from_profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.swap_offers add constraint swap_offers_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE;
alter table public.swap_offers add constraint swap_offers_to_profile_id_fkey FOREIGN KEY (to_profile_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.wiedza_entries add constraint wiedza_entries_parish_id_fkey FOREIGN KEY (parish_id) REFERENCES parishes(id) ON DELETE CASCADE;

-- indeksy
CREATE UNIQUE INDEX badge_definitions_criteria_key_system_uq ON public.badge_definitions USING btree (criteria_key) WHERE (parish_id IS NULL);
CREATE UNIQUE INDEX badge_definitions_criteria_key_parish_uq ON public.badge_definitions USING btree (criteria_key, parish_id) WHERE (parish_id IS NOT NULL);
CREATE INDEX chat_channels_parish ON public.chat_channels USING btree (parish_id);
CREATE INDEX chat_members_user_channel ON public.chat_members USING btree (user_id, channel_id);
CREATE INDEX chat_members_user ON public.chat_members USING btree (user_id);
CREATE INDEX chat_messages_channel_created ON public.chat_messages USING btree (channel_id, created_at DESC);
CREATE INDEX chat_messages_unread ON public.chat_messages USING btree (channel_id, created_at DESC) WHERE (deleted_at IS NULL);
CREATE INDEX member_badges_profile_id_idx ON public.member_badges USING btree (profile_id);
CREATE UNIQUE INDEX points_no_duplicate_auto ON public.points USING btree (profile_id, schedule_id) WHERE ((schedule_id IS NOT NULL) AND (awarded_by IS NULL));
CREATE INDEX schedules_series_id_idx ON public.schedules USING btree (series_id) WHERE (series_id IS NOT NULL);

-- triggery
CREATE TRIGGER trg_notify_announcement AFTER INSERT ON public.announcements FOR EACH ROW EXECUTE FUNCTION trg_fn_notify_announcement();
CREATE TRIGGER trg_notify_chat_message AFTER INSERT ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION notify_chat_message();
CREATE TRIGGER trg_create_parish_channels AFTER INSERT ON public.parishes FOR EACH ROW EXECUTE FUNCTION create_parish_chat_channels();
CREATE TRIGGER trg_notify_points AFTER INSERT ON public.points FOR EACH ROW EXECUTE FUNCTION trg_fn_notify_points();
CREATE TRIGGER trg_add_profile_to_chat_channels AFTER INSERT OR UPDATE OF parish_id, role, is_admin ON public.profiles FOR EACH ROW EXECUTE FUNCTION add_profile_to_chat_channels();
CREATE TRIGGER trg_notify_new_user AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION trg_fn_notify_new_user();
CREATE TRIGGER trg_profiles_protect_sensitive BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION trg_profiles_protect_sensitive_fields();
CREATE TRIGGER trg_notify_absence_decision AFTER UPDATE ON public.schedule_assignments FOR EACH ROW EXECUTE FUNCTION trg_fn_notify_absence_decision();
CREATE TRIGGER trg_notify_assignment AFTER INSERT ON public.schedule_assignments FOR EACH ROW EXECUTE FUNCTION trg_fn_notify_assignment();
CREATE TRIGGER trg_notify_excused AFTER UPDATE ON public.schedule_assignments FOR EACH ROW EXECUTE FUNCTION trg_fn_notify_excused();
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- RLS
alter table public.announcements enable row level security;
alter table public.attendance enable row level security;
alter table public.badge_definitions enable row level security;
alter table public.chat_channels enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_poll_options enable row level security;
alter table public.chat_poll_votes enable row level security;
alter table public.chat_polls enable row level security;
alter table public.chat_reactions enable row level security;
alter table public.extra_attendance enable row level security;
alter table public.group_members enable row level security;
alter table public.groups enable row level security;
alter table public.mass_templates enable row level security;
alter table public.member_badges enable row level security;
alter table public.parishes enable row level security;
alter table public.point_rules enable row level security;
alter table public.points enable row level security;
alter table public.profiles enable row level security;
alter table public.ranks enable row level security;
alter table public.recurring_commitments enable row level security;
alter table public.schedule_assignments enable row level security;
alter table public.schedules enable row level security;
alter table public.swap_offers enable row level security;
alter table public.wiedza_entries enable row level security;

-- polityki
create policy "Admin manages announcements" on public.announcements as PERMISSIVE for ALL to public using (((parish_id = get_my_parish_id()) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role = 'admin'::text) OR (profiles.is_admin = true)))))));
create policy "Adminowie mogą zarządzać ogłoszeniami" on public.announcements as PERMISSIVE for ALL to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));
create policy "Parish announcements visible" on public.announcements as PERMISSIVE for SELECT to authenticated using ((parish_id = get_my_parish_id()));
create policy "Zalogowani mogą czytać ogłoszenia" on public.announcements as PERMISSIVE for SELECT to public using ((auth.role() = 'authenticated'::text));
create policy "announcements: admin manage" on public.announcements as PERMISSIVE for ALL to public using (((parish_id = get_my_parish_id()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text))))));
create policy "announcements: see own parish" on public.announcements as PERMISSIVE for SELECT to public using ((parish_id = get_my_parish_id()));
create policy announcements_delete on public.announcements as PERMISSIVE for DELETE to public using (((parish_id = my_parish_id()) AND is_parish_admin()));
create policy announcements_insert on public.announcements as PERMISSIVE for INSERT to public with check (((parish_id = my_parish_id()) AND is_parish_admin()));
create policy announcements_select on public.announcements as PERMISSIVE for SELECT to public using ((parish_id = my_parish_id()));
create policy announcements_update on public.announcements as PERMISSIVE for UPDATE to public using (((parish_id = my_parish_id()) AND is_parish_admin())) with check (((parish_id = my_parish_id()) AND is_parish_admin()));
create policy "Admin can delete attendance" on public.attendance as PERMISSIVE for DELETE to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role = 'admin'::text) OR (profiles.is_admin = true))))));
create policy "Admin can insert attendance" on public.attendance as PERMISSIVE for INSERT to public with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role = 'admin'::text) OR (profiles.is_admin = true))))));
create policy "Admin manages attendance" on public.attendance as PERMISSIVE for ALL to public using (((parish_id = get_my_parish_id()) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role = 'admin'::text) OR (profiles.is_admin = true)))))));
create policy "Dodaj swoją obecność" on public.attendance as PERMISSIVE for INSERT to authenticated with check ((auth.uid() = profile_id));
create policy "Member marks own attendance" on public.attendance as PERMISSIVE for INSERT to public with check (((profile_id = auth.uid()) AND (parish_id = get_my_parish_id())));
create policy "Obecnosc widoczna dla zalogowanych" on public.attendance as PERMISSIVE for SELECT to authenticated using (true);
create policy "Parish attendance visible" on public.attendance as PERMISSIVE for SELECT to authenticated using ((parish_id = get_my_parish_id()));
create policy "attendance: admin all" on public.attendance as PERMISSIVE for ALL to public using (((parish_id = get_my_parish_id()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text))))));
create policy "attendance: member insert" on public.attendance as PERMISSIVE for INSERT to public with check (((profile_id = auth.uid()) AND (parish_id = get_my_parish_id())));
create policy "attendance: see own parish" on public.attendance as PERMISSIVE for SELECT to public using ((parish_id = get_my_parish_id()));
create policy attendance_delete on public.attendance as PERMISSIVE for DELETE to public using (((parish_id = my_parish_id()) AND is_parish_admin()));
create policy attendance_insert on public.attendance as PERMISSIVE for INSERT to public with check (((parish_id = my_parish_id()) AND ((profile_id = auth.uid()) OR is_parish_admin())));
create policy attendance_select on public.attendance as PERMISSIVE for SELECT to public using ((parish_id = my_parish_id()));
create policy attendance_update on public.attendance as PERMISSIVE for UPDATE to public using (((parish_id = my_parish_id()) AND is_parish_admin())) with check (((parish_id = my_parish_id()) AND is_parish_admin()));
create policy member_insert_own_attendance on public.attendance as PERMISSIVE for INSERT to authenticated with check ((profile_id = auth.uid()));
create policy member_select_own_attendance on public.attendance as PERMISSIVE for SELECT to authenticated using ((profile_id = auth.uid()));
create policy badge_definitions_admin_write on public.badge_definitions as PERMISSIVE for ALL to public using ((parish_id IN ( SELECT profiles.parish_id
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role = 'admin'::text) OR (profiles.is_admin = true)))))) with check ((parish_id IN ( SELECT profiles.parish_id
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role = 'admin'::text) OR (profiles.is_admin = true))))));
create policy badge_definitions_select on public.badge_definitions as PERMISSIVE for SELECT to public using (((parish_id IS NULL) OR (parish_id IN ( SELECT profiles.parish_id
   FROM profiles
  WHERE (profiles.id = auth.uid())))));
create policy chat_channels_insert on public.chat_channels as PERMISSIVE for INSERT to public with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.parish_id = chat_channels.parish_id)))));
create policy chat_channels_select on public.chat_channels as PERMISSIVE for SELECT to public using ((EXISTS ( SELECT 1
   FROM chat_members
  WHERE ((chat_members.channel_id = chat_channels.id) AND (chat_members.user_id = auth.uid())))));
create policy chat_members_insert on public.chat_members as PERMISSIVE for INSERT to public with check (((EXISTS ( SELECT 1
   FROM (profiles p
     JOIN chat_channels cc ON ((cc.parish_id = p.parish_id)))
  WHERE ((p.id = auth.uid()) AND ((p.role = 'admin'::text) OR (p.is_admin = true)) AND (cc.id = chat_members.channel_id)))) OR (user_id = auth.uid())));
create policy chat_members_select on public.chat_members as PERMISSIVE for SELECT to public using (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role = 'admin'::text) OR (profiles.is_admin = true)))))));
create policy chat_members_update on public.chat_members as PERMISSIVE for UPDATE to public using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy chat_messages_insert on public.chat_messages as PERMISSIVE for INSERT to public with check (((sender_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM chat_members
  WHERE ((chat_members.channel_id = chat_messages.channel_id) AND (chat_members.user_id = auth.uid()))))));
create policy chat_messages_select on public.chat_messages as PERMISSIVE for SELECT to public using ((EXISTS ( SELECT 1
   FROM chat_members
  WHERE ((chat_members.channel_id = chat_messages.channel_id) AND (chat_members.user_id = auth.uid())))));
create policy chat_messages_update on public.chat_messages as PERMISSIVE for UPDATE to public using (((sender_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role = 'admin'::text) OR (profiles.is_admin = true))))))) with check (((sender_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role = 'admin'::text) OR (profiles.is_admin = true)))))));
create policy chat_poll_options_insert on public.chat_poll_options as PERMISSIVE for INSERT to public with check ((EXISTS ( SELECT 1
   FROM chat_polls
  WHERE ((chat_polls.id = chat_poll_options.poll_id) AND (chat_polls.creator_id = auth.uid())))));
create policy chat_poll_options_select on public.chat_poll_options as PERMISSIVE for SELECT to public using ((EXISTS ( SELECT 1
   FROM (chat_members cm
     JOIN chat_polls p ON ((p.id = chat_poll_options.poll_id)))
  WHERE ((cm.channel_id = p.channel_id) AND (cm.user_id = auth.uid())))));
create policy chat_poll_votes_delete on public.chat_poll_votes as PERMISSIVE for DELETE to public using ((user_id = auth.uid()));
create policy chat_poll_votes_insert on public.chat_poll_votes as PERMISSIVE for INSERT to public with check ((user_id = auth.uid()));
create policy chat_poll_votes_select on public.chat_poll_votes as PERMISSIVE for SELECT to public using ((EXISTS ( SELECT 1
   FROM ((chat_members cm
     JOIN chat_poll_options opt ON ((opt.id = chat_poll_votes.option_id)))
     JOIN chat_polls p ON ((p.id = opt.poll_id)))
  WHERE ((cm.channel_id = p.channel_id) AND (cm.user_id = auth.uid())))));
create policy chat_polls_insert on public.chat_polls as PERMISSIVE for INSERT to public with check (((creator_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM chat_members
  WHERE ((chat_members.channel_id = chat_polls.channel_id) AND (chat_members.user_id = auth.uid()))))));
create policy chat_polls_select on public.chat_polls as PERMISSIVE for SELECT to public using ((EXISTS ( SELECT 1
   FROM chat_members
  WHERE ((chat_members.channel_id = chat_polls.channel_id) AND (chat_members.user_id = auth.uid())))));
create policy chat_polls_update on public.chat_polls as PERMISSIVE for UPDATE to public using (((creator_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role = 'admin'::text) OR (profiles.is_admin = true)))))));
create policy chat_reactions_delete on public.chat_reactions as PERMISSIVE for DELETE to public using ((user_id = auth.uid()));
create policy chat_reactions_insert on public.chat_reactions as PERMISSIVE for INSERT to public with check ((user_id = auth.uid()));
create policy chat_reactions_select on public.chat_reactions as PERMISSIVE for SELECT to public using ((EXISTS ( SELECT 1
   FROM (chat_members cm
     JOIN chat_messages msg ON ((msg.id = chat_reactions.message_id)))
  WHERE ((cm.channel_id = msg.channel_id) AND (cm.user_id = auth.uid())))));
create policy chat_reactions_update on public.chat_reactions as PERMISSIVE for UPDATE to public using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy "admin view all" on public.extra_attendance as PERMISSIVE for SELECT to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));
create policy "member insert own" on public.extra_attendance as PERMISSIVE for INSERT to public with check ((auth.uid() = profile_id));
create policy "member view own" on public.extra_attendance as PERMISSIVE for SELECT to public using ((auth.uid() = profile_id));
create policy "group_members: admin manage" on public.group_members as PERMISSIVE for ALL to public using ((EXISTS ( SELECT 1
   FROM (groups g
     JOIN profiles p ON ((p.id = auth.uid())))
  WHERE ((g.id = group_members.group_id) AND (g.parish_id = p.parish_id) AND (p.role = 'admin'::text)))));
create policy "group_members: see own parish" on public.group_members as PERMISSIVE for SELECT to public using ((EXISTS ( SELECT 1
   FROM groups g
  WHERE ((g.id = group_members.group_id) AND (g.parish_id = get_my_parish_id())))));
create policy "Admin — pełny dostęp do grup" on public.groups as PERMISSIVE for ALL to authenticated using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));
create policy "Grupy widoczne dla zalogowanych" on public.groups as PERMISSIVE for SELECT to authenticated using (true);
create policy "groups: admin manage" on public.groups as PERMISSIVE for ALL to public using (((parish_id = get_my_parish_id()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text))))));
create policy "groups: see own parish" on public.groups as PERMISSIVE for SELECT to public using ((parish_id = get_my_parish_id()));
create policy groups_admin_write on public.groups as PERMISSIVE for ALL to public using ((created_by IN ( SELECT profiles.id
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role = 'admin'::text) OR (profiles.is_admin = true)))))) with check ((created_by IN ( SELECT profiles.id
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role = 'admin'::text) OR (profiles.is_admin = true))))));
create policy groups_select on public.groups as PERMISSIVE for SELECT to public using (((created_by IS NULL) OR (created_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.parish_id = my_parish_id())))));
create policy "Admins delete mass templates" on public.mass_templates as PERMISSIVE for DELETE to public using ((parish_id = ( SELECT profiles.parish_id
   FROM profiles
  WHERE (profiles.id = auth.uid())
 LIMIT 1)));
create policy "Admins manage templates" on public.mass_templates as PERMISSIVE for ALL to public using ((parish_id = get_my_parish_id())) with check ((parish_id = get_my_parish_id()));
create policy "Parish members view templates" on public.mass_templates as PERMISSIVE for SELECT to public using ((parish_id = get_my_parish_id()));
create policy "Parish templates visible" on public.mass_templates as PERMISSIVE for SELECT to authenticated using ((parish_id = get_my_parish_id()));
create policy "mass_templates: admin manage" on public.mass_templates as PERMISSIVE for ALL to public using (((parish_id = get_my_parish_id()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text))))));
create policy "mass_templates: see own parish" on public.mass_templates as PERMISSIVE for SELECT to public using ((parish_id = get_my_parish_id()));
create policy mass_templates_admin_write on public.mass_templates as PERMISSIVE for ALL to public using (((parish_id = my_parish_id()) AND is_parish_admin())) with check (((parish_id = my_parish_id()) AND is_parish_admin()));
create policy mass_templates_select on public.mass_templates as PERMISSIVE for SELECT to public using ((parish_id = my_parish_id()));
create policy member_badges_admin_write on public.member_badges as PERMISSIVE for ALL to public using ((EXISTS ( SELECT 1
   FROM profiles a,
    profiles m
  WHERE ((a.id = auth.uid()) AND ((a.role = 'admin'::text) OR (a.is_admin = true)) AND (m.id = member_badges.profile_id) AND (a.parish_id = m.parish_id))))) with check ((EXISTS ( SELECT 1
   FROM profiles a,
    profiles m
  WHERE ((a.id = auth.uid()) AND ((a.role = 'admin'::text) OR (a.is_admin = true)) AND (m.id = member_badges.profile_id) AND (a.parish_id = m.parish_id)))));
create policy member_badges_member_update on public.member_badges as PERMISSIVE for UPDATE to public using (((profile_id = auth.uid()) AND (( SELECT badge_definitions.type
   FROM badge_definitions
  WHERE (badge_definitions.id = member_badges.badge_definition_id)) = 'auto'::text))) with check (((profile_id = auth.uid()) AND (( SELECT badge_definitions.type
   FROM badge_definitions
  WHERE (badge_definitions.id = member_badges.badge_definition_id)) = 'auto'::text)));
create policy member_badges_member_write on public.member_badges as PERMISSIVE for INSERT to public with check (((profile_id = auth.uid()) AND (( SELECT badge_definitions.type
   FROM badge_definitions
  WHERE (badge_definitions.id = member_badges.badge_definition_id)) = 'auto'::text)));
create policy member_badges_select on public.member_badges as PERMISSIVE for SELECT to public using (((profile_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM (profiles a
     JOIN profiles m ON ((m.id = member_badges.profile_id)))
  WHERE ((a.id = auth.uid()) AND ((a.role = 'admin'::text) OR (a.is_admin = true)) AND (a.parish_id = m.parish_id)))) OR (EXISTS ( SELECT 1
   FROM profiles child
  WHERE ((child.id = member_badges.profile_id) AND (child.parent_id = auth.uid()))))));
create policy "Admin can update own parish" on public.parishes as PERMISSIVE for UPDATE to public using (((created_by = auth.uid()) OR (id = get_my_parish_id())));
create policy "Authenticated can create parish" on public.parishes as PERMISSIVE for INSERT to public with check (((auth.uid() IS NOT NULL) AND (created_by = auth.uid())));
create policy "Read own parish" on public.parishes as PERMISSIVE for SELECT to public using (((id = get_my_parish_id()) OR (created_by = auth.uid())));
create policy "parishes: admin insert" on public.parishes as PERMISSIVE for INSERT to public with check (true);
create policy "parishes: admin update" on public.parishes as PERMISSIVE for UPDATE to public using (((id = get_my_parish_id()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text))))));
create policy "parishes: see all" on public.parishes as PERMISSIVE for SELECT to public using (true);
create policy parishes_admin_update on public.parishes as PERMISSIVE for UPDATE to public using (((id = my_parish_id()) AND is_parish_admin())) with check (((id = my_parish_id()) AND is_parish_admin()));
create policy parishes_insert on public.parishes as PERMISSIVE for INSERT to public with check ((created_by = auth.uid()));
create policy parishes_select_own on public.parishes as PERMISSIVE for SELECT to public using ((id = my_parish_id()));
create policy "Admins delete point rules" on public.point_rules as PERMISSIVE for DELETE to public using ((parish_id = get_my_parish_id()));
create policy "Admins manage point rules" on public.point_rules as PERMISSIVE for ALL to public using ((parish_id = get_my_parish_id())) with check ((parish_id = get_my_parish_id()));
create policy "Parish members view point rules" on public.point_rules as PERMISSIVE for SELECT to public using ((parish_id = get_my_parish_id()));
create policy "Parish point rules visible" on public.point_rules as PERMISSIVE for SELECT to authenticated using ((parish_id = get_my_parish_id()));
create policy "point_rules: admin manage" on public.point_rules as PERMISSIVE for ALL to public using (((parish_id = get_my_parish_id()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text))))));
create policy "point_rules: see own parish" on public.point_rules as PERMISSIVE for SELECT to public using ((parish_id = get_my_parish_id()));
create policy point_rules_admin_write on public.point_rules as PERMISSIVE for ALL to public using (((parish_id = my_parish_id()) AND is_parish_admin())) with check (((parish_id = my_parish_id()) AND is_parish_admin()));
create policy point_rules_select on public.point_rules as PERMISSIVE for SELECT to public using ((parish_id = my_parish_id()));
create policy "Admin manages points" on public.points as PERMISSIVE for ALL to public using (((parish_id = get_my_parish_id()) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role = 'admin'::text) OR (profiles.is_admin = true)))))));
create policy "Parish points visible" on public.points as PERMISSIVE for SELECT to authenticated using ((parish_id = get_my_parish_id()));
create policy "Punkty widoczne dla zalogowanych" on public.points as PERMISSIVE for SELECT to authenticated using (true);
create policy "points: admin manage" on public.points as PERMISSIVE for ALL to public using (((parish_id = get_my_parish_id()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text))))));
create policy "points: see own parish" on public.points as PERMISSIVE for SELECT to public using ((parish_id = get_my_parish_id()));
create policy points_delete on public.points as PERMISSIVE for DELETE to public using (((parish_id = my_parish_id()) AND is_parish_admin()));
create policy points_insert on public.points as PERMISSIVE for INSERT to public with check (((parish_id = my_parish_id()) AND is_parish_admin()));
create policy points_select on public.points as PERMISSIVE for SELECT to public using ((parish_id = my_parish_id()));
create policy points_update on public.points as PERMISSIVE for UPDATE to public using (((parish_id = my_parish_id()) AND is_parish_admin())) with check (((parish_id = my_parish_id()) AND is_parish_admin()));
create policy "Edycja własnego profilu" on public.profiles as PERMISSIVE for UPDATE to authenticated using ((auth.uid() = id));
create policy "Parish profiles visible" on public.profiles as PERMISSIVE for SELECT to authenticated using (((id = auth.uid()) OR (parish_id = get_my_parish_id())));
create policy "Profile widoczny dla zalogowanych" on public.profiles as PERMISSIVE for SELECT to authenticated using (true);
create policy "Users insert own profile" on public.profiles as PERMISSIVE for INSERT to public with check ((id = auth.uid()));
create policy "Users see profiles in same parish" on public.profiles as PERMISSIVE for SELECT to public using (((parish_id = get_my_parish_id()) OR (id = auth.uid())));
create policy "Users update own profile" on public.profiles as PERMISSIVE for UPDATE to public using ((id = auth.uid())) with check ((id = auth.uid()));
create policy "profiles: admin update" on public.profiles as PERMISSIVE for UPDATE to public using (((parish_id = get_my_parish_id()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text))))));
create policy "profiles: see same parish" on public.profiles as PERMISSIVE for SELECT to public using (((id = auth.uid()) OR (parish_id = get_my_parish_id()) OR (parent_id = auth.uid())));
create policy "profiles: update own" on public.profiles as PERMISSIVE for UPDATE to public using ((id = auth.uid()));
create policy profiles_insert on public.profiles as PERMISSIVE for INSERT to public with check (((id = auth.uid()) AND ((role IS NULL) OR (role = ANY (ARRAY['member'::text, 'parent'::text, 'admin'::text]))) AND (is_admin IS NOT TRUE)));
create policy profiles_select on public.profiles as PERMISSIVE for SELECT to public using (((id = auth.uid()) OR (parish_id = my_parish_id())));
create policy profiles_update on public.profiles as PERMISSIVE for UPDATE to public using (((id = auth.uid()) OR (is_parish_admin() AND (parish_id = my_parish_id())))) with check (((id = auth.uid()) OR (is_parish_admin() AND (parish_id = my_parish_id()))));
create policy "Admin can manage ranks" on public.ranks as PERMISSIVE for ALL to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role = 'admin'::text) OR (profiles.is_admin = true))))));
create policy "Admin manages parish ranks" on public.ranks as PERMISSIVE for ALL to public using (((parish_id = get_my_parish_id()) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role = 'admin'::text) OR (profiles.is_admin = true)))))));
create policy "Anyone can read ranks" on public.ranks as PERMISSIVE for SELECT to public using (true);
create policy "Everyone reads ranks" on public.ranks as PERMISSIVE for SELECT to public using (((parish_id IS NULL) OR (parish_id = get_my_parish_id())));
create policy ranks_admin_write on public.ranks as PERMISSIVE for ALL to public using (((parish_id = my_parish_id()) AND is_parish_admin())) with check (((parish_id = my_parish_id()) AND is_parish_admin()));
create policy ranks_select on public.ranks as PERMISSIVE for SELECT to public using (((parish_id IS NULL) OR (parish_id = my_parish_id())));
create policy "Own recurring commitments" on public.recurring_commitments as PERMISSIVE for SELECT to authenticated using ((profile_id = auth.uid()));
create policy "Użytkownicy zarządzają swoimi cyklami" on public.recurring_commitments as PERMISSIVE for ALL to public using ((auth.uid() = profile_id));
create policy "recurring: admin" on public.recurring_commitments as PERMISSIVE for SELECT to public using ((EXISTS ( SELECT 1
   FROM profiles member_p,
    profiles admin_p
  WHERE ((member_p.id = recurring_commitments.profile_id) AND (admin_p.id = auth.uid()) AND (admin_p.role = 'admin'::text) AND (member_p.parish_id = admin_p.parish_id)))));
create policy "recurring: own" on public.recurring_commitments as PERMISSIVE for ALL to public using ((profile_id = auth.uid()));
create policy recurring_commitments_self on public.recurring_commitments as PERMISSIVE for ALL to public using ((profile_id = auth.uid())) with check ((profile_id = auth.uid()));
create policy "Admin can delete any assignment" on public.schedule_assignments as PERMISSIVE for DELETE to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role = 'admin'::text) OR (profiles.is_admin = true))))));
create policy "Admin can update any assignment" on public.schedule_assignments as PERMISSIVE for UPDATE to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role = 'admin'::text) OR (profiles.is_admin = true))))));
create policy "Admin manages assignments" on public.schedule_assignments as PERMISSIVE for ALL to public using (((EXISTS ( SELECT 1
   FROM schedules
  WHERE ((schedules.id = schedule_assignments.schedule_id) AND (schedules.parish_id = get_my_parish_id())))) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role = 'admin'::text) OR (profiles.is_admin = true)))))));
create policy "Member manages own assignments" on public.schedule_assignments as PERMISSIVE for UPDATE to public using ((profile_id = auth.uid()));
create policy "Ministrant może zgłosić nieobecność na własnym dyżurze" on public.schedule_assignments as PERMISSIVE for UPDATE to authenticated using ((profile_id = auth.uid())) with check ((profile_id = auth.uid()));
create policy "Parish assignments visible" on public.schedule_assignments as PERMISSIVE for SELECT to authenticated using (((profile_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM schedules s
  WHERE ((s.id = schedule_assignments.schedule_id) AND (s.parish_id = get_my_parish_id()))))));
create policy "Przypisania widoczne dla zalogowanych" on public.schedule_assignments as PERMISSIVE for SELECT to authenticated using (true);
create policy "assignments: admin all" on public.schedule_assignments as PERMISSIVE for ALL to public using ((EXISTS ( SELECT 1
   FROM (schedules s
     JOIN profiles p ON ((p.id = auth.uid())))
  WHERE ((s.id = schedule_assignments.schedule_id) AND (s.parish_id = p.parish_id) AND (p.role = 'admin'::text)))));
create policy "assignments: member delete" on public.schedule_assignments as PERMISSIVE for DELETE to public using ((profile_id = auth.uid()));
create policy "assignments: member insert" on public.schedule_assignments as PERMISSIVE for INSERT to public with check ((profile_id = auth.uid()));
create policy "assignments: member update" on public.schedule_assignments as PERMISSIVE for UPDATE to public using ((profile_id = auth.uid()));
create policy "assignments: see parish" on public.schedule_assignments as PERMISSIVE for SELECT to public using ((EXISTS ( SELECT 1
   FROM schedules s
  WHERE ((s.id = schedule_assignments.schedule_id) AND (s.parish_id = get_my_parish_id())))));
create policy authenticated_select_assignments on public.schedule_assignments as PERMISSIVE for SELECT to authenticated using (true);
create policy member_delete_own_assignment on public.schedule_assignments as PERMISSIVE for DELETE to authenticated using ((profile_id = auth.uid()));
create policy member_update_own_assignment on public.schedule_assignments as PERMISSIVE for UPDATE to authenticated using ((profile_id = auth.uid())) with check ((profile_id = auth.uid()));
create policy schedule_assignments_delete on public.schedule_assignments as PERMISSIVE for DELETE to public using (((profile_id = auth.uid()) OR (is_parish_admin() AND (EXISTS ( SELECT 1
   FROM schedules s
  WHERE ((s.id = schedule_assignments.schedule_id) AND (s.parish_id = my_parish_id())))))));
create policy schedule_assignments_insert on public.schedule_assignments as PERMISSIVE for INSERT to public with check ((is_parish_admin() AND (EXISTS ( SELECT 1
   FROM schedules s
  WHERE ((s.id = schedule_assignments.schedule_id) AND (s.parish_id = my_parish_id())))) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = schedule_assignments.profile_id) AND (p.parish_id = my_parish_id()))))));
create policy schedule_assignments_select on public.schedule_assignments as PERMISSIVE for SELECT to public using ((EXISTS ( SELECT 1
   FROM schedules s
  WHERE ((s.id = schedule_assignments.schedule_id) AND (s.parish_id = my_parish_id())))));
create policy schedule_assignments_update on public.schedule_assignments as PERMISSIVE for UPDATE to public using (((profile_id = auth.uid()) OR (is_parish_admin() AND (EXISTS ( SELECT 1
   FROM schedules s
  WHERE ((s.id = schedule_assignments.schedule_id) AND (s.parish_id = my_parish_id()))))))) with check (((profile_id = auth.uid()) OR (is_parish_admin() AND (EXISTS ( SELECT 1
   FROM schedules s
  WHERE ((s.id = schedule_assignments.schedule_id) AND (s.parish_id = my_parish_id())))))));
create policy "Admin manages schedules" on public.schedules as PERMISSIVE for ALL to public using (((parish_id = get_my_parish_id()) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role = 'admin'::text) OR (profiles.is_admin = true)))))));
create policy "Admins delete schedules" on public.schedules as PERMISSIVE for DELETE to public using ((parish_id = ( SELECT profiles.parish_id
   FROM profiles
  WHERE (profiles.id = auth.uid())
 LIMIT 1)));
create policy "Parish schedules visible" on public.schedules as PERMISSIVE for SELECT to public using ((parish_id = get_my_parish_id()));
create policy parish_isolation on public.schedules as PERMISSIVE for ALL to public using ((parish_id = ( SELECT profiles.parish_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
create policy "schedules: admin delete" on public.schedules as PERMISSIVE for DELETE to public using (((parish_id = get_my_parish_id()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text))))));
create policy "schedules: admin insert" on public.schedules as PERMISSIVE for INSERT to public with check (((parish_id = get_my_parish_id()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text))))));
create policy "schedules: admin update" on public.schedules as PERMISSIVE for UPDATE to public using (((parish_id = get_my_parish_id()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text))))));
create policy "schedules: see own parish" on public.schedules as PERMISSIVE for SELECT to public using ((parish_id = get_my_parish_id()));
create policy schedules_delete on public.schedules as PERMISSIVE for DELETE to public using (((parish_id = my_parish_id()) AND is_parish_admin()));
create policy schedules_insert on public.schedules as PERMISSIVE for INSERT to public with check (((parish_id = my_parish_id()) AND is_parish_admin()));
create policy schedules_select on public.schedules as PERMISSIVE for SELECT to public using ((parish_id = my_parish_id()));
create policy schedules_update on public.schedules as PERMISSIVE for UPDATE to public using (((parish_id = my_parish_id()) AND is_parish_admin())) with check (((parish_id = my_parish_id()) AND is_parish_admin()));
create policy "Edytuj własne oferty zastępstw" on public.swap_offers as PERMISSIVE for UPDATE to authenticated using (((auth.uid() = from_profile_id) OR (auth.uid() = to_profile_id)));
create policy "Giełda widoczna dla zalogowanych" on public.swap_offers as PERMISSIVE for SELECT to authenticated using (true);
create policy "Twórz własne oferty zastępstw" on public.swap_offers as PERMISSIVE for INSERT to authenticated with check ((auth.uid() = from_profile_id));
create policy wiedza_entries_admin_write on public.wiedza_entries as PERMISSIVE for ALL to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.parish_id = wiedza_entries.parish_id) AND ((profiles.role = 'admin'::text) OR (profiles.is_admin = true))))));
create policy wiedza_entries_read on public.wiedza_entries as PERMISSIVE for SELECT to public using ((parish_id = ( SELECT profiles.parish_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
create policy "Authenticated users can update avatars" on storage.objects as PERMISSIVE for UPDATE to authenticated using ((bucket_id = 'avatars'::text));
create policy "Authenticated users can upload avatars" on storage.objects as PERMISSIVE for INSERT to authenticated with check ((bucket_id = 'avatars'::text));
create policy "Full access for authenticated users in avatars" on storage.objects as PERMISSIVE for ALL to authenticated using ((bucket_id = 'avatars'::text)) with check ((bucket_id = 'avatars'::text));

-- realtime
alter publication supabase_realtime add table public.announcements;
alter publication supabase_realtime add table public.chat_channels;
alter publication supabase_realtime add table public.chat_members;
alter publication supabase_realtime add table public.chat_messages;
alter publication supabase_realtime add table public.chat_poll_votes;
alter publication supabase_realtime add table public.chat_polls;
alter publication supabase_realtime add table public.chat_reactions;
alter publication supabase_realtime add table public.member_badges;
alter publication supabase_realtime add table public.points;
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.schedule_assignments;

-- dane słownikowe: rangi
insert into public.ranks select * from json_populate_recordset(null::public.ranks, '[{"id":"85352830-633a-45ff-9598-f7f5ca0a717e","name":"Kandydat","order":1,"is_system":true,"created_at":"2026-05-27T14:24:04.112239+00:00","parish_id":null}, 
 {"id":"bf00d718-ffde-488d-82f2-991e490f9848","name":"Ministrant","order":2,"is_system":true,"created_at":"2026-05-27T14:24:04.112239+00:00","parish_id":null}, 
 {"id":"71d8c6d7-173d-4c8d-bb1b-69f4a891be85","name":"Lektor Starszy","order":4,"is_system":true,"created_at":"2026-05-27T14:24:04.112239+00:00","parish_id":null}, 
 {"id":"0a811a60-29bf-489a-8a4f-81bf0b4edef9","name":"Ceremoniarz","order":5,"is_system":true,"created_at":"2026-05-27T14:24:04.112239+00:00","parish_id":null}, 
 {"id":"2d9909a6-b1d6-4d9f-8637-36bec1989926","name":"Lektor Młodszy","order":3,"is_system":true,"created_at":"2026-05-27T14:24:04.112239+00:00","parish_id":null}]');

-- dane słownikowe: odznaki
insert into public.badge_definitions select * from json_populate_recordset(null::public.badge_definitions, '[{"id":"96a6a953-3a95-406e-9596-8aa02970fe34","parish_id":null,"name":"Regularny","icon":"🔥","type":"auto","persistence":"status","criteria_key":"regularny","created_at":"2026-05-27T14:18:50.532439+00:00"}, 
 {"id":"b1bf83f8-c8d1-4522-aa9e-ba1cf4535424","parish_id":null,"name":"Seria 5","icon":"⚡","type":"auto","persistence":"status","criteria_key":"seria_5","created_at":"2026-05-27T14:18:50.532439+00:00"}, 
 {"id":"21037aed-3cfe-47ce-878a-70ee6f5fa0ff","parish_id":null,"name":"Seria 10","icon":"⚡","type":"auto","persistence":"status","criteria_key":"seria_10","created_at":"2026-05-27T14:18:50.532439+00:00"}, 
 {"id":"8b2d1de1-de48-442f-97d9-db5fffb2ea5b","parish_id":null,"name":"Seria 15","icon":"⚡","type":"auto","persistence":"status","criteria_key":"seria_15","created_at":"2026-05-27T14:18:50.532439+00:00"}, 
 {"id":"e195347f-3f74-4fde-a96f-33e571f36be0","parish_id":null,"name":"Seria 20","icon":"⚡","type":"auto","persistence":"status","criteria_key":"seria_20","created_at":"2026-05-27T14:18:50.532439+00:00"}, 
 {"id":"5527a48d-45db-42a8-b711-93709a57d662","parish_id":null,"name":"Weteran 100","icon":"🎖️","type":"auto","persistence":"permanent","criteria_key":"weteran_100","created_at":"2026-05-27T14:18:50.532439+00:00"}, 
 {"id":"d1fdfb10-9d31-436f-afd1-7897a261d06f","parish_id":null,"name":"Weteran 250","icon":"🎖️","type":"auto","persistence":"permanent","criteria_key":"weteran_250","created_at":"2026-05-27T14:18:50.532439+00:00"}, 
 {"id":"c2d06650-db60-480b-a6f2-ce89dd8a7dd9","parish_id":null,"name":"Weteran 500","icon":"🎖️","type":"auto","persistence":"permanent","criteria_key":"weteran_500","created_at":"2026-05-27T14:18:50.532439+00:00"}, 
 {"id":"87d2643d-d987-4ecc-94be-cccb927a2903","parish_id":null,"name":"Rocznik 1","icon":"🎂","type":"auto","persistence":"permanent","criteria_key":"rocznica_1","created_at":"2026-05-27T14:18:50.532439+00:00"}, 
 {"id":"c7a4caec-a0da-435f-8647-ec80cb79712b","parish_id":null,"name":"Rocznik 2","icon":"🎂","type":"auto","persistence":"permanent","criteria_key":"rocznica_2","created_at":"2026-05-27T14:18:50.532439+00:00"}, 
 {"id":"10d6d71a-4092-44d1-8e44-ab7458f29456","parish_id":null,"name":"Rocznik 5","icon":"🎂","type":"auto","persistence":"permanent","criteria_key":"rocznica_5","created_at":"2026-05-27T14:18:50.532439+00:00"}, 
 {"id":"9538d6f4-200a-4cb4-9ca1-0d21a35f825d","parish_id":null,"name":"Top 3","icon":"🏆","type":"auto","persistence":"permanent","criteria_key":"top3","created_at":"2026-05-27T14:18:50.532439+00:00"}, 
 {"id":"e1954c92-f4e2-4f86-83c2-759ad0b74b79","parish_id":null,"name":"Sumienny","icon":"⭐","type":"manual","persistence":"permanent","criteria_key":"sumienny","created_at":"2026-05-27T14:18:50.532439+00:00"}, 
 {"id":"2e600878-03dd-47e6-9720-8996fb72cc46","parish_id":null,"name":"Animator","icon":"👑","type":"manual","persistence":"permanent","criteria_key":"animator","created_at":"2026-05-27T14:18:50.532439+00:00"}, 
 {"id":"e8220b63-69d8-4d27-814d-843922f2c532","parish_id":null,"name":"Szczególna posługa","icon":"✝️","type":"manual","persistence":"permanent","criteria_key":"szczegolna","created_at":"2026-05-27T14:18:50.532439+00:00"}]');

-- storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('avatars', 'avatars', 't', null, NULL) on conflict (id) do nothing;
