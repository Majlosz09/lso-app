-- =============================================================
-- N13: ustawienia czatu parafii
--
-- parishes.parents_see_general       — rodzice są w kanale „Ministranci” TYLKO DO ODCZYTU (domyślnie nie)
-- parishes.members_can_create_polls  — ministranci/rodzice mogą tworzyć ankiety (domyślnie tak;
--                                      wyłączone → ankiety zakłada tylko opiekun)
-- chat_members.can_post              — false = członek tylko czyta (nie pisze, nie głosuje)
-- =============================================================

BEGIN;

ALTER TABLE parishes ADD COLUMN IF NOT EXISTS parents_see_general boolean NOT NULL DEFAULT false;
ALTER TABLE parishes ADD COLUMN IF NOT EXISTS members_can_create_polls boolean NOT NULL DEFAULT true;
ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS can_post boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.chat_can_post(p_channel uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT can_post FROM chat_members WHERE channel_id = p_channel AND user_id = auth.uid()), false)
$$;
REVOKE EXECUTE ON FUNCTION public.chat_can_post(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_can_post(uuid) TO authenticated;

-- Pisanie tylko z prawem zapisu (członkostwo nadal sprawdzane przez chat_can_post)
DROP POLICY IF EXISTS "chat_messages_insert" ON chat_messages;
CREATE POLICY "chat_messages_insert" ON chat_messages
  FOR INSERT WITH CHECK (sender_id = auth.uid() AND chat_can_post(channel_id));

DROP POLICY IF EXISTS "chat_polls_insert" ON chat_polls;
CREATE POLICY "chat_polls_insert" ON chat_polls
  FOR INSERT WITH CHECK (
    creator_id = auth.uid()
    AND chat_can_post(channel_id)
    AND (
      (is_parish_admin() AND chat_channel_parish(channel_id) = my_parish_id())
      OR coalesce((SELECT members_can_create_polls FROM parishes WHERE id = my_parish_id()), true)
    )
  );

DROP POLICY IF EXISTS "chat_poll_votes_insert" ON chat_poll_votes;
CREATE POLICY "chat_poll_votes_insert" ON chat_poll_votes
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM chat_poll_options o
      JOIN chat_polls p ON p.id = o.poll_id
      WHERE o.id = chat_poll_votes.option_id AND chat_can_post(p.channel_id)
    )
  );

-- Nowy / zatwierdzony profil → kanały (rodzic dodatkowo do „Ministranci” w trybie odczytu, jeśli włączone)
CREATE OR REPLACE FUNCTION public.add_profile_to_chat_channels()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.parish_id IS NULL OR NOT NEW.approved THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.parish_id IS NOT NULL AND OLD.parish_id = NEW.parish_id
     AND OLD.role = NEW.role AND OLD.is_admin = NEW.is_admin
     AND OLD.approved = NEW.approved THEN
    RETURN NEW;
  END IF;

  IF NEW.role = 'member' THEN
    INSERT INTO chat_members(channel_id, user_id)
    SELECT id, NEW.id FROM chat_channels WHERE parish_id = NEW.parish_id AND slug = 'ministranci'
    ON CONFLICT DO NOTHING;
  END IF;
  IF NEW.role = 'parent' THEN
    INSERT INTO chat_members(channel_id, user_id)
    SELECT id, NEW.id FROM chat_channels WHERE parish_id = NEW.parish_id AND slug = 'rodzice'
    ON CONFLICT DO NOTHING;
    IF (SELECT parents_see_general FROM parishes WHERE id = NEW.parish_id) THEN
      INSERT INTO chat_members(channel_id, user_id, can_post)
      SELECT id, NEW.id, false FROM chat_channels WHERE parish_id = NEW.parish_id AND slug = 'ministranci'
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  IF NEW.role = 'admin' OR NEW.is_admin = TRUE THEN
    INSERT INTO chat_members(channel_id, user_id, can_post)
    SELECT id, NEW.id, true FROM chat_channels WHERE parish_id = NEW.parish_id AND slug IN ('ministranci', 'rodzice')
    ON CONFLICT (channel_id, user_id) DO UPDATE SET can_post = true;
  END IF;
  RETURN NEW;
END;
$$;

-- Przełącznik „Rodzice widzą kanał ogólny” → dopisz / usuń rodziców (tylko odczyt)
CREATE OR REPLACE FUNCTION trg_parishes_parents_general()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_channel uuid;
BEGIN
  IF NEW.parents_see_general IS NOT DISTINCT FROM OLD.parents_see_general THEN RETURN NEW; END IF;
  SELECT id INTO v_channel FROM chat_channels WHERE parish_id = NEW.id AND slug = 'ministranci' LIMIT 1;
  IF v_channel IS NULL THEN RETURN NEW; END IF;

  IF NEW.parents_see_general THEN
    INSERT INTO chat_members(channel_id, user_id, can_post)
    SELECT v_channel, p.id, false FROM profiles p
     WHERE p.parish_id = NEW.id AND p.role = 'parent' AND p.approved AND NOT coalesce(p.is_admin, false)
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM chat_members cm USING profiles p
     WHERE cm.channel_id = v_channel AND cm.user_id = p.id AND cm.can_post = false
       AND p.role = 'parent';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_parishes_parents_general ON parishes;
CREATE TRIGGER trg_parishes_parents_general
  AFTER UPDATE OF parents_see_general ON parishes
  FOR EACH ROW EXECUTE FUNCTION trg_parishes_parents_general();

COMMIT;
