# Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate re-render thrashing in list screens and N+1 Supabase queries on the chat channel list to make the app noticeably smoother on Android and web.

**Architecture:** Three independent changes — (1) SQL RPC replaces N+1 chat channel queries, (2) new `ChannelRow` and `MemberRow` components wrapped in `React.memo` replace inline `renderItem` JSX, (3) `MessageBubble` and `AvatarImage` are memoized and all inline style object literals in FlatList props are moved to `StyleSheet`/`useMemo`.

**Tech Stack:** React Native / Expo (React.memo, useCallback, useMemo), Supabase RPC (PostgreSQL LATERAL JOIN), TypeScript, Jest + @testing-library/react-native

---

## File Map

| File | Action |
|------|--------|
| `supabase/migrations/20260610_chat_channels_meta_rpc.sql` | **Create** — SQL function replacing N+1 |
| `types/chat.ts` | **Modify** — add `ChatChannelListItem` type |
| `components/chat/ChannelRow.tsx` | **Create** — memoized channel list row |
| `components/MemberRow.tsx` | **Create** — memoized member list row |
| `components/AvatarImage.tsx` | **Modify** — wrap in `React.memo` |
| `components/chat/MessageBubble.tsx` | **Modify** — wrap in `React.memo` with custom equality |
| `app/(tabs)/chat.tsx` | **Modify** — RPC fetch, use ChannelRow, fix styles |
| `app/chat/[channelId].tsx` | **Modify** — useCallback on renderItem/handlers, fix inline styles |
| `app/(admin)/(admin-tabs)/members.tsx` | **Modify** — use MemberRow, fix inline styles |
| `app/(admin)/members.tsx` | **Modify** — use MemberRow, fix inline styles |
| `app/(tabs)/index.tsx` | **Modify** — fix inline contentContainerStyle |
| `app/(tabs)/schedule.tsx` | **Modify** — fix inline contentContainerStyle |
| `__tests__/components/ChannelRow.test.tsx` | **Create** — render + behaviour tests |
| `__tests__/components/MemberRow.test.tsx` | **Create** — render tests |

---

## Task 1: SQL migration — `get_chat_channels_with_meta` RPC

**Files:**
- Create: `supabase/migrations/20260610_chat_channels_meta_rpc.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260610_chat_channels_meta_rpc.sql
CREATE OR REPLACE FUNCTION get_chat_channels_with_meta()
RETURNS TABLE (
  id                   uuid,
  parish_id            uuid,
  type                 text,
  name                 text,
  slug                 text,
  created_at           timestamptz,
  last_message_content text,
  last_message_at      timestamptz,
  last_message_type    text,
  unread_count         bigint
)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    cc.id,
    cc.parish_id,
    cc.type,
    cc.name,
    cc.slug,
    cc.created_at,
    last_msg.content       AS last_message_content,
    last_msg.created_at    AS last_message_at,
    last_msg.type          AS last_message_type,
    (
      SELECT COUNT(*)
      FROM chat_messages m
      WHERE m.channel_id = cc.id
        AND m.created_at > COALESCE(cm.last_read_at, '1970-01-01'::timestamptz)
        AND m.deleted_at IS NULL
        AND m.sender_id != auth.uid()
    ) AS unread_count
  FROM chat_channels cc
  JOIN chat_members cm
    ON cm.channel_id = cc.id AND cm.user_id = auth.uid()
  LEFT JOIN LATERAL (
    SELECT m.content, m.created_at, m.type
    FROM chat_messages m
    WHERE m.channel_id = cc.id AND m.deleted_at IS NULL
    ORDER BY m.created_at DESC
    LIMIT 1
  ) last_msg ON true
  ORDER BY COALESCE(last_msg.created_at, cc.created_at) DESC;
$$;
```

- [ ] **Step 2: Run migration in Supabase Dashboard**

