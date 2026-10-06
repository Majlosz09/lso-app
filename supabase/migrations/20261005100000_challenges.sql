-- =============================================================
-- Wyzwania sezonowe (Roraty, Droga Krzyżowa, Różaniec, Majówki, Wakacje…) — 2026-10-05
--  challenges: okres (daty), cel (liczba obecności), filtr (fragment nazwy służby i/lub rodzaj), premia punktowa.
--  Obecność dodana / usunięta → przeliczenie; cel osiągnięty → premia (points.source = 'challenge') + gratulacje;
--  spadek poniżej celu (cofnięta obecność) → premia cofnięta.
--  challenge_board(): wyniki uczestników (parafia).
-- =============================================================

BEGIN;

ALTER TABLE points DROP CONSTRAINT IF EXISTS points_source_check;
ALTER TABLE points ADD CONSTRAINT points_source_check CHECK (source IN ('manual', 'checkin', 'penalty', 'challenge'));

CREATE TABLE IF NOT EXISTS challenges (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parish_id    uuid NOT NULL REFERENCES parishes(id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),
  description  text CHECK (description IS NULL OR length(description) <= 300),
  date_from    date NOT NULL,
  date_to      date NOT NULL,
  goal         int NOT NULL CHECK (goal BETWEEN 1 AND 200),
  bonus_points int NOT NULL DEFAULT 0 CHECK (bonus_points BETWEEN 0 AND 500),
  title_filter text CHECK (title_filter IS NULL OR length(title_filter) <= 40),
  category     text CHECK (category IS NULL OR category IN ('msza', 'nabozenstwo', 'zbiorka')),
  icon         text NOT NULL DEFAULT 'trophy',
  created_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (date_to >= date_from AND date_to <= date_from + 366)
);
CREATE INDEX IF NOT EXISTS challenges_parish_dates ON challenges (parish_id, date_from, date_to);

CREATE TABLE IF NOT EXISTS challenge_completions (
  challenge_id uuid NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  profile_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  points_id    uuid REFERENCES points(id) ON DELETE SET NULL,
  PRIMARY KEY (challenge_id, profile_id)
);

ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_completions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "challenges_select" ON challenges;
CREATE POLICY "challenges_select" ON challenges FOR SELECT USING (parish_id = (SELECT my_parish_id()));
DROP POLICY IF EXISTS "challenges_write" ON challenges;
CREATE POLICY "challenges_write" ON challenges FOR ALL
  USING (parish_id = (SELECT my_parish_id()) AND (SELECT is_parish_admin()))
  WITH CHECK (parish_id = (SELECT my_parish_id()) AND (SELECT is_parish_admin()));
DROP POLICY IF EXISTS "challenge_completions_select" ON challenge_completions;
CREATE POLICY "challenge_completions_select" ON challenge_completions FOR SELECT USING (
  EXISTS (SELECT 1 FROM challenges c WHERE c.id = challenge_id AND c.parish_id = (SELECT my_parish_id())));
GRANT SELECT, INSERT, UPDATE, DELETE ON challenges TO authenticated;
GRANT SELECT ON challenge_completions TO authenticated;

