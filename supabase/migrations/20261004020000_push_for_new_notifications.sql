-- =============================================================
-- Push dla powiadomień, które dotąd trafiały tylko do dzwonka (2026-10-04):
-- zmiana godziny / odwołanie służby (save_rozklad), zgłoszenia obecności i decyzje.
-- Pozostałe typy mają własne triggery push — nie dublujemy.
-- =============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.trg_notifications_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_token text;
BEGIN
  IF NEW.type NOT IN ('schedule_change', 'attendance_report', 'attendance_report_decision') THEN
    RETURN NEW;
  END IF;
  SELECT push_token INTO v_token FROM profiles WHERE id = NEW.profile_id;
  IF v_token IS NOT NULL THEN
    PERFORM notify_push(ARRAY[v_token], NEW.title, coalesce(NEW.body, ''),
                        coalesce(NEW.data, '{}'::jsonb) || jsonb_build_object('type', NEW.type));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW; -- push nigdy nie blokuje zapisu powiadomienia
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_push ON notifications;
CREATE TRIGGER trg_notifications_push AFTER INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION trg_notifications_push();

COMMIT;
