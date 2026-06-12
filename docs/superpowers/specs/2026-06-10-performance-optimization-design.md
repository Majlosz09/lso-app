# Performance Optimization — Design Spec
**Date:** 2026-06-10
**App:** LSO (Expo/React Native + Supabase)
**Target platforms:** Android (Expo Go), Web

---

## Problem

The app feels sluggish across the board on Android (Expo Go) and web — both on initial screen load and during scrolling/animations. Two root causes identified:

1. **Excessive re-renders in lists** — `FlatList` item components are not memoized and `renderItem` callbacks are recreated every render. With chat's real-time subscriptions firing frequently, 50+ `MessageBubble` instances re-render on every incoming message.
2. **N+1 Supabase queries on chat channel list** — each channel triggers a separate query for last message and unread count. 10 channels = 21 queries per screen open.

---

## Goals

- Eliminate unnecessary re-renders during list scrolling (chat, members)
- Reduce Supabase roundtrips when loading the chat channel list
- Zero new external dependencies
- No changes to app behaviour or UI

## Non-goals

- Dev build / Hermes / Fabric / FlashList migration (separate decision)
- Skeleton screens (separate decision)
- State normalization in `member-detail` (out of scope)
- Optimizing screens outside chat and members

---

## Design

### 1. React.memo + useCallback on list components

**Why it matters:** `React.memo` prevents a component from re-rendering when its props haven't changed. Without it, every parent re-render (e.g. a real-time message arriving) triggers a full re-render of all 50 message bubbles. `useCallback` is required on handler props — without it, new function references are created each render and `React.memo` is bypassed.

**Changes:**

| File | Change |
|------|--------|
| `components/chat/MessageBubble.tsx` | Wrap export in `React.memo`. Wrap `onLongPress`, `onReactionPress`, `onVote`, `onReplyPress` handlers with `useCallback` inside the component. |
| `components/AvatarImage.tsx` | Wrap export in `React.memo`. |
| `components/chat/ChannelRow.tsx` | **New file.** Extract the inline `renderItem` JSX from both chat-list screens into a standalone `React.memo` component. Props: `channel`, `onPress`. |
| `components/MemberRow.tsx` | **New file.** Extract inline `renderItem` JSX from both member-list screens into a standalone `React.memo` component. Props: `member`, `onPress`. |
| `app/(tabs)/chat.tsx` | Replace inline `renderItem` with `<ChannelRow>`. Wrap `renderItem` callback in `useCallback`. |
| `app/(parent)/(parent-tabs)/chat.tsx` | Same as above. |
| `app/(admin)/(admin-tabs)/members.tsx` | Replace inline `renderItem` with `<MemberRow>`. Wrap in `useCallback`. |
| `app/(admin)/members.tsx` | Same as above. |
| `app/chat/[channelId].tsx` | Wrap `renderItem` in `useCallback`. Ensure handler props passed to `MessageBubble` are stable references (wrap in `useCallback` at call site). |

**Rule for `useCallback` at call site:** Any function passed as a prop to a `React.memo` component must be wrapped in `useCallback` with correct deps — otherwise memo is useless.

---

### 2. Eliminate inline style objects in FlatList/ScrollView props

**Why it matters:** `contentContainerStyle={{ padding: 16, gap: 4 }}` creates a new object reference every render. React compares props by reference, so this always triggers a re-render of the list container.

**Rule:** If a style does not depend on props or dynamic state → move it to the existing `useMemo(() => createStyles(c), [c])` block in that file (add a new key). If it doesn't depend on theme either → declare it as a `const` outside the component.

**Files to fix:**

| File | Locations |
|------|-----------|
| `app/chat/[channelId].tsx` | `contentContainerStyle` on FlatList |
| `app/(tabs)/chat.tsx` | `contentContainerStyle={{ padding: 16, gap: 4 }}` |
| `app/(parent)/(parent-tabs)/chat.tsx` | Same |
| `app/(tabs)/index.tsx` | `contentContainerStyle={{ gap: 6, paddingBottom: 4 }}` |
| `app/(tabs)/schedule.tsx` | Inline styles on FlatList (multiple) |
| `components/chat/MessageBubble.tsx` | Inline style literals inside render |

Approximately 15–20 occurrences across these 6 files.

---

### 3. Fix N+1 query on chat channel list

**Why it matters:** The current `fetchChannels` in both chat-list screens issues 1 query for channels, then 2 queries per channel (last message + unread count) via `Promise.all`. At 10 channels that's 21 sequential/parallel DB roundtrips on every screen mount.

**Solution:** A single Supabase RPC function that returns all channels with metadata in one query.

**New migration:** `supabase/migrations/20260610_chat_channels_meta_rpc.sql`

```sql
CREATE OR REPLACE FUNCTION get_chat_channels_with_meta()
RETURNS TABLE (
  id            uuid,
  parish_id     uuid,
  type          text,
  name          text,
  slug          text,
  created_at    timestamptz,
  last_message_content  text,
  last_message_at       timestamptz,
  last_message_sender   text,
  unread_count          bigint
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
    last_msg.sender_name   AS last_message_sender,
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
    SELECT m.content, m.created_at, p.full_name AS sender_name
    FROM chat_messages m
    JOIN profiles p ON p.id = m.sender_id
    WHERE m.channel_id = cc.id AND m.deleted_at IS NULL
    ORDER BY m.created_at DESC
    LIMIT 1
  ) last_msg ON true
  ORDER BY COALESCE(last_msg.created_at, cc.created_at) DESC;
$$;
```

**App-side change (`app/(tabs)/chat.tsx` and `app/(parent)/(parent-tabs)/chat.tsx`):**

Replace current `fetchChannels` logic with:
```ts
const { data, error } = await supabase.rpc('get_chat_channels_with_meta');
```

Update the `ChatChannelWithMeta` type to match the RPC return shape (flat fields instead of nested objects).

---

## Files Changed

| File | Type |
|------|------|
| `components/chat/MessageBubble.tsx` | Modified |
| `components/AvatarImage.tsx` | Modified |
| `components/chat/ChannelRow.tsx` | **New** |
| `components/MemberRow.tsx` | **New** |
| `app/(tabs)/chat.tsx` | Modified |
| `app/(parent)/(parent-tabs)/chat.tsx` | Modified |
| `app/(admin)/(admin-tabs)/members.tsx` | Modified |
| `app/(admin)/members.tsx` | Modified |
| `app/chat/[channelId].tsx` | Modified |
| `app/(tabs)/index.tsx` | Modified |
| `app/(tabs)/schedule.tsx` | Modified |
| `supabase/migrations/20260610_chat_channels_meta_rpc.sql` | **New** |

---

## Success Criteria

- Scrolling through chat messages does not drop frames when a real-time message arrives
- Opening the chat channel list feels instant (single DB call)
- Scrolling through member lists is smooth
- No existing tests broken, no visible UI changes
