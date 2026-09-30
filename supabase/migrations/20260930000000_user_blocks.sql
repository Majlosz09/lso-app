-- =============================================================
-- Blokowanie użytkowników w czacie (App Store 1.2 — treści użytkowników:
-- zgłaszanie + blokowanie). Uruchom w: Supabase → SQL Editor (najpierw LSO-dev, potem LSO).
-- Można uruchomić ponownie (idempotentna).
--
-- Działanie:
--  * wiadomości osób, które zablokowałem, nie przychodzą do mnie wcale — ani przy
--    wczytywaniu, ani przez realtime (polityka RESTRICTIVE na SELECT),
--  * w rozmowie prywatnej (DM) żadna ze stron nie może pisać, jeśli któraś zablokowała drugą,
--  * odblokować można w Profilu → „Zablokowane osoby”.
-- Istniejących polityk i funkcji nie zmienia — tylko dokłada nowe.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT user_blocks_not_self CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx ON public.user_blocks (blocked_id);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_blocks_select_own" ON public.user_blocks;
CREATE POLICY "user_blocks_select_own" ON public.user_blocks
  FOR SELECT USING (blocker_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "user_blocks_insert_own" ON public.user_blocks;
CREATE POLICY "user_blocks_insert_own" ON public.user_blocks
  FOR INSERT WITH CHECK (blocker_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "user_blocks_delete_own" ON public.user_blocks;
CREATE POLICY "user_blocks_delete_own" ON public.user_blocks
  FOR DELETE USING (blocker_id = (SELECT auth.uid()));

GRANT SELECT, INSERT, DELETE ON public.user_blocks TO authenticated;

-- Czy w tym kanale DM jest blokada w którąkolwiek stronę między mną a drugą osobą.
-- SECURITY DEFINER: musi widzieć blokady założone przez drugą osobę.
CREATE OR REPLACE FUNCTION public.dm_blocked(p_channel_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM chat_channels c
      JOIN chat_members m ON m.channel_id = c.id AND m.user_id <> auth.uid()
      JOIN user_blocks b
        ON (b.blocker_id = m.user_id AND b.blocked_id = auth.uid())
        OR (b.blocker_id = auth.uid() AND b.blocked_id = m.user_id)
     WHERE c.id = p_channel_id AND c.type = 'dm'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.dm_blocked(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dm_blocked(uuid) TO authenticated;

-- Nie widzę wiadomości osób, które zablokowałem (dotyczy też realtime i odpowiedzi-cytatów).
DROP POLICY IF EXISTS "chat_messages_hide_blocked" ON public.chat_messages;
CREATE POLICY "chat_messages_hide_blocked" ON public.chat_messages
  AS RESTRICTIVE FOR SELECT USING (
    sender_id IS NULL
    OR sender_id = (SELECT auth.uid())
    OR NOT EXISTS (
      SELECT 1 FROM public.user_blocks b
       WHERE b.blocker_id = (SELECT auth.uid()) AND b.blocked_id = chat_messages.sender_id
    )
  );

-- W DM nie da się pisać, gdy jest blokada w którąkolwiek stronę.
DROP POLICY IF EXISTS "chat_messages_insert_not_blocked" ON public.chat_messages;
CREATE POLICY "chat_messages_insert_not_blocked" ON public.chat_messages
  AS RESTRICTIVE FOR INSERT WITH CHECK (NOT public.dm_blocked(channel_id));

-- Kontrola po uruchomieniu (powinno zwrócić 3 wiersze):
-- select policyname, permissive, cmd from pg_policies
--  where tablename in ('chat_messages') and policyname like '%block%'
--  union all select 'user_blocks', 'rls='||relrowsecurity::text, '' from pg_class where relname='user_blocks';
