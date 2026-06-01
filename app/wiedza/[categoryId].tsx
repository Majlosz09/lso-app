import { useMemo } from 'react'
import {
  View, Text, StyleSheet, SectionList
} from 'react-native'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { TouchableOpacity } from 'react-native'
import { shadow } from '../../lib/shadows'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'
import { findCategory } from '../../lib/wiedza'

export default function WiedzaCategoryScreen() {
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>()
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
  const router = useRouter()

  const category = findCategory(categoryId)

  if (!category) {
    return (
      <View style={styles.center}>
        <Text style={{ color: c.subtext }}>Kategoria nie znaleziona</Text>
      </View>
    )
  }

  const sections = category.sections.map(s => ({
    title: s.title,
    sectionId: s.id,
    data: s.items,
  }))

  return (
    <>
      <Stack.Screen options={{ title: `${category.emoji} ${category.title}` }} />
      <SectionList
        sections={sections}
        keyExtractor={item => item.id}
        style={{ backgroundColor: c.bg }}
        contentContainerStyle={styles.content}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.itemRow}
            activeOpacity={0.7}
            onPress={() => router.push(`/wiedza/${categoryId}/${item.id}`)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              {item.subtitle && (
                <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={16} color={c.iconMuted} />
          </TouchableOpacity>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    content: { padding: 16, gap: 8 },
    sectionHeader: {
      paddingVertical: 6, paddingHorizontal: 4, marginTop: 8,
    },
    sectionTitle: {
      fontSize: 12, fontWeight: '700', color: c.primary,
      textTransform: 'uppercase', letterSpacing: 0.5,
    },
    itemRow: {
      backgroundColor: c.surface, borderRadius: 10, padding: 14,
      flexDirection: 'row', alignItems: 'center', ...shadow.xs,
    },
    itemTitle: { fontSize: 15, fontWeight: '600', color: c.text },
    itemSubtitle: { fontSize: 12, color: c.textTertiary, marginTop: 2 },
    separator: { height: 6 },
  })
}
