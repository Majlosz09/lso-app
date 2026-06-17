import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { ChatMessageWithSender, ChatReaction } from '../types/chat'

const PAGE_SIZE = 50

function mergeOptimisticReactions(
  fresh: ChatMessageWithSender[],
  prev: ChatMessageWithSender[],
): ChatMessageWithSender[] {
  return fresh.map(msg => {
    const prevMsg = prev.find(m => m.id === msg.id)
    if (!prevMsg) return msg
    const pending = prevMsg.reactions.filter(
      r => r.id.startsWith('opt-') &&
        !msg.reactions.some(db => db.user_id === r.user_id && db.emoji === r.emoji)
    )
    return pending.length > 0 ? { ...msg, reactions: [...msg.reactions, ...pending] } : msg
  })
}

const SELECT = `
  *,
  sender:profiles!chat_messages_sender_id_fkey(id, full_name, avatar_url, role),
  reactions:chat_reactions!chat_reactions_message_id_fkey(*),
  poll:chat_polls!chat_messages_poll_id_fkey(*, options:chat_poll_options!chat_poll_options_poll_id_fkey(*, votes:chat_poll_votes!chat_poll_votes_option_id_fkey(*)))
`

async function attachReplies(msgs: any[]): Promise<ChatMessageWithSender[]> {
  const replyIds = [...new Set(
    msgs.filter(m => m.reply_to_id).map(m => m.reply_to_id as string)
  )]
  let replyMap: Record<string, any> = {}
  if (replyIds.length > 0) {
    const { data: replies } = await supabase
      .from('chat_messages')
      .select('id, content, deleted_at, sender:profiles(full_name)')
      .in('id', replyIds)
    if (replies) {
      replyMap = Object.fromEntries(replies.map(r => [r.id, r]))
    }
  }
  return msgs.map(m => ({
    ...m,
    reply_to: m.reply_to_id ? (replyMap[m.reply_to_id] ?? null) : null,
    reactions: m.reactions ?? [],
    poll: m.poll ?? null,
  })) as ChatMessageWithSender[]
}

