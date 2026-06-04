# Chat Improvements Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add emoji reactions, message editing, reply-to-message, polls, and Enter/Send keyboard behavior to the LSO app chat.

**Architecture:** New Supabase tables (`chat_reactions`, `chat_polls`, `chat_poll_options`, `chat_poll_votes`) and 4 new columns on `chat_messages`. New components live in `components/chat/`. The main `[channelId].tsx` screen delegates rendering to `MessageBubble` and wires new state (reply, edit, action sheet). Real-time updates piggyback on the existing `fetchMessages()` re-fetch pattern.

**Tech Stack:** Expo/React Native, TypeScript, Supabase (PostgREST + Realtime), `@testing-library/react-native`, Jest.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `components/chat/ReactionBar.tsx` | Row of 6 emoji buttons |
| Create | `components/chat/MessageActionSheet.tsx` | Modal bottom sheet: emoji bar + action list |
| Create | `components/chat/ReplyPreview.tsx` | Banner above input showing quoted message |
| Create | `components/chat/PollBubble.tsx` | Poll card with vote bars + voting |
| Create | `components/chat/CreatePollModal.tsx` | Modal to create a poll |
| Create | `components/chat/MessageBubble.tsx` | Single message: text/poll, reactions, reply quote |
| Create | `hooks/useChatReactions.ts` | Insert/delete reaction logic |
| Create | `hooks/useChatPolls.ts` | Vote logic for polls |
| Create | `__tests__/hooks/useChatReactions.test.ts` | Tests for reaction hook |
| Create | `__tests__/hooks/useChatPolls.test.ts` | Tests for poll voting hook |
| Modify | `types/chat.ts` | New interfaces + extend ChatMessage/ChatMessageWithSender |
| Modify | `hooks/useChatMessages.ts` | Extended select + new realtime subs |
| Modify | `__tests__/hooks/useChatMessages.test.ts` | Update mock to match new select shape |
| Modify | `app/chat/[channelId].tsx` | Use MessageBubble, wire action sheet/reply/edit/poll |

---

## Task 1: Supabase Migrations

**Files:**
- No code files — run SQL in Supabase Dashboard → SQL Editor

- [ ] **Step 1: Run migration in Supabase SQL Editor**

Open your Supabase project → SQL Editor → New query. Paste and run:

```sql
-- 1. New tables (must come before chat_messages columns that reference them)
CREATE TABLE chat_polls (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id     uuid REFERENCES chat_channels(id),
  creator_id     uuid REFERENCES profiles(id),
  question       text NOT NULL,
  allow_multiple boolean DEFAULT false,
  closed_at      timestamptz,
  created_at     timestamptz DEFAULT now()
);

CREATE TABLE chat_poll_options (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id  uuid REFERENCES chat_polls(id) ON DELETE CASCADE,
  text     text NOT NULL,
  position integer NOT NULL
);

CREATE TABLE chat_poll_votes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  option_id  uuid REFERENCES chat_poll_options(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (option_id, user_id)
);

CREATE TABLE chat_reactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  uuid REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES profiles(id) ON DELETE CASCADE,
  emoji       text NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

-- 2. Extend chat_messages
ALTER TABLE chat_messages
  ADD COLUMN type        text    DEFAULT 'text',
  ADD COLUMN reply_to_id uuid    REFERENCES chat_messages(id),
  ADD COLUMN edited_at   timestamptz,
  ADD COLUMN poll_id     uuid    REFERENCES chat_polls(id);
```

- [ ] **Step 2: Run RLS policies**

```sql
-- chat_reactions
ALTER TABLE chat_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members can select reactions"
  ON chat_reactions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM chat_members cm
    JOIN chat_messages msg ON msg.id = chat_reactions.message_id
    WHERE cm.channel_id = msg.channel_id AND cm.user_id = auth.uid()
  ));
CREATE POLICY "user inserts own reaction"
  ON chat_reactions FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "user deletes own reaction"
  ON chat_reactions FOR DELETE USING (user_id = auth.uid());

-- chat_polls
ALTER TABLE chat_polls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members can select polls"
  ON chat_polls FOR SELECT
  USING (EXISTS (SELECT 1 FROM chat_members WHERE channel_id = chat_polls.channel_id AND user_id = auth.uid()));
CREATE POLICY "members can insert polls"
  ON chat_polls FOR INSERT WITH CHECK (
    creator_id = auth.uid() AND
    EXISTS (SELECT 1 FROM chat_members WHERE channel_id = chat_polls.channel_id AND user_id = auth.uid())
  );
CREATE POLICY "creator or admin closes poll"
  ON chat_polls FOR UPDATE USING (
    creator_id = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR is_admin = true))
  );

-- chat_poll_options
ALTER TABLE chat_poll_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members can select options"
  ON chat_poll_options FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM chat_members cm
    JOIN chat_polls p ON p.id = chat_poll_options.poll_id
    WHERE cm.channel_id = p.channel_id AND cm.user_id = auth.uid()
  ));
CREATE POLICY "creator inserts options"
  ON chat_poll_options FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM chat_polls WHERE id = poll_id AND creator_id = auth.uid())
  );

-- chat_poll_votes
ALTER TABLE chat_poll_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members can select votes"
  ON chat_poll_votes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM chat_members cm
    JOIN chat_poll_options opt ON opt.id = chat_poll_votes.option_id
    JOIN chat_polls p ON p.id = opt.poll_id
    WHERE cm.channel_id = p.channel_id AND cm.user_id = auth.uid()
  ));
CREATE POLICY "user inserts own vote"
  ON chat_poll_votes FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "user deletes own vote"
  ON chat_poll_votes FOR DELETE USING (user_id = auth.uid());
```

