import { useMemo } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { shadow } from '../../lib/shadows'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'
import { WIEDZA_DATA } from '../../lib/wiedza'

export default function WiedzaScreen() {
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
  const router = useRouter()

  return (
    <View style={styles.container}>
      <FlatList
        data={WIEDZA_DATA}
        keyExtractor={item => item.id}
        numColumns={2}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.row}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.75}
            onPress={() => {
              if (item.searchable) {
                router.push('/wiedza/slowniczek')
              } else {
                router.push(`/wiedza/${item.id}`)
              }
            }}
          >
            <Text style={styles.emoji}>{item.emoji}</Text>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.count}>{item.itemCount} pozycji</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    grid: { padding: 16 },
    row: { gap: 12, marginBottom: 12 },
    card: {
      flex: 1, backgroundColor: c.surface, borderRadius: 14,
      padding: 16, alignItems: 'center', gap: 6, ...shadow.md,
    },
    emoji: { fontSize: 28 },
    title: { fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'center' },
    count: { fontSize: 11, color: c.textTertiary },
  })
}
