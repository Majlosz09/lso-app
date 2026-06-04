import { Modal, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native'
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
}

export function MessageActionSheet({
  visible, message, currentUserId, isAdmin,
  onClose, onReact, onReply, onEdit, onDelete,
}: Props) {
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  if (!message) return null

  const isOwn = message.sender_id === currentUserId
  const canEdit = isOwn && message.type !== 'poll' && !message.deleted_at
  const canDelete = (isOwn || isAdmin) && !message.deleted_at

  const handleReact = (emoji: string) => {
    onReact(emoji)
    onClose()
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.sheet, { backgroundColor: c.surface }]}>
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
                <TouchableOpacity style={styles.action} onPress={() => { onDelete(); onClose() }}>
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
      justifyContent: 'flex-end',
    },
    sheet: {
      borderTopLeftRadius: 16, borderTopRightRadius: 16,
      paddingBottom: 32,
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
