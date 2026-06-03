// hooks/useChatMessages.ts
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ChatMessageWithSender } from '../types/chat'

const PAGE_SIZE = 50

export function useChatMessages(channelId: string) {
  const [messages, setMessages] = useState<ChatMessageWithSender[]>([])
  const [loading, setLoading] = useState(true)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const fetchMessages = async () => {
    const { data } = await supabase
      .from('chat_messages')
      .select('*, sender:profiles(id, full_name, avatar_url, role)')
      .eq('channel_id', channelId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)
    if (data) setMessages(data as ChatMessageWithSender[])
    setLoading(false)
  }

  useEffect(() => {
    fetchMessages()

    channelRef.current = supabase
      .channel(`chat-messages-${channelId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'chat_messages',
        filter: `channel_id=eq.${channelId}`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any, () => { fetchMessages() })
      .subscribe()

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [channelId])

  return { messages, loading, refetch: fetchMessages }
}
