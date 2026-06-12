import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { ChatReaction } from '../types/chat'

export function useChatReactions(userId: string) {

  const toggleReaction = useCallback(async (
    messageId: string,
    emoji: string,
    currentReactions: ChatReaction[],
  ): Promise<{ success: boolean; error?: any }> => {

    const existingByUser = currentReactions.find(r => r.user_id === userId)

    // Same emoji already set — reaction is permanent, nothing to do
    if (existingByUser?.emoji === emoji) {
      return { success: true }
    }

    try {
      // UPSERT handles both new reactions and emoji changes atomically.
      // Avoids 409 conflicts when optimistic state is out of sync with DB.
      const { error } = await supabase
        .from('chat_reactions')
        .upsert(
          { message_id: messageId, user_id: userId, emoji },
          { onConflict: 'message_id,user_id' },
        )
      if (error) throw error
      return { success: true }
    } catch (err: any) {
      console.error('[useChatReactions] Błąd podczas zmiany reakcji:', err.message || err)
      return { success: false, error: err }
    }
  }, [userId])

  return { toggleReaction }
}