export function useChatMessages(channelId: string) {
  const [messages, setMessages] = useState<ChatMessageWithSender[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const reactionsRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const votesRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  
  const oldestCreatedAt = useRef<string | null>(null)
  const messagesRef = useRef<ChatMessageWithSender[]>([])

  // Keep messagesRef in sync to avoid stale closures in realtime events
  useEffect(() => {
    messagesRef.current = messages
    // Centralized synchronization for pagination
    if (messages.length > 0) {
      oldestCreatedAt.current = messages[messages.length - 1].created_at
    } else {
      oldestCreatedAt.current = null
    }
  }, [messages])

  // Helper to fetch a single message with all its relations (highly efficient)
  const fetchSingleMessage = useCallback(async (messageId: string): Promise<ChatMessageWithSender | null> => {
    const { data, error } = await supabase
      .from('chat_messages')
      .select(SELECT)
      .eq('id', messageId)
      .single()

    if (error || !data) return null
    const [enriched] = await attachReplies([data])
    return enriched
  }, [])

  const fetchMessages = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select(SELECT)
        .eq('channel_id', channelId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)

      if (error) {
        console.error('[useChatMessages] fetch error, running fallback:', error.message)
        const { data: fallback, error: fallbackError } = await supabase
          .from('chat_messages')
          .select('*, sender:profiles(id, full_name, avatar_url, role), reactions:chat_reactions!chat_reactions_message_id_fkey(*)')
          .eq('channel_id', channelId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(PAGE_SIZE)

        if (fallbackError) {
          console.error('[useChatMessages] fallback error:', fallbackError.message)
        } else if (fallback) {
          const withReplies = await attachReplies(fallback)
          setMessages(prev => mergeOptimisticReactions(withReplies, prev))
          setHasMore(fallback.length === PAGE_SIZE)
        }
        return
      }

      if (data) {
        const withReplies = await attachReplies(data)
        setMessages(prev => mergeOptimisticReactions(withReplies, prev))
        setHasMore(data.length === PAGE_SIZE)
      }
    } finally {
      setLoading(false)
    }
  }, [channelId])

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !oldestCreatedAt.current) return
    setLoadingMore(true)
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select(SELECT)
        .eq('channel_id', channelId)
        .is('deleted_at', null)
        .lt('created_at', oldestCreatedAt.current)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)

      if (error) {
        console.error('[useChatMessages] loadMore error, running fallback:', error.message)
        const { data: fallback } = await supabase
          .from('chat_messages')
          .select('*, sender:profiles(id, full_name, avatar_url, role), reactions:chat_reactions!chat_reactions_message_id_fkey(*)')
          .eq('channel_id', channelId)
          .is('deleted_at', null)
          .lt('created_at', oldestCreatedAt.current)
          .order('created_at', { ascending: false })
          .limit(PAGE_SIZE)

        if (fallback && fallback.length > 0) {
          const withReplies = await attachReplies(fallback)
          setMessages(prev => mergeOptimisticReactions([...prev, ...withReplies], prev))
          setHasMore(fallback.length === PAGE_SIZE)
        } else {
          setHasMore(false)
        }
        return
      }

      if (data && data.length > 0) {
        const withReplies = await attachReplies(data)
        setMessages(prev => mergeOptimisticReactions([...prev, ...withReplies], prev))
        setHasMore(data.length === PAGE_SIZE)
      } else {
        setHasMore(false)
      }
    } finally {
      setLoadingMore(false)
    }
  }, [channelId, loadingMore, hasMore])

  const optimisticToggleReaction = (messageId: string, emoji: string, userId: string) => {
    setMessages(prev => prev.map(msg => {
      if (msg.id !== messageId) return msg
      const existing = msg.reactions.find(r => r.user_id === userId)
      if (existing) {
        if (existing.emoji === emoji) {
          // Same emoji — toggle off optimistically
          return { ...msg, reactions: msg.reactions.filter(r => r.user_id !== userId) }
        }
        return {
          ...msg,
          reactions: [
            ...msg.reactions.filter(r => r.user_id !== userId),
            { id: `opt-${Date.now()}`, message_id: messageId, user_id: userId, emoji, created_at: new Date().toISOString() } as ChatReaction,
          ],
        }
      }
      return {
        ...msg,
        reactions: [...msg.reactions, { id: `opt-${Date.now()}`, message_id: messageId, user_id: userId, emoji, created_at: new Date().toISOString() } as ChatReaction],
      }
    }))
  }

  useEffect(() => {
    fetchMessages()

    // 1. Incremental Chat Messages Updater (No more full table re-fetches!)
    channelRef.current = supabase
      .channel(`chat-messages-${channelId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'chat_messages',
        filter: `channel_id=eq.${channelId}`,
      }, async (payload: any) => {
        const { eventType, new: newRow, old: oldRow } = payload

        if (eventType === 'DELETE' || (newRow && newRow.deleted_at)) {
          const idToRemove = oldRow?.id || newRow?.id
          if (idToRemove) {
            setMessages(prev => prev.filter(m => m.id !== idToRemove))
          }
          return
        }

        if (eventType === 'INSERT' || eventType === 'UPDATE') {
          const enriched = await fetchSingleMessage(newRow.id)
          if (!enriched) return

          setMessages(prev => {
            const exists = prev.some(m => m.id === enriched.id)
            if (exists) {
              return prev.map(m => m.id === enriched.id ? enriched : m)
            }
            // Prepend new messages to the top (since sorting is descending)
            return [enriched, ...prev]
          })
        }
      })
      .subscribe()

    // 2. Chat Reactions Realtime
    reactionsRef.current = supabase
      .channel(`chat-reactions-${channelId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'chat_reactions',
      }, (payload: any) => {
        if (payload.eventType === 'INSERT') {
          const r = payload.new as ChatReaction
          setMessages(prev => prev.map(msg => {
            if (msg.id !== r.message_id) return msg
            const hasOptimistic = msg.reactions.some(
              ex => ex.user_id === r.user_id && ex.emoji === r.emoji
            )
            if (hasOptimistic) {
              return {
                ...msg,
                reactions: msg.reactions.map(ex =>
                  (ex.user_id === r.user_id && ex.emoji === r.emoji) ? r : ex
                ),
              }
            }
            return { ...msg, reactions: [...msg.reactions, r] }
          }))
        } else if (payload.eventType === 'UPDATE') {
          // Fired when a user changes their emoji via upsert
          const r = payload.new as ChatReaction
          setMessages(prev => prev.map(msg => {
            if (msg.id !== r.message_id) return msg
            // Replace by user_id so optimistic reactions (id: 'opt-...') are also swapped out
            return {
              ...msg,
              reactions: msg.reactions.map(ex => ex.user_id === r.user_id ? r : ex),
            }
          }))
        } else if (payload.eventType === 'DELETE') {
          const deletedId = payload.old?.id
          if (!deletedId) return
          setMessages(prev => prev.map(msg => ({
            ...msg,
            reactions: msg.reactions.filter(r => r.id !== deletedId),
          })))
        }
      })
      .subscribe()

    // 3. Incremental Poll Votes Updater (Targets only the specific message)
    votesRef.current = supabase
      .channel(`chat-votes-${channelId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'chat_poll_votes',
      }, async (payload: any) => {
        const optionId = payload.new?.option_id || payload.old?.option_id
        if (!optionId) return

        // Look through current state to find which message owns this option
        const targetMessage = messagesRef.current.find(m => 
          m.poll?.options?.some(o => o.id === optionId)
        )
        
        if (targetMessage) {
          const enriched = await fetchSingleMessage(targetMessage.id)
          if (enriched) {
            setMessages(prev => prev.map(m => m.id === enriched.id ? enriched : m))
          }
        }
      })
      .subscribe()

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
      if (reactionsRef.current) supabase.removeChannel(reactionsRef.current)
      if (votesRef.current) supabase.removeChannel(votesRef.current)
    }
  }, [channelId, fetchMessages, fetchSingleMessage])

  const updateMessageReactions = (messageId: string, reactions: ChatReaction[]) => {
    setMessages(prev => prev.map(msg =>
      msg.id === messageId ? { ...msg, reactions } : msg
    ))
  }

  return { 
    messages, 
    loading, 
    loadingMore, 
    hasMore, 
    loadMore, 
    refetch: () => fetchMessages(true),
    optimisticToggleReaction, 
    updateMessageReactions 
  }
}