- [ ] **Step 3: Verify tables exist**

In Supabase Table Editor, confirm these tables exist: `chat_reactions`, `chat_polls`, `chat_poll_options`, `chat_poll_votes`. Confirm `chat_messages` has columns: `type`, `reply_to_id`, `edited_at`, `poll_id`.

- [ ] **Step 4: Commit a note**

```bash
git commit --allow-empty -m "feat: apply chat phase 1 supabase migrations (manual)"
```

---

## Task 2: TypeScript Types

**Files:**
- Modify: `types/chat.ts`

- [ ] **Step 1: Replace `types/chat.ts` with updated version**

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd lso-app && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add types/chat.ts
git commit -m "feat: extend chat types for reactions, polls, reply, edit"
```

---

## Task 3: Update `useChatMessages` Hook

**Files:**
- Modify: `hooks/useChatMessages.ts`
- Modify: `__tests__/hooks/useChatMessages.test.ts`

- [ ] **Step 1: Update the failing test first**

Replace `__tests__/hooks/useChatMessages.test.ts`:

```typescript
import { renderHook, waitFor } from '@testing-library/react-native'
import { useChatMessages } from '../../hooks/useChatMessages'

const mockChannel = { on: jest.fn().mockReturnThis(), subscribe: jest.fn().mockReturnThis() }

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
    })),
    channel: jest.fn(() => mockChannel),
    removeChannel: jest.fn(),
  },
}))

