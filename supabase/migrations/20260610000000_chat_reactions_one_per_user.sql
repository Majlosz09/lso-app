-- =============================================================
-- REAKCJE: max jedna na wiadomość per użytkownik
-- Zmiana constraint z (message_id, user_id, emoji)
-- na (message_id, user_id).
-- =============================================================

-- Usuń duplikaty: jeśli user ma >1 emoji na tej samej wiadomości,
-- zostaw tylko najnowszą reakcję.
DELETE FROM chat_reactions
WHERE id NOT IN (
  SELECT DISTINCT ON (message_id, user_id) id
  FROM chat_reactions
  ORDER BY message_id, user_id, created_at DESC
);

-- Zamień stary constraint na nowy (węższy)
ALTER TABLE chat_reactions
  DROP CONSTRAINT IF EXISTS chat_reactions_message_id_user_id_emoji_key;

ALTER TABLE chat_reactions
  ADD CONSTRAINT chat_reactions_message_id_user_id_key
  UNIQUE (message_id, user_id);
