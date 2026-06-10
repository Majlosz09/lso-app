import { memo, useMemo, useState } from 'react'
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'
import { shadow } from '../../lib/shadows'
import { ChatMessageWithSender, ChatPoll, ChatReaction } from '../../types/chat'
import { PollBubble } from './PollBubble'

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const

interface Props {
  item: ChatMessageWithSender
  currentUserId: string
  isAdmin: boolean
  showSender: boolean
  onLongPress: (message: ChatMessageWithSender, pageY: number) => void
  onReactionPress: (messageId: string, emoji: string, reactions: ChatReaction[]) => void
  onVote: (poll: ChatPoll, optionId: string) => void
  onClosePoll: (pollId: string) => void
  onReply?: () => void
  onEdit?: () => void
  onDelete?: () => void
}

function MessageBubbleComponent({
  item, currentUserId, isAdmin, showSender,
  onLongPress, onReactionPress, onVote, onClosePoll,
  onReply, onEdit, onDelete,
}: Props) {
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
  const [hovered, setHovered] = useState(false)
  const [showReactionPicker, setShowReactionPicker] = useState(false)
  const [showMenu, setShowMenu] = useState(false)

  const isOwn = item.sender_id === currentUserId
  const isWeb = Platform.OS === 'web'

  const reactionGroups = item.reactions.reduce<Record<string, ChatReaction[]>>((acc, r) => {
    acc[r.emoji] = acc[r.emoji] ?? []
    acc[r.emoji].push(r)
    return acc
  }, {})

  const canEdit = isOwn && item.type !== 'poll'
  const canDelete = isOwn || isAdmin
  // Show three-dots only when there's at least one action in the menu
  const hasMenuItems = canEdit || canDelete

  if (item.deleted_at) {
    return (
      <View style={[styles.row, isOwn ? styles.rowRight : styles.rowLeft]}>
        <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
          <Text style={styles.deletedText}>Wiadomość usunięta</Text>
        </View>
      </View>
    )
  }

  const messageContent = (
    <View style={isOwn ? styles.messageContentWrapperOwn : styles.messageContentWrapper}>
      {showSender && !isOwn && (
        <Text style={styles.senderName}>{item.sender?.full_name}</Text>
      )}
      {item.reply_to && (
        <View style={[styles.quote, styles.quoteAccent]}>
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
  )

  // --- WEB: hover-based compact action bar ---
  if (isWeb) {
    // The action bar stays visible as long as the row is hovered OR a panel is open.
    const isActionBarVisible = hovered || showMenu || showReactionPicker

    // Row leave: only clear hover. Panels close via their own onMouseLeave — this
    // prevents the menu from closing while the mouse is in the "gap" between the
    // row bounds and the panel (which is position:absolute above the row).
    const handleRowMouseLeave = () => {
      setHovered(false)
    }

    const actionBar = (
      <View
        pointerEvents={isActionBarVisible ? 'auto' : 'none'}
        style={[
          styles.actionBarContainer,
          isOwn ? styles.actionBarOwnSide : styles.actionBarOtherSide,
          isActionBarVisible ? { opacity: 1 } : { opacity: 0, width: 0 },
        ]}
      >
        {/* Emoji reaction button */}
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: c.surface, borderColor: c.border }]}
          onPress={() => {
            setShowReactionPicker(!showReactionPicker)
            setShowMenu(false)
          }}
        >
          <Text style={styles.actionBtnEmoji}>😊</Text>
        </TouchableOpacity>

        {/* Reply button */}
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: c.surface, borderColor: c.border }]}
          onPress={() => {
            onReply?.()
            setShowReactionPicker(false)
            setShowMenu(false)
          }}
        >
          <Ionicons name="return-up-back-outline" size={14} color={c.subtext} />
        </TouchableOpacity>

        {/* Three dots — only shown when there are menu items */}
        {hasMenuItems && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: c.surface, borderColor: c.border }]}
            onPress={() => {
              setShowMenu(!showMenu)
              setShowReactionPicker(false)
            }}
          >
            <Ionicons name="ellipsis-horizontal" size={14} color={c.subtext} />
          </TouchableOpacity>
        )}

        {/* Floating emoji reaction picker */}
        {showReactionPicker && (
          <View
            style={[
              styles.floatingReactionPicker,
              isOwn ? styles.floatingAlignRight : styles.floatingAlignLeft,
              { backgroundColor: c.surface, borderColor: c.border },
            ]}
            // @ts-ignore — React Native Web
            onMouseEnter={() => setHovered(true)}
            // @ts-ignore
            onMouseLeave={() => setShowReactionPicker(false)}
          >
            {QUICK_EMOJIS.map((emoji) => (
              <TouchableOpacity
                key={emoji}
                style={styles.pickerEmojiBtn}
                onPress={() => {
                  onReactionPress(item.id, emoji, item.reactions)
                  setShowReactionPicker(false)
                }}
              >
                <Text style={styles.pickerEmoji}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Floating context menu */}
        {showMenu && (
          <View
            style={[
              styles.floatingMenu,
              isOwn ? styles.floatingAlignRight : styles.floatingAlignLeft,
              { backgroundColor: c.surface, borderColor: c.border },
            ]}
            // @ts-ignore
            onMouseEnter={() => setHovered(true)}
            // @ts-ignore
            onMouseLeave={() => setShowMenu(false)}
          >
            {canEdit && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => { onEdit?.(); setShowMenu(false) }}
              >
                <Ionicons name="pencil-outline" size={14} color={c.text} />
                <Text style={[styles.menuItemText, { color: c.text }]}>Edytuj</Text>
              </TouchableOpacity>
            )}
            {canDelete && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => { onDelete?.(); setShowMenu(false) }}
              >
                <Ionicons name="trash-outline" size={14} color="#ef4444" />
                <Text style={[styles.menuItemText, { color: '#ef4444' }]}>Usuń</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    )

    return (
      <View
        style={[styles.row, isOwn ? styles.rowRight : styles.rowLeft]}
        // @ts-ignore — React Native Web
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={handleRowMouseLeave}
      >
        {isOwn ? (
          <>{actionBar}{messageContent}</>
        ) : (
          <>{messageContent}{actionBar}</>
        )}
      </View>
    )
  }

  // --- MOBILE: long-press to open action sheet ---
  return (
    <TouchableOpacity
      style={[styles.row, isOwn ? styles.rowRight : styles.rowLeft]}
      onLongPress={(event) => onLongPress(item, event.nativeEvent.pageY)}
      activeOpacity={0.85}
    >
      {messageContent}
    </TouchableOpacity>
  )
}

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

function createStyles(c: Colors) {
  return StyleSheet.create({
    row: { marginVertical: 2, width: '100%', flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
    rowRight: { justifyContent: 'flex-end' },
    rowLeft: { justifyContent: 'flex-start' },
    senderName: { fontSize: 11, color: c.subtext, marginBottom: 2, marginLeft: 4 },
    quote: {
      borderLeftWidth: 3, borderRadius: 6,
      paddingVertical: 3, paddingHorizontal: 8,
      marginBottom: 3, maxWidth: '92%',
    },
    messageContentWrapper: { flexDirection: 'column', alignItems: 'flex-start', maxWidth: '92%' },
    messageContentWrapperOwn: { flexDirection: 'column', alignItems: 'flex-end', maxWidth: '92%' },
    quoteAccent: { borderLeftColor: c.primary, backgroundColor: c.primaryAlpha08 },
    quoteName: { fontSize: 11, fontWeight: '600' },
    quoteText: { fontSize: 11 },
    bubble: { borderRadius: 16, padding: 10, paddingHorizontal: 14 },
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
    // Web compact action bar — collapses to width:0 when hidden so messages sit flush
    actionBarContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      position: 'relative',
      overflow: 'visible',
    },
    actionBarOwnSide: { marginRight: 4 },
    actionBarOtherSide: { marginLeft: 4 },
    actionBtn: {
      width: 26, height: 26, borderRadius: 13, borderWidth: 1,
      justifyContent: 'center', alignItems: 'center',
    },
    actionBtnEmoji: { fontSize: 13 },
    // Floating panels — absolute so they don't push layout
    floatingReactionPicker: {
      position: 'absolute',
      bottom: 32,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderRadius: 20, borderWidth: 1,
      paddingHorizontal: 8, paddingVertical: 6,
      zIndex: 100,
      ...shadow.float,
    },
    floatingMenu: {
      position: 'absolute',
      bottom: 32,
      borderRadius: 10, borderWidth: 1,
      paddingVertical: 4,
      minWidth: 130,
      zIndex: 100,
      ...shadow.float,
    },
    floatingAlignLeft: { left: 0 },
    floatingAlignRight: { right: 0 },
    pickerEmojiBtn: { padding: 4, borderRadius: 12 },
    pickerEmoji: { fontSize: 20 },
    menuItem: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingVertical: 8, paddingHorizontal: 12,
    },
    menuItemText: { fontSize: 14 },
  })
}
