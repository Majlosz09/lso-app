import { useState, useMemo } from 'react'
import {
  View, Text, TextInput, FlatList,
  TouchableOpacity, StyleSheet
} from 'react-native'
import { useRouter, Stack } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { shadow } from '../../lib/shadows'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'
import { getAllSlowniczekItems, getSlowniczekTags } from '../../lib/wiedza'

const ALL_ITEMS = getAllSlowniczekItems()
const TAGS = ['Wszystkie', ...getSlowniczekTags()]

export default function SlowniczekScreen() {
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [activeTag, setActiveTag] = useState('Wszystkie')

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    return ALL_ITEMS.filter(item => {
      const matchesTag = activeTag === 'Wszystkie' || item.tag === activeTag
      const matchesQuery = !q ||
        item.title.toLowerCase().includes(q) ||
        item.subtitle?.toLowerCase().includes(q) ||
        item.content.toLowerCase().includes(q)
      return matchesTag && matchesQuery
    })
  }, [query, activeTag])

  return (
    <>
      <Stack.Screen options={{ title: '📖 Słowniczek' }} />
      <View style={styles.container}>
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={18} color={c.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Szukaj hasła..."
            placeholderTextColor={c.textTertiary}
            value={query}
            onChangeText={setQuery}
            clearButtonMode="while-editing"
          />
        </View>

        <FlatList
          data={TAGS}
          keyExtractor={t => t}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tagsList}
          contentContainerStyle={styles.tagsRow}
          renderItem={({ item: tag }) => (
            <TouchableOpacity
              style={[styles.tag, activeTag === tag && styles.tagActive]}
              onPress={() => setActiveTag(tag)}
            >
              <Text style={[styles.tagText, activeTag === tag && styles.tagTextActive]}>
                {tag}
              </Text>
            </TouchableOpacity>
          )}
        />

        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="search-outline" size={40} color={c.iconMuted} />
              <Text style={styles.emptyText}>
                {query ? `Brak wyników dla "${query}"` : `Brak wyników w kategorii "${activeTag}"`}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.item}
              activeOpacity={0.7}
              onPress={() => router.push(`/wiedza/slowniczek/${item.id}`)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                {item.subtitle && (
                  <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
                )}
                <Text style={styles.itemPreview} numberOfLines={2}>{item.content}</Text>
              </View>
              {item.tag && (
                <View style={styles.tagBadge}>
                  <Text style={styles.tagBadgeText}>{item.tag}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        />
      </View>
    </>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    searchRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: c.surface, borderRadius: 12,
      marginHorizontal: 16, marginTop: 16, marginBottom: 8,
      paddingHorizontal: 14, paddingVertical: 11,
      borderWidth: 1.5, borderColor: c.primaryAlpha20, ...shadow.xs,
    },
    searchInput: { flex: 1, fontSize: 15, color: c.text },
    tagsList: { flexGrow: 0, flexShrink: 0 },
    tagsRow: { paddingHorizontal: 16, paddingBottom: 12, gap: 8, alignItems: 'center' },
    tag: {
      paddingHorizontal: 14, paddingVertical: 7,
      borderRadius: 20, backgroundColor: c.surface,
      borderWidth: 1, borderColor: c.border,
      alignSelf: 'flex-start',
    },
    tagActive: { backgroundColor: c.primary, borderColor: c.primary },
    tagText: { fontSize: 13, fontWeight: '500', color: c.subtext },
    tagTextActive: { color: c.white },
    list: { paddingHorizontal: 16, paddingBottom: 24 },
    item: {
      backgroundColor: c.surface, borderRadius: 12, padding: 14,
      flexDirection: 'row', alignItems: 'flex-start', gap: 10, ...shadow.xs,
    },
    itemTitle: { fontSize: 15, fontWeight: '700', color: c.text },
    itemSubtitle: { fontSize: 12, color: c.primary, marginTop: 1 },
    itemPreview: { fontSize: 13, color: c.textTertiary, marginTop: 4, lineHeight: 18 },
    tagBadge: {
      backgroundColor: c.primaryAlpha08, borderRadius: 8,
      paddingHorizontal: 8, paddingVertical: 4, marginTop: 2,
    },
    tagBadgeText: { fontSize: 11, color: c.primary, fontWeight: '600' },
    empty: { alignItems: 'center', marginTop: 60, gap: 10 },
    emptyText: { color: c.textTertiary, fontSize: 15 },
  })
}
