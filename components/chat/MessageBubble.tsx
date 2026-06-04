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
