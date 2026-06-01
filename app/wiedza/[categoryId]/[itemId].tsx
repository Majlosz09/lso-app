import { useMemo } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet
} from 'react-native'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { shadow } from '../../../lib/shadows'
import { useTheme } from '../../../lib/ThemeContext'
import { Colors } from '../../../lib/theme'
import { findItem } from '../../../lib/wiedza'

export default function WiedzaItemScreen() {
  const { categoryId, itemId } = useLocalSearchParams<{ categoryId: string; itemId: string }>()
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const found = findItem(categoryId, itemId)

  if (!found) {
    return (
      <View style={styles.center}>
        <Text style={{ color: c.subtext }}>Nie znaleziono treści</Text>
      </View>
    )
  }

  const { item, allItems } = found
  const currentIndex = allItems.findIndex(i => i.id === itemId)
  const prevItem = currentIndex > 0 ? allItems[currentIndex - 1] : null
  const nextItem = currentIndex < allItems.length - 1 ? allItems[currentIndex + 1] : null

  return (
    <>
      <Stack.Screen options={{ title: item.title }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom + 80, 96) }]}
      >
        {item.subtitle && (
          <Text style={styles.subtitle}>{item.subtitle}</Text>
        )}
        <View style={styles.textCard}>
          <Text style={styles.text}>{item.content}</Text>
        </View>
      </ScrollView>

      <View style={[styles.navBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity
          style={[styles.navBtn, !prevItem && styles.navBtnDisabled]}
          onPress={() => prevItem && router.replace(`/wiedza/${categoryId}/${prevItem.id}`)}
          disabled={!prevItem}
        >
          <Ionicons name="chevron-back" size={18} color={prevItem ? c.primary : c.iconMuted} />
          <Text style={[styles.navText, !prevItem && styles.navTextDisabled]} numberOfLines={1}>
            {prevItem ? prevItem.title : 'Pierwsza'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.navCount}>{currentIndex + 1} / {allItems.length}</Text>

        <TouchableOpacity
          style={[styles.navBtn, styles.navBtnRight, !nextItem && styles.navBtnDisabled]}
          onPress={() => nextItem && router.replace(`/wiedza/${categoryId}/${nextItem.id}`)}
          disabled={!nextItem}
        >
          <Text style={[styles.navText, !nextItem && styles.navTextDisabled]} numberOfLines={1}>
            {nextItem ? nextItem.title : 'Ostatnia'}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={nextItem ? c.primary : c.iconMuted} />
        </TouchableOpacity>
      </View>
    </>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scroll: { flex: 1, backgroundColor: c.bg },
    content: { padding: 16 },
    subtitle: {
      fontSize: 13, color: c.primary, fontWeight: '600',
      marginBottom: 12, textAlign: 'center',
    },
    textCard: {
      backgroundColor: c.surface, borderRadius: 14, padding: 20, ...shadow.md,
    },
    text: { fontSize: 16, color: c.text, lineHeight: 26 },
    navBar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border,
      paddingHorizontal: 16, paddingTop: 12, gap: 8,
    },
    navBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: c.primaryAlpha08, borderRadius: 10, padding: 10,
      borderWidth: 1, borderColor: c.primaryAlpha20,
    },
    navBtnRight: { justifyContent: 'flex-end' },
    navBtnDisabled: { backgroundColor: c.bg, borderColor: c.border },
    navText: { flex: 1, fontSize: 12, color: c.primary, fontWeight: '500' },
    navTextDisabled: { color: c.iconMuted },
    navCount: { fontSize: 12, color: c.textTertiary, minWidth: 40, textAlign: 'center' },
  })
}
