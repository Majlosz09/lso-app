import { StyleSheet, TouchableOpacity, View } from 'react-native'
import { Text } from 'react-native'

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const

interface Props {
  onSelect: (emoji: string) => void
}

export function ReactionBar({ onSelect }: Props) {
  return (
    <View style={styles.row}>
      {EMOJIS.map((emoji) => (
        <TouchableOpacity key={emoji} onPress={() => onSelect(emoji)} style={styles.btn}>
          <Text style={styles.emoji}>{emoji}</Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4 },
  btn: { padding: 6 },
  emoji: { fontSize: 24 },
})
