import { useEffect, useState, useMemo } from 'react'
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { BADGE_CATALOG } from '../../lib/badges'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'
import { shadow } from '../../lib/shadows'

type CatalogEntry = {
  id: string
  name: string
  icon: string
  criteria_key: string
  parish_id: string | null
}

export default function BadgeCatalogScreen() {
  const { profile } = useAuthStore()
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
  const insets = useSafeAreaInsets()
  const [badges, setBadges] = useState<CatalogEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.parish_id) return
    supabase
      .from('badge_definitions')
      .select('id, name, icon, criteria_key, parish_id')
      .or(`parish_id.is.null,parish_id.eq.${profile.parish_id}`)
      .order('name')
      .then(({ data }) => {
        setBadges(data ?? [])
        setLoading(false)
      })
  }, [profile?.parish_id])

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={c.primary} /></View>
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) }]}
      data={badges}
      keyExtractor={item => item.id}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Text style={styles.icon}>{item.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.desc}>
              {BADGE_CATALOG[item.criteria_key] ?? 'Przyznawana ręcznie przez animatora'}
            </Text>
          </View>
        </View>
      )}
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Brak odznak w katalogu.</Text>
        </View>
      }
    />
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    content: { padding: 16 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    row: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 14,
      backgroundColor: c.surface, borderRadius: 12, padding: 14,
      ...shadow.xs,
    },
    icon: { fontSize: 28, lineHeight: 34 },
    name: { fontSize: 15, fontWeight: '600', color: c.text },
    desc: { fontSize: 13, color: c.subtext, marginTop: 2 },
    empty: { alignItems: 'center', padding: 32 },
    emptyText: { fontSize: 14, color: c.textTertiary },
  })
}
