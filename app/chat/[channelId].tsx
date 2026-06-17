// app/chat/[channelId].tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert, FlatList, KeyboardAvoidingView, Platform,
  StyleSheet, Text, TextInput, TouchableOpacity, View, ActivityIndicator, RefreshControl,
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

  const inputRef = useRef<TextInput>(null)

  const [channel, setChannel] = useState<ChatChannel | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [actionSheetMessage, setActionSheetMessage] = useState<ChatMessageWithSender | null>(null)
  const [actionSheetY, setActionSheetY] = useState(0)
  const [replyTo, setReplyTo] = useState<ChatMessageWithSender | null>(null)
  const [editingMessage, setEditingMessage] = useState<ChatMessageWithSender | null>(null)
  const [showPollModal, setShowPollModal] = useState(false)

  const { messages, loading, loadingMore, hasMore, loadMore, refetch, optimisticToggleReaction } = useChatMessages(channelId)
  const { toggleReaction } = useChatReactions(profile?.id ?? '')
  const { vote, closePoll } = useChatPolls(profile?.id ?? '')

  const isAdmin = profile?.role === 'admin' || !!profile?.is_admin

  const senderMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const msg of messages) {
      if (msg.sender_id && msg.sender?.full_name) map[msg.sender_id] = msg.sender.full_name
    }
    if (profile?.id && profile?.full_name) map[profile.id] = profile.full_name
    return map
  }, [messages, profile?.id, profile?.full_name])

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

  // Web: Enter sends, Shift+Enter = new line
  const handleKeyPress = (e: any) => {
    if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
      e.preventDefault?.()
      handleSend()
    }
  }

  const insertNewline = () => setText((t) => t + '\n')

  if (loading && messages.length === 0) {
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
        contentContainerStyle={styles.listContent}
        onEndReached={hasMore ? loadMore : undefined}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          loadingMore
            ? <ActivityIndicator color={c.primary} style={{ marginVertical: 12 }} />
            : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Brak wiadomości. Napisz pierwszą!</Text>
          </View>
        }
        renderItem={renderMessage}
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
          ref={inputRef}
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
    listContent: { padding: 12, gap: 4 },
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
