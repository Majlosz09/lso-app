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
    const result = await toggleReaction(messageId, emoji, reactions)
    if (result?.error) Alert.alert('Błąd', 'Nie udało się dodać reakcji.')
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
