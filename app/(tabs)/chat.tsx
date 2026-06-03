// app/(tabs)/chat.tsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator, FlatList, RefreshControl,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'
import { ChatChannel, ChatChannelWithMeta, ChatMember, ChatMessageWithSender } from '../../types/chat'
import { useRealtimeTable } from '../../hooks/useRealtimeTable'

export default function ChatScreen() {
  const router = useRouter()
  const { profile, parish } = useAuthStore()
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  const [channels, setChannels] = useState<ChatChannelWithMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchChannels = useCallback(async () => {
    if (!profile?.id) return

    const { data: memberships } = await supabase
      .from('chat_members')
      .select('channel_id, last_read_at, channel:chat_channels(*)')
      .eq('user_id', profile.id)

    if (!memberships) { setLoading(false); setRefreshing(false); return }

    const withMeta = await Promise.all(
      memberships.map(async (m) => {
        const channel = m.channel as unknown as ChatChannel
        const member: ChatMember = {
          channel_id: channel.id,
          user_id: profile.id,
          last_read_at: m.last_read_at,
        }

        const [{ data: lastMsgs }, { count: unread }] = await Promise.all([
          supabase
            .from('chat_messages')
            .select('*, sender:profiles(id, full_name, avatar_url, role)')
            .eq('channel_id', channel.id)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(1),
          supabase
            .from('chat_messages')
            .select('*', { count: 'exact', head: true })
            .eq('channel_id', channel.id)
            .is('deleted_at', null)
            .neq('sender_id', profile.id)
            .gt('created_at', m.last_read_at ?? '1970-01-01T00:00:00Z'),
        ])

        return {
          ...channel,
          member,
          last_message: (lastMsgs?.[0] ?? null) as ChatMessageWithSender | null,
          unread_count: unread ?? 0,
        } as ChatChannelWithMeta
      })
    )

    withMeta.sort((a, b) => {
      const at = a.last_message?.created_at ?? a.created_at
      const bt = b.last_message?.created_at ?? b.created_at
      return bt.localeCompare(at)
    })

    setChannels(withMeta)
    setLoading(false)
    setRefreshing(false)
  }, [profile?.id])

  useEffect(() => { fetchChannels() }, [fetchChannels])
  useRealtimeTable('chat_messages', fetchChannels)

  const onRefresh = () => { setRefreshing(true); fetchChannels() }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })
  }

  const canCreateDm =
    profile?.role === 'admin' || profile?.is_admin ||
    (parish?.allow_member_dm === true && profile?.role === 'member')

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={c.primary} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={channels}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
        contentContainerStyle={{ padding: 16, gap: 4 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="chatbubbles-outline" size={48} color={c.subtext} />
            <Text style={styles.emptyText}>Brak kanałów</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onPress={() => router.push(`/chat/${item.id}` as any)}
            activeOpacity={0.7}
          >
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
                {item.last_message && (
                  <Text style={styles.time}>{formatTime(item.last_message.created_at)}</Text>
                )}
              </View>
              <View style={styles.rowBottom}>
                <Text
                  style={[styles.preview, item.unread_count > 0 && styles.previewUnread]}
                  numberOfLines={1}
                >
                  {item.last_message ? item.last_message.content : 'Brak wiadomości'}
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
        )}
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
    fab: {
      position: 'absolute', right: 20, bottom: 20,
      width: 52, height: 52, borderRadius: 26,
      justifyContent: 'center', alignItems: 'center',
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25, shadowRadius: 4, elevation: 4,
    },
  })
}