describe('useChatMessages', () => {
  it('starts loading and resolves to empty array', async () => {
    const { result } = renderHook(() => useChatMessages('channel-123'))
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.messages).toEqual([])
  })

  it('subscribes to 3 realtime channels on mount', async () => {
    const { supabase } = require('../../lib/supabase')
    renderHook(() => useChatMessages('channel-abc'))
    await waitFor(() =>
      expect(supabase.channel).toHaveBeenCalledWith('chat-messages-channel-abc')
    )
    expect(supabase.channel).toHaveBeenCalledWith('chat-reactions-channel-abc')
    expect(supabase.channel).toHaveBeenCalledWith('chat-votes-channel-abc')
  })

  it('unsubscribes all channels on unmount', async () => {
    const { supabase } = require('../../lib/supabase')
    const { unmount } = renderHook(() => useChatMessages('channel-xyz'))
    unmount()
    expect(supabase.removeChannel).toHaveBeenCalledTimes(3)
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd lso-app && npx jest __tests__/hooks/useChatMessages.test.ts --no-coverage
```

Expected: FAIL — "subscribes to 3 realtime channels" fails because current hook only creates 1.

- [ ] **Step 3: Replace `hooks/useChatMessages.ts`**

```typescript
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
    setLoading(false)
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
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd lso-app && npx jest __tests__/hooks/useChatMessages.test.ts --no-coverage
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add hooks/useChatMessages.ts __tests__/hooks/useChatMessages.test.ts
git commit -m "feat: extend useChatMessages with reactions/votes subs and full select"
```

---

## Task 4: `useChatReactions` Hook

**Files:**
- Create: `hooks/useChatReactions.ts`
- Create: `__tests__/hooks/useChatReactions.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/hooks/useChatReactions.test.ts`:

```typescript
import { renderHook, act } from '@testing-library/react-native'
import { useChatReactions } from '../../hooks/useChatReactions'

const mockFrom = {
  insert: jest.fn().mockResolvedValue({ error: null }),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  match: jest.fn().mockResolvedValue({ error: null }),
}

jest.mock('../../lib/supabase', () => ({
  supabase: { from: jest.fn(() => mockFrom) },
}))

describe('useChatReactions', () => {
  const userId = 'user-1'

  beforeEach(() => jest.clearAllMocks())

  it('calls insert when user has not reacted with that emoji', async () => {
    const { result } = renderHook(() => useChatReactions(userId))
    await act(async () => {
      await result.current.toggleReaction('msg-1', '👍', [])
    })
    expect(mockFrom.insert).toHaveBeenCalledWith({
      message_id: 'msg-1', user_id: userId, emoji: '👍',
    })
  })

  it('calls delete when user already reacted with that emoji', async () => {
    const existing = [{ id: 'r-1', message_id: 'msg-1', user_id: userId, emoji: '👍', created_at: '' }]
    const { result } = renderHook(() => useChatReactions(userId))
    await act(async () => {
      await result.current.toggleReaction('msg-1', '👍', existing)
    })
    expect(mockFrom.delete).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to confirm fail**

```bash
cd lso-app && npx jest __tests__/hooks/useChatReactions.test.ts --no-coverage
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `hooks/useChatReactions.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd lso-app && npx jest __tests__/hooks/useChatReactions.test.ts --no-coverage
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add hooks/useChatReactions.ts __tests__/hooks/useChatReactions.test.ts
git commit -m "feat: add useChatReactions hook with toggle logic"
```

---

## Task 5: `useChatPolls` Hook

**Files:**
- Create: `hooks/useChatPolls.ts`
- Create: `__tests__/hooks/useChatPolls.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/hooks/useChatPolls.test.ts`:

```typescript
import { renderHook, act } from '@testing-library/react-native'
import { useChatPolls } from '../../hooks/useChatPolls'
import { ChatPoll } from '../../types/chat'

// All terminal operations use .match() — simplifies mock chaining
const mockFrom = {
  delete: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  insert: jest.fn().mockResolvedValue({ error: null }),
  match: jest.fn().mockResolvedValue({ error: null }),
}

jest.mock('../../lib/supabase', () => ({
  supabase: { from: jest.fn(() => mockFrom) },
}))

const basePoll: ChatPoll = {
  id: 'poll-1', channel_id: 'ch-1', creator_id: 'user-creator',
  question: 'Test?', allow_multiple: false, closed_at: null, created_at: '',
  options: [
    { id: 'opt-1', poll_id: 'poll-1', text: 'A', position: 0, votes: [] },
    { id: 'opt-2', poll_id: 'poll-1', text: 'B', position: 1, votes: [] },
  ],
}

describe('useChatPolls', () => {
  const userId = 'user-1'

  beforeEach(() => jest.clearAllMocks())

  it('single choice: deletes old vote by id then inserts new', async () => {
    const poll = {
      ...basePoll,
      options: [
        { ...basePoll.options[0], votes: [{ id: 'v-1', option_id: 'opt-1', user_id: userId }] },
        basePoll.options[1],
      ],
    }
    const { result } = renderHook(() => useChatPolls(userId))
    await act(async () => { await result.current.vote(poll, 'opt-2') })
    expect(mockFrom.delete).toHaveBeenCalled()
    expect(mockFrom.match).toHaveBeenCalledWith({ id: 'v-1', user_id: userId })
    expect(mockFrom.insert).toHaveBeenCalledWith({ option_id: 'opt-2', user_id: userId })
  })

  it('single choice: only inserts when no existing vote', async () => {
    const { result } = renderHook(() => useChatPolls(userId))
    await act(async () => { await result.current.vote(basePoll, 'opt-1') })
    expect(mockFrom.delete).not.toHaveBeenCalled()
    expect(mockFrom.insert).toHaveBeenCalledWith({ option_id: 'opt-1', user_id: userId })
  })

  it('multi choice: deletes when toggling off existing vote', async () => {
    const poll = {
      ...basePoll, allow_multiple: true,
      options: [
        { ...basePoll.options[0], votes: [{ id: 'v-1', option_id: 'opt-1', user_id: userId }] },
        basePoll.options[1],
      ],
    }
    const { result } = renderHook(() => useChatPolls(userId))
    await act(async () => { await result.current.vote(poll, 'opt-1') })
    expect(mockFrom.delete).toHaveBeenCalled()
    expect(mockFrom.insert).not.toHaveBeenCalled()
  })

  it('closePoll: updates closed_at via match', async () => {
    const { result } = renderHook(() => useChatPolls(userId))
    await act(async () => { await result.current.closePoll('poll-1') })
    expect(mockFrom.update).toHaveBeenCalledWith(expect.objectContaining({ closed_at: expect.any(String) }))
    expect(mockFrom.match).toHaveBeenCalledWith({ id: 'poll-1' })
  })
})
```

- [ ] **Step 2: Run to confirm fail**

```bash
cd lso-app && npx jest __tests__/hooks/useChatPolls.test.ts --no-coverage
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `hooks/useChatPolls.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd lso-app && npx jest __tests__/hooks/useChatPolls.test.ts --no-coverage
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add hooks/useChatPolls.ts __tests__/hooks/useChatPolls.test.ts
git commit -m "feat: add useChatPolls hook with single/multi vote and close logic"
```

---

## Task 6: `ReactionBar` Component

**Files:**
- Create: `components/chat/ReactionBar.tsx`

- [ ] **Step 1: Create `components/chat/ReactionBar.tsx`**

```typescript
import { StyleSheet, TouchableOpacity, View } from 'react-native'
import { Text } from 'react-native'

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const

interface Props {
  onSelect: (emoji: string) => void
}

export function ReactionBar({ onSelect }: Props) {
  return (
    <View style={styles.row}>
      {EMOJIS.map((emoji) => (
        <TouchableOpacity key={emoji} onPress={() => onSelect(emoji)} style={styles.btn}>
          <Text style={styles.emoji}>{emoji}</Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4 },
  btn: { padding: 6 },
  emoji: { fontSize: 24 },
})
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd lso-app && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/chat/ReactionBar.tsx
git commit -m "feat: add ReactionBar component with 6 fixed emoji"
```

---

## Task 7: `MessageActionSheet` Component

**Files:**
- Create: `components/chat/MessageActionSheet.tsx`

- [ ] **Step 1: Create `components/chat/MessageActionSheet.tsx`**

```typescript
import { Modal, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native'
import { useMemo } from 'react'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'
import { ReactionBar } from './ReactionBar'
import { ChatMessageWithSender } from '../../types/chat'

interface Props {
  visible: boolean
  message: ChatMessageWithSender | null
  currentUserId: string
  isAdmin: boolean
  onClose: () => void
  onReact: (emoji: string) => void
  onReply: () => void
  onEdit: () => void
  onDelete: () => void
}

export function MessageActionSheet({
  visible, message, currentUserId, isAdmin,
  onClose, onReact, onReply, onEdit, onDelete,
}: Props) {
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  if (!message) return null

  const isOwn = message.sender_id === currentUserId
  const canEdit = isOwn && message.type !== 'poll' && !message.deleted_at
  const canDelete = (isOwn || isAdmin) && !message.deleted_at

  const handleReact = (emoji: string) => {
    onReact(emoji)
    onClose()
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.sheet, { backgroundColor: c.surface }]}>
              <View style={[styles.emojiRow, { borderBottomColor: c.border }]}>
                <ReactionBar onSelect={handleReact} />
              </View>
              <TouchableOpacity style={styles.action} onPress={() => { onReply(); onClose() }}>
                <Text style={[styles.actionText, { color: c.text }]}>💬  Odpowiedz</Text>
              </TouchableOpacity>
              {canEdit && (
                <TouchableOpacity style={styles.action} onPress={() => { onEdit(); onClose() }}>
                  <Text style={[styles.actionText, { color: c.text }]}>✏️  Edytuj</Text>
                </TouchableOpacity>
              )}
              {canDelete && (
                <TouchableOpacity style={styles.action} onPress={() => { onDelete(); onClose() }}>
                  <Text style={[styles.actionText, { color: c.danger }]}>🗑️  Usuń</Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    overlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    sheet: {
      borderTopLeftRadius: 16, borderTopRightRadius: 16,
      paddingBottom: 32,
    },
    emojiRow: {
      padding: 12, paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      alignItems: 'center',
    },
    action: { paddingVertical: 14, paddingHorizontal: 20 },
    actionText: { fontSize: 16 },
  })
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd lso-app && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/chat/MessageActionSheet.tsx components/chat/ReactionBar.tsx
git commit -m "feat: add MessageActionSheet with emoji bar and action list"
```

---

## Task 8: `ReplyPreview` Component

**Files:**
- Create: `components/chat/ReplyPreview.tsx`

- [ ] **Step 1: Create `components/chat/ReplyPreview.tsx`**

```typescript
import { StyleSheet, Text, TouchableOpacity, View, useMemo } from 'react-native'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'
import { ChatMessageWithSender } from '../../types/chat'

interface Props {
  message: ChatMessageWithSender
  mode: 'reply' | 'edit'
  onCancel: () => void
}

export function ReplyPreview({ message, mode, onCancel }: Props) {
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  const label = mode === 'edit'
    ? 'Edytujesz'
    : `Odpowiadasz ${message.sender?.full_name ?? 'Ktoś'}`

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceElevated, borderTopColor: c.border }]}>
      <View style={[styles.bar, { backgroundColor: c.primary }]} />
      <View style={styles.content}>
        <Text style={[styles.name, { color: c.primary }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.preview, { color: c.subtext }]} numberOfLines={1}>
          {message.type === 'poll' ? '📊 Ankieta' : message.content}
        </Text>
      </View>
      <TouchableOpacity onPress={onCancel} style={styles.cancel}>
        <Text style={[styles.cancelText, { color: c.subtext }]}>✕</Text>
      </TouchableOpacity>
    </View>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: 6, paddingHorizontal: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      gap: 8,
    },
    bar: { width: 3, height: 32, borderRadius: 2 },
    content: { flex: 1 },
    name: { fontSize: 12, fontWeight: '600' },
    preview: { fontSize: 12 },
    cancel: { padding: 4 },
    cancelText: { fontSize: 18 },
  })
}
```

- [ ] **Step 2: Fix import** — `useMemo` is from `react`, not `react-native`. Open the file and fix:

```typescript
import { useMemo } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd lso-app && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add components/chat/ReplyPreview.tsx
git commit -m "feat: add ReplyPreview component"
```

---

## Task 9: `PollBubble` Component

**Files:**
- Create: `components/chat/PollBubble.tsx`

- [ ] **Step 1: Create `components/chat/PollBubble.tsx`**

```typescript
import { useMemo } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'
import { ChatPoll } from '../../types/chat'

interface Props {
  poll: ChatPoll
  currentUserId: string
  isOwn: boolean
  onVote: (optionId: string) => void
  onClose: () => void
}

export function PollBubble({ poll, currentUserId, isOwn, onVote, onClose }: Props) {
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  const totalVotes = poll.options.reduce((sum, o) => sum + o.votes.length, 0)
  const userVotedOptionIds = poll.options
    .filter((o) => o.votes.some((v) => v.user_id === currentUserId))
    .map((o) => o.id)
  const isClosed = !!poll.closed_at

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: c.primary }]}>📊 ANKIETA</Text>
      <Text style={[styles.question, { color: c.text }]}>{poll.question}</Text>
      {poll.options
        .sort((a, b) => a.position - b.position)
        .map((option) => {
          const pct = totalVotes > 0 ? Math.round((option.votes.length / totalVotes) * 100) : 0
          const voted = userVotedOptionIds.includes(option.id)
          return (
            <TouchableOpacity
              key={option.id}
              disabled={isClosed}
              onPress={() => onVote(option.id)}
              style={[
                styles.option,
                { backgroundColor: c.surface, borderColor: voted ? c.primary : c.border },
              ]}
            >
              <View style={[styles.fill, { width: `${pct}%` as any, backgroundColor: c.primaryAlpha12 }]} />
              <Text style={[styles.optionText, { color: c.text }]}>{option.text}</Text>
              <Text style={[styles.pct, { color: voted ? c.primary : c.subtext }]}>{pct}%</Text>
            </TouchableOpacity>
          )
        })}
      <Text style={[styles.meta, { color: c.subtext }]}>
        {totalVotes === 0 ? 'Brak głosów' : `${totalVotes} głosów`}
        {isClosed ? ' · zamknięta' : poll.allow_multiple ? ' · możesz wybrać kilka' : ''}
      </Text>
      {isOwn && !isClosed && (
        <TouchableOpacity onPress={onClose}>
          <Text style={[styles.closeBtn, { color: c.subtext }]}>Zamknij ankietę</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { gap: 6 },
    label: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
    question: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
    option: {
      borderWidth: 1, borderRadius: 8,
      padding: 8, paddingHorizontal: 10,
      flexDirection: 'row', alignItems: 'center',
      overflow: 'hidden', position: 'relative',
    },
    fill: { position: 'absolute', top: 0, left: 0, bottom: 0, borderRadius: 8 },
    optionText: { flex: 1, fontSize: 13 },
    pct: { fontSize: 12, fontWeight: '600' },
    meta: { fontSize: 11, marginTop: 2 },
    closeBtn: { fontSize: 12, marginTop: 2, textDecorationLine: 'underline' },
  })
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd lso-app && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/chat/PollBubble.tsx
git commit -m "feat: add PollBubble component with vote bars"
```

---

## Task 10: `CreatePollModal` Component

**Files:**
- Create: `components/chat/CreatePollModal.tsx`

- [ ] **Step 1: Create `components/chat/CreatePollModal.tsx`**

```typescript
import { useMemo, useState } from 'react'
import {
  Alert, Modal, ScrollView, StyleSheet, Switch,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'

interface Props {
  visible: boolean
  onClose: () => void
  onSubmit: (question: string, options: string[], allowMultiple: boolean) => Promise<void>
}

export function CreatePollModal({ visible, onClose, onSubmit }: Props) {
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [allowMultiple, setAllowMultiple] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const reset = () => {
    setQuestion('')
    setOptions(['', ''])
    setAllowMultiple(false)
  }

  const handleClose = () => { reset(); onClose() }

  const updateOption = (index: number, value: string) => {
    setOptions((prev) => prev.map((o, i) => (i === index ? value : o)))
  }

  const addOption = () => {
    if (options.length < 6) setOptions((prev) => [...prev, ''])
  }

  const removeOption = (index: number) => {
    if (options.length > 2) setOptions((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async () => {
    const trimmedQ = question.trim()
    const trimmedOpts = options.map((o) => o.trim()).filter(Boolean)
    if (!trimmedQ) { Alert.alert('Błąd', 'Wpisz pytanie.'); return }
    if (trimmedOpts.length < 2) { Alert.alert('Błąd', 'Dodaj co najmniej 2 opcje.'); return }
    setSubmitting(true)
    await onSubmit(trimmedQ, trimmedOpts, allowMultiple)
    setSubmitting(false)
    reset()
    onClose()
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: c.surface }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: c.text }]}>Nowa ankieta</Text>
            <TouchableOpacity onPress={handleClose}>
              <Text style={[styles.cancel, { color: c.subtext }]}>Anuluj</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={[styles.label, { color: c.subtext }]}>Pytanie</Text>
            <TextInput
              style={[styles.input, { color: c.text, backgroundColor: c.inputBg, borderColor: c.border }]}
              value={question}
              onChangeText={setQuestion}
              placeholder="Wpisz pytanie..."
              placeholderTextColor={c.subtext}
              maxLength={200}
            />
            <Text style={[styles.label, { color: c.subtext }]}>Opcje ({options.length}/6)</Text>
            {options.map((opt, i) => (
              <View key={i} style={styles.optionRow}>
                <TextInput
                  style={[styles.input, styles.optionInput, { color: c.text, backgroundColor: c.inputBg, borderColor: c.border }]}
                  value={opt}
                  onChangeText={(v) => updateOption(i, v)}
                  placeholder={`Opcja ${i + 1}`}
                  placeholderTextColor={c.subtext}
                  maxLength={100}
                />
                {options.length > 2 && (
                  <TouchableOpacity onPress={() => removeOption(i)} style={styles.removeBtn}>
                    <Text style={{ color: c.danger, fontSize: 18 }}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
            {options.length < 6 && (
              <TouchableOpacity onPress={addOption} style={styles.addBtn}>
                <Text style={[styles.addBtnText, { color: c.primary }]}>+ Dodaj opcję</Text>
              </TouchableOpacity>
            )}
            <View style={styles.toggleRow}>
              <Text style={[styles.toggleLabel, { color: c.text }]}>Wielokrotny wybór</Text>
              <Switch
                value={allowMultiple}
                onValueChange={setAllowMultiple}
                trackColor={{ true: c.primary }}
              />
            </View>
          </ScrollView>
          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: submitting ? c.border : c.primary }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            <Text style={styles.submitText}>Utwórz ankietę</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' },
    header: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      padding: 16, paddingBottom: 12,
    },
    title: { fontSize: 18, fontWeight: '700' },
    cancel: { fontSize: 15 },
    body: { padding: 16, gap: 8 },
    label: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
    input: {
      borderRadius: 10, borderWidth: 1,
      paddingHorizontal: 12, paddingVertical: 10,
      fontSize: 15,
    },
    optionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    optionInput: { flex: 1 },
    removeBtn: { padding: 4 },
    addBtn: { paddingVertical: 8 },
    addBtnText: { fontSize: 14, fontWeight: '600' },
    toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
    toggleLabel: { fontSize: 15 },
    submitBtn: { margin: 16, borderRadius: 12, padding: 14, alignItems: 'center' },
    submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  })
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd lso-app && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/chat/CreatePollModal.tsx
git commit -m "feat: add CreatePollModal component"
```

---

## Task 11: `MessageBubble` Component

**Files:**
- Create: `components/chat/MessageBubble.tsx`

- [ ] **Step 1: Create `components/chat/MessageBubble.tsx`**

```typescript
import { useMemo } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'
import { ChatMessageWithSender, ChatPoll, ChatReaction } from '../../types/chat'
import { PollBubble } from './PollBubble'

interface Props {
  item: ChatMessageWithSender
  currentUserId: string
  isAdmin: boolean
  showSender: boolean
  onLongPress: (message: ChatMessageWithSender) => void
  onReactionPress: (messageId: string, emoji: string, reactions: ChatReaction[]) => void
  onVote: (poll: ChatPoll, optionId: string) => void
  onClosePoll: (pollId: string) => void
}

export function MessageBubble({
  item, currentUserId, isAdmin, showSender,
  onLongPress, onReactionPress, onVote, onClosePoll,
}: Props) {
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  const isOwn = item.sender_id === currentUserId

  // Group reactions by emoji
  const reactionGroups = item.reactions.reduce<Record<string, ChatReaction[]>>((acc, r) => {
    acc[r.emoji] = acc[r.emoji] ?? []
    acc[r.emoji].push(r)
    return acc
  }, {})

  if (item.deleted_at) {
    return (
      <View style={[styles.row, isOwn ? styles.rowRight : styles.rowLeft]}>
        <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
          <Text style={styles.deletedText}>Wiadomość usunięta</Text>
        </View>
      </View>
    )
  }

  return (
    <TouchableOpacity
      style={[styles.row, isOwn ? styles.rowRight : styles.rowLeft]}
      onLongPress={() => onLongPress(item)}
      activeOpacity={0.85}
    >
      <View style={{ flexDirection: 'column', alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
        {showSender && (
          <Text style={styles.senderName}>{item.sender?.full_name}</Text>
        )}
        {item.reply_to && (
          <View style={[styles.quote, { borderLeftColor: c.primary, backgroundColor: c.primaryAlpha08 }]}>
            <Text style={[styles.quoteName, { color: c.primary }]} numberOfLines={1}>
              {item.reply_to.sender?.full_name ?? 'Ktoś'}
            </Text>
            <Text style={[styles.quoteText, { color: c.subtext }]} numberOfLines={1}>
              {item.reply_to.deleted_at ? 'Wiadomość usunięta' : item.reply_to.content}
            </Text>
          </View>
        )}
        <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
          {item.type === 'poll' && item.poll ? (
            <PollBubble
              poll={item.poll}
              currentUserId={currentUserId}
              isOwn={isOwn}
              onVote={(optionId) => onVote(item.poll!, optionId)}
              onClose={() => onClosePoll(item.poll!.id)}
            />
          ) : (
            <Text style={[styles.messageText, isOwn && styles.messageTextOwn]}>
              {item.content}
            </Text>
          )}
          <Text style={[styles.messageTime, isOwn && styles.messageTimeOwn]}>
            {new Date(item.created_at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
            {item.edited_at ? ' · edytowano' : ''}
          </Text>
        </View>
        {Object.keys(reactionGroups).length > 0 && (
          <View style={styles.reactionsRow}>
            {Object.entries(reactionGroups).map(([emoji, reactions]) => {
              const iMine = reactions.some((r) => r.user_id === currentUserId)
              return (
                <TouchableOpacity
                  key={emoji}
                  style={[
                    styles.reactionChip,
                    { backgroundColor: c.surface, borderColor: iMine ? c.primary : c.border },
                  ]}
                  onPress={() => onReactionPress(item.id, emoji, item.reactions)}
                >
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                  <Text style={[styles.reactionCount, { color: iMine ? c.primary : c.subtext }]}>
                    {reactions.length}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        )}
      </View>
    </TouchableOpacity>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    row: { marginVertical: 2 },
    rowRight: { alignItems: 'flex-end' },
    rowLeft: { alignItems: 'flex-start' },
    senderName: { fontSize: 11, color: c.subtext, marginBottom: 2, marginLeft: 4 },
    quote: {
      borderLeftWidth: 3, borderRadius: 6,
      paddingVertical: 3, paddingHorizontal: 8,
      marginBottom: 3, maxWidth: '92%',
    },
    quoteName: { fontSize: 11, fontWeight: '600' },
    quoteText: { fontSize: 11 },
    bubble: { maxWidth: '92%', borderRadius: 16, padding: 10, paddingHorizontal: 14 },
    bubbleOwn: { backgroundColor: c.primary, borderBottomRightRadius: 4 },
    bubbleOther: { backgroundColor: c.surface, borderBottomLeftRadius: 4 },
    messageText: { fontSize: 15, color: c.text, lineHeight: 20 },
    messageTextOwn: { color: '#fff' },
    deletedText: { fontSize: 13, color: c.subtext, fontStyle: 'italic' },
    messageTime: { fontSize: 10, color: c.subtext, alignSelf: 'flex-end', marginTop: 4 },
    messageTimeOwn: { color: 'rgba(255,255,255,0.7)' },
    reactionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3, marginHorizontal: 4 },
    reactionChip: {
      flexDirection: 'row', alignItems: 'center', gap: 3,
      borderRadius: 12, borderWidth: 1,
      paddingVertical: 2, paddingHorizontal: 7,
    },
    reactionEmoji: { fontSize: 13 },
    reactionCount: { fontSize: 12 },
  })
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd lso-app && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/chat/MessageBubble.tsx
git commit -m "feat: add MessageBubble component with reactions, reply quote, poll support"
```

---

## Task 12: Update `[channelId].tsx` — Wire Everything Together

**Files:**
- Modify: `app/chat/[channelId].tsx`

- [ ] **Step 1: Replace `app/chat/[channelId].tsx`**

```typescript
// app/chat/[channelId].tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert, FlatList, KeyboardAvoidingView, Platform,
  StyleSheet, Text, TextInput, TouchableOpacity, View, ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useNavigation } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'
import { useChatMessages } from '../../hooks/useChatMessages'
import { useChatReactions } from '../../hooks/useChatReactions'
import { useChatPolls } from '../../hooks/useChatPolls'
import { ChatChannel, ChatMessageWithSender, ChatPoll, ChatReaction } from '../../types/chat'
import { MessageBubble } from '../../components/chat/MessageBubble'
import { MessageActionSheet } from '../../components/chat/MessageActionSheet'
import { ReplyPreview } from '../../components/chat/ReplyPreview'
import { CreatePollModal } from '../../components/chat/CreatePollModal'

export default function ChannelScreen() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>()
  const navigation = useNavigation()
  const { profile } = useAuthStore()
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  const [channel, setChannel] = useState<ChatChannel | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [actionSheetMessage, setActionSheetMessage] = useState<ChatMessageWithSender | null>(null)
  const [replyTo, setReplyTo] = useState<ChatMessageWithSender | null>(null)
  const [editingMessage, setEditingMessage] = useState<ChatMessageWithSender | null>(null)
  const [showPollModal, setShowPollModal] = useState(false)

  const { messages, loading } = useChatMessages(channelId)
  const { toggleReaction } = useChatReactions(profile?.id ?? '')
  const { vote, closePoll } = useChatPolls(profile?.id ?? '')

  const isAdmin = profile?.role === 'admin' || !!profile?.is_admin

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase
        .from('chat_channels').select('*').eq('id', channelId).single()
      if (data) setChannel(data)
    }
    if (channelId) init()
  }, [channelId])

  useEffect(() => {
    if (channel) {
      navigation.setOptions({
        title: channel.type === 'group' ? `#${channel.name}` : (channel.name ?? 'Wiadomości'),
      })
    }
  }, [channel, navigation])

  const markRead = useCallback(async () => {
    if (!profile?.id || !channelId) return
    await supabase.from('chat_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('channel_id', channelId).eq('user_id', profile.id)
  }, [channelId, profile?.id])

  useEffect(() => { markRead() }, [markRead])
  useEffect(() => { if (messages.length > 0) markRead() }, [messages[0]?.id, markRead])

  const handleSend = async () => {
    if (!text.trim() || !profile?.id || sending) return
    const content = text.trim()

    if (editingMessage) {
      setText('')
      setEditingMessage(null)
      const { error } = await supabase.from('chat_messages')
        .update({ content, edited_at: new Date().toISOString() })
        .eq('id', editingMessage.id).eq('sender_id', profile.id)
      if (error) Alert.alert('Błąd', 'Nie udało się edytować wiadomości.')
      return
    }

    setText('')
    setSending(true)
    const { error } = await supabase.from('chat_messages').insert({
      channel_id: channelId,
      sender_id: profile.id,
      content,
      type: 'text',
      reply_to_id: replyTo?.id ?? null,
    })
    setReplyTo(null)
    if (error) {
      setText(content)
      Alert.alert('Błąd', 'Nie udało się wysłać wiadomości.')
    }
    setSending(false)
  }

  const handleDelete = async (message: ChatMessageWithSender) => {
    Alert.alert('Usuń wiadomość', 'Tej operacji nie można cofnąć.', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń', style: 'destructive',
        onPress: () =>
          supabase.from('chat_messages')
            .update({ deleted_at: new Date().toISOString() }).eq('id', message.id),
      },
    ])
  }

  const handleCreatePoll = async (question: string, options: string[], allowMultiple: boolean) => {
    if (!profile?.id) return
    const { data: poll, error: pollError } = await supabase
      .from('chat_polls')
      .insert({ channel_id: channelId, creator_id: profile.id, question, allow_multiple: allowMultiple })
      .select().single()
    if (pollError || !poll) { Alert.alert('Błąd', 'Nie udało się utworzyć ankiety.'); return }

    await Promise.all(
      options.map((text, position) =>
        supabase.from('chat_poll_options').insert({ poll_id: poll.id, text, position })
      )
    )

    await supabase.from('chat_messages').insert({
      channel_id: channelId,
      sender_id: profile.id,
      content: question,
      type: 'poll',
      poll_id: poll.id,
    })
  }

  const handleReaction = async (messageId: string, emoji: string, reactions: ChatReaction[]) => {
    const { error } = (await toggleReaction(messageId, emoji, reactions)) ?? {}
    if (error) Alert.alert('Błąd', 'Nie udało się dodać reakcji.')
  }

  // Web: Enter sends, Shift+Enter = new line
  const handleKeyPress = (e: any) => {
    if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
      e.preventDefault?.()
      handleSend()
    }
  }

  const insertNewline = () => setText((t) => t + '\n')

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={c.primary} />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        inverted
        contentContainerStyle={{ padding: 12, gap: 4 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Brak wiadomości. Napisz pierwszą!</Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const prevItem = messages[index + 1]
          const showSender = item.sender_id !== profile?.id &&
            (!prevItem || prevItem.sender_id !== item.sender_id)
          return (
            <MessageBubble
              item={item}
              currentUserId={profile?.id ?? ''}
              isAdmin={isAdmin}
              showSender={showSender}
              onLongPress={setActionSheetMessage}
              onReactionPress={handleReaction}
              onVote={async (poll: ChatPoll, optionId: string) => {
                await vote(poll, optionId)
              }}
              onClosePoll={closePoll}
            />
          )
        }}
      />

      {(replyTo || editingMessage) && (
        <ReplyPreview
          message={(replyTo ?? editingMessage)!}
          mode={editingMessage ? 'edit' : 'reply'}
          onCancel={() => { setReplyTo(null); setEditingMessage(null); setText('') }}
        />
      )}

      <View style={[styles.inputRow, { borderTopColor: c.border }]}>
        <TextInput
          style={[styles.input, { color: c.text, backgroundColor: c.surface, borderColor: c.border }]}
          value={text}
          onChangeText={setText}
          placeholder={editingMessage ? 'Edytuj wiadomość...' : 'Napisz wiadomość...'}
          placeholderTextColor={c.subtext}
          multiline
          maxLength={1000}
          returnKeyType="send"
          blurOnSubmit={false}
          onSubmitEditing={Platform.OS !== 'web' ? handleSend : undefined}
          onKeyPress={Platform.OS === 'web' ? handleKeyPress : undefined}
        />
        {Platform.OS !== 'web' && (
          <TouchableOpacity style={[styles.newlineBtn, { borderColor: c.border }]} onPress={insertNewline}>
            <Text style={{ color: c.subtext, fontSize: 14 }}>⏎</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.pollBtn, { borderColor: c.border }]}
          onPress={() => setShowPollModal(true)}
        >
          <Text style={{ fontSize: 18 }}>📊</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: text.trim() ? c.primary : c.border }]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
        >
          <Ionicons name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      <MessageActionSheet
        visible={!!actionSheetMessage}
        message={actionSheetMessage}
        currentUserId={profile?.id ?? ''}
        isAdmin={isAdmin}
        onClose={() => setActionSheetMessage(null)}
        onReact={(emoji) => {
          if (actionSheetMessage)
            handleReaction(actionSheetMessage.id, emoji, actionSheetMessage.reactions)
        }}
        onReply={() => {
          setReplyTo(actionSheetMessage)
          setEditingMessage(null)
        }}
        onEdit={() => {
          setEditingMessage(actionSheetMessage)
          setText(actionSheetMessage?.content ?? '')
          setReplyTo(null)
        }}
        onDelete={() => { if (actionSheetMessage) handleDelete(actionSheetMessage) }}
      />

      <CreatePollModal
        visible={showPollModal}
        onClose={() => setShowPollModal(false)}
        onSubmit={handleCreatePoll}
      />
    </KeyboardAvoidingView>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    center: { justifyContent: 'center', alignItems: 'center' },
    empty: { alignItems: 'center', padding: 40 },
    emptyText: { color: c.subtext, fontSize: 14, textAlign: 'center' },
    inputRow: {
      flexDirection: 'row', alignItems: 'flex-end',
      padding: 8, paddingHorizontal: 12,
      borderTopWidth: StyleSheet.hairlineWidth, gap: 8,
    },
    input: {
      flex: 1, borderRadius: 20, borderWidth: 1,
      paddingHorizontal: 14, paddingVertical: 8,
      fontSize: 15, maxHeight: 100, minHeight: 40,
    },
    newlineBtn: {
      width: 36, height: 36, borderRadius: 18, borderWidth: 1,
      justifyContent: 'center', alignItems: 'center',
    },
    pollBtn: {
      width: 36, height: 36, borderRadius: 18, borderWidth: 1,
      justifyContent: 'center', alignItems: 'center',
    },
    sendBtn: {
      width: 40, height: 40, borderRadius: 20,
      justifyContent: 'center', alignItems: 'center',
    },
  })
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd lso-app && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run all tests**

