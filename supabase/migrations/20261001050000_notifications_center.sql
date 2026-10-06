-- =============================================================
-- N3: centrum powiadomień w aplikacji (dzwonek, lista, „nowe”)
--
-- Tabela notifications — historia tego, co dziś przychodzi tylko jako push.
-- Zapis wyłącznie przez triggery (SECURITY DEFINER); użytkownik czyta, oznacza
-- jako przeczytane i usuwa tylko swoje. Istniejące triggery push zostają bez zmian.
--
-- Zdarzenia:
--   assignment        nowy przydział od opiekuna            → ministrant (+ rodzic)
--   announcement      nowe ogłoszenie                       → adresaci (ministranci / rodzice / ranga)
--   points            punkty od opiekuna lub kara           → ministrant (+ rodzic)   (bez własnego meldowania)
--   excuse_request    zgłoszona nieobecność                 → opiekunowie parafii
--   excuse_decision   usprawiedliwienie przyjęte/odrzucone  → ministrant (+ rodzic)
--   member_pending    nowa osoba czeka na akceptację        → opiekunowie parafii
--   account_approved  konto zatwierdzone                    → ta osoba
--   swap_request      prośba o zamianę                      → adresat
--   swap_response     odpowiedź na prośbę o zamianę         → proszący
-- Starsze niż 90 dni są usuwane przy dopisywaniu nowych.
-- =============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type       text NOT NULL,
  title      text NOT NULL,
  body       text,
  data       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at    timestamptz
);
CREATE INDEX IF NOT EXISTS notifications_profile_created_idx ON notifications (profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications (profile_id) WHERE read_at IS NULL;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifications_select" ON notifications;
CREATE POLICY "notifications_select" ON notifications FOR SELECT USING (profile_id = auth.uid());
DROP POLICY IF EXISTS "notifications_update" ON notifications;
CREATE POLICY "notifications_update" ON notifications FOR UPDATE USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
DROP POLICY IF EXISTS "notifications_delete" ON notifications;
CREATE POLICY "notifications_delete" ON notifications FOR DELETE USING (profile_id = auth.uid());
GRANT SELECT, UPDATE, DELETE ON notifications TO authenticated;

-- Użytkownik zmienia tylko read_at
CREATE OR REPLACE FUNCTION trg_notifications_protect()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND (
       NEW.profile_id IS DISTINCT FROM OLD.profile_id OR NEW.type IS DISTINCT FROM OLD.type
    OR NEW.title IS DISTINCT FROM OLD.title OR NEW.body IS DISTINCT FROM OLD.body
    OR NEW.data IS DISTINCT FROM OLD.data OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
    RAISE EXCEPTION 'Można tylko oznaczyć powiadomienie jako przeczytane';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notifications_protect ON notifications;
CREATE TRIGGER trg_notifications_protect BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION trg_notifications_protect();

-- Realtime (licznik na dzwonku)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL; END $$;

-- Dopisz powiadomienie (i posprzątaj stare tej osoby)
CREATE OR REPLACE FUNCTION public.add_notification(p_profile uuid, p_type text, p_title text, p_body text, p_data jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_profile IS NULL THEN RETURN; END IF;
  DELETE FROM notifications WHERE profile_id = p_profile AND created_at < now() - interval '90 days';
  INSERT INTO notifications (profile_id, type, title, body, data)
  VALUES (p_profile, p_type, left(p_title, 200), left(p_body, 500), coalesce(p_data, '{}'::jsonb));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.add_notification(uuid, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- Ministrant + jego rodzic (rodzic dostaje z imieniem dziecka)
CREATE OR REPLACE FUNCTION public.add_notification_with_parent(p_profile uuid, p_type text, p_title text, p_body text, p_data jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_parent uuid;
  v_name   text;
BEGIN
  PERFORM add_notification(p_profile, p_type, p_title, p_body, p_data);
  SELECT parent_id, split_part(full_name, ' ', 1) INTO v_parent, v_name FROM profiles WHERE id = p_profile;
  IF v_parent IS NOT NULL THEN
    PERFORM add_notification(v_parent, p_type, v_name || ': ' || p_title, p_body, p_data || jsonb_build_object('child_id', p_profile));
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.add_notification_with_parent(uuid, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- Opiekunowie parafii
CREATE OR REPLACE FUNCTION public.add_notification_admins(p_parish uuid, p_type text, p_title text, p_body text, p_data jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM profiles WHERE parish_id = p_parish AND approved AND (role = 'admin' OR is_admin = true) LOOP
    PERFORM add_notification(r.id, p_type, p_title, p_body, p_data);
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.add_notification_admins(uuid, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- ── Przydziały: nowy dyżur (nie własny zapis) + zmiany statusu ─────────────
CREATE OR REPLACE FUNCTION trg_inapp_assignments()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s      record;
  v_name text;
  v_when text;
BEGIN
  SELECT id, title, date, time, parish_id INTO s FROM schedules WHERE id = NEW.schedule_id;
  IF s.id IS NULL THEN RETURN NEW; END IF;
  v_when := s.title || ' · ' || to_char(s.date, 'DD.MM') || ' ' || to_char(s.time, 'HH24:MI');

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'assigned' AND auth.uid() IS DISTINCT FROM NEW.profile_id AND s.date >= current_date THEN
      PERFORM add_notification_with_parent(NEW.profile_id, 'assignment', 'Nowy dyżur', v_when,
        jsonb_build_object('schedule_id', s.id, 'date', s.date, 'time', to_char(s.time, 'HH24:MI')));
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status = 'excused' THEN
    SELECT full_name INTO v_name FROM profiles WHERE id = NEW.profile_id;
    PERFORM add_notification_admins(s.parish_id, 'excuse_request', 'Prośba o usprawiedliwienie',
      v_name || ' · ' || v_when || coalesce(' — ' || NEW.absence_reason, ''),
      jsonb_build_object('schedule_id', s.id, 'assignment_id', NEW.id));
  ELSIF OLD.status = 'excused' AND NEW.status = 'confirmed' THEN
    PERFORM add_notification_with_parent(NEW.profile_id, 'excuse_decision', 'Usprawiedliwienie przyjęte', v_when,
      jsonb_build_object('schedule_id', s.id, 'accepted', true));
  ELSIF OLD.status = 'excused' AND NEW.status = 'absent' THEN
    PERFORM add_notification_with_parent(NEW.profile_id, 'excuse_decision', 'Usprawiedliwienie odrzucone', v_when,
      jsonb_build_object('schedule_id', s.id, 'accepted', false));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_inapp_assignments ON schedule_assignments;
CREATE TRIGGER trg_inapp_assignments
  AFTER INSERT OR UPDATE OF status ON schedule_assignments
  FOR EACH ROW EXECUTE FUNCTION trg_inapp_assignments();

-- ── Ogłoszenia ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_inapp_announcements()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id FROM profiles
     WHERE parish_id = NEW.parish_id AND approved AND id IS DISTINCT FROM NEW.author_id
       AND role <> 'admin' AND NOT coalesce(is_admin, false)
       AND CASE NEW.target_audience
             WHEN 'all' THEN role IN ('member', 'parent')
             WHEN 'members' THEN role = 'member'
             WHEN 'parents' THEN role = 'parent'
             ELSE role = 'member' AND rank_id::text = NEW.target_audience
           END
  LOOP
    PERFORM add_notification(r.id, 'announcement', 'Nowe ogłoszenie', NEW.title, jsonb_build_object('announcement_id', NEW.id));
  END LOOP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_inapp_announcements ON announcements;
CREATE TRIGGER trg_inapp_announcements AFTER INSERT ON announcements
  FOR EACH ROW EXECUTE FUNCTION trg_inapp_announcements();

-- ── Punkty (od opiekuna / kary; bez automatycznych za meldowanie) ──────────
CREATE OR REPLACE FUNCTION trg_inapp_points()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.source = 'checkin' THEN RETURN NEW; END IF;
  PERFORM add_notification_with_parent(NEW.profile_id, 'points',
    CASE WHEN NEW.amount >= 0 THEN '+' ELSE '' END || NEW.amount || ' pkt', NEW.reason,
    jsonb_build_object('amount', NEW.amount));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_inapp_points ON points;
CREATE TRIGGER trg_inapp_points AFTER INSERT ON points
  FOR EACH ROW EXECUTE FUNCTION trg_inapp_points();

-- ── Konta: oczekujące → opiekunowie; zatwierdzone → osoba ─────────────────
CREATE OR REPLACE FUNCTION trg_inapp_profiles()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.parish_id IS NULL THEN RETURN NEW; END IF;
  IF NOT NEW.approved AND (TG_OP = 'INSERT' OR OLD.parish_id IS DISTINCT FROM NEW.parish_id OR OLD.approved) THEN
    PERFORM add_notification_admins(NEW.parish_id, 'member_pending', 'Nowa osoba czeka na akceptację',
      NEW.full_name || CASE NEW.role WHEN 'parent' THEN ' (rodzic)' ELSE ' (ministrant)' END,
      jsonb_build_object('profile_id', NEW.id));
  ELSIF TG_OP = 'UPDATE' AND NEW.approved AND NOT OLD.approved THEN
    PERFORM add_notification(NEW.id, 'account_approved', 'Konto zatwierdzone', 'Witamy w parafii! Masz już pełny dostęp do aplikacji.', '{}'::jsonb);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_inapp_profiles ON profiles;
CREATE TRIGGER trg_inapp_profiles AFTER INSERT OR UPDATE OF approved, parish_id ON profiles
  FOR EACH ROW EXECUTE FUNCTION trg_inapp_profiles();

-- ── Zamiany dyżurów (N4) ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_inapp_swaps()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s      record;
  v_from text;
  v_to   text;
BEGIN
  SELECT id, title, date, time INTO s FROM schedules WHERE id = NEW.schedule_id;
  SELECT full_name INTO v_from FROM profiles WHERE id = NEW.from_profile_id;
  SELECT full_name INTO v_to FROM profiles WHERE id = NEW.to_profile_id;
  IF TG_OP = 'INSERT' AND NEW.status = 'open' THEN
    PERFORM add_notification(NEW.to_profile_id, 'swap_request', 'Prośba o zamianę',
      v_from || ' prosi o zastępstwo: ' || s.title || ' · ' || to_char(s.date, 'DD.MM') || ' ' || to_char(s.time, 'HH24:MI'),
      jsonb_build_object('offer_id', NEW.id, 'schedule_id', s.id));
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'open' AND NEW.status IN ('accepted', 'rejected') THEN
    PERFORM add_notification(NEW.from_profile_id, 'swap_response',
      CASE WHEN NEW.status = 'accepted' THEN 'Zamiana przyjęta' ELSE 'Zamiana odrzucona' END,
      v_to || CASE WHEN NEW.status = 'accepted' THEN ' przejmuje Twój dyżur: ' ELSE ' nie może Cię zastąpić: ' END
        || s.title || ' · ' || to_char(s.date, 'DD.MM'),
      jsonb_build_object('offer_id', NEW.id, 'schedule_id', s.id));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_inapp_swaps ON swap_offers;
CREATE TRIGGER trg_inapp_swaps AFTER INSERT OR UPDATE OF status ON swap_offers
  FOR EACH ROW EXECUTE FUNCTION trg_inapp_swaps();

COMMIT;