-- Ile obecności liczy się do wyzwania
CREATE OR REPLACE FUNCTION public.challenge_count(p_challenge uuid, p_profile uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int
    FROM attendance a
    JOIN schedules s ON s.id = a.schedule_id
    JOIN challenges c ON c.id = p_challenge AND c.parish_id = s.parish_id
   WHERE a.profile_id = p_profile
     AND s.date BETWEEN c.date_from AND c.date_to
     AND (c.category IS NULL OR s.category = c.category)
     AND (c.title_filter IS NULL OR s.title ILIKE '%' || c.title_filter || '%')
$$;

-- Przeliczenie wyzwań dotyczących danej służby dla osoby
CREATE OR REPLACE FUNCTION public._challenges_recount(p_schedule uuid, p_profile uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c        challenges%ROWTYPE;
  v_cnt    int;
  v_done   challenge_completions%ROWTYPE;
  v_pid    uuid;
BEGIN
  FOR c IN
    SELECT ch.* FROM challenges ch JOIN schedules s ON s.id = p_schedule AND s.parish_id = ch.parish_id
     WHERE s.date BETWEEN ch.date_from AND ch.date_to
       AND (ch.category IS NULL OR s.category = ch.category)
       AND (ch.title_filter IS NULL OR s.title ILIKE '%' || ch.title_filter || '%')
  LOOP
    v_cnt := challenge_count(c.id, p_profile);
    SELECT * INTO v_done FROM challenge_completions WHERE challenge_id = c.id AND profile_id = p_profile;
    IF v_cnt >= c.goal AND v_done.challenge_id IS NULL THEN
      v_pid := NULL;
      IF c.bonus_points > 0 THEN
        INSERT INTO points (profile_id, amount, reason, awarded_by, parish_id, source)
        VALUES (p_profile, c.bonus_points, 'Wyzwanie: ' || c.name, NULL, c.parish_id, 'challenge')
        RETURNING id INTO v_pid;
      END IF;
      INSERT INTO challenge_completions (challenge_id, profile_id, points_id) VALUES (c.id, p_profile, v_pid);
      PERFORM add_notification_with_parent(p_profile, 'challenge_done', 'Wyzwanie ukończone: ' || c.name,
        CASE WHEN c.bonus_points > 0 THEN 'Brawo! Premia +' || c.bonus_points || ' pkt.' ELSE 'Brawo, cel osiągnięty!' END,
        jsonb_build_object('challenge_id', c.id));
    ELSIF v_cnt < c.goal AND v_done.challenge_id IS NOT NULL THEN
      -- cofnięta obecność: premia też
      IF v_done.points_id IS NOT NULL THEN DELETE FROM points WHERE id = v_done.points_id; END IF;
      DELETE FROM challenge_completions WHERE challenge_id = c.id AND profile_id = p_profile;
    END IF;
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._challenges_recount(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_attendance_challenges()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM _challenges_recount(OLD.schedule_id, OLD.profile_id);
    RETURN OLD;
  END IF;
  PERFORM _challenges_recount(NEW.schedule_id, NEW.profile_id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_attendance_challenges ON attendance;
CREATE TRIGGER trg_attendance_challenges AFTER INSERT OR DELETE ON attendance
  FOR EACH ROW EXECUTE FUNCTION trg_attendance_challenges();

-- Nowe / zmienione wyzwanie: policz wszystkich (np. dodane w trakcie Adwentu)
CREATE OR REPLACE FUNCTION public.recount_challenge(p_challenge uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  n int := 0;
  v_sched uuid;
BEGIN
  IF NOT is_parish_admin() OR NOT EXISTS (SELECT 1 FROM challenges WHERE id = p_challenge AND parish_id = my_parish_id()) THEN
    RAISE EXCEPTION 'Tylko opiekun parafii';
  END IF;
  FOR r IN SELECT id FROM profiles WHERE parish_id = my_parish_id() AND role = 'member' LOOP
    SELECT s.id INTO v_sched FROM attendance a JOIN schedules s ON s.id = a.schedule_id
      JOIN challenges c ON c.id = p_challenge
     WHERE a.profile_id = r.id AND s.date BETWEEN c.date_from AND c.date_to
       AND (c.category IS NULL OR s.category = c.category)
       AND (c.title_filter IS NULL OR s.title ILIKE '%' || c.title_filter || '%')
     LIMIT 1;
    IF v_sched IS NOT NULL THEN
      PERFORM _challenges_recount(v_sched, r.id);
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.recount_challenge(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recount_challenge(uuid) TO authenticated;

-- Wyniki wyzwania (parafia): kto ile, kto ukończył
CREATE OR REPLACE FUNCTION public.challenge_board(p_challenge uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c challenges%ROWTYPE;
BEGIN
  SELECT * INTO c FROM challenges WHERE id = p_challenge AND parish_id = my_parish_id();
  IF c.id IS NULL THEN RETURN NULL; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', x.id, 'name', x.full_name, 'count', x.cnt, 'done', x.done, 'me', x.id = auth.uid())
                     ORDER BY x.cnt DESC, x.full_name)
      FROM (SELECT p.id, p.full_name, challenge_count(c.id, p.id) AS cnt,
                   EXISTS (SELECT 1 FROM challenge_completions cc WHERE cc.challenge_id = c.id AND cc.profile_id = p.id) AS done
              FROM profiles p
             WHERE p.parish_id = c.parish_id AND p.role = 'member' AND p.is_active AND p.approved) x
     WHERE x.cnt > 0), '[]'::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.challenge_board(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.challenge_board(uuid) TO authenticated;

-- Push dla ukończonego wyzwania
CREATE OR REPLACE FUNCTION public.trg_notifications_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_token text;
BEGIN
  IF NEW.type NOT IN ('schedule_change', 'attendance_report', 'attendance_report_decision', 'assignment_batch', 'promotion', 'challenge_done') THEN
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

COMMIT;
