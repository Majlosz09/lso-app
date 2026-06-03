export type ChatChannelType = 'group' | 'dm'

export interface ChatChannel {
  id: string
  parish_id: string
  type: ChatChannelType
  name: string | null
  slug: string | null
  created_at: string
}

export interface ChatMember {
  channel_id: string
  user_id: string
  last_read_at: string | null
}

export interface ChatMessage {
  id: string
  channel_id: string
  sender_id: string
  content: string
  created_at: string
  deleted_at: string | null
}

export interface ChatMessageWithSender extends ChatMessage {
  sender: {
    id: string
    full_name: string
    avatar_url: string | null
    role: string
  } | null
}

export interface ChatChannelWithMeta extends ChatChannel {
  member: ChatMember
  last_message: ChatMessageWithSender | null
  unread_count: number
}
