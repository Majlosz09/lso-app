-- =============================================================
-- Przegląd logiki 2026-11-06
--
--  1. Usunięcie / odwołanie służby zabiera też jej punkty za obecność i kary.
--     Wcześniej obecność znikała (CASCADE), a punkty zostawały w rankingu bez służby.
--  2. Wypis ze służby (pojedynczy, z cyklu, przez opiekuna) zamyka otwartą prośbę o zamianę tej służby.
--     Wcześniej prośba wisiała u adresata, a błąd widział dopiero przy próbie przyjęcia.
--  3. Push o ogłoszeniu dla wybranego stopnia (target_audience = id stopnia) — wcześniej tylko dzwonek.
--     Push tylko do zatwierdzonych kont.
--  4. sign_up_for_slot('recurring'): wcześniejsze pojedyncze zapisy w kolejnych tygodniach dołączają do cyklu
--     (inaczej zostałyby po wypisie z całego cyklu).
-- =============================================================

BEGIN;

-- ── 1. Punkty usuwanej służby ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_schedules_drop_points()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM points WHERE schedule_id = OLD.id AND source IN ('checkin', 'penalty');
  RETURN OLD;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.trg_schedules_drop_points() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_schedules_drop_points ON schedules;
CREATE TRIGGER trg_schedules_drop_points BEFORE DELETE ON schedules
  FOR EACH ROW EXECUTE FUNCTION trg_schedules_drop_points();

-- ── 2. Otwarte prośby o zamianę po wypisie ────────────────────
CREATE OR REPLACE FUNCTION public.trg_assignments_close_swaps()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE swap_offers SET status = 'cancelled', resolved_at = now()
   WHERE schedule_id = OLD.schedule_id AND from_profile_id = OLD.profile_id AND status = 'open';
  RETURN OLD;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.trg_assignments_close_swaps() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_assignments_close_swaps ON schedule_assignments;
CREATE TRIGGER trg_assignments_close_swaps AFTER DELETE ON schedule_assignments
  FOR EACH ROW EXECUTE FUNCTION trg_assignments_close_swaps();

-- ── 3. Push o ogłoszeniu ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_fn_notify_announcement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tokens text[];
BEGIN
  SELECT array_agg(push_token) INTO v_tokens
    FROM profiles
   WHERE parish_id = NEW.parish_id AND is_active AND approved AND push_token IS NOT NULL
     AND id IS DISTINCT FROM NEW.author_id
     AND CASE NEW.target_audience
           WHEN 'all' THEN role IN ('member', 'parent')
           WHEN 'members' THEN role = 'member'
           WHEN 'parents' THEN role = 'parent'
           ELSE role = 'member' AND rank_id::text = NEW.target_audience
         END;
  IF v_tokens IS NOT NULL THEN
    PERFORM notify_push(v_tokens, 'Nowe ogłoszenie', NEW.title);
  END IF;
  RETURN NEW;
END;
$$;

-- ── 4. Zapis „co tydzień” dołącza wcześniejsze pojedyncze zapisy ──
DO $$
DECLARE
  def text := pg_get_functiondef('public.sign_up_for_slot(date, text, text, uuid, uuid)'::regprocedure);
  old_txt text := $x$          VALUES (v_sched, v_uid, 'ministrant', 'assigned', v_rule)
          ON CONFLICT (schedule_id, profile_id) DO NOTHING;$x$;
  new_txt text := $x$          VALUES (v_sched, v_uid, 'ministrant', 'assigned', v_rule)
          ON CONFLICT (schedule_id, profile_id) DO UPDATE SET recurring_assignment_id = EXCLUDED.recurring_assignment_id
           WHERE schedule_assignments.recurring_assignment_id IS NULL AND schedule_assignments.status = 'assigned';$x$;
  -- dopięcie istniejącego zapisu zmienia recurring_assignment_id — trigger ochronny wpuszcza to tylko w trybie systemowym
  old_on  text := $x$PERFORM set_config('lso.bulk', 'on', true);$x$;
  new_on  text := $x$PERFORM set_config('lso.bulk', 'on', true);
    PERFORM set_config('lso.sys', 'on', true);$x$;
  old_off text := $x$PERFORM set_config('lso.bulk', 'off', true);$x$;
  new_off text := $x$PERFORM set_config('lso.bulk', 'off', true);
    PERFORM set_config('lso.sys', 'off', true);$x$;
BEGIN
  IF position(new_txt IN def) > 0 THEN
    RETURN; -- już podmienione
  END IF;
  IF position(old_txt IN def) = 0 OR position(old_on IN def) = 0 OR position(old_off IN def) = 0 THEN
    RAISE EXCEPTION 'sign_up_for_slot: nie znaleziono fragmentu do podmiany (najpierw 20261106000000_recurring_unify.sql)';
  END IF;
  EXECUTE replace(replace(replace(def, old_txt, new_txt), old_on, new_on), old_off, new_off);
END $$;

COMMIT;
