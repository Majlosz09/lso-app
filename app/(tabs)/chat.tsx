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

    // Only INSERT: edits/deletes don't change the channel list preview or unread count
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

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    center: { justifyContent: 'center', alignItems: 'center' },
    empty: { alignItems: 'center', marginTop: 80, gap: 12 },
    emptyText: { color: c.subtext, fontSize: 15 },
    listContent: { padding: 16, gap: 4 },
    fab: {
      position: 'absolute', right: 20, bottom: 20,
      width: 52, height: 52, borderRadius: 26,
      justifyContent: 'center', alignItems: 'center',
      ...shadow.fab,
    },
  })
}
