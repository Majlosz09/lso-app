-- =============================================================
-- CZAT — PEŁNA MIGRACJA (tabele podstawowe + Phase 1)
-- Uruchom w: Supabase Dashboard → SQL Editor
-- =============================================================

-- -------------------------------------------------------------
-- 1. KOLUMNA allow_member_dm w parishes
-- -------------------------------------------------------------
ALTER TABLE parishes
  ADD COLUMN IF NOT EXISTS allow_member_dm boolean NOT NULL DEFAULT false;


-- -------------------------------------------------------------
-- 2. PODSTAWOWE TABELE CZATU
-- -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chat_channels (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parish_id  uuid NOT NULL REFERENCES parishes(id) ON DELETE CASCADE,
  type       text NOT NULL CHECK (type IN ('group', 'dm')),
  name       text,
  slug       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_members (
  channel_id   uuid NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_read_at timestamptz,
  PRIMARY KEY (channel_id, user_id)
);

-- chat_polls musi być przed chat_messages (FK poll_id)
CREATE TABLE IF NOT EXISTS chat_polls (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id     uuid REFERENCES chat_channels(id) ON DELETE CASCADE,
  creator_id     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  question       text NOT NULL,
  allow_multiple boolean DEFAULT false,
  closed_at      timestamptz,
  created_at     timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id   uuid NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  sender_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content      text NOT NULL,
  type         text NOT NULL DEFAULT 'text',
  reply_to_id  uuid REFERENCES chat_messages(id) ON DELETE SET NULL,
  edited_at    timestamptz,
  poll_id      uuid REFERENCES chat_polls(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);


-- -------------------------------------------------------------
-- 3. PHASE 1 — TABELE REAKCJI I ANKIET
-- -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chat_poll_options (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id  uuid NOT NULL REFERENCES chat_polls(id) ON DELETE CASCADE,
  text     text NOT NULL,
  position integer NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_poll_votes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  option_id  uuid NOT NULL REFERENCES chat_poll_options(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (option_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_reactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  uuid NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji       text NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);


-- -------------------------------------------------------------
-- 4. INDEKSY
-- -------------------------------------------------------------
CREATE INDEX IF NOT EXISTS chat_messages_channel_created
  ON chat_messages(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_channels_parish
  ON chat_channels(parish_id);
CREATE INDEX IF NOT EXISTS chat_members_user
  ON chat_members(user_id);


-- -------------------------------------------------------------
-- 5. RLS
-- -------------------------------------------------------------
ALTER TABLE chat_channels  ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_polls     ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_poll_votes   ENABLE ROW LEVEL SECURITY;

-- chat_channels
DROP POLICY IF EXISTS "chat_channels_select" ON chat_channels;
DROP POLICY IF EXISTS "chat_channels_insert" ON chat_channels;
CREATE POLICY "chat_channels_select" ON chat_channels
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM chat_members WHERE channel_id = id AND user_id = auth.uid())
  );
CREATE POLICY "chat_channels_insert" ON chat_channels
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND parish_id = chat_channels.parish_id)
  );

-- chat_members
DROP POLICY IF EXISTS "chat_members_select" ON chat_members;
DROP POLICY IF EXISTS "chat_members_insert" ON chat_members;
DROP POLICY IF EXISTS "chat_members_update" ON chat_members;
CREATE POLICY "chat_members_select" ON chat_members
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR is_admin = true))
  );
CREATE POLICY "chat_members_insert" ON chat_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN chat_channels cc ON cc.parish_id = p.parish_id
      WHERE p.id = auth.uid() AND (p.role = 'admin' OR p.is_admin = true)
        AND cc.id = chat_members.channel_id
    )
    OR user_id = auth.uid()
  );
CREATE POLICY "chat_members_update" ON chat_members
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- chat_messages
DROP POLICY IF EXISTS "chat_messages_select" ON chat_messages;
DROP POLICY IF EXISTS "chat_messages_insert" ON chat_messages;
DROP POLICY IF EXISTS "chat_messages_update" ON chat_messages;
DROP POLICY IF EXISTS "chat_messages_soft_delete" ON chat_messages;
CREATE POLICY "chat_messages_select" ON chat_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM chat_members WHERE channel_id = chat_messages.channel_id AND user_id = auth.uid())
  );
