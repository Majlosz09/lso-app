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

export interface ChatReaction {
  id: string
  message_id: string
  user_id: string
  emoji: string
  created_at: string
}

export interface ChatPollVote {
  id: string
  option_id: string
  user_id: string
}

export interface ChatPollOption {
  id: string
  poll_id: string
  text: string
  position: number
  votes: ChatPollVote[]
}

export interface ChatPoll {
  id: string
  channel_id: string
  creator_id: string
  question: string
  allow_multiple: boolean
  closed_at: string | null
  created_at: string
  options: ChatPollOption[]
}

export interface ChatMessage {
  id: string
  channel_id: string
  sender_id: string
  content: string
  type: 'text' | 'poll'
  reply_to_id: string | null
  edited_at: string | null
  poll_id: string | null
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
  reply_to: {
    id: string
    content: string
    deleted_at: string | null
    sender: { full_name: string } | null
  } | null
  reactions: ChatReaction[]
  poll: ChatPoll | null
}

export interface ChatChannelWithMeta extends ChatChannel {
  member: ChatMember
  last_message: ChatMessageWithSender | null
  unread_count: number
}
