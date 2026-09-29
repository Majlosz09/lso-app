// app/(tabs)/chat.tsx — lista rozmów (wspólna dla ministranta, opiekuna i rodzica)
import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { sans } from '../../lib/theme'
import { ChatChannelListItem, ChatMessageWithSender } from '../../types/chat'
import { useRealtimeTable } from '../../hooks/useRealtimeTable'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { useLiturgyHeader } from '../../hooks/useLiturgyHeader'
import { ChannelRow } from '../../components/chat/ChannelRow'
import { ChatThread } from '../../components/chat/ChatThread'
import { AppText, Card, Icon, ScreenHeader } from '../../components/ui'

export default function ChatScreen() {
  const router = useRouter()
  const { profile, parish } = useAuthStore()
  const { colors: c } = useTheme()
  const isDesktop = useIsDesktop()
  const { palette } = useLiturgyHeader()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const [channels, setChannels] = useState<ChatChannelListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchChannels = useCallback(async (showLoading = false) => {
    if (!profile?.id) return
    if (showLoading) setLoading(true)

    const { data, error } = await supabase.rpc('get_chat_channels_with_meta')

    if (error || !data) {
      console.error('[Chat] fetchChannels error:', error)
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
      fetchChannels(false)
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

  const unreadTotal = channels.reduce((s, ch) => s + ch.unread_count, 0)
  const selected = isDesktop ? (channels.find(ch => ch.id === selectedId) ?? channels[0]) : undefined

  const openChannel = (id: string) => {
    if (isDesktop) {
      setSelectedId(id)
      // po otwarciu rozmowy licznik nieprzeczytanych znika od razu
      setChannels(prev => prev.map(ch => ch.id === id ? { ...ch, unread_count: 0 } : ch))
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['nav-badges'] }), 1500)
    } else {
      router.push(`/chat/${id}` as any)
    }
  }

  const list = (
    <FlatList
      data={channels}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Icon name="forum" size={44} color={c.iconMuted} />
          <AppText muted>Brak rozmów</AppText>
        </View>
      }
      renderItem={({ item, index }) => (
        <ChannelRow item={item} first={index === 0} selected={selected?.id === item.id} onPress={() => openChannel(item.id)} />
      )}
    />
  )

  const newDmButton = canCreateDm ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Nowa wiadomość"
      onPress={() => router.push('/chat/new-dm')}
      style={[styles.newBtn, { backgroundColor: isDesktop ? c.primary : palette.chip }]}
    >
      <Icon name="pencil" size={20} color={isDesktop ? '#FFFFFF' : palette.fg} filled />
    </Pressable>
  ) : null

  if (loading) {
    return <View style={[styles.flex, styles.center, { backgroundColor: c.bg }]}><ActivityIndicator color={c.primary} /></View>
  }

  if (isDesktop) {
    return (
      <View style={[styles.flex, styles.desktop, { backgroundColor: c.bg }]}>
        <Card large flush style={styles.split}>
          <View style={[styles.listPane, { borderRightColor: c.border }]}>
            <View style={[styles.listHead, { borderBottomColor: c.border }]}>
              <AppText variant="eyebrow" color={c.goldInk} style={styles.flex}>
                {`Rozmowy${unreadTotal ? ` · ${unreadTotal} nieprzeczytane` : ''}`}
              </AppText>
              {newDmButton}
            </View>
            {list}
          </View>
          <View style={styles.flex}>
            {selected
              ? <ChatThread key={selected.id} channelId={selected.id} embedded />
              : <View style={[styles.flex, styles.center]}><AppText muted>Wybierz rozmowę.</AppText></View>}
          </View>
        </Card>
      </View>
    )
  }

  return (
    <View style={[styles.flex, { backgroundColor: c.bg }]}>
      <ScreenHeader
        eyebrow={unreadTotal ? `${unreadTotal} nieprzeczytane` : 'Parafia'}
        title="Czat"
        right={newDmButton}
      />
      <View style={[styles.flex, styles.mobileList]}>
        <Card large flush style={styles.shrink}>{list}</Card>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  center: { justifyContent: 'center', alignItems: 'center' },
  empty: { alignItems: 'center', marginTop: 60, gap: 10 },
  mobileList: { padding: 16 },
  shrink: { flexShrink: 1 },
  newBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', cursor: 'pointer' } as any,
  desktop: { padding: 28, paddingHorizontal: 32 },
  split: { flex: 1, flexDirection: 'row' },
  listPane: { width: 320, borderRightWidth: 1 },
  listHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, minHeight: 60 },
})
