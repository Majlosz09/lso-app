import { useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { sans, VESTMENT_DOT, VestmentColor } from '../../lib/theme'
import { getLiturgicalDay } from '../../lib/liturgy'
import { dayShort, localDateStr, monthName, shortDate, weekDays } from '../../lib/dates'
import { serviceAvailability } from '../../lib/serviceRules'
import { effectiveMode } from '../../lib/attendance'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { useLiturgyHeader } from '../../hooks/useLiturgyHeader'
import { Service, useServices } from '../../hooks/useServices'
import { useServiceActions } from '../../components/services/useServiceActions'
import { ServiceCard } from '../../components/services/ServiceCard'
import { ServiceDetail } from '../../components/services/ServiceDetail'
import { AppText, Card, Icon, ScreenHeader, Segmented } from '../../components/ui'

type Seg = 'mine' | 'all' | 'free'

export default function ScheduleScreen() {
  const router = useRouter()
  const isDesktop = useIsDesktop()
  const { colors: c } = useTheme()
  const parish = useAuthStore(s => s.parish)
  const { palette } = useLiturgyHeader()

  const [weekOffset, setWeekOffset] = useState(0)
  const [seg, setSeg] = useState<Seg>('mine')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const days = useMemo(() => weekDays(weekOffset), [weekOffset])
  const { services, loading, refresh } = useServices(days[0], days[6])
  const actions = useServiceActions(refresh)
  const [refreshing, setRefreshing] = useState(false)
  const mode = effectiveMode(parish)

  const filtered = useMemo(() => services.filter(s => {
    if (seg === 'mine') return !!s.mine
    if (seg === 'free') return serviceAvailability(s, mode).canSignUp
    return true
  }), [services, seg, mode])

  const groups = useMemo(() => days
    .map(d => ({ date: d, items: filtered.filter(s => s.date === d) }))
    .filter(g => g.items.length > 0), [days, filtered])

  const selected = isDesktop
    ? filtered.find(s => s.id === selectedId) ?? filtered.find(s => s.mine && s.date >= localDateStr()) ?? filtered[0]
    : undefined

  const open = (s: Service) => {
    if (isDesktop) setSelectedId(s.id)
    else router.push({ pathname: '/(tabs)/service', params: { id: s.id, date: s.date, time: s.time } } as any)
  }

  const weekLabel = `${shortDate(days[0])} – ${shortDate(days[6])}`
  const segOptions = [
    { value: 'mine' as const, label: 'Moje' },
    { value: 'all' as const, label: 'Wszystkie' },
    { value: 'free' as const, label: 'Wolne' },
  ]

  const weekSwitch = (onHeader: boolean) => (
    <View style={[styles.weekSwitch, { backgroundColor: onHeader ? palette.chip : c.surface, borderColor: onHeader ? 'transparent' : c.border }]}>
      <Pressable accessibilityLabel="Poprzedni tydzień" onPress={() => setWeekOffset(o => o - 1)} hitSlop={6}>
        <Icon name="chevron-left" size={20} color={onHeader ? palette.fg : c.primary} />
      </Pressable>
      <AppText style={[styles.weekText, { color: onHeader ? palette.fg : c.text }]}>{weekLabel}</AppText>
      <Pressable accessibilityLabel="Następny tydzień" onPress={() => setWeekOffset(o => o + 1)} hitSlop={6}>
        <Icon name="chevron-right" size={20} color={onHeader ? palette.fg : c.primary} />
      </Pressable>
    </View>
  )

  const list = (
    <View style={styles.list}>
      {loading ? (
        <ActivityIndicator color={c.primary} style={styles.loader} />
      ) : groups.length === 0 ? (
        <View style={[styles.empty, { borderColor: c.iconMuted }]}>
          <AppText muted style={styles.emptyText}>
            {seg === 'mine' ? 'W tym tygodniu nie masz służb. Zajrzyj do zakładki „Wolne”.' : 'W tym tygodniu nie ma tu żadnych służb.'}
          </AppText>
        </View>
      ) : groups.map(g => {
        const lit = getLiturgicalDay(g.date)
        const color = (lit.color ?? 'GREEN') as VestmentColor
        return (
          <View key={g.date} style={styles.group}>
            <View style={styles.dayHead}>
              <View style={[styles.dot, { backgroundColor: VESTMENT_DOT[color] }, color === 'WHITE' && { borderWidth: 1, borderColor: c.gold }]} />
              <AppText style={[styles.dayLabel, { color: c.text }]}>{`${dayShort(g.date)} ${shortDate(g.date)}`}</AppText>
              <AppText variant="small" muted numberOfLines={1} style={styles.flex}>{lit.name}</AppText>
            </View>
            {g.items.map(s => (
              <ServiceCard
                key={s.id}
                service={s}
                showPeople={!isDesktop && seg !== 'free'}
                selected={isDesktop && selected?.id === s.id}
                onPress={() => open(s)}
              />
            ))}
          </View>
        )
      })}
    </View>
  )

  if (isDesktop) {
    return (
      <View style={[styles.desktop, { backgroundColor: c.bg }]}>
        <ScrollView style={styles.desktopList} contentContainerStyle={styles.desktopListInner}>
          <View style={styles.desktopBar}>
            <Segmented options={segOptions} value={seg} onChange={setSeg} style={styles.desktopSeg} />
            {weekSwitch(false)}
          </View>
          {list}
        </ScrollView>
        <ScrollView style={styles.desktopPanel} contentContainerStyle={styles.desktopPanelInner}>
          {selected ? (
            <Card large flush>
              <ServiceDetail service={selected} actions={actions} compactHeader />
            </Card>
          ) : (
            <AppText muted>Wybierz służbę z listy.</AppText>
          )}
        </ScrollView>
        {actions.sheets}
      </View>
    )
  }

  return (
    <View style={[styles.flex, { backgroundColor: c.bg }]}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refresh(); setRefreshing(false) }} />}
        stickyHeaderIndices={[]}
      >
        <ScreenHeader
          eyebrow={weekOffset === 0 ? 'Ten tydzień' : weekOffset === 1 ? 'Następny tydzień' : weekOffset === -1 ? 'Poprzedni tydzień' : monthName(days[3])}
          title="Grafik"
          right={weekSwitch(true)}
        >
          <Segmented options={segOptions} value={seg} onChange={setSeg} tone="onHeader" headerFg={palette.fg} headerChip={palette.chip} />
        </ScreenHeader>
        <View style={styles.mobileBody}>{list}</View>
      </ScrollView>
      {actions.sheets}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  mobileBody: { padding: 16, paddingBottom: 32 },
  list: { gap: 16 },
  loader: { marginTop: 40 },
  group: { gap: 8 },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dayLabel: { ...sans(700), fontSize: 13 },
  empty: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 16, padding: 26 },
  emptyText: { textAlign: 'center' },
  weekSwitch: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  weekText: { ...sans(700), fontSize: 13, fontVariant: ['tabular-nums'] },
  desktop: { flex: 1, flexDirection: 'row', gap: 24, paddingHorizontal: 32 },
  desktopList: { flex: 1.1 },
  desktopListInner: { paddingVertical: 28, gap: 16 },
  desktopBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  desktopSeg: { width: 300 },
  desktopPanel: { flex: 1 },
  desktopPanelInner: { paddingVertical: 28 },
})