Open Supabase Dashboard → SQL Editor → paste the file contents → Run.
Verify: no errors, function appears in Database → Functions.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260610_chat_channels_meta_rpc.sql
git commit -m "feat: add get_chat_channels_with_meta RPC to replace N+1 channel queries"
```

---

## Task 2: Add `ChatChannelListItem` type

**Files:**
- Modify: `types/chat.ts`

- [ ] **Step 1: Add the type at the bottom of `types/chat.ts`**

Open `types/chat.ts`. After the existing `ChatChannelWithMeta` interface, append:

```ts
export interface ChatChannelListItem {
  id: string
  parish_id: string
  type: ChatChannelType
  name: string | null
  slug: string | null
  created_at: string
  last_message_content: string | null
  last_message_at: string | null
  last_message_type: 'text' | 'poll' | null
  unread_count: number
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no new errors (existing errors are OK, only new ones matter).

- [ ] **Step 3: Commit**

```bash
git add types/chat.ts
git commit -m "feat: add ChatChannelListItem type for flat RPC channel response"
```

---

## Task 3: Create `ChannelRow` component

**Files:**
- Create: `components/chat/ChannelRow.tsx`
- Create: `__tests__/components/ChannelRow.test.tsx`

- [ ] **Step 1: Write the failing test first**

Create `__tests__/components/ChannelRow.test.tsx`:

```tsx
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'

jest.mock('../../lib/ThemeContext', () => ({
  useTheme: () => ({
    colors: require('../../lib/theme').lightColors,
    isDark: false,
    scheme: 'light',
  }),
}))

// Required after mocks
const { ChannelRow } = require('../../components/chat/ChannelRow')

const baseChannel = {
  id: 'ch1',
  parish_id: 'p1',
  type: 'group' as const,
  name: 'Ministranci',
  slug: 'ministranci',
  created_at: '2026-01-01T00:00:00Z',
  last_message_content: 'Cześć wszystkim',
  last_message_at: '2026-01-01T10:30:00Z',
  last_message_type: 'text' as const,
  unread_count: 0,
}

describe('ChannelRow', () => {
  it('renders group channel name with # prefix', () => {
    const { getByText } = render(<ChannelRow item={baseChannel} onPress={jest.fn()} />)
    expect(getByText('#Ministranci')).toBeTruthy()
  })

  it('renders last message content', () => {
    const { getByText } = render(<ChannelRow item={baseChannel} onPress={jest.fn()} />)
    expect(getByText('Cześć wszystkim')).toBeTruthy()
  })

  it('shows unread badge when unread_count > 0', () => {
    const { getByText } = render(
      <ChannelRow item={{ ...baseChannel, unread_count: 5 }} onPress={jest.fn()} />
    )
    expect(getByText('5')).toBeTruthy()
  })

  it('shows 99+ when unread_count > 99', () => {
    const { getByText } = render(
      <ChannelRow item={{ ...baseChannel, unread_count: 150 }} onPress={jest.fn()} />
    )
    expect(getByText('99+')).toBeTruthy()
  })

  it('shows poll indicator for poll type messages', () => {
    const pollChannel = {
      ...baseChannel,
      last_message_content: 'Kiedy msza?',
      last_message_type: 'poll' as const,
    }
    const { getByText } = render(<ChannelRow item={pollChannel} onPress={jest.fn()} />)
    expect(getByText('📊 Ankieta')).toBeTruthy()
  })

  it('shows placeholder when no last message', () => {
    const emptyChannel = { ...baseChannel, last_message_content: null, last_message_at: null }
    const { getByText } = render(<ChannelRow item={emptyChannel} onPress={jest.fn()} />)
    expect(getByText('Brak wiadomości')).toBeTruthy()
  })

  it('calls onPress when tapped', () => {
    const onPress = jest.fn()
    const { getByText } = render(<ChannelRow item={baseChannel} onPress={onPress} />)
    fireEvent.press(getByText('#Ministranci'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx jest __tests__/components/ChannelRow.test.tsx --no-coverage
```
Expected: FAIL — "Cannot find module '../../components/chat/ChannelRow'"

- [ ] **Step 3: Create `components/chat/ChannelRow.tsx`**

```tsx
import { memo, useMemo } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'
import { ChatChannelListItem } from '../../types/chat'

interface Props {
  item: ChatChannelListItem
  onPress: () => void
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })
}

function ChannelRowComponent({ item, onPress }: Props) {
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  const preview = item.last_message_content === null
    ? 'Brak wiadomości'
    : item.last_message_type === 'poll'
      ? '📊 Ankieta'
      : item.last_message_content

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.avatar}>
        <Ionicons
          name={item.type === 'group' ? 'people' : 'person'}
          size={22}
          color={c.primary}
        />
      </View>
      <View style={styles.rowContent}>
        <View style={styles.rowTop}>
          <Text style={styles.channelName} numberOfLines={1}>
            {item.type === 'group' ? `#${item.name}` : item.name}
          </Text>
          {item.last_message_at && (
            <Text style={styles.time}>{formatTime(item.last_message_at)}</Text>
          )}
        </View>
        <View style={styles.rowBottom}>
          <Text
            style={[styles.preview, item.unread_count > 0 && styles.previewUnread]}
            numberOfLines={1}
          >
            {preview}
          </Text>
          {item.unread_count > 0 && (
            <View style={[styles.badge, { backgroundColor: c.primary }]}>
              <Text style={styles.badgeText}>
                {item.unread_count > 99 ? '99+' : item.unread_count}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  )
}

export const ChannelRow = memo(ChannelRowComponent)

function createStyles(c: Colors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: c.surface, borderRadius: 12,
      padding: 12, gap: 12,
    },
    avatar: {
      width: 44, height: 44, borderRadius: 22,
      backgroundColor: c.primary + '18',
      justifyContent: 'center', alignItems: 'center',
    },
    rowContent: { flex: 1 },
    rowTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
    channelName: { fontSize: 15, fontWeight: '600', color: c.text, flex: 1 },
    time: { fontSize: 12, color: c.subtext, marginLeft: 8 },
    rowBottom: { flexDirection: 'row', alignItems: 'center' },
    preview: { fontSize: 13, color: c.subtext, flex: 1 },
    previewUnread: { color: c.text, fontWeight: '500' },
    badge: {
      borderRadius: 10, minWidth: 20, height: 20,
      justifyContent: 'center', alignItems: 'center',
      paddingHorizontal: 5, marginLeft: 8,
    },
    badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  })
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx jest __tests__/components/ChannelRow.test.tsx --no-coverage
```
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add components/chat/ChannelRow.tsx __tests__/components/ChannelRow.test.tsx
git commit -m "feat: add memoized ChannelRow component for chat channel list"
```

