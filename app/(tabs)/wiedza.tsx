import { useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'

export default function WiedzaScreen() {
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  return (
    <View style={styles.container}>
      <Ionicons name="book-outline" size={64} color="#C4B5FD" />
      <Text style={styles.title}>Wiedza</Text>
      <Text style={styles.subtitle}>Wkrótce tu coś będzie</Text>
    </View>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.bg,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      color: c.text,
    },
    subtitle: {
      fontSize: 15,
      color: c.textTertiary,
    },
  })
}
