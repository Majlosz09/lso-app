import { supabase } from '../lib/supabase'
import { ChatReaction } from '../types/chat'

export function useChatReactions(userId: string) {
  const toggleReaction = async (
    messageId: string,
    emoji: string,
    currentReactions: ChatReaction[],
  ) => {
    const existing = currentReactions.find(
      (r) => r.user_id === userId && r.emoji === emoji,
    )
    if (existing) {
      return supabase
        .from('chat_reactions')
        .delete()
        .match({ message_id: messageId, user_id: userId, emoji })
    } else {
      return supabase
        .from('chat_reactions')
        .insert({ message_id: messageId, user_id: userId, emoji })
    }
  }

  return { toggleReaction }
}