---

## Task 4: Update `app/(tabs)/chat.tsx` — RPC fetch + ChannelRow + style fixes

**Files:**
- Modify: `app/(tabs)/chat.tsx`

Note: `app/(parent)/(parent-tabs)/chat.tsx` is `export { default } from '../../(tabs)/chat'` — fixing `(tabs)/chat.tsx` automatically fixes the parent view.

- [ ] **Step 1: Replace the imports section at the top of `app/(tabs)/chat.tsx`**

Replace lines 1–16:
```tsx
// app/(tabs)/chat.tsx
import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator, FlatList, RefreshControl,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter, useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'
import { ChatChannelListItem, ChatMessageWithSender } from '../../types/chat'
import { useRealtimeTable } from '../../hooks/useRealtimeTable'
import { shadow } from '../../lib/shadows'
import { ChannelRow } from '../../components/chat/ChannelRow'
```

- [ ] **Step 2: Replace `ChatScreen` component (lines 17–233)**

Replace the entire component function with:

```tsx
export default function ChatScreen() {
  const router = useRouter()
  const { profile, parish } = useAuthStore()
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  const [channels, setChannels] = useState<ChatChannelListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchChannels = useCallback(async (showLoading = false) => {
    if (!profile?.id) return
    if (showLoading) setLoading(true)

    const { data, error } = await supabase.rpc('get_chat_channels_with_meta')

    if (error || !data) {
      setLoading(false)
      setRefreshing(false)
      return
    }

    setChannels(
      (data as any[]).map((row) => ({
        id: row.id as string,
        parish_id: row.parish_id as string,
        type: row.type as 'group' | 'dm',
        name: row.name as string | null,
        slug: row.slug as string | null,
        created_at: row.created_at as string,
        last_message_content: row.last_message_content as string | null,
        last_message_at: row.last_message_at as string | null,
        last_message_type: (row.last_message_type as 'text' | 'poll' | null) ?? null,
        unread_count: Number(row.unread_count ?? 0),
      }))
    )
    setLoading(false)
    setRefreshing(false)
  }, [profile?.id])

  useFocusEffect(
    useCallback(() => {
      fetchChannels(channels.length === 0)
    }, [fetchChannels])
  )

  useRealtimeTable<ChatMessageWithSender>('chat_messages', (payload) => {
    const { eventType, new: newMsg } = payload

    if (eventType === 'INSERT') {
      setChannels(prev => {
        const channelIndex = prev.findIndex(ch => ch.id === newMsg.channel_id)

        if (channelIndex === -1) {
          fetchChannels(false)
          return prev
        }

        const updated = [...prev]
        const target = updated[channelIndex]
        const isMyMessage = newMsg.sender_id === profile?.id

        updated[channelIndex] = {
          ...target,
          last_message_content: newMsg.content,
          last_message_at: newMsg.created_at,
          last_message_type: (newMsg.type as 'text' | 'poll') ?? 'text',
          unread_count: isMyMessage ? target.unread_count : target.unread_count + 1,
        }

        return updated.sort((a, b) => {
          const at = a.last_message_at ?? a.created_at
          const bt = b.last_message_at ?? b.created_at
          return bt.localeCompare(at)
        })
      })
    }
  })

  const onRefresh = () => { setRefreshing(true); fetchChannels(false) }

  const canCreateDm =
    profile?.role === 'admin' || profile?.is_admin ||
    (parish?.allow_member_dm === true && (profile?.role === 'member' || profile?.role === 'parent'))

  const renderItem = useCallback(({ item }: { item: ChatChannelListItem }) => (
    <ChannelRow
      item={item}
      onPress={() => router.push(`/chat/${item.id}` as any)}
    />
  ), [router])

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={c.primary} size="large" />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={channels}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="chatbubbles-outline" size={48} color={c.subtext} />
            <Text style={styles.emptyText}>Brak kanałów</Text>
          </View>
        }
        renderItem={renderItem}
      />
      {canCreateDm && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: c.primary }]}
          onPress={() => router.push('/chat/new-dm')}
        >
          <Ionicons name="create-outline" size={24} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  )
}
```

