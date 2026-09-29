import { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { BADGE_CATALOG } from '../../lib/badges'
import { useTheme } from '../../lib/ThemeContext'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { AppText, Badge, Card, ScreenHeader } from '../../components/ui'

type CatalogEntry = { id: string; name: string; icon: string; criteria_key: string; parish_id: string | null }

export default function BadgeCatalogScreen() {
  const router = useRouter()
  const isDesktop = useIsDesktop()
  const { profile } = useAuthStore()
  const { colors: c } = useTheme()
  const [badges, setBadges] = useState<CatalogEntry[]>([])
  const [earned, setEarned] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.parish_id) return
    Promise.all([
      supabase.from('badge_definitions').select('id, name, icon, criteria_key, parish_id')
        .or(`parish_id.is.null,parish_id.eq.${profile.parish_id}`).order('name'),
      supabase.from('member_badges').select('badge_definition:badge_definitions(criteria_key)')
        .eq('profile_id', profile.id).eq('is_active', true),
    ]).then(([defs, mine]) => {
      setBadges((defs.data ?? []) as CatalogEntry[])
      setEarned(new Set(((mine.data ?? []) as any[]).map(m => m.badge_definition?.criteria_key).filter(Boolean)))
      setLoading(false)
    })
  }, [profile?.parish_id, profile?.id])

  const list = loading ? <ActivityIndicator color={c.primary} style={styles.loader} /> : (
    <Card flush>
      {badges.length === 0 ? <AppText muted style={styles.pad}>Brak odznak w katalogu.</AppText> : badges.map((b, i) => {
        const has = earned.has(b.criteria_key)
        return (
          <View key={b.id} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: c.borderLight }]}>
            <View style={[styles.circle, { backgroundColor: has ? c.primary : c.borderLight }]}>
              <AppText style={[styles.icon, !has && styles.dim]}>{b.icon}</AppText>
            </View>
            <View style={styles.flex}>
              <AppText variant="bodyStrong">{b.name}</AppText>
              <AppText variant="small" muted>{BADGE_CATALOG[b.criteria_key] ?? 'Przyznawana ręcznie przez opiekuna'}</AppText>
            </View>
            {has && <Badge label="Masz" tone="success" />}
          </View>
        )
      })}
    </Card>
  )

  return (
    <ScrollView style={{ backgroundColor: c.bg }}>
      {!isDesktop && (
        <ScreenHeader
          eyebrow="Odznaki"
          title="Katalog odznak"
          onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/points'))}
        />
      )}
      <View style={[styles.body, isDesktop && styles.desktop]}>{list}</View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  loader: { marginTop: 40 },
  pad: { padding: 14 },
  body: { padding: 16, paddingBottom: 32 },
  desktop: { padding: 28, paddingHorizontal: 32, maxWidth: 820, width: '100%', alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 12 },
  circle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 20 },
  dim: { opacity: 0.45 },
})
