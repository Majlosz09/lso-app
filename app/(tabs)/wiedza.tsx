import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { sans, serif } from '../../lib/theme'
import { WIEDZA_DATA, WiedzaCategory, wiedzaKey } from '../../lib/wiedza'
import { ensureReads, useReadsStore } from '../../stores/readsStore'
import { pl } from '../../lib/dates'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { useLiturgyHeader } from '../../hooks/useLiturgyHeader'
import { AppText, Button, Card, Icon, ScreenHeader } from '../../components/ui'

type Entry = { id: string; /** klucz w content_reads (N8) */ key: string; title: string; subtitle?: string | null; content: string; route: string; categoryId: string; section: string }
type DbEntry = { id: string; category_id: string; section: string; title: string; subtitle: string | null; content: string }

/** Wszystkie hasła (wbudowane + wpisy parafii) płasko, z adresem ekranu hasła. */
export function flattenWiedza(db: DbEntry[]): Entry[] {
  const out: Entry[] = []
  for (const cat of WIEDZA_DATA) {
    for (const sec of cat.sections) {
      for (const it of sec.items) {
        out.push({
          ...it, key: wiedzaKey(cat.id, it.id), categoryId: cat.id, section: sec.title,
          route: cat.searchable ? `/wiedza/slowniczek/${it.id}` : `/wiedza/${cat.id}/${it.id}`,
        })
      }
    }
    for (const e of db.filter(d => d.category_id === cat.id)) {
      out.push({
        id: `db-${e.id}`, key: wiedzaKey(cat.id, `__db_${e.id}`), title: e.title, subtitle: e.subtitle, content: e.content,
        categoryId: cat.id, section: e.section || 'Wpisy parafii', route: `/wiedza/${cat.id}/__db_${e.id}`,
      })
    }
  }
  return out
}

export function searchWiedza(entries: Entry[], q: string): Entry[] {
  const needle = q.trim().toLocaleLowerCase('pl')
  if (needle.length < 2) return []
  return entries.filter(e =>
    e.title.toLocaleLowerCase('pl').includes(needle) ||
    (e.subtitle ?? '').toLocaleLowerCase('pl').includes(needle),
  ).slice(0, 20)
}

