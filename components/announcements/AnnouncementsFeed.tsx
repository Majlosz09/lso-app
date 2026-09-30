import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { sans, serif } from '../../lib/theme'
import { localDateStr, relativeDay } from '../../lib/dates'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { useRealtimeTable } from '../../hooks/useRealtimeTable'
import type { Announcement } from '../../types/database'
import { ensureReads, useReadsStore } from '../../stores/readsStore'
import { AppText, Badge, Icon, ScreenHeader } from '../ui'

const FIXED_AUDIENCE: Record<string, string> = { all: 'Wszyscy', members: 'Ministranci', parents: 'Rodzice' }

/** „dziś, 8:15” / „wczoraj” / „3 dni temu” */
export function announcementWhen(iso: string): string {
  const d = new Date(iso)
  const rel = relativeDay(localDateStr(d))
  return rel === 'dziś' ? `dziś, ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}` : rel
}

/**
 * Ogłoszenia parafii do czytania (ministrant i rodzic). Filtr adresatów jak dotąd:
 * ministrant — wszyscy + ministranci + jego ranga; rodzic — wszyscy + rodzice.
 * Opiekun dodaje ogłoszenia w swoim panelu.
 */
export function AnnouncementsFeed({ homeHref, showBack = true }: { homeHref: string; showBack?: boolean }) {
  const router = useRouter()
  const isDesktop = useIsDesktop()
  const { profile } = useAuthStore()
  const { colors: c } = useTheme()
  const [items, setItems] = useState<Announcement[]>([])
  const [rankNames, setRankNames] = useState<Record<string, string>>({})
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const reads = useReadsStore(st => st.announcement)
  const readsOn = useReadsStore(st => st.available)
  const markRead = useReadsStore(st => st.markRead)
  useEffect(() => { ensureReads(profile?.id) }, [profile?.id])
  // „Nowe” = nieprzeczytane w chwili otwarcia ekranu (znacznik zostaje do wyjścia)
  const [fresh, setFresh] = useState<Set<string> | null>(null)
  useEffect(() => {
    if (fresh || loading || !readsOn) return
    setFresh(new Set(items.filter(a => !reads.has(a.id)).map(a => a.id)))
  }, [loading, readsOn, items])
  // N6: rozwinięte = przeczytane
  useEffect(() => {
    if (!profile?.id || !readsOn) return
    for (const id of Object.keys(open)) if (open[id]) markRead(profile.id, 'announcement', id)
  }, [open, readsOn, profile?.id])

  const load = async () => {
    if (!profile?.parish_id) return
    let query = supabase
      .from('announcements')
      .select('*, author:profiles(full_name)')
      .eq('parish_id', profile.parish_id)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
    if (profile.role === 'member') {
      const targets = ['all', 'members']
      if (profile.rank_id) targets.push(profile.rank_id)
      query = query.in('target_audience', targets)
    } else if (profile.role === 'parent') {
      query = query.in('target_audience', ['all', 'parents'])
    }
    const [{ data }, ranks] = await Promise.all([
      query,
      supabase.from('ranks').select('id, name').or(`parish_id.is.null,parish_id.eq.${profile.parish_id}`),
    ])
    const list = (data ?? []) as Announcement[]
    setItems(list)
    setRankNames(Object.fromEntries((ranks.data ?? []).map((r: any) => [r.id, r.name])))
    // pierwsze (najnowsze / przypięte) rozwinięte
    setOpen(prev => (Object.keys(prev).length || !list[0] ? prev : { [list[0].id]: true }))
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => { load() }, [profile?.parish_id, profile?.rank_id])
  useRealtimeTable('announcements', () => { load() }, profile?.parish_id ? `parish_id=eq.${profile.parish_id}` : undefined)

  const audience = (t: string) => FIXED_AUDIENCE[t] ?? rankNames[t] ?? 'Wybrana grupa'

  const list = loading ? <ActivityIndicator color={c.primary} style={styles.loader} /> : items.length === 0 ? (
    <View style={[styles.empty, { borderColor: c.iconMuted }]}>
      <Icon name="bullhorn" size={36} color={c.iconMuted} />
      <AppText muted>Opiekun nie dodał jeszcze ogłoszeń.</AppText>
    </View>
  ) : items.map(a => {
    const expanded = !!open[a.id]
    return (
      <Pressable
        key={a.id}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setOpen(o => ({ ...o, [a.id]: !o[a.id] }))}
        style={[styles.card, { backgroundColor: c.surface, borderColor: a.is_pinned ? c.gold : c.border }]}
      >
        <View style={styles.head}>
          <View style={styles.tags}>
            {a.is_pinned && (
              <View style={[styles.pinned, { backgroundColor: c.primary }]}>
                <Icon name="pin" size={12} color="#FFFFFF" filled />
                <AppText style={styles.pinnedText}>PRZYPIĘTE</AppText>
              </View>
            )}
            {fresh?.has(a.id) && <Badge label="NOWE" tone="navy" />}
            <Badge label={audience(a.target_audience).toUpperCase()} tone="gold" />
          </View>
          {isDesktop && (
            <AppText variant="small" muted>{`${(a as any).author?.full_name ?? 'Parafia'} · ${announcementWhen(a.created_at)}`}</AppText>
          )}
          <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={c.subtext} />
        </View>
        <AppText style={isDesktop ? [serif(), styles.titleWeb, { color: c.text }] : [styles.title, { color: c.text }]}>
          {a.title}
        </AppText>
        {expanded && <AppText style={[styles.content, { color: c.text }]}>{a.content}</AppText>}
        {!isDesktop && (
          <AppText variant="small" muted>{`${(a as any).author?.full_name ?? 'Parafia'} · ${announcementWhen(a.created_at)}`}</AppText>
        )}
      </Pressable>
    )
  })

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} />}
    >
      {!isDesktop && (
        <ScreenHeader
          title="Ogłoszenia"
          eyebrow={showBack ? undefined : 'Parafia'}
          onBack={showBack ? () => (router.canGoBack() ? router.back() : router.replace(homeHref as any)) : undefined}
        />
      )}
      <View style={[styles.body, isDesktop && styles.desktop]}>{list}</View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  loader: { marginTop: 40 },
  body: { padding: 16, gap: 12, paddingBottom: 32 },
  desktop: { padding: 28, paddingHorizontal: 32, maxWidth: 900 },
  empty: { alignItems: 'center', gap: 10, padding: 28, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 16 },
  card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 8, cursor: 'pointer' } as any,
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tags: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pinned: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  pinnedText: { ...sans(800), fontSize: 10, color: '#FFFFFF', letterSpacing: 0.6 },
  title: { ...sans(800), fontSize: 17, lineHeight: 22 },
  titleWeb: { fontSize: 28, lineHeight: 31 },
  content: { ...sans(500), fontSize: 14, lineHeight: 22 },
})
