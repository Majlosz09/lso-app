-- =============================================================
-- Zgłoszenie obecności po fakcie (2026-10-04)
-- Ministrant był na Mszy / nabożeństwie, ale nie potwierdził obecności (zapomniał, nie był zapisany,
-- nabożeństwa nie ma w grafiku). Zgłasza do 48 h po rozpoczęciu → opiekun przyjmuje → obecność + punkty
-- (jak przy zwykłym potwierdzeniu: dyżur / Msza dodatkowa / nabożeństwo / zbiórka).
-- =============================================================

BEGIN;

ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_method_check;
ALTER TABLE attendance ADD CONSTRAINT attendance_method_check CHECK (method IN ('gps', 'qr', 'manual', 'report'));

CREATE TABLE IF NOT EXISTS attendance_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parish_id     uuid NOT NULL REFERENCES parishes(id) ON DELETE CASCADE,
  profile_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  schedule_id   uuid REFERENCES schedules(id) ON DELETE SET NULL,
  service_date  date NOT NULL,
  service_time  time NOT NULL,
  category      text NOT NULL CHECK (category IN ('msza', 'nabozenstwo', 'zbiorka')),
  title         text NOT NULL,
  note          text CHECK (note IS NULL OR length(note) <= 300),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note    text,
  decided_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  decided_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attendance_reports_parish_status ON attendance_reports (parish_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_reports_one_per_service
  ON attendance_reports (profile_id, service_date, service_time) WHERE status <> 'rejected';

ALTER TABLE attendance_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "attendance_reports_select" ON attendance_reports;
CREATE POLICY "attendance_reports_select" ON attendance_reports FOR SELECT USING (
  profile_id = auth.uid()
  OR (parish_id = (SELECT my_parish_id()) AND (SELECT is_parish_admin()))
  OR profile_id IN (SELECT id FROM profiles WHERE parent_id = auth.uid())
);
-- wycofanie własnego, jeszcze nierozpatrzonego zgłoszenia
DROP POLICY IF EXISTS "attendance_reports_delete" ON attendance_reports;
CREATE POLICY "attendance_reports_delete" ON attendance_reports FOR DELETE USING (profile_id = auth.uid() AND status = 'pending');
GRANT SELECT, DELETE ON attendance_reports TO authenticated;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE attendance_reports;
EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL; END $$;

-- ── Zgłoszenie (ministrant) ──────────────────────────────────
-- Służba z grafiku / rozkładu o tej porze albo „inne” (wtedy p_title + p_category).
CREATE OR REPLACE FUNCTION public.report_attendance(
  p_date     date,
  p_time     text,
  p_title    text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_note     text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_parish uuid := my_parish_id();
  v_time   time;
  v_start  timestamptz;
  v_sched  record;
  v_slot   record;
  v_cat    text;
  v_title  text;
  v_sid    uuid;
  v_id     uuid;
  v_name   text;
BEGIN
  IF v_parish IS NULL OR (SELECT role FROM profiles WHERE id = v_uid) IS DISTINCT FROM 'member' THEN
    RAISE EXCEPTION 'Obecność zgłasza ministrant';
  END IF;
  v_time  := make_time(split_part(p_time, ':', 1)::int, split_part(p_time, ':', 2)::int, 0);
  v_start := (p_date + v_time) AT TIME ZONE 'Europe/Warsaw';
  IF now() < v_start - interval '30 minutes' THEN
    RAISE EXCEPTION 'Obecność można zgłosić dopiero od 30 minut przed rozpoczęciem';
  END IF;
  IF now() > v_start + interval '48 hours' THEN
    RAISE EXCEPTION 'Minęło ponad 48 godzin — porozmawiaj z opiekunem';
  END IF;

  SELECT id, title, category, service_mode INTO v_sched FROM schedules
   WHERE parish_id = v_parish AND date = p_date AND "time" = v_time
     AND (p_category IS NULL OR category = p_category)
   ORDER BY (category = 'msza') DESC LIMIT 1;
  IF v_sched.id IS NOT NULL THEN
    IF v_sched.service_mode = 'none' THEN RAISE EXCEPTION 'Na tej służbie nie sprawdzamy obecności'; END IF;
    IF EXISTS (SELECT 1 FROM attendance WHERE schedule_id = v_sched.id AND profile_id = v_uid) THEN
      RAISE EXCEPTION 'Obecność na tej służbie jest już zapisana';
    END IF;
    v_sid := v_sched.id; v_cat := v_sched.category; v_title := v_sched.title;
  ELSE
    SELECT * INTO v_slot FROM mass_slots(v_parish, p_date, p_date) s
     WHERE s.slot_time = v_time AND (p_category IS NULL OR s.category = p_category)
     ORDER BY (s.category = 'msza') DESC LIMIT 1;
    IF FOUND THEN
      IF v_slot.service_mode = 'none' THEN RAISE EXCEPTION 'Na tej służbie nie sprawdzamy obecności'; END IF;
      v_cat := v_slot.category; v_title := slot_title(v_slot.label, v_slot.category);
    ELSE
      IF nullif(btrim(p_title), '') IS NULL THEN RAISE EXCEPTION 'Napisz, na czym byłeś'; END IF;
      v_cat := coalesce(p_category, 'nabozenstwo'); v_title := left(btrim(p_title), 80);
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM attendance_reports WHERE profile_id = v_uid AND service_date = p_date
               AND service_time = v_time AND status <> 'rejected') THEN
    RAISE EXCEPTION 'To zgłoszenie już czeka na opiekuna';
  END IF;

  INSERT INTO attendance_reports (parish_id, profile_id, schedule_id, service_date, service_time, category, title, note)
  VALUES (v_parish, v_uid, v_sid, p_date, v_time, v_cat, v_title, nullif(left(btrim(p_note), 300), ''))
  RETURNING id INTO v_id;

  SELECT full_name INTO v_name FROM profiles WHERE id = v_uid;
  PERFORM add_notification_admins(v_parish, 'attendance_report', 'Zgłoszenie obecności',
    v_name || ' · ' || v_title || ' ' || to_char(p_date, 'DD.MM') || ' ' || to_char(v_time, 'HH24:MI'),
    jsonb_build_object('report_id', v_id));
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.report_attendance(date, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_attendance(date, text, text, text, text) TO authenticated;

-- ── Decyzja (opiekun) ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.decide_attendance_report(p_id uuid, p_approve boolean, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_parish uuid := my_parish_id();
  r        attendance_reports%ROWTYPE;
  v_sid    uuid;
  v_mode   text;
  v_res    jsonb := '{}'::jsonb;
  v_when   text;
BEGIN
  IF NOT is_parish_admin() OR v_parish IS NULL THEN RAISE EXCEPTION 'Tylko opiekun parafii'; END IF;
  SELECT * INTO r FROM attendance_reports WHERE id = p_id AND parish_id = v_parish FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Nie znaleziono zgłoszenia'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Zgłoszenie jest już rozpatrzone'; END IF;
  v_when := r.title || ' · ' || to_char(r.service_date, 'DD.MM') || ' ' || to_char(r.service_time, 'HH24:MI');

  IF p_approve THEN
    v_sid := r.schedule_id;
    IF v_sid IS NULL THEN
      SELECT s.service_mode INTO v_mode FROM mass_slots(v_parish, r.service_date, r.service_date) s
       WHERE s.slot_time = r.service_time AND s.category = r.category LIMIT 1;
      v_sid := _slot_schedule(v_parish, r.service_date, r.service_time, r.title, r.category,
                              coalesce(v_mode, 'assigned'), v_uid);
    END IF;
    v_res := check_in_and_award_points_impl(v_sid, r.profile_id, v_parish, 'report', NULL, NULL);
    UPDATE attendance_reports SET status = 'approved', schedule_id = v_sid, decided_by = v_uid, decided_at = now(),
           admin_note = nullif(btrim(p_note), '') WHERE id = p_id;
    PERFORM add_notification_with_parent(r.profile_id, 'attendance_report_decision', 'Obecność przyjęta',
      v_when || CASE WHEN (v_res->>'points_awarded')::int > 0 THEN ' · +' || (v_res->>'points_awarded') || ' pkt' ELSE '' END,
      jsonb_build_object('report_id', p_id, 'accepted', true));
  ELSE
    UPDATE attendance_reports SET status = 'rejected', decided_by = v_uid, decided_at = now(),
           admin_note = nullif(btrim(p_note), '') WHERE id = p_id;
    PERFORM add_notification_with_parent(r.profile_id, 'attendance_report_decision', 'Zgłoszenie obecności odrzucone',
      v_when || coalesce(' — ' || nullif(btrim(p_note), ''), ''), jsonb_build_object('report_id', p_id, 'accepted', false));
  END IF;
  RETURN v_res || jsonb_build_object('approved', p_approve);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.decide_attendance_report(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_attendance_report(uuid, boolean, text) TO authenticated;

COMMIT;