export default function WiedzaScreen() {
  const router = useRouter()
  const isDesktop = useIsDesktop()
  // wąski desktop (laptop / tablet poziomo): węższe listy, żeby tekst modlitwy miał miejsce
  const narrow = useWindowDimensions().width < 1280
  const { colors: c } = useTheme()
  const { palette } = useLiturgyHeader()
  const parishId = useAuthStore(s => s.profile?.parish_id)
  const profileId = useAuthStore(s => s.profile?.id)
  // opiekun / ksiądz: ten sam widok co ministranci + skrót do własnych wpisów parafii
  const isStaff = useAuthStore(s => s.profile?.role === 'admin' || !!s.profile?.is_admin)
  const home = isStaff ? '/(admin)/(admin-tabs)' : '/(tabs)'
  const editParish = isStaff
    ? <Button compact variant="secondary" icon="pencil" label="Wpisy parafii" onPress={() => router.push('/(admin)/wiedza-admin' as any)} />
    : null
  const reads = useReadsStore(s => s.wiedza)
  const readsOn = useReadsStore(s => s.available)
  const markRead = useReadsStore(s => s.markRead)
  useEffect(() => { ensureReads(profileId) }, [profileId])
  const [db, setDb] = useState<DbEntry[]>([])
  const [query, setQuery] = useState('')
  const [catId, setCatId] = useState(WIEDZA_DATA[0]?.id)
  const [itemId, setItemId] = useState<string | null>(null)

  useEffect(() => {
    if (!parishId) return
    supabase.from('wiedza_entries').select('id, category_id, section, title, subtitle, content')
      .eq('parish_id', parishId).order('display_order')
      .then(({ data }) => setDb((data ?? []) as DbEntry[]))
  }, [parishId])

  const entries = useMemo(() => flattenWiedza(db), [db])
  const results = useMemo(() => searchWiedza(entries, query), [entries, query])
  const countFor = (cat: WiedzaCategory) => entries.filter(e => e.categoryId === cat.id).length
  const readFor = (cat: WiedzaCategory) => entries.filter(e => e.categoryId === cat.id && reads.has(e.key)).length
  /** „12 haseł” albo (N8) „3 z 12 przeczytane” */
  const countLabel = (cat: WiedzaCategory) => readsOn && readFor(cat) > 0
    ? `${readFor(cat)} z ${countFor(cat)} przeczytane`
    : `${countFor(cat)} ${pl(countFor(cat), ['hasło', 'hasła', 'haseł'])}`
  const totalRead = entries.filter(e => reads.has(e.key)).length

  // Web: wyświetlony artykuł = przeczytany
  const deskCat = WIEDZA_DATA.find(w => w.id === catId) ?? WIEDZA_DATA[0]
  const deskEntries = entries.filter(e => e.categoryId === deskCat.id)
  const deskItem = deskEntries.find(e => e.id === itemId) ?? deskEntries[0]
  useEffect(() => {
    if (isDesktop && deskItem && profileId) markRead(profileId, 'wiedza', deskItem.key)
  }, [isDesktop, deskItem?.key, profileId, readsOn])

  const search = (onHeader: boolean) => (
    <View style={[styles.search, { backgroundColor: c.surface, borderColor: onHeader ? 'transparent' : c.inputBorder }]}>
      <Icon name="magnify" size={20} color={c.subtext} />
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Szukaj: kustodia, stuła, Kyrie…"
        placeholderTextColor={c.textTertiary}
        style={[styles.searchInput, { color: c.text }]}
      />
      {!!query && (
        <Pressable onPress={() => setQuery('')} accessibilityLabel="Wyczyść">
          <Icon name="close-circle" size={18} color={c.iconMuted} filled />
        </Pressable>
      )}
    </View>
  )

  const resultList = (onPick: (e: Entry) => void) => (
    <Card flush>
      {results.length === 0 ? (
        <AppText muted style={styles.pad}>Brak haseł dla „{query}”.</AppText>
      ) : results.map((e, i) => (
        <Pressable
          key={e.id}
          onPress={() => onPick(e)}
          style={({ hovered }: any) => [styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: c.borderLight }, hovered && { backgroundColor: c.highlight }]}
        >
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{e.title}</AppText>
            <AppText variant="small" muted numberOfLines={1}>
              {`${WIEDZA_DATA.find(w => w.id === e.categoryId)?.title ?? ''} · ${e.subtitle ?? e.section}`}
            </AppText>
          </View>
          <Icon name="chevron-right" size={20} color={c.iconMuted} />
        </Pressable>
      ))}
    </Card>
  )

  // ── Web: kategorie | hasła | artykuł ─────────────────────────────────────
  if (isDesktop) {
    const cat = deskCat
    const catEntries = deskEntries
    const item = deskItem
    const idx = item ? catEntries.indexOf(item) : -1
    const next = idx >= 0 ? catEntries[idx + 1] : undefined
    return (
      <View style={[styles.desktop, { backgroundColor: c.bg }]}>
        <ScrollView style={[styles.colCats, narrow && { width: 200 }]} contentContainerStyle={styles.colInner}>
          {search(false)}
          {editParish}
          {query ? resultList(e => { setQuery(''); setCatId(e.categoryId); setItemId(e.id) }) : WIEDZA_DATA.map(w => {
            const active = w.id === cat.id
            return (
              <Pressable
                key={w.id}
                onPress={() => { setCatId(w.id); setItemId(null) }}
                style={[styles.catRow, { backgroundColor: active ? c.primary : c.surface, borderColor: active ? c.primary : c.border }]}
              >
                <AppText style={styles.emoji}>{w.emoji}</AppText>
                <View style={styles.flex}>
                  <AppText style={[styles.catTitle, { color: active ? '#FFFFFF' : c.text }]}>{w.title}</AppText>
                  <AppText style={[styles.catSub, { color: active ? '#C9D3E3' : c.subtext }]}>
                    {countLabel(w)}
                  </AppText>
                </View>
              </Pressable>
            )
          })}
        </ScrollView>
        <ScrollView style={[styles.colItems, narrow && { width: 210 }]} contentContainerStyle={styles.colInner}>
          <Card flush>
            {catEntries.map((e, i) => {
              const active = item?.id === e.id
              return (
                <Pressable
                  key={e.id}
                  onPress={() => setItemId(e.id)}
                  style={({ hovered }: any) => [
                    styles.itemRow,
                    i > 0 && { borderTopWidth: 1, borderTopColor: c.borderLight },
                    (active || hovered) && { backgroundColor: active ? c.goldSurface : c.highlight },
                  ]}
                >
                  {active && <View style={[styles.selBar, { backgroundColor: c.gold }]} />}
                  <AppText style={[styles.itemTitle, styles.flex, { color: c.text }, active && sans(800)]} numberOfLines={2}>{e.title}</AppText>
                  {reads.has(e.key) && <Icon name="check-circle" size={16} color={c.success} filled />}
                </Pressable>
              )
            })}
          </Card>
        </ScrollView>
        <ScrollView style={styles.colArticle} contentContainerStyle={styles.colInner}>
          {item ? (
            <Card large style={styles.article}>
              <AppText variant="eyebrow" color={c.goldInk}>{`${cat.title} · ${item.section}`}</AppText>
              <AppText style={[serif(), styles.articleTitle, { color: c.text }]}>{item.title}</AppText>
              {!!item.subtitle && <AppText variant="bodyStrong" muted>{item.subtitle}</AppText>}
              <AppText style={[styles.articleBody, { color: c.text }]}>{item.content}</AppText>
              {next && (
                <Button
                  label={`Następne: ${next.title}`}
                  icon="arrow-right"
                  variant="secondary"
                  compact
                  style={styles.nextBtn}
                  onPress={() => setItemId(next.id)}
                />
              )}
            </Card>
          ) : <AppText muted>Brak haseł w tej kategorii.</AppText>}
        </ScrollView>
      </View>
    )
  }

  // ── Telefon ──────────────────────────────────────────────────────────────
  return (
    <ScrollView style={{ backgroundColor: c.bg }} keyboardShouldPersistTaps="handled">
      <ScreenHeader
        title="Wiedza"
        onBack={() => (router.canGoBack() ? router.back() : router.replace(home as any))}
        right={editParish}
      >
        {search(true)}
      </ScreenHeader>
      <View style={styles.body}>
        {query ? resultList(e => router.push(e.route as any)) : (
          <>
            <View style={styles.catHead}>
              <AppText variant="title">Kategorie</AppText>
              <AppText variant="small" muted>{readsOn && totalRead > 0 ? `${totalRead} z ${entries.length} przeczytane` : `${entries.length} ${pl(entries.length, ['hasło', 'hasła', 'haseł'])}`}</AppText>
            </View>
            <View style={styles.grid}>
              {WIEDZA_DATA.map(w => (
                <Card
                  key={w.id}
                  style={styles.tile}
                  onPress={() => router.push((w.searchable ? '/wiedza/slowniczek' : `/wiedza/${w.id}`) as any)}
                >
                  <AppText style={styles.emoji}>{w.emoji}</AppText>
                  <AppText variant="bodyStrong">{w.title}</AppText>
                  <AppText variant="small" muted>{countLabel(w)}</AppText>
                </Card>
              ))}
            </View>
          </>
        )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  pad: { padding: 14 },
  body: { padding: 16, gap: 14, paddingBottom: 32 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, borderRadius: 14, paddingHorizontal: 14, borderWidth: 1 },
  searchInput: { flex: 1, minWidth: 0, height: '100%', fontSize: 15, ...sans(600), outlineStyle: 'none' } as any,
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, cursor: 'pointer' } as any,
  catHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { width: '47.5%', gap: 6, padding: 16 },
  emoji: { fontSize: 26 },
  desktop: { flex: 1, flexDirection: 'row', gap: 16, paddingHorizontal: 32 },
  colInner: { paddingVertical: 28, gap: 10 },
  colCats: { width: 250, flexGrow: 0 },
  colItems: { width: 270, flexGrow: 0 },
  colArticle: { flex: 1 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, cursor: 'pointer' } as any,
  catTitle: { ...sans(800), fontSize: 14 },
  catSub: { ...sans(600), fontSize: 11 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, cursor: 'pointer' } as any,
  selBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  itemTitle: { ...sans(600), fontSize: 14 },
  article: { padding: 32, gap: 14 },
  articleTitle: { fontSize: 48, lineHeight: 52 },
  articleBody: { ...sans(500), fontSize: 16, lineHeight: 27, maxWidth: 640 },
  nextBtn: { alignSelf: 'flex-start', marginTop: 6 },
})