CREATE POLICY "chat_messages_insert" ON chat_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (SELECT 1 FROM chat_members WHERE channel_id = chat_messages.channel_id AND user_id = auth.uid())
  );
CREATE POLICY "chat_messages_update" ON chat_messages
  FOR UPDATE USING (
    sender_id = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR is_admin = true))
  )
  WITH CHECK (
    sender_id = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR is_admin = true))
  );

-- chat_reactions
DROP POLICY IF EXISTS "chat_reactions_select" ON chat_reactions;
DROP POLICY IF EXISTS "chat_reactions_insert" ON chat_reactions;
DROP POLICY IF EXISTS "chat_reactions_delete" ON chat_reactions;
DROP POLICY IF EXISTS "members can select reactions" ON chat_reactions;
DROP POLICY IF EXISTS "user inserts own reaction" ON chat_reactions;
DROP POLICY IF EXISTS "user deletes own reaction" ON chat_reactions;
CREATE POLICY "chat_reactions_select" ON chat_reactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chat_members cm
      JOIN chat_messages msg ON msg.id = chat_reactions.message_id
      WHERE cm.channel_id = msg.channel_id AND cm.user_id = auth.uid()
    )
  );
CREATE POLICY "chat_reactions_insert" ON chat_reactions
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "chat_reactions_delete" ON chat_reactions
  FOR DELETE USING (user_id = auth.uid());

-- chat_polls
DROP POLICY IF EXISTS "chat_polls_select" ON chat_polls;
DROP POLICY IF EXISTS "chat_polls_insert" ON chat_polls;
DROP POLICY IF EXISTS "chat_polls_update" ON chat_polls;
DROP POLICY IF EXISTS "members can select polls" ON chat_polls;
DROP POLICY IF EXISTS "members can insert polls" ON chat_polls;
DROP POLICY IF EXISTS "creator or admin closes poll" ON chat_polls;
CREATE POLICY "chat_polls_select" ON chat_polls
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM chat_members WHERE channel_id = chat_polls.channel_id AND user_id = auth.uid())
  );
CREATE POLICY "chat_polls_insert" ON chat_polls
  FOR INSERT WITH CHECK (
    creator_id = auth.uid() AND
    EXISTS (SELECT 1 FROM chat_members WHERE channel_id = chat_polls.channel_id AND user_id = auth.uid())
  );
CREATE POLICY "chat_polls_update" ON chat_polls
  FOR UPDATE USING (
    creator_id = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR is_admin = true))
  );

-- chat_poll_options
DROP POLICY IF EXISTS "chat_poll_options_select" ON chat_poll_options;
DROP POLICY IF EXISTS "chat_poll_options_insert" ON chat_poll_options;
DROP POLICY IF EXISTS "members can select options" ON chat_poll_options;
DROP POLICY IF EXISTS "creator inserts options" ON chat_poll_options;
CREATE POLICY "chat_poll_options_select" ON chat_poll_options
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chat_members cm
      JOIN chat_polls p ON p.id = chat_poll_options.poll_id
      WHERE cm.channel_id = p.channel_id AND cm.user_id = auth.uid()
    )
  );
CREATE POLICY "chat_poll_options_insert" ON chat_poll_options
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM chat_polls WHERE id = poll_id AND creator_id = auth.uid())
  );

-- chat_poll_votes
DROP POLICY IF EXISTS "chat_poll_votes_select" ON chat_poll_votes;
DROP POLICY IF EXISTS "chat_poll_votes_insert" ON chat_poll_votes;
DROP POLICY IF EXISTS "chat_poll_votes_delete" ON chat_poll_votes;
DROP POLICY IF EXISTS "members can select votes" ON chat_poll_votes;
DROP POLICY IF EXISTS "user inserts own vote" ON chat_poll_votes;
DROP POLICY IF EXISTS "user deletes own vote" ON chat_poll_votes;
CREATE POLICY "chat_poll_votes_select" ON chat_poll_votes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chat_members cm
      JOIN chat_poll_options opt ON opt.id = chat_poll_votes.option_id
      JOIN chat_polls p ON p.id = opt.poll_id
      WHERE cm.channel_id = p.channel_id AND cm.user_id = auth.uid()
    )
  );
