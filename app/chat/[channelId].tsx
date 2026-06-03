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
import { ChatChannel } from '../../types/chat'

export default function ChannelScreen() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>()
  const navigation = useNavigation()
  const { profile } = useAuthStore()
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  const [channel, setChannel] = useState<ChatChannel | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  const { messages, loading } = useChatMessages(channelId)

  // Pobierz metadane kanału i ustaw tytuł
  useEffect(() => {
    const init = async () => {
      const { data } = await supabase
        .from('chat_channels')
        .select('*')
        .eq('id', channelId)
        .single()
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

  // Oznacz jako przeczytane przy wejściu i przy nowych wiadomościach
  const markRead = useCallback(async () => {
    if (!profile?.id || !channelId) return
    await supabase
      .from('chat_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('channel_id', channelId)
      .eq('user_id', profile.id)
  }, [channelId, profile?.id])

  useEffect(() => { markRead() }, [markRead])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (messages.length > 0) markRead() }, [messages[0]?.id])

  const handleSend = async () => {
    if (!text.trim() || !profile?.id || sending) return
    const content = text.trim()
    setText('')
    setSending(true)
    const { error } = await supabase.from('chat_messages').insert({
      channel_id: channelId,
      sender_id: profile.id,
      content,
    })
    if (error) {
      setText(content)
      Alert.alert('Błąd', 'Nie udało się wysłać wiadomości.')
    }
    setSending(false)
  }

  const handleLongPress = (messageId: string, senderId: string) => {
    const isOwn = senderId === profile?.id
    const isAdmin = profile?.role === 'admin' || profile?.is_admin
    if (!isOwn && !isAdmin) return

    Alert.alert('Usuń wiadomość', 'Tej operacji nie można cofnąć.', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń', style: 'destructive',
        onPress: () =>
          supabase
            .from('chat_messages')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', messageId),
      },
    ])
  }

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
          const isOwn = item.sender_id === profile?.id
          const prevItem = messages[index + 1]
          const showSender = !isOwn && (!prevItem || prevItem.sender_id !== item.sender_id)

          if (item.deleted_at) {
            return (
              <View style={[styles.bubbleRow, isOwn ? styles.rowRight : styles.rowLeft]}>
                <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
                  <Text style={styles.deletedText}>Wiadomość usunięta</Text>
                </View>
              </View>
            )
          }

          return (
            <TouchableOpacity
              style={[styles.bubbleRow, isOwn ? styles.rowRight : styles.rowLeft]}
              onLongPress={() => handleLongPress(item.id, item.sender_id)}
              activeOpacity={0.85}
            >
              {showSender && (
                <Text style={styles.senderName}>{item.sender?.full_name}</Text>
              )}
              <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
                <Text style={[styles.messageText, isOwn && styles.messageTextOwn]}>
                  {item.content}
                </Text>
                <Text style={[styles.messageTime, isOwn && styles.messageTimeOwn]}>
                  {new Date(item.created_at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            </TouchableOpacity>
          )
        }}
      />
      <View style={[styles.inputRow, { borderTopColor: c.border }]}>
        <TextInput
          style={[styles.input, { color: c.text, backgroundColor: c.surface, borderColor: c.border }]}
          value={text}
          onChangeText={setText}
          placeholder="Napisz wiadomość..."
          placeholderTextColor={c.subtext}
          multiline
          maxLength={1000}
          returnKeyType="default"
        />
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: text.trim() ? c.primary : c.border }]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
        >
          <Ionicons name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    center: { justifyContent: 'center', alignItems: 'center' },
    empty: { alignItems: 'center', padding: 40 },
    emptyText: { color: c.subtext, fontSize: 14, textAlign: 'center' },
    bubbleRow: { marginVertical: 2 },
    rowRight: { alignItems: 'flex-end' },
    rowLeft: { alignItems: 'flex-start' },
    senderName: { fontSize: 11, color: c.subtext, marginBottom: 2, marginLeft: 4 },
    bubble: { maxWidth: '80%', borderRadius: 16, padding: 10, paddingHorizontal: 14 },
    bubbleOwn: { backgroundColor: c.primary, borderBottomRightRadius: 4 },
    bubbleOther: { backgroundColor: c.surface, borderBottomLeftRadius: 4 },
    messageText: { fontSize: 15, color: c.text, lineHeight: 20 },
    messageTextOwn: { color: '#fff' },
    deletedText: { fontSize: 13, color: c.subtext, fontStyle: 'italic' },
    messageTime: { fontSize: 10, color: c.subtext, alignSelf: 'flex-end', marginTop: 4 },
    messageTimeOwn: { color: 'rgba(255,255,255,0.7)' },
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
    sendBtn: {
      width: 40, height: 40, borderRadius: 20,
      justifyContent: 'center', alignItems: 'center',
    },
  })
}
