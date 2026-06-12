import { InteractionManager, Modal, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View, useWindowDimensions } from 'react-native'
import { useMemo } from 'react'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'
import { ReactionBar } from './ReactionBar'
import { ChatMessageWithSender } from '../../types/chat'

interface Props {
  visible: boolean
  message: ChatMessageWithSender | null
  currentUserId: string
  isAdmin: boolean
  onClose: () => void
  onReact: (emoji: string) => void
  onReply: () => void
  onEdit: () => void
  onDelete: () => void
  messageY?: number
}

export function MessageActionSheet({
  visible, message, currentUserId, isAdmin,
  onClose, onReact, onReply, onEdit, onDelete,
  messageY,
}: Props) {
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
  const { height: SCREEN_HEIGHT } = useWindowDimensions()

  if (!message) return null

  const isOwn = message.sender_id === currentUserId
  const canEdit = isOwn && message.type !== 'poll' && !message.deleted_at
  const canDelete = (isOwn || isAdmin) && !message.deleted_at

  const handleReact = (emoji: string) => {
    onReact(emoji)
    onClose()
  }

  // Position sheet near the pressed message.
  // top half  → sheet starts just below the touch point (marginTop)
  // bottom half → sheet ends just above the touch point (marginBottom)
  const isTopHalf = (messageY ?? SCREEN_HEIGHT / 2) < SCREEN_HEIGHT / 2
  const sheetPositionStyle = messageY != null
    ? isTopHalf
      ? { marginTop: messageY + 12 }
      : { marginBottom: SCREEN_HEIGHT - messageY }
    : {}

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={[styles.overlay, isTopHalf ? styles.overlayTop : styles.overlayBottom]}>
          <TouchableWithoutFeedback>
            <View style={[styles.sheet, { backgroundColor: c.surface }, sheetPositionStyle]}>
              <View style={[styles.emojiRow, { borderBottomColor: c.border }]}>
                <ReactionBar onSelect={handleReact} />
              </View>
              <TouchableOpacity style={styles.action} onPress={() => { onReply(); onClose() }}>
                <Text style={[styles.actionText, { color: c.text }]}>💬  Odpowiedz</Text>
              </TouchableOpacity>
              {canEdit && (
                <TouchableOpacity style={styles.action} onPress={() => { onEdit(); onClose() }}>
                  <Text style={[styles.actionText, { color: c.text }]}>✏️  Edytuj</Text>
                </TouchableOpacity>
              )}
              {canDelete && (
                <TouchableOpacity
                  style={styles.action}
                  onPress={() => {
                    onClose()
                    // Wait for the modal fade-out to finish before showing the Alert.
                    // Without this delay the Alert can be swallowed by the closing animation.
                    InteractionManager.runAfterInteractions(() => onDelete())
                  }}
                >
                  <Text style={[styles.actionText, { color: c.danger }]}>🗑️  Usuń</Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    overlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    },
    overlayTop: { justifyContent: 'flex-start' },
    overlayBottom: { justifyContent: 'flex-end' },
    sheet: {
      borderRadius: 16,
      paddingBottom: 16,
    },
    emojiRow: {
      padding: 12, paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      alignItems: 'center',
    },
    action: { paddingVertical: 14, paddingHorizontal: 20 },
    actionText: { fontSize: 16 },
  })
}
