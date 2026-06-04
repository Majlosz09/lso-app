import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ChatMessageWithSender } from '../types/chat'

const PAGE_SIZE = 50

export function useChatMessages(channelId: string) {
  const [messages, setMessages] = useState<ChatMessageWithSender[]>([])
  const [loading, setLoading] = useState(true)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const reactionsRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const votesRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const fetchMessages = async () => {
    try {
      const { data } = await supabase
        .from('chat_messages')
        .select(`
          *,
          sender:profiles(id, full_name, avatar_url, role),
          reply_to:chat_messages!reply_to_id(id, content, deleted_at, sender:profiles(full_name)),
          reactions:chat_reactions(*),
          poll:chat_polls(*, options:chat_poll_options(*, votes:chat_poll_votes(*)))
        `)
        .eq('channel_id', channelId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)
      if (data) setMessages(data as ChatMessageWithSender[])
    } finally {
      setLoading(false)
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

  return { messages, loading, refetch: fetchMessages }
}
