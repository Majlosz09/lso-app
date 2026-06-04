import { useMemo } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'
import { ChatMessageWithSender } from '../../types/chat'

interface Props {
  message: ChatMessageWithSender
  mode: 'reply' | 'edit'
  onCancel: () => void
}

export function ReplyPreview({ message, mode, onCancel }: Props) {
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  const label = mode === 'edit'
    ? 'Edytujesz'
    : `Odpowiadasz ${message.sender?.full_name ?? 'Ktoś'}`

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceElevated, borderTopColor: c.border }]}>
      <View style={[styles.bar, { backgroundColor: c.primary }]} />
      <View style={styles.content}>
        <Text style={[styles.name, { color: c.primary }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.preview, { color: c.subtext }]} numberOfLines={1}>
          {message.type === 'poll' ? '📊 Ankieta' : message.content}
        </Text>
      </View>
      <TouchableOpacity onPress={onCancel} style={styles.cancel}>
        <Text style={[styles.cancelText, { color: c.subtext }]}>✕</Text>
      </TouchableOpacity>
    </View>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: 6, paddingHorizontal: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      gap: 8,
    },
    bar: { width: 3, height: 32, borderRadius: 2 },
    content: { flex: 1 },
    name: { fontSize: 12, fontWeight: '600' },
    preview: { fontSize: 12 },
    cancel: { padding: 4 },
    cancelText: { fontSize: 18 },
  })
}