CREATE POLICY "chat_poll_votes_insert" ON chat_poll_votes
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "chat_poll_votes_delete" ON chat_poll_votes
  FOR DELETE USING (user_id = auth.uid());


-- -------------------------------------------------------------
-- 6. REALTIME
-- -------------------------------------------------------------
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE chat_reactions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE chat_poll_votes;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- -------------------------------------------------------------
-- 7. TRIGGER — automatyczne tworzenie kanałów przy nowej parafii
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_parish_chat_channels()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO chat_channels(parish_id, type, name, slug)
  VALUES
    (NEW.id, 'group', 'Ministranci', 'ministranci'),
    (NEW.id, 'group', 'Rodzice',     'rodzice');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_parish_channels ON parishes;
CREATE TRIGGER trg_create_parish_channels
  AFTER INSERT ON parishes
  FOR EACH ROW EXECUTE FUNCTION create_parish_chat_channels();


-- -------------------------------------------------------------
-- 8. TRIGGER — dodawanie profilu do kanałów przy dołączeniu do parafii
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION add_profile_to_chat_channels()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
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
$$;

DROP TRIGGER IF EXISTS trg_add_profile_to_chat_channels ON profiles;
CREATE TRIGGER trg_add_profile_to_chat_channels
  AFTER INSERT OR UPDATE OF parish_id, role, is_admin ON profiles
  FOR EACH ROW EXECUTE FUNCTION add_profile_to_chat_channels();


-- -------------------------------------------------------------
-- 9. TRIGGER — push notyfikacje dla nowych wiadomości
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_chat_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
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
$$;

DROP TRIGGER IF EXISTS trg_notify_chat_message ON chat_messages;
CREATE TRIGGER trg_notify_chat_message
  AFTER INSERT ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION notify_chat_message();


-- -------------------------------------------------------------
-- 10. ISTNIEJĄCE PARAFIE — utwórz kanały jeśli jeszcze nie ma
-- (dla parafii stworzonych PRZED tą migracją)
-- -------------------------------------------------------------
INSERT INTO chat_channels(parish_id, type, name, slug)
SELECT p.id, 'group', 'Ministranci', 'ministranci'
FROM parishes p
WHERE NOT EXISTS (
  SELECT 1 FROM chat_channels cc WHERE cc.parish_id = p.id AND cc.slug = 'ministranci'
);

INSERT INTO chat_channels(parish_id, type, name, slug)
SELECT p.id, 'group', 'Rodzice', 'rodzice'
FROM parishes p
WHERE NOT EXISTS (
  SELECT 1 FROM chat_channels cc WHERE cc.parish_id = p.id AND cc.slug = 'rodzice'
);

-- Dodaj istniejących użytkowników do odpowiednich kanałów
INSERT INTO chat_members(channel_id, user_id)
SELECT cc.id, pr.id
FROM profiles pr
JOIN chat_channels cc ON cc.parish_id = pr.parish_id AND cc.slug = 'ministranci'
WHERE pr.role = 'member' AND pr.parish_id IS NOT NULL AND pr.is_active = true
ON CONFLICT DO NOTHING;

INSERT INTO chat_members(channel_id, user_id)
SELECT cc.id, pr.id
FROM profiles pr
JOIN chat_channels cc ON cc.parish_id = pr.parish_id AND cc.slug = 'rodzice'
WHERE pr.role = 'parent' AND pr.parish_id IS NOT NULL AND pr.is_active = true
ON CONFLICT DO NOTHING;

INSERT INTO chat_members(channel_id, user_id)
SELECT cc.id, pr.id
FROM profiles pr
JOIN chat_channels cc ON cc.parish_id = pr.parish_id AND cc.slug IN ('ministranci', 'rodzice')
WHERE (pr.role = 'admin' OR pr.is_admin = true) AND pr.parish_id IS NOT NULL AND pr.is_active = true
ON CONFLICT DO NOTHING;