```bash
cd lso-app && npx jest --no-coverage
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add app/chat/[channelId].tsx
git commit -m "feat: wire MessageBubble, reactions, reply, edit, polls into ChannelScreen"
```

---

## Task 13: Manual QA Checklist

- [ ] Start the app: `cd lso-app && npx expo start`

- [ ] **Enter/Send — Mobile:** Open chat. Type a message. Press the keyboard's Send/Return key → message sends. Press ⏎ button → new line added without sending.

- [ ] **Enter/Send — Web:** Open `http://localhost:8081` (or expo web URL). Type in chat. Press Enter → sends. Press Shift+Enter → new line.

- [ ] **Reactions:** Long-press any message → action sheet appears with emoji bar. Tap 👍 → reaction chip appears below message. Long-press again → tap 👍 again → chip disappears.

- [ ] **Reply:** Long-press a message → Odpowiedz → reply preview bar appears above input. Type and send → new message shows the quoted bubble above it. Tap ✕ on preview → cancels reply.

- [ ] **Edit:** Long-press your own message → Edytuj → input prefilled with text. Edit and send → message updated, shows "edytowano". Long-press another user's message → Edytuj not shown.

- [ ] **Delete:** Long-press a message → Usuń → confirm → message shows "Wiadomość usunięta".

- [ ] **Create poll:** Tap 📊 → modal opens. Enter question + 2 options → Utwórz → poll appears in chat. Tap an option → vote registered, bar updates.

- [ ] **Close poll:** As creator, tap "Zamknij ankietę" → options become disabled.

- [ ] **Commit final QA note**

```bash
git commit --allow-empty -m "feat: chat phase 1 — manual QA passed"
```