- [ ] **Step 3: Add `listContent` to `createStyles` at bottom of file**

In the `createStyles` function, add after `fab`:
```ts
listContent: { padding: 16, gap: 4 },
```

- [ ] **Step 4: Run TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add app/(tabs)/chat.tsx
git commit -m "perf: replace N+1 channel queries with RPC, extract ChannelRow, fix inline styles"
```

---

## Task 5: Wrap `AvatarImage` in `React.memo`

**Files:**
- Modify: `components/AvatarImage.tsx`

- [ ] **Step 1: Update the import and wrap the export**

In `components/AvatarImage.tsx`, change line 1:
```tsx
import { memo } from 'react'
import { View, Image } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { parsePresetUrl } from '../lib/presetAvatar'
import { useTheme } from '../lib/ThemeContext'
```

Change the function declaration from:
```tsx
export function AvatarImage({
```
to:
```tsx
function AvatarImageComponent({
```

Add at the very end of the file after the closing `}`:
```tsx
export const AvatarImage = memo(AvatarImageComponent)
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no new errors (all existing imports of `AvatarImage` still resolve to the named export).

- [ ] **Step 3: Commit**

```bash
git add components/AvatarImage.tsx
git commit -m "perf: memoize AvatarImage to prevent re-renders in lists"
```

---

## Task 6: Wrap `MessageBubble` in `React.memo` with custom equality

**Files:**
- Modify: `components/chat/MessageBubble.tsx`

The custom equality function skips re-renders when only handler function references changed. A bubble must re-render only when its message data (content, reactions, edit/delete status) actually changed.

- [ ] **Step 1: Update the import line**

Change line 1 from:
```tsx
import { useMemo, useState } from 'react'
```
to:
```tsx
import { memo, useMemo, useState } from 'react'
```

- [ ] **Step 2: Rename the function and add `memo` export at the bottom**

Change the function declaration from:
```tsx
export function MessageBubble({
```
to:
```tsx
function MessageBubbleComponent({
```

Add after the closing `}` of `MessageBubbleComponent` (before the `createStyles` function):
```tsx
function arePropsEqual(prev: Props, next: Props): boolean {
  return (
    prev.item.id === next.item.id &&
    prev.item.content === next.item.content &&
    prev.item.edited_at === next.item.edited_at &&
    prev.item.deleted_at === next.item.deleted_at &&
    prev.item.reactions === next.item.reactions &&
    prev.item.poll === next.item.poll &&
    prev.showSender === next.showSender &&
    prev.currentUserId === next.currentUserId &&
    prev.isAdmin === next.isAdmin
  )
}

export const MessageBubble = memo(MessageBubbleComponent, arePropsEqual)
```

- [ ] **Step 3: Fix inline style object literals inside `MessageBubble`**

There are two inline style objects created on every render. Move them into `createStyles`.

In the component body, change:
```tsx
const messageContent = (
  <View style={{ flexDirection: 'column', alignItems: isOwn ? 'flex-end' : 'flex-start', maxWidth: '92%' }}>
```
to:
```tsx
const messageContent = (
  <View style={isOwn ? styles.messageContentWrapperOwn : styles.messageContentWrapper}>
```

In the `quote` View, change:
```tsx
style={[styles.quote, { borderLeftColor: c.primary, backgroundColor: c.primaryAlpha08 }]}
```
to:
```tsx
style={[styles.quote, styles.quoteAccent]}
```

In `createStyles`, add these three keys (they depend on theme so they belong there):
```ts
messageContentWrapper: { flexDirection: 'column', alignItems: 'flex-start', maxWidth: '92%' },
messageContentWrapperOwn: { flexDirection: 'column', alignItems: 'flex-end', maxWidth: '92%' },
quoteAccent: { borderLeftColor: c.primary, backgroundColor: c.primaryAlpha08 },
```

- [ ] **Step 4: Run TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add components/chat/MessageBubble.tsx
git commit -m "perf: memoize MessageBubble with data-equality check, move inline styles to StyleSheet"
```

---

## Task 7: Fix handlers and inline styles in `app/chat/[channelId].tsx`

**Files:**
- Modify: `app/chat/[channelId].tsx`

- [ ] **Step 1: Wrap `handleReaction` in `useCallback`**

`handleReaction` is currently defined at line 156 as a plain `const`. Wrap it:

```tsx
const handleReaction = useCallback(async (messageId: string, emoji: string, reactions: ChatReaction[]) => {
  if (!profile?.id) return
  optimisticToggleReaction(messageId, emoji, profile.id)
  const result = await toggleReaction(messageId, emoji, reactions)
  if (result?.error) {
    refetch()
  }
}, [profile?.id, optimisticToggleReaction, toggleReaction, refetch])
```

- [ ] **Step 2: Wrap `handleDelete` in `useCallback`**

`handleDelete` is currently at line 106 as a plain `const`. Wrap it:

```tsx
const handleDelete = useCallback((message: ChatMessageWithSender) => {
  Alert.alert('Usuń wiadomość', 'Tej operacji nie można cofnąć.', [
    { text: 'Anuluj', style: 'cancel' },
    {
      text: 'Usuń', style: 'destructive',
      onPress: async () => {
        const { error } = await supabase.from('chat_messages')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', message.id)
        if (error) Alert.alert('Błąd', 'Nie udało się usunąć wiadomości.')
        else refetch()
      },
    },
  ])
}, [refetch])
```

- [ ] **Step 3: Wrap `renderItem` in `useCallback`**

Replace the inline `renderItem` prop on `FlatList` (lines 206–235) by first extracting it as a named callback. Add before the `if (loading ...)` guard:

```tsx
const renderMessage = useCallback(({ item, index }: { item: ChatMessageWithSender; index: number }) => {
  const prevItem = messages[index + 1]
  const showSender = item.sender_id !== profile?.id &&
    (!prevItem || prevItem.sender_id !== item.sender_id)
  return (
    <MessageBubble
      item={item}
      currentUserId={profile?.id ?? ''}
      isAdmin={isAdmin}
      showSender={showSender}
      onLongPress={(msg, pageY) => { setActionSheetMessage(msg); setActionSheetY(pageY) }}
      onReactionPress={handleReaction}
      onVote={async (poll: ChatPoll, optionId: string) => {
        await vote(poll, optionId)
        refetch()
      }}
      onClosePoll={closePoll}
      onReply={() => {
        setReplyTo(item)
        setEditingMessage(null)
      }}
      onEdit={() => {
        setEditingMessage(item)
        setText(item.content)
        setReplyTo(null)
      }}
      onDelete={() => handleDelete(item)}
    />
  )
}, [messages, profile?.id, isAdmin, handleReaction, vote, refetch, closePoll, handleDelete])
```

Then on the `FlatList`, replace `renderItem={({ item, index }) => { ... }}` with:
```tsx
renderItem={renderMessage}
```

- [ ] **Step 4: Move inline `contentContainerStyle` to `createStyles`**

Change `FlatList` prop from:
```tsx
contentContainerStyle={{ padding: 12, gap: 4 }}
```
to:
```tsx
contentContainerStyle={styles.listContent}
```

In the `createStyles` function, add:
```ts
listContent: { padding: 12, gap: 4 },
```

- [ ] **Step 5: Add `useCallback` to the imports at the top of the file**

`useCallback` is already imported at line 2. Confirm it's present:
```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
```

- [ ] **Step 6: Run TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add "app/chat/[channelId].tsx"
git commit -m "perf: useCallback on renderItem and handlers in channel screen, fix inline styles"
```

---

## Task 8: Create `MemberRow` component

**Files:**
- Create: `components/MemberRow.tsx`
- Create: `__tests__/components/MemberRow.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/MemberRow.test.tsx`:

```tsx
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'

jest.mock('../../lib/ThemeContext', () => ({
  useTheme: () => ({
    colors: require('../../lib/theme').lightColors,
    isDark: false,
    scheme: 'light',
  }),
}))

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

const { MemberRow } = require('../../components/MemberRow')

const baseMember = {
  id: 'u1',
  full_name: 'Jan Kowalski',
  role: 'member' as const,
  phone: '600100200',
  rocznik: 2010,
  total_points: 42,
}

describe('MemberRow', () => {
  it('renders member name', () => {
    const { getByText } = render(<MemberRow member={baseMember} onPress={jest.fn()} />)
    expect(getByText('Jan Kowalski')).toBeTruthy()
  })

  it('renders phone number', () => {
    const { getByText } = render(<MemberRow member={baseMember} onPress={jest.fn()} />)
    expect(getByText(/600100200/)).toBeTruthy()
  })

  it('shows rocznik for member role', () => {
    const { getByText } = render(<MemberRow member={baseMember} onPress={jest.fn()} />)
    expect(getByText(/rocznik 2010/)).toBeTruthy()
  })

  it('shows points badge for member role', () => {
    const { getByText } = render(<MemberRow member={baseMember} onPress={jest.fn()} />)
    expect(getByText('42')).toBeTruthy()
  })

  it('does not show rocznik for parent role', () => {
    const parent = { ...baseMember, role: 'parent' as const, rocznik: null }
    const { queryByText } = render(<MemberRow member={parent} onPress={jest.fn()} />)
    expect(queryByText(/rocznik/)).toBeNull()
  })

  it('calls onPress when tapped', () => {
    const onPress = jest.fn()
    const { getByText } = render(<MemberRow member={baseMember} onPress={onPress} />)
    fireEvent.press(getByText('Jan Kowalski'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to confirm failure**

```bash
npx jest __tests__/components/MemberRow.test.tsx --no-coverage
```
Expected: FAIL — "Cannot find module '../../components/MemberRow'"

- [ ] **Step 3: Create `components/MemberRow.tsx`**

```tsx
import { memo, useMemo } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../lib/ThemeContext'
import { Colors } from '../lib/theme'

export interface MemberRowData {
  id: string
  full_name: string
  role: 'member' | 'parent' | 'admin'
  phone: string | null
  rocznik: number | null
  total_points?: number
}

interface Props {
  member: MemberRowData
  onPress: () => void
}

function MemberRowComponent({ member, onPress }: Props) {
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={styles.avatar}>
        <Ionicons name="person" size={18} color={c.primary} />
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.name}>{member.full_name}</Text>
        <Text style={styles.sub}>
          {member.phone ?? 'Brak telefonu'}
          {member.role === 'member' && member.rocznik ? ` · rocznik ${member.rocznik}` : ''}
        </Text>
      </View>
      {member.role === 'member' && (
        <View style={styles.pointsBadge}>
          <Ionicons name="trophy-outline" size={12} color={c.gold} />
          <Text style={styles.pointsText}>{member.total_points ?? 0}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={16} color={c.border} />
    </TouchableOpacity>
  )
}

export const MemberRow = memo(MemberRowComponent)

function createStyles(c: Colors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: c.surface, borderRadius: 12, padding: 12,
    },
    avatar: {
      width: 38, height: 38, borderRadius: 19,
      backgroundColor: c.primaryAlpha08, justifyContent: 'center', alignItems: 'center',
    },
    rowInfo: { flex: 1 },
    name: { fontSize: 15, fontWeight: '600', color: c.text },
    sub: { fontSize: 12, color: c.subtext, marginTop: 2 },
    pointsBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 3,
      backgroundColor: c.gold + '15', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3,
    },
    pointsText: { fontSize: 12, fontWeight: '700', color: c.gold },
  })
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx jest __tests__/components/MemberRow.test.tsx --no-coverage
```
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add components/MemberRow.tsx __tests__/components/MemberRow.test.tsx
git commit -m "feat: add memoized MemberRow component for member list screens"
```

