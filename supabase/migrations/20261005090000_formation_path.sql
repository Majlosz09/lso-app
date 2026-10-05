-- =============================================================
-- Ścieżka formacji: wymagania do stopnia + postęp + awans (2026-10-05)
--  1. rank_requirements (per parafia i stopień): służby w obecnym stopniu, miesiące stażu, frekwencja (90 dni),
--     przeczytane działy Wiedzy (klucze haseł zapisane przy zapisie wymagań), notatka (np. kurs u księdza).
--  2. profiles.rank_since — od kiedy w obecnym stopniu (wyzwalacz), awans → powiadomienie (typ promotion, z push).
--  3. formation_progress(profil) — postęp do następnego stopnia (sam ministrant, rodzic, opiekun / pomocnik);
--     formation_ready() — kto jest gotowy do awansu (opiekun / pomocnik).
-- =============================================================

BEGIN;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rank_since timestamptz;
UPDATE profiles SET rank_since = created_at WHERE rank_since IS NULL;

CREATE TABLE IF NOT EXISTS rank_requirements (
  parish_id          uuid NOT NULL REFERENCES parishes(id) ON DELETE CASCADE,
  rank_id            uuid NOT NULL REFERENCES ranks(id) ON DELETE CASCADE,
  min_services       int NOT NULL DEFAULT 0 CHECK (min_services BETWEEN 0 AND 1000),
  min_months         int NOT NULL DEFAULT 0 CHECK (min_months BETWEEN 0 AND 120),
  min_rate           int NOT NULL DEFAULT 0 CHECK (min_rate BETWEEN 0 AND 100),
  wiedza_categories  text[] NOT NULL DEFAULT '{}',
  wiedza_keys        text[] NOT NULL DEFAULT '{}',
  note               text CHECK (note IS NULL OR length(note) <= 200),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (parish_id, rank_id)
);
ALTER TABLE rank_requirements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rank_requirements_select" ON rank_requirements;
CREATE POLICY "rank_requirements_select" ON rank_requirements FOR SELECT USING (parish_id = (SELECT my_parish_id()));
DROP POLICY IF EXISTS "rank_requirements_write" ON rank_requirements;
CREATE POLICY "rank_requirements_write" ON rank_requirements FOR ALL
  USING (parish_id = (SELECT my_parish_id()) AND (SELECT is_parish_admin()))
  WITH CHECK (parish_id = (SELECT my_parish_id()) AND (SELECT is_parish_admin()));
GRANT SELECT, INSERT, UPDATE, DELETE ON rank_requirements TO authenticated;

-- Zmiana stopnia: data + powiadomienie przy awansie
CREATE OR REPLACE FUNCTION public.trg_profiles_rank_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old int; v_new int; v_name text;
BEGIN
  IF NEW.rank_id IS NOT DISTINCT FROM OLD.rank_id THEN RETURN NEW; END IF;
  NEW.rank_since := now();
  -- operacja systemowa (np. przejęcie profilu kodem) — bez powiadomienia o awansie
  IF current_setting('lso.sys', true) = 'on' THEN RETURN NEW; END IF;
  SELECT "order" INTO v_old FROM ranks WHERE id = OLD.rank_id;
  SELECT "order", name INTO v_new, v_name FROM ranks WHERE id = NEW.rank_id;
  IF NEW.rank_id IS NOT NULL AND (v_old IS NULL OR v_new > v_old) THEN
    PERFORM add_notification_with_parent(NEW.id, 'promotion', 'Awans: ' || v_name,
      'Gratulacje! Opiekun nadał Ci nowy stopień w służbie liturgicznej.', jsonb_build_object('rank_id', NEW.rank_id));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_profiles_rank_change ON profiles;
CREATE TRIGGER trg_profiles_rank_change BEFORE UPDATE OF rank_id ON profiles
  FOR EACH ROW EXECUTE FUNCTION trg_profiles_rank_change();

-- Push także dla awansu
CREATE OR REPLACE FUNCTION public.trg_notifications_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_token text;
BEGIN
  IF NEW.type NOT IN ('schedule_change', 'attendance_report', 'attendance_report_decision', 'assignment_batch', 'promotion') THEN
    RETURN NEW;
  END IF;
  SELECT push_token INTO v_token FROM profiles WHERE id = NEW.profile_id;
  IF v_token IS NOT NULL THEN
    PERFORM notify_push(ARRAY[v_token], NEW.title, coalesce(NEW.body, ''),
                        coalesce(NEW.data, '{}'::jsonb) || jsonb_build_object('type', NEW.type));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

