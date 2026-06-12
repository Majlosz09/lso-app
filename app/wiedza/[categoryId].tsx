import { useEffect, useMemo, useState } from 'react'
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
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'

type DbEntry = { id: string; section: string; title: string; subtitle: string | null; content: string }

export default function WiedzaCategoryScreen() {
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>()
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
  const router = useRouter()
  const { profile } = useAuthStore()
  const [dbEntries, setDbEntries] = useState<DbEntry[]>([])

  useEffect(() => {
    if (!profile?.parish_id) return
    supabase
      .from('wiedza_entries')
      .select('id, section, title, subtitle, content')
      .eq('parish_id', profile.parish_id)
      .eq('category_id', categoryId)
      .order('display_order')
      .then(({ data }) => setDbEntries(data ?? []))
      .catch(console.error)
  }, [categoryId, profile?.parish_id])

  const category = findCategory(categoryId)

  if (!category) {
    return (
      <View style={styles.center}>
        <Text style={{ color: c.subtext }}>Kategoria nie znaleziona</Text>
      </View>
    )
  }

  const sections: { title: string; sectionId: string; data: any[] }[] = category.sections.map(s => ({
    title: s.title,
    sectionId: s.id,
    data: s.items,
  }))

  // Grupuj wpisy z DB według pola section
  if (dbEntries.length > 0) {
    const grouped: Record<string, DbEntry[]> = {}
    dbEntries.forEach(e => {
      const key = e.section || 'Wpisy parafii'
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(e)
    })
    Object.entries(grouped).forEach(([sectionName, items]) => {
      sections.push({
        title: sectionName,
        sectionId: `db_${sectionName}`,
        data: items.map(e => ({ ...e, _isDb: true })),
      })
    })
  }

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
            {section.sectionId.startsWith('db_') && (
              <View style={styles.parishBadge}>
                <Text style={styles.parishBadgeText}>parafia</Text>
              </View>
            )}
          </View>
        )}
        renderItem={({ item, section }) => {
          const isDb = (item as any)._isDb
          return (
            <TouchableOpacity
              style={styles.itemRow}
              activeOpacity={0.7}
              onPress={() => {
                if (isDb) {
                  router.push(`/wiedza/${categoryId}/__db_${item.id}`)
                } else {
                  router.push(`/wiedza/${categoryId}/${item.id}`)
                }
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                {item.subtitle && (
                  <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={16} color={c.iconMuted} />
            </TouchableOpacity>
          )
        }}
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
      flexDirection: 'row', alignItems: 'center', gap: 8,
    },
    sectionTitle: {
      fontSize: 12, fontWeight: '700', color: c.primary,
      textTransform: 'uppercase', letterSpacing: 0.5,
    },
    parishBadge: {
      backgroundColor: c.primary + '18', borderRadius: 6,
      paddingHorizontal: 6, paddingVertical: 2,
    },
    parishBadgeText: { fontSize: 10, fontWeight: '700', color: c.primary },
    itemRow: {
      backgroundColor: c.surface, borderRadius: 10, padding: 14,
      flexDirection: 'row', alignItems: 'center', ...shadow.xs,
    },
    itemTitle: { fontSize: 15, fontWeight: '600', color: c.text },
    itemSubtitle: { fontSize: 12, color: c.textTertiary, marginTop: 2 },
    separator: { height: 6 },
  })
}