---

## Task 9: Update member list screens to use `MemberRow`

**Files:**
- Modify: `app/(admin)/(admin-tabs)/members.tsx`
- Modify: `app/(admin)/members.tsx`

### `app/(admin)/(admin-tabs)/members.tsx`

- [ ] **Step 1: Add imports**

Add to the import section (after existing imports):
```tsx
import { MemberRow, MemberRowData } from '../../../components/MemberRow'
```

- [ ] **Step 2: Add `useCallback` to React imports**

Change line 1:
```tsx
import { useEffect, useState, useMemo, useCallback } from 'react'
```

- [ ] **Step 3: Add a stable `renderItem` callback and replace inline renderItem**

Add before the `return` statement:
```tsx
const handleMemberPress = useCallback((id: string) => {
  router.push(`/(admin)/member-detail?id=${id}`)
}, [router])

const renderItem = useCallback(({ item }: { item: Member }) => {
  if (filter === 'admin') {
    return (
      <View style={styles.row}>
        <View style={styles.avatar}>
          <Ionicons name="shield-checkmark" size={18} color={c.primary} />
        </View>
        <View style={styles.rowInfo}>
          <Text style={styles.name}>{item.full_name}</Text>
          <Text style={styles.sub}>{item.phone ?? 'Brak telefonu'}</Text>
        </View>
        <TouchableOpacity
          onPress={() => handleRevokeAdmin(item)}
          hitSlop={8}
          style={styles.revokeBtn}
        >
          <Ionicons name="person-remove-outline" size={20} color="#DC2626" />
        </TouchableOpacity>
      </View>
    )
  }
  return (
    <MemberRow
      member={item as MemberRowData}
      onPress={() => handleMemberPress(item.id)}
    />
  )
}, [filter, styles, c.primary, handleRevokeAdmin, handleMemberPress])
```

