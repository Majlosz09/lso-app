import { supabase } from '../lib/supabase'
import { ChatPoll } from '../types/chat'

export function useChatPolls(userId: string) {
  const vote = async (poll: ChatPoll, optionId: string) => {
    if (poll.allow_multiple) {
      const option = poll.options.find((o) => o.id === optionId)
      const existing = option?.votes.find((v) => v.user_id === userId)
      if (existing) {
        await supabase.from('chat_poll_votes').delete().match({ id: existing.id, user_id: userId })
      } else {
        await supabase.from('chat_poll_votes').insert({ option_id: optionId, user_id: userId })
      }
    } else {
      // Single choice: find and delete the user's current vote in this poll (by vote ID)
      const existingVote = poll.options
        .flatMap((o) => o.votes)
        .find((v) => v.user_id === userId)
      if (existingVote) {
        await supabase.from('chat_poll_votes').delete().match({ id: existingVote.id, user_id: userId })
      }
      await supabase.from('chat_poll_votes').insert({ option_id: optionId, user_id: userId })
    }
  }

  const closePoll = async (pollId: string) => {
    await supabase
      .from('chat_polls')
      .update({ closed_at: new Date().toISOString() })
      .match({ id: pollId })
  }

  return { vote, closePoll }
}
