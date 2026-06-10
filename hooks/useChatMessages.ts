import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ChatMessageWithSender } from '../types/chat'

const PAGE_SIZE = 50

export function useChatMessages(channelId: string) {
  const [messages, setMessages] = useState<ChatMessageWithSender[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const reactionsRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const votesRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const oldestCreatedAt = useRef<string | null>(null)

  const select = `
    *,
    sender:profiles(id, full_name, avatar_url, role),
    reply_to:chat_messages!reply_to_id(id, content, deleted_at, sender:profiles(full_name)),
    reactions:chat_reactions(*),
    poll:chat_polls(*, options:chat_poll_options(*, votes:chat_poll_votes(*)))
  `

  const fetchMessages = async () => {
    try {
      const { data } = await supabase
        .from('chat_messages')
        .select(select)
        .eq('channel_id', channelId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)
      if (data) {
        setMessages(data as ChatMessageWithSender[])
        setHasMore(data.length === PAGE_SIZE)
        oldestCreatedAt.current = data.length > 0 ? data[data.length - 1].created_at : null
      }
    } finally {
      setLoading(false)
    }
  }

  const loadMore = async () => {
    if (loadingMore || !hasMore || !oldestCreatedAt.current) return
    setLoadingMore(true)
    try {
      const { data } = await supabase
        .from('chat_messages')
        .select(select)
        .eq('channel_id', channelId)
        .is('deleted_at', null)
        .lt('created_at', oldestCreatedAt.current)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)
      if (data && data.length > 0) {
        setMessages((prev) => [...prev, ...(data as ChatMessageWithSender[])])
        setHasMore(data.length === PAGE_SIZE)
        oldestCreatedAt.current = data[data.length - 1].created_at
      } else {
        setHasMore(false)
      }
    } finally {
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    fetchMessages()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = () => { fetchMessages() }

    channelRef.current = supabase
      .channel(`chat-messages-${channelId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'chat_messages',
        filter: `channel_id=eq.${channelId}`,
      } as any, handler)
      .subscribe()

    reactionsRef.current = supabase
      .channel(`chat-reactions-${channelId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'chat_reactions',
      } as any, handler)
      .subscribe()

    votesRef.current = supabase
      .channel(`chat-votes-${channelId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'chat_poll_votes',
      } as any, handler)
      .subscribe()

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
      if (reactionsRef.current) supabase.removeChannel(reactionsRef.current)
      if (votesRef.current) supabase.removeChannel(votesRef.current)
    }
  }, [channelId])

  return { messages, loading, loadingMore, hasMore, loadMore, refetch: fetchMessages }
}
