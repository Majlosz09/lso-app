import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../lib/ThemeContext'
import { sans, serif, VESTMENT_DOT, VestmentColor } from '../../lib/theme'
import { DAY_LONG, shortDate, weekDays } from '../../lib/dates'
import { getLiturgicalDay, useLiturgyVersion } from '../../lib/liturgy'
import { AppText, Card, Icon } from '../../components/ui'

type PubService = { date: string; time: string; title: string; category: string; mode: string; church: string | null; people: { name: string; role: string | null }[] }
type Pub = { parish: string; city: string | null; services: PubService[] }

/**
 * Grafik bez logowania (link od księdza dla rodziców): tydzień po tygodniu, imię + inicjał nazwiska.
 * Działa w przeglądarce bez konta — dane z public_schedule(token).
 */
export default function PublicScheduleScreen() {
  useLiturgyVersion()
  const { token } = useLocalSearchParams<{ token: string }>()
  const { colors: c } = useTheme()
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState<Pub | null | undefined>(undefined)
  const days = useMemo(() => weekDays(offset), [offset])

  useEffect(() => {
    if (!token) return
    setData(undefined)
    supabase.rpc('public_schedule', { p_token: token, p_from: days[0], p_to: days[6] })
      .then(({ data: d }) => setData((d as Pub) ?? null))
  }, [token, days])

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.body}>
      <Stack.Screen options={{ headerShown: false, title: 'Grafik służby' }} />
      <View style={[styles.head, { backgroundColor: c.primary }]}>
        <AppText variant="eyebrow" color={c.gold}>Grafik ministrantów</AppText>
        <AppText style={[serif(), styles.title]}>{data?.parish ?? 'LSO App'}</AppText>
        {!!data?.city && <AppText style={styles.city}>{data.city}</AppText>}
      </View>

      <View style={styles.nav}>
        <Pressable accessibilityLabel="Poprzedni tydzień" onPress={() => setOffset(o => o - 1)} style={[styles.navBtn, { backgroundColor: c.surface }]}>
          <Icon name="chevron-left" size={22} color={c.primary} />
        </Pressable>
        <AppText variant="bodyStrong">{`${shortDate(days[0])} – ${shortDate(days[6])}`}</AppText>
        <Pressable accessibilityLabel="Następny tydzień" onPress={() => setOffset(o => o + 1)} style={[styles.navBtn, { backgroundColor: c.surface }]}>
          <Icon name="chevron-right" size={22} color={c.primary} />
        </Pressable>
      </View>

      {data === undefined ? <ActivityIndicator color={c.primary} style={styles.pad} /> : data === null ? (
        <Card large><AppText>Ten link do grafiku jest nieaktualny. Poproś księdza o nowy.</AppText></Card>
      ) : days.map(d => {
        const lit = getLiturgicalDay(d)
        const list = data.services.filter(s => s.date === d)
        return (
          <View key={d} style={styles.day}>
            <View style={styles.dayHead}>
              <View style={[styles.dot, { backgroundColor: VESTMENT_DOT[(lit.color ?? 'GREEN') as VestmentColor] }]} />
              <AppText variant="bodyStrong">{`${DAY_LONG[new Date(d + 'T12:00:00').getDay()]}, ${shortDate(d)}`}</AppText>
              <AppText variant="small" muted numberOfLines={1} style={styles.flex}>{lit.name}</AppText>
            </View>
            {list.length === 0 ? <AppText variant="small" muted style={styles.empty}>Brak służb</AppText> : list.map((s, i) => (
              <Card key={`${s.time}-${i}`} style={styles.svc}>
                <View style={styles.row}>
                  <AppText style={styles.time}>{s.time}</AppText>
                  <View style={styles.flex}>
                    <AppText variant="bodyStrong">{s.title}</AppText>
                    {!!s.church && <AppText variant="small" color={c.goldInk}>{s.church}</AppText>}
                  </View>
                </View>
                {s.mode !== 'none' && (
                  <AppText variant="small" muted>
                    {s.people.length ? s.people.map(p => (p.role ? `${p.name} (${p.role})` : p.name)).join(' · ') : 'obsada jeszcze nieustalona'}
                  </AppText>
                )}
              </Card>
            ))}
          </View>
        )
      })}
      <AppText variant="small" muted style={styles.foot}>LSO App · lsoapp.com</AppText>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  body: { paddingBottom: 32, maxWidth: 720, width: '100%', alignSelf: 'center' },
  head: { padding: 22, paddingTop: 34, gap: 4 },
  title: { fontSize: 30, lineHeight: 34, color: '#FFFFFF' },
  city: { ...sans(600), color: '#C9D3E3' },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  navBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  pad: { padding: 24 },
  day: { paddingHorizontal: 16, gap: 6, marginBottom: 14 },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  empty: { paddingLeft: 17 },
  svc: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  time: { ...sans(800), fontSize: 16, width: 52 },
  flex: { flex: 1, minWidth: 0 },
  foot: { textAlign: 'center', marginTop: 8 },
})