-- Postęp bez sprawdzania uprawnień (wewnętrzny)
CREATE OR REPLACE FUNCTION public._formation_progress(p_profile uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me      profiles%ROWTYPE;
  cur     record;
  nxt     record;
  req     rank_requirements%ROWTYPE;
  v_items jsonb := '[]'::jsonb;
  v_have  int;
  v_total int;
  v_ready boolean := true;
  v_since timestamptz;
BEGIN
  SELECT * INTO me FROM profiles WHERE id = p_profile;
  IF me.id IS NULL OR me.role <> 'member' THEN RETURN NULL; END IF;
  SELECT id, name, "order" INTO cur FROM ranks WHERE id = me.rank_id;
  SELECT id, name, "order" INTO nxt FROM ranks
   WHERE (parish_id IS NULL OR parish_id = me.parish_id) AND (cur.id IS NULL OR "order" > cur."order")
   ORDER BY "order", name LIMIT 1;
  IF nxt.id IS NULL THEN
    RETURN jsonb_build_object('current', CASE WHEN cur.id IS NOT NULL THEN jsonb_build_object('id', cur.id, 'name', cur.name) END,
                              'next', NULL, 'items', '[]'::jsonb, 'ready', false, 'configured', false, 'top', true);
  END IF;
  SELECT * INTO req FROM rank_requirements WHERE parish_id = me.parish_id AND rank_id = nxt.id;
  v_since := coalesce(me.rank_since, me.created_at);

  IF req.rank_id IS NOT NULL THEN
    IF req.min_services > 0 THEN
      SELECT count(*) INTO v_have FROM attendance WHERE profile_id = me.id AND checked_at >= v_since;
      v_items := v_items || jsonb_build_object('key', 'services', 'label', 'Służby w obecnym stopniu', 'have', v_have, 'need', req.min_services, 'met', v_have >= req.min_services);
      v_ready := v_ready AND v_have >= req.min_services;
    END IF;
    IF req.min_months > 0 THEN
      v_have := (extract(year FROM age(now(), v_since)) * 12 + extract(month FROM age(now(), v_since)))::int;
      v_items := v_items || jsonb_build_object('key', 'months', 'label', 'Miesiące w obecnym stopniu', 'have', v_have, 'need', req.min_months, 'met', v_have >= req.min_months);
      v_ready := v_ready AND v_have >= req.min_months;
    END IF;
    IF req.min_rate > 0 THEN
      SELECT count(*) FILTER (WHERE a.status = 'present'), count(*) FILTER (WHERE a.status IN ('present', 'absent', 'excused', 'confirmed'))
        INTO v_have, v_total
        FROM schedule_assignments a JOIN schedules s ON s.id = a.schedule_id
       WHERE a.profile_id = me.id AND s.date >= (now() AT TIME ZONE 'Europe/Warsaw')::date - 90
         AND s.date < (now() AT TIME ZONE 'Europe/Warsaw')::date;
      v_have := CASE WHEN v_total > 0 THEN round(100.0 * v_have / v_total)::int ELSE 0 END;
      v_items := v_items || jsonb_build_object('key', 'rate', 'label', 'Frekwencja (ostatnie 3 miesiące)', 'have', v_have, 'need', req.min_rate, 'met', v_have >= req.min_rate, 'unit', '%');
      v_ready := v_ready AND v_have >= req.min_rate;
    END IF;
    IF cardinality(req.wiedza_keys) > 0 THEN
      SELECT count(*) INTO v_have FROM content_reads WHERE profile_id = me.id AND kind = 'wiedza' AND item_key = ANY (req.wiedza_keys);
      v_items := v_items || jsonb_build_object('key', 'wiedza', 'label', 'Przeczytane hasła w Wiedzy', 'have', v_have, 'need', cardinality(req.wiedza_keys),
                                               'met', v_have >= cardinality(req.wiedza_keys), 'categories', to_jsonb(req.wiedza_categories));
      v_ready := v_ready AND v_have >= cardinality(req.wiedza_keys);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'current', CASE WHEN cur.id IS NOT NULL THEN jsonb_build_object('id', cur.id, 'name', cur.name) END,
    'next', jsonb_build_object('id', nxt.id, 'name', nxt.name),
    'items', v_items, 'note', req.note,
    'configured', req.rank_id IS NOT NULL AND jsonb_array_length(v_items) > 0,
    'ready', req.rank_id IS NOT NULL AND jsonb_array_length(v_items) > 0 AND v_ready,
    'since', v_since);
END;
$$;
REVOKE EXECUTE ON FUNCTION public._formation_progress(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.formation_progress(p_profile uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (p_profile = auth.uid()
          OR EXISTS (SELECT 1 FROM profiles WHERE id = p_profile AND parent_id = auth.uid())
          OR (can_manage_services() AND EXISTS (SELECT 1 FROM profiles WHERE id = p_profile AND parish_id = my_parish_id()))) THEN
    RAISE EXCEPTION 'Brak uprawnień';
  END IF;
  RETURN _formation_progress(p_profile);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.formation_progress(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.formation_progress(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.formation_ready()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_out jsonb := '[]'::jsonb;
  r     record;
  v_p   jsonb;
BEGIN
  IF NOT can_manage_services() THEN RAISE EXCEPTION 'Brak uprawnień'; END IF;
  FOR r IN SELECT id, full_name FROM profiles
            WHERE parish_id = my_parish_id() AND role = 'member' AND is_active AND approved ORDER BY full_name LOOP
    v_p := _formation_progress(r.id);
    IF (v_p->>'ready')::boolean THEN
      v_out := v_out || jsonb_build_object('id', r.id, 'full_name', r.full_name, 'current', v_p->'current', 'next', v_p->'next');
    END IF;
  END LOOP;
  RETURN v_out;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.formation_ready() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.formation_ready() TO authenticated;

COMMIT;