On the `FlatList`, replace:
```tsx
renderItem={({ item }) => ( ... )}
contentContainerStyle={{ padding: 16, gap: 8 }}
```
with:
```tsx
renderItem={renderItem}
contentContainerStyle={styles.listContent}
```

- [ ] **Step 4: Add `listContent` to `createStyles`**

In the `createStyles` function, add:
```ts
listContent: { padding: 16, gap: 8 },
```

- [ ] **Step 5: Run TypeScript check**

```bash
npx tsc --noEmit
```

### `app/(admin)/members.tsx`

- [ ] **Step 6: Add imports**

Add to the import section:
```tsx
import { MemberRow, MemberRowData } from '../../components/MemberRow'
```

- [ ] **Step 7: Add `useCallback` to React imports**

Change line 1:
```tsx
import { useEffect, useState, useMemo, useCallback } from 'react'
```

- [ ] **Step 8: Add `renderItem` callback and fix FlatList**

Add before the `return` statement:
```tsx
const handleMemberPress = useCallback((id: string) => {
  router.push(`/(admin)/member-detail?id=${id}`)
}, [router])

const renderItem = useCallback(({ item }: { item: Member }) => (
  <MemberRow
    member={item as MemberRowData}
    onPress={() => handleMemberPress(item.id)}
  />
), [handleMemberPress])
```

