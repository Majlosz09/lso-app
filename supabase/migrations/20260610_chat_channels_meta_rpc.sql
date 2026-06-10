-- supabase/migrations/20260610_chat_channels_meta_rpc.sql
-- This migration creates an RPC function to fetch chat channels with metadata
-- (last message, unread count) in a single query, replacing N+1 queries.
--
-- NOTE: This migration must be run manually in the Supabase Dashboard.
-- Copy the SQL below and execute it in your project's SQL editor.

-- SECURITY NOTE: SECURITY DEFINER runs as function owner.
-- Access control is enforced by the JOIN on chat_members (user_id = auth.uid()).
-- Only channels where the user is a member are returned.

-- Composite index for the JOIN condition in get_chat_channels_with_meta
CREATE INDEX IF NOT EXISTS chat_members_user_channel
  ON chat_members(user_id, channel_id);

-- Partial index for the unread count subquery
CREATE INDEX IF NOT EXISTS chat_messages_unread
  ON chat_messages(channel_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION get_chat_channels_with_meta()
RETURNS TABLE (
  id                   uuid,
  parish_id            uuid,
  type                 text,
  name                 text,
  slug                 text,
  created_at           timestamptz,
  last_message_content text,
  last_message_at      timestamptz,
  last_message_type    text,
  unread_count         bigint
)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    cc.id,
    cc.parish_id,
    cc.type,
    cc.name,
    cc.slug,
    cc.created_at,
    last_msg.content       AS last_message_content,
    last_msg.created_at    AS last_message_at,
    last_msg.type          AS last_message_type,
    (
      SELECT COUNT(*)
      FROM chat_messages m
      WHERE m.channel_id = cc.id
        AND m.created_at > COALESCE(cm.last_read_at, '1970-01-01'::timestamptz)
        AND m.deleted_at IS NULL
        AND m.sender_id != auth.uid()
    ) AS unread_count
  FROM chat_channels cc
  JOIN chat_members cm
    ON cm.channel_id = cc.id AND cm.user_id = auth.uid()
  LEFT JOIN LATERAL (
    SELECT m.content, m.created_at, m.type
    FROM chat_messages m
    WHERE m.channel_id = cc.id AND m.deleted_at IS NULL
    ORDER BY m.created_at DESC
    LIMIT 1
  ) last_msg ON true
  ORDER BY COALESCE(last_msg.created_at, cc.created_at) DESC;
$$;
