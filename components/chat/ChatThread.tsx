// Rozmowa w kanale / DM — ekran app/chat/[channelId] (telefon) i panel obok listy (web).
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert, FlatList, KeyboardAvoidingView, Platform,
  Pressable, StyleSheet, TextInput, View, ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useHeaderHeight } from 'expo-router/react-navigation'
import { useNavigation } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { sans } from '../../lib/theme'
import { pl } from '../../lib/dates'
import { useChatMessages } from '../../hooks/useChatMessages'
import { useChatReactions } from '../../hooks/useChatReactions'
import { useChatPolls } from '../../hooks/useChatPolls'
import { ChatChannel, ChatMessageWithSender, ChatPoll, ChatReaction } from '../../types/chat'
import { MessageBubble } from './MessageBubble'
import { MessageActionSheet } from './MessageActionSheet'
import { ReplyPreview } from './ReplyPreview'
import { CreatePollModal } from './CreatePollModal'
import { ReportMessageModal } from './ReportMessageModal'
import { channelTitle } from './ChannelRow'
import { AppText, Icon } from '../ui'

function useHeaderHeightSafe(): number {
  try {
    return useHeaderHeight()
  } catch {
    return 0
  }
}

export function ChatThread({ channelId, embedded = false }: { channelId: string; embedded?: boolean }) {
  const navigation = useNavigation()
  const { profile, parish } = useAuthStore()
  const { colors: c } = useTheme()
  const insets = useSafeAreaInsets()
  const headerHeight = useHeaderHeightSafe()

  const inputRef = useRef<TextInput>(null)

  const [channel, setChannel] = useState<ChatChannel | null>(null)
  const [memberCount, setMemberCount] = useState<number | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [actionSheetMessage, setActionSheetMessage] = useState<ChatMessageWithSender | null>(null)
  const [actionSheetY, setActionSheetY] = useState(0)
  const [reportMessage, setReportMessage] = useState<ChatMessageWithSender | null>(null)
  const [replyTo, setReplyTo] = useState<ChatMessageWithSender | null>(null)
  const [editingMessage, setEditingMessage] = useState<ChatMessageWithSender | null>(null)
  const [showPollModal, setShowPollModal] = useState(false)

  const { messages, loading, loadingMore, hasMore, loadMore, refetch, optimisticToggleReaction } = useChatMessages(channelId)
  const { toggleReaction } = useChatReactions(profile?.id ?? '')
  const { vote, closePoll } = useChatPolls(profile?.id ?? '')

  const isAdmin = profile?.role === 'admin' || !!profile?.is_admin

  // N13: rodzic w kanale ogólnym tylko czyta; ankiety wg ustawień parafii
  const [canPost, setCanPost] = useState(true)
  useEffect(() => {
    if (!profile?.id) return
    supabase.from('chat_members').select('can_post').eq('channel_id', channelId).eq('user_id', profile.id).maybeSingle()
      .then(({ data, error }) => setCanPost(error || !data ? true : (data as any).can_post !== false))
  }, [channelId, profile?.id])
  const canPoll = canPost && (isAdmin || parish?.members_can_create_polls !== false)

  const senderMap = (() => {
    const map: Record<string, string> = {}
    for (const msg of messages) {
      if (msg.sender_id && msg.sender?.full_name) map[msg.sender_id] = msg.sender.full_name
    }
    if (profile?.id && profile?.full_name) map[profile.id] = profile.full_name
    return map
  })()

  useEffect(() => {
    setChannel(null)
    setMemberCount(null)
    setText('')
    setReplyTo(null)
    setEditingMessage(null)
    const init = async () => {
      const [{ data }, { count }] = await Promise.all([
        supabase.from('chat_channels').select('*').eq('id', channelId).single(),
        supabase.from('chat_members').select('user_id', { count: 'exact', head: true }).eq('channel_id', channelId),
      ])
      if (data) setChannel(data)
      setMemberCount(count ?? null)
    }
    if (channelId) init()
  }, [channelId])

  const title = channel ? channelTitle(channel) : 'Wiadomości'
  const subtitle = memberCount != null ? `${memberCount} ${pl(memberCount, ['osoba', 'osoby', 'osób'])}` : ''

  useEffect(() => {
    if (embedded || !channel) return
    navigation.setOptions({
      headerTitle: () => (
        <View>
          <AppText style={[styles.navTitle, { color: c.text }]} numberOfLines={1}>{title}</AppText>
          {!!subtitle && <AppText style={[styles.navSub, { color: c.subtext }]}>{subtitle}</AppText>}
        </View>
      ),
    })
  }, [channel, subtitle, embedded, navigation, c.text, c.subtext])

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
      setSending(true)
      setText('')
      setEditingMessage(null)
      const { error } = await supabase.from('chat_messages')
        .update({ content, edited_at: new Date().toISOString() })
        .eq('id', editingMessage.id).eq('sender_id', profile.id)
      if (error) Alert.alert('Błąd', 'Nie udało się edytować wiadomości.')
      setSending(false)
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
    } else {
      refetch()
    }
    setSending(false)
  }

  const handleDelete = useCallback((message: ChatMessageWithSender) => {
    const doDelete = async () => {
      const { error } = await supabase.from('chat_messages')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', message.id)
      if (error) Alert.alert('Błąd', 'Nie udało się usunąć wiadomości.')
      else refetch()
    }

    if (Platform.OS === 'web') {
      // Alert.alert with multiple buttons is a no-op on React Native Web
      if (window.confirm('Usuń wiadomość?\nTej operacji nie można cofnąć.')) {
        doDelete()
      }
    } else {
      Alert.alert('Usuń wiadomość', 'Tej operacji nie można cofnąć.', [
        { text: 'Anuluj', style: 'cancel' },
        { text: 'Usuń', style: 'destructive', onPress: doDelete },
      ])
    }
  }, [refetch])

  const handleCreatePoll = async (question: string, options: string[], allowMultiple: boolean) => {
    if (!profile?.id) return
    const { data: poll, error: pollError } = await supabase
      .from('chat_polls')
      .insert({ channel_id: channelId, creator_id: profile.id, question, allow_multiple: allowMultiple })
      .select().single()
    if (pollError || !poll) {
      Alert.alert('Błąd', 'Nie udało się utworzyć ankiety.')
      throw new Error('poll_create')
    }

    const optResults = await Promise.all(
      options.map((text, position) =>
        supabase.from('chat_poll_options').insert({ poll_id: poll.id, text, position })
      )
    )
    if (optResults.some(r => r.error)) {
      Alert.alert('Błąd', 'Nie udało się dodać opcji ankiety.')
      throw new Error('poll_options')
    }

    const { error: msgError } = await supabase.from('chat_messages').insert({
      channel_id: channelId,
      sender_id: profile.id,
      content: question,
      type: 'poll',
      poll_id: poll.id,
    })
    if (msgError) {
      Alert.alert('Błąd', 'Nie udało się wysłać wiadomości z ankietą.')
      throw new Error('poll_message')
    }
  }

  const handleReaction = useCallback(async (messageId: string, emoji: string, reactions: ChatReaction[]) => {
    if (!profile?.id) return
    optimisticToggleReaction(messageId, emoji, profile.id)
    const result = await toggleReaction(messageId, emoji, reactions)
    if (result?.error) {
      refetch()
    }
  }, [profile?.id, optimisticToggleReaction, toggleReaction, refetch])

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
        senderMap={senderMap}
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
          inputRef.current?.focus()
        }}
        onEdit={() => {
          setEditingMessage(item)
          setText(item.content)
          setReplyTo(null)
        }}
        onDelete={() => handleDelete(item)}
      />
    )
  }, [messages, profile?.id, isAdmin, senderMap, handleReaction, vote, refetch, closePoll, handleDelete])

  // Web: Enter wysyła, Shift+Enter = nowa linia
  const handleKeyPress = (e: any) => {
    if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
      e.preventDefault?.()
      handleSend()
    }
  }

  const canSend = !!text.trim() && !sending

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      {embedded && (
        <View style={[styles.embeddedHead, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
          <View style={styles.flex}>
            <AppText style={[styles.embTitle, { color: c.text }]} numberOfLines={1}>{title}</AppText>
            {!!subtitle && <AppText variant="small" muted>{subtitle}</AppText>}
          </View>
          {canPoll && <Pressable
            accessibilityRole="button"
            onPress={() => setShowPollModal(true)}
            style={[styles.pollChip, { borderColor: c.inputBorder, backgroundColor: c.surface }]}
          >
            <Icon name="poll" size={18} color={c.primary} />
            <AppText variant="label" color={c.primary}>Ankieta</AppText>
          </Pressable>}
        </View>
      )}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        keyboardVerticalOffset={embedded ? 0 : headerHeight}
      >
        {loading && messages.length === 0 ? (
          <View style={[styles.flex, styles.center]}><ActivityIndicator color={c.primary} /></View>
        ) : (
          <FlatList
            data={messages}
            keyExtractor={(item) => item.id}
            inverted
            contentContainerStyle={styles.listContent}
            onEndReached={hasMore ? loadMore : undefined}
            onEndReachedThreshold={0.3}
            ListFooterComponent={loadingMore ? <ActivityIndicator color={c.primary} style={styles.more} /> : null}
            ListEmptyComponent={
              <View style={styles.empty}>
                <AppText muted style={styles.emptyText}>Brak wiadomości. Napisz pierwszą!</AppText>
              </View>
            }
            renderItem={renderMessage}
          />
        )}

        {(replyTo || editingMessage) && (
          <ReplyPreview
            message={(replyTo ?? editingMessage)!}
            mode={editingMessage ? 'edit' : 'reply'}
            onCancel={() => { setReplyTo(null); setEditingMessage(null); setText('') }}
          />
        )}

        {!canPost ? (
          <View style={[styles.readOnly, { borderTopColor: c.border, backgroundColor: c.surface }]}>
            <Icon name="eye" size={18} color={c.subtext} />
            <AppText variant="small" muted>Kanał tylko do odczytu</AppText>
          </View>
        ) : (
        <View style={[styles.inputRow, { borderTopColor: c.border, backgroundColor: c.surface }]}>
          {!embedded && canPoll && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ankieta"
              style={[styles.roundBtn, { borderColor: c.inputBorder }]}
              onPress={() => setShowPollModal(true)}
            >
              <Icon name="poll" size={20} color={c.primary} />
            </Pressable>
          )}
          <TextInput
            ref={inputRef}
            style={[styles.input, { color: c.text, backgroundColor: c.bg, borderColor: c.inputBorder }]}
            value={text}
            onChangeText={setText}
            placeholder={editingMessage ? 'Edytuj wiadomość…' : 'Napisz wiadomość…'}
            placeholderTextColor={c.textTertiary}
            multiline
            maxLength={1000}
            returnKeyType="send"
            blurOnSubmit={false}
            onSubmitEditing={Platform.OS !== 'web' ? handleSend : undefined}
            onKeyPress={Platform.OS === 'web' ? handleKeyPress : undefined}
          />
          {embedded ? (
            <Pressable
              accessibilityRole="button"
              onPress={handleSend}
              disabled={!canSend}
              style={[styles.sendWide, { backgroundColor: c.primary, opacity: canSend ? 1 : 0.5 }]}
            >
              <Icon name="send" size={18} color="#FFFFFF" filled />
              <AppText variant="label" color="#FFFFFF" style={styles.sendText}>Wyślij</AppText>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Wyślij"
              onPress={handleSend}
              disabled={!canSend}
              style={[styles.sendBtn, { backgroundColor: canSend ? c.primary : c.iconMuted }]}
            >
              <Icon name="send" size={20} color="#FFFFFF" filled />
            </Pressable>
          )}
        </View>
        )}
      </KeyboardAvoidingView>
      {!embedded && Platform.OS === 'android' && insets.bottom > 0 && (
        <View style={{ height: insets.bottom, backgroundColor: c.surface }} />
      )}
      <MessageActionSheet
        visible={!!actionSheetMessage}
        message={actionSheetMessage}
        currentUserId={profile?.id ?? ''}
        isAdmin={isAdmin}
        messageY={actionSheetY}
        onClose={() => setActionSheetMessage(null)}
        onReact={(emoji) => {
          if (actionSheetMessage) {
            const fresh = messages.find(m => m.id === actionSheetMessage.id)
            handleReaction(actionSheetMessage.id, emoji, fresh?.reactions ?? actionSheetMessage.reactions)
          }
        }}
        onReply={() => {
          setReplyTo(actionSheetMessage)
          setEditingMessage(null)
          setTimeout(() => inputRef.current?.focus(), Platform.OS === 'web' ? 0 : 350)
        }}
        onEdit={() => {
          setEditingMessage(actionSheetMessage)
          setText(actionSheetMessage?.content ?? '')
          setReplyTo(null)
        }}
        onDelete={() => { if (actionSheetMessage) handleDelete(actionSheetMessage) }}
        onReport={() => setReportMessage(actionSheetMessage)}
      />
      <ReportMessageModal
        message={reportMessage}
        reporterId={profile?.id ?? ''}
        onClose={() => setReportMessage(null)}
      />
      <CreatePollModal
        visible={showPollModal}
        onClose={() => setShowPollModal(false)}
        onSubmit={handleCreatePoll}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  center: { justifyContent: 'center', alignItems: 'center' },
  more: { marginVertical: 12 },
  listContent: { padding: 14, gap: 4 },
  empty: { alignItems: 'center', padding: 40 },
  emptyText: { textAlign: 'center' },
  navTitle: { ...sans(800), fontSize: 16 },
  navSub: { ...sans(500), fontSize: 12 },
  embeddedHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  embTitle: { ...sans(800), fontSize: 17 },
  pollChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, cursor: 'pointer' } as any,
  readOnly: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderTopWidth: 1 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', paddingVertical: 10, paddingHorizontal: 12, borderTopWidth: 1, gap: 8 },
  roundBtn: { flexShrink: 0, width: 44, height: 44, borderRadius: 22, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  // minWidth 0: pole na webie ma własną minimalną szerokość i wypycha „Wyślij” poza ekran 320 px
  input: {
    flex: 1, minWidth: 0, borderRadius: 22, borderWidth: 1,
    paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11,
    fontSize: 15, maxHeight: 120, minHeight: 44, ...sans(500),
    outlineStyle: 'none',
  } as any,
  sendBtn: { flexShrink: 0, width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  sendWide: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 18, borderRadius: 22, cursor: 'pointer' } as any,
  sendText: { fontSize: 14 },
})
