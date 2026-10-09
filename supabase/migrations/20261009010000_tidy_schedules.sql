-- =============================================================
-- Porządkowanie grafiku według rozkładu (2026-10-09)
--
-- Stare wersje aplikacji (1.1) tworzyły służby same: m.in. w październiku 17:00 zamiast 17:30
-- i drugi egzemplarz tej samej Mszy. Rozkład o nich nie wie, więc zmiany okresowe ich nie ruszają
-- (np. po usunięciu okresu zostaje 17:00 z zapisami, a 17:30 wraca z rozkładu).
--
--  1. schedules.manual — służba dodana ręcznie przez opiekuna (formularz „Nowa służba”); porządkowanie jej nie rusza.
--  2. tidy_schedules(p_policy, p_dry_run) — od dziś w przód:
--     a) duplikaty (ten sam dzień, godzina, rodzaj, kościół) → jedna służba, zapisy scalone;
--     b) Msze spoza rozkładu (automatyczne, bez obecności) → zapisani przechodzą na Mszę z rozkładu
--        tego dnia (najbliższa godzina; policy 'keep' = zostają, 'cancel' = odwołane), puste — usunięte.
--     Podgląd (p_dry_run) niczego nie zmienia.
-- =============================================================

BEGIN;

ALTER TABLE schedules ADD COLUMN IF NOT EXISTS manual boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.tidy_schedules(p_policy text DEFAULT 'move', p_dry_run boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_parish  uuid := my_parish_id();
  v_from    date := (now() AT TIME ZONE 'Europe/Warsaw')::date;
  v_nowt    time := (now() AT TIME ZONE 'Europe/Warsaw')::time;
  v_to      date := (now() AT TIME ZONE 'Europe/Warsaw')::date + 400;
  v_changes jsonb := '[]'::jsonb;
  v_merged  int := 0;
  v_moved   int := 0;
  v_cancel  int := 0;
  v_kept    int := 0;
  v_removed int := 0;
  v_result  jsonb;
  g         record;
  r         record;
  n         record;
  a         record;
  v_keep    uuid;
  v_people  jsonb;
  v_action  text;
  v_target  uuid;
  v_when    text;
  i         int;
BEGIN
  IF NOT can_manage_services() OR v_parish IS NULL THEN
    RAISE EXCEPTION 'Tylko opiekun parafii może porządkować grafik';
  END IF;
  IF p_policy NOT IN ('move', 'cancel', 'keep') THEN RAISE EXCEPTION 'Nieznana opcja dla zapisów'; END IF;

  BEGIN
    DROP TABLE IF EXISTS _tidy_slots;
    CREATE TEMP TABLE _tidy_slots ON COMMIT DROP AS SELECT * FROM mass_slots(v_parish, v_from, v_to);

    -- ── a) duplikaty ──
    FOR g IN
      SELECT s.date, s."time", s.category, s.church_id,
             array_agg(s.id ORDER BY (SELECT count(*) FROM schedule_assignments x WHERE x.schedule_id = s.id) DESC,
                                     (s.title = coalesce((SELECT slot_title(t.label, t.category) FROM _tidy_slots t
                                                           WHERE t.slot_date = s.date AND t.slot_time = s."time"
                                                             AND t.category = s.category AND t.church_id = s.church_id LIMIT 1), s.title)) DESC,
                                     s.created_at) AS ids,
             min(s.title) AS title
        FROM schedules s
       WHERE s.parish_id = v_parish AND (s.date > v_from OR (s.date = v_from AND s."time" > v_nowt)) AND s.date <= v_to
         AND s.series_id IS NULL AND NOT s.manual
         AND NOT EXISTS (SELECT 1 FROM attendance at WHERE at.schedule_id = s.id)
       GROUP BY s.date, s."time", s.category, s.church_id
      HAVING count(*) > 1
    LOOP
      v_keep := g.ids[1];
      FOR i IN 2 .. array_length(g.ids, 1) LOOP
        FOR a IN SELECT * FROM schedule_assignments WHERE schedule_id = g.ids[i] LOOP
          IF EXISTS (SELECT 1 FROM schedule_assignments WHERE schedule_id = v_keep AND profile_id = a.profile_id) THEN
            DELETE FROM schedule_assignments WHERE id = a.id;
          ELSE
            UPDATE schedule_assignments SET schedule_id = v_keep, slot_id = NULL WHERE id = a.id;
          END IF;
        END LOOP;
        BEGIN
          DELETE FROM schedules WHERE id = g.ids[i];
          v_merged := v_merged + 1;
        EXCEPTION WHEN foreign_key_violation THEN NULL;
        END;
      END LOOP;
    END LOOP;

    -- ── b) Msze spoza rozkładu ──
    FOR r IN
      SELECT s.*
        FROM schedules s
       WHERE s.parish_id = v_parish AND (s.date > v_from OR (s.date = v_from AND s."time" > v_nowt)) AND s.date <= v_to
         AND s.series_id IS NULL AND NOT s.manual AND s.category = 'msza'
         AND NOT EXISTS (SELECT 1 FROM attendance at WHERE at.schedule_id = s.id)
         AND NOT EXISTS (SELECT 1 FROM _tidy_slots t WHERE t.slot_date = s.date AND t.slot_time = s."time"
                                                       AND t.category = s.category AND t.church_id = s.church_id)
       ORDER BY s.date, s."time"
    LOOP
      v_people := coalesce((
        SELECT jsonb_agg(p.full_name ORDER BY p.full_name)
          FROM schedule_assignments sa JOIN profiles p ON p.id = sa.profile_id
         WHERE sa.schedule_id = r.id AND sa.status IN ('assigned', 'excused')), '[]'::jsonb);

      SELECT * INTO n FROM _tidy_slots x
       WHERE x.slot_date = r.date AND x.service_mode <> 'none'
       ORDER BY (x.category = 'msza') DESC, (x.church_id = r.church_id) DESC,
                abs(extract(epoch FROM x.slot_time - r."time")), x.slot_time
       LIMIT 1;

      v_action := CASE
        WHEN jsonb_array_length(v_people) = 0 THEN 'remove'
        WHEN p_policy = 'keep' THEN 'keep'
        WHEN p_policy = 'move' AND FOUND THEN 'move'
        WHEN p_policy = 'move' THEN 'keep'
        ELSE 'cancel' END;

      v_when := to_char(r.date, 'DD.MM') || ' ' || to_char(r."time", 'HH24:MI');
      v_changes := v_changes || jsonb_build_object(
        'date', r.date, 'time', to_char(r."time", 'HH24:MI'), 'title', r.title, 'people', v_people,
        'action', v_action, 'to_time', CASE WHEN v_action = 'move' THEN to_char(n.slot_time, 'HH24:MI') END);

      IF v_action = 'move' THEN
        v_target := _slot_schedule(v_parish, n.slot_date, n.slot_time, n.label, n.category, n.service_mode, v_uid, n.church_id);
        FOR a IN SELECT * FROM schedule_assignments WHERE schedule_id = r.id AND status IN ('assigned', 'excused') LOOP
          IF EXISTS (SELECT 1 FROM schedule_assignments WHERE schedule_id = v_target AND profile_id = a.profile_id) THEN
            DELETE FROM schedule_assignments WHERE id = a.id;
          ELSE
            UPDATE schedule_assignments SET schedule_id = v_target, slot_id = NULL WHERE id = a.id;
          END IF;
          PERFORM add_notification_with_parent(a.profile_id, 'schedule_change', 'Zmiana godziny służby',
            r.title || ' ' || v_when || ' → ' || to_char(n.slot_time, 'HH24:MI'),
            jsonb_build_object('schedule_id', v_target, 'date', n.slot_date, 'time', to_char(n.slot_time, 'HH24:MI')));
          v_moved := v_moved + 1;
        END LOOP;
      ELSIF v_action = 'cancel' THEN
        FOR a IN SELECT * FROM schedule_assignments WHERE schedule_id = r.id AND status IN ('assigned', 'excused') LOOP
          DELETE FROM schedule_assignments WHERE id = a.id;
          PERFORM add_notification_with_parent(a.profile_id, 'schedule_change', 'Służba odwołana',
            r.title || ' ' || v_when || ' — nie ma jej w rozkładzie Mszy', jsonb_build_object('date', r.date));
          v_cancel := v_cancel + 1;
        END LOOP;
      ELSIF v_action = 'keep' THEN
        v_kept := v_kept + jsonb_array_length(v_people);
      END IF;

      IF v_action <> 'keep' AND NOT EXISTS (SELECT 1 FROM schedule_assignments WHERE schedule_id = r.id) THEN
        BEGIN
          DELETE FROM schedules WHERE id = r.id;
          v_removed := v_removed + 1;
        EXCEPTION WHEN foreign_key_violation THEN NULL;
        END;
      END IF;
    END LOOP;

    v_result := jsonb_build_object('dry_run', p_dry_run, 'changes', v_changes, 'merged', v_merged,
      'moved', v_moved, 'cancelled', v_cancel, 'kept', v_kept, 'removed', v_removed);
    IF p_dry_run THEN
      RAISE EXCEPTION USING ERRCODE = 'LS001', MESSAGE = 'dry run';
    END IF;
  EXCEPTION WHEN SQLSTATE 'LS001' THEN
    NULL; -- podgląd: zmiany wycofane, wynik zostaje
  END;
  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.tidy_schedules(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tidy_schedules(text, boolean) TO authenticated;

COMMIT;