On the `FlatList`, replace:
```tsx
renderItem={({ item }) => ( ... )}
contentContainerStyle={{ padding: 16, gap: 8 }}
```
with:
```tsx
renderItem={renderItem}
contentContainerStyle={styles.listContent}
```

- [ ] **Step 9: Add `listContent` to `createStyles`**

```ts
listContent: { padding: 16, gap: 8 },
```

- [ ] **Step 10: Run TypeScript check and commit**

```bash
npx tsc --noEmit
git add "app/(admin)/(admin-tabs)/members.tsx" "app/(admin)/members.tsx"
git commit -m "perf: use MemberRow in member list screens, useCallback on renderItem"
```

---

## Task 10: Fix remaining inline `contentContainerStyle` objects

**Files:**
- Modify: `app/(tabs)/index.tsx`
- Modify: `app/(tabs)/schedule.tsx`

### `app/(tabs)/index.tsx`

- [ ] **Step 1: Move the inline style in the ScrollView**

Find the `ScrollView` with `contentContainerStyle={{ gap: 6, paddingBottom: 4 }}` (around line 157).

Change to:
```tsx
contentContainerStyle={styles.daySelectorContent}
```

In `createStyles`, add:
```ts
daySelectorContent: { gap: 6, paddingBottom: 4 },
```

### `app/(tabs)/schedule.tsx`

- [ ] **Step 2: Move the inline style in the FlatList**

Find `contentContainerStyle={{ padding: 16, gap: 10 }}` (around line 632).

Change to:
```tsx
contentContainerStyle={styles.listContent}
```

In `createStyles`, add:
```ts
listContent: { padding: 16, gap: 10 },
```

- [ ] **Step 3: Run TypeScript check and commit**

```bash
npx tsc --noEmit
git add "app/(tabs)/index.tsx" "app/(tabs)/schedule.tsx"
git commit -m "perf: move inline contentContainerStyle objects to StyleSheet in index and schedule screens"
```

---

## Task 11: Run full test suite — verify nothing broken

- [ ] **Step 1: Run all tests**

```bash
npx jest --no-coverage
```
Expected: all existing tests pass + new ChannelRow and MemberRow tests pass.

- [ ] **Step 2: TypeScript full check**

```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 3: If tests pass, tag completion**

```bash
git log --oneline -10
```
Review the last 10 commits — confirm all 8 planned commits are present.
