import { useEffect, useMemo, useState } from 'react'
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { headerPalette, sans, serif, VESTMENT_DOT, VESTMENT_NAMES, VestmentColor } from '../../lib/theme'
import { shadow } from '../../lib/shadows'
import { getLiturgicalDay } from '../../lib/liturgy'
import { addDays, dayMonth, dayNum, dayShort, localDateStr, longDate, pl, relativeDay, weekdayShortDate } from '../../lib/dates'
import { serviceAvailability } from '../../lib/serviceRules'
import { effectiveMode } from '../../lib/attendance'
import { CATEGORY_CONFIG } from '../../types/database'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { useLiturgyHeader } from '../../hooks/useLiturgyHeader'
import { useRealtimeTable } from '../../hooks/useRealtimeTable'
import { Service, useServices } from '../../hooks/useServices'
import { useServiceActions } from '../../components/services/useServiceActions'
import { DayStrip } from '../../components/services/DayStrip'
import { SwapInbox } from '../../components/services/SwapInbox'
import { DailyWordCard } from '../../components/services/DailyWordCard'
import { NotificationBell } from '../../components/layout/NotificationBell'
import { useSwapStore } from '../../stores/swapStore'
import { useUnreadAnnouncements } from '../../hooks/useUnreadAnnouncements'
import { useWiedzaReads } from '../../hooks/useWiedzaReads'
import { builtInKeys, countRead } from '../../lib/wiedza'

const WIEDZA_KEYS = builtInKeys()
import { AppText, Avatar, Badge, Button, Card, HeaderChip, Icon, IconButton, SectionHeader } from '../../components/ui'

type Ann = { id: string; title: string; created_at: string; author: { full_name: string } | null }

function useHomeData() {
  const profile = useAuthStore(s => s.profile)
  const [points, setPoints] = useState<{ total: number; services: number; rank: number } | null>(null)
  const [anns, setAnns] = useState<Ann[]>([])
  const [rankName, setRankName] = useState<string | null>(null)

  const load = async () => {
    if (!profile?.id || !profile.parish_id) return
    const targets = ['all', 'members', ...(profile.rank_id ? [profile.rank_id] : [])]
    const [mine, ranking, annRes, rankRes] = await Promise.all([
      supabase.from('points_summary').select('total_points, services_count').eq('profile_id', profile.id).maybeSingle(),
      supabase.from('points_summary').select('profile_id').eq('parish_id', profile.parish_id).order('total_points', { ascending: false }),
      supabase.from('announcements').select('id, title, created_at, author:profiles(full_name)')
        .eq('parish_id', profile.parish_id).in('target_audience', targets)
        .order('is_pinned', { ascending: false }).order('created_at', { ascending: false }).limit(2),
      profile.rank_id ? supabase.from('ranks').select('name').eq('id', profile.rank_id).maybeSingle() : Promise.resolve({ data: null }),
    ])
    const pos = ((ranking.data ?? []) as any[]).findIndex(r => r.profile_id === profile.id) + 1
    setPoints({ total: mine.data?.total_points ?? 0, services: mine.data?.services_count ?? 0, rank: pos })
    setAnns((annRes.data ?? []) as any)
    setRankName((rankRes as any).data?.name ?? null)
  }

  useEffect(() => { load() }, [profile?.id, profile?.rank_id])
  useRealtimeTable('announcements', () => { load() }, profile?.parish_id ? `parish_id=eq.${profile.parish_id}` : undefined)
  return { points, anns, rankName, reload: load }
}

/** Najbliższa moja służba (jeśli nie ma jej w bieżącym tygodniu — szukamy dalej). */
function useNextService(week: Service[]) {
  const profile = useAuthStore(s => s.profile)
  const today = localDateStr()
  const inWeek = week.find(s => s.mine && !s.attended && s.mine.status === 'assigned' && s.date >= today
    && new Date(`${s.date}T${s.time}`).getTime() + 90 * 60_000 > Date.now())
  const [later, setLater] = useState<{ id: string; date: string; time: string; title: string } | null>(null)
  useEffect(() => {
    if (inWeek || !profile?.id) { setLater(null); return }
    supabase.from('schedule_assignments')
      .select('schedule:schedules!inner(id, date, time, title)')
      .eq('profile_id', profile.id).eq('status', 'assigned')
      .gt('schedule.date', addDays(today, 6))
      .order('schedule(date)').limit(1)
      .then(({ data }) => {
        const s = (data?.[0] as any)?.schedule
        setLater(s ? { id: s.id, date: s.date, time: s.time.slice(0, 5), title: s.title } : null)
      })
  }, [inWeek?.id, profile?.id])
  return { next: inWeek, later }
}

export default function HomeScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const isDesktop = useIsDesktop()
  const { colors: c, isDark } = useTheme()
  const { profile, parish } = useAuthStore()
  const today = localDateStr()
  const liturgy = useLiturgyHeader()
  const pal = liturgy.palette
  const [day, setDay] = useState(today)
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today, i)), [today])
  const { services, refresh } = useServices(today, days[6])
  const actions = useServiceActions(refresh)
  const { points, anns, rankName, reload } = useHomeData()
  const { next, later } = useNextService(services)
  const [refreshing, setRefreshing] = useState(false)
  const unreadAnn = useUnreadAnnouncements()
  const { reads: wiedzaReads, available: readsOn } = useWiedzaReads()
  const wiedzaRead = countRead(WIEDZA_KEYS, wiedzaReads)

  const firstName = (profile?.full_name ?? '').split(' ')[0]
  const dayServices = services.filter(s => s.date === day)
  const mode = effectiveMode(parish)
  const goService = (s: { id: string; date: string; time: string }) =>
    router.push({ pathname: isDesktop ? '/(tabs)/schedule' : '/(tabs)/service', params: { id: s.id, date: s.date, time: s.time } } as any)

  const pointsChip = points ? `${points.total} pkt · #${points.rank || '—'} w parafii` : '…'

  // ── Karta „Twoja najbliższa służba” ──────────────────────────────────────
  const nextCard = (hero: boolean) => {
    const target = next ?? later
    if (!target) {
      return (
        <Card large style={[styles.nextCard, !hero && shadow.hero]}>
          <AppText variant="eyebrow" color={c.goldInk}>Twoja najbliższa służba</AppText>
          <AppText variant="heading">Nie masz zaplanowanych służb</AppText>
          <AppText muted>Zajrzyj do grafiku i zapisz się na wolną Mszę.</AppText>
          <Button label="Przejdź do grafiku" icon="calendar-month" onPress={() => router.push('/(tabs)/schedule')} />
        </Card>
      )
    }
    const avail = next ? serviceAvailability(next, mode) : null
    const lit = getLiturgicalDay(target.date)
    const vest = (lit.color ?? 'GREEN') as VestmentColor
    const heroPal = headerPalette(vest, isDark)
    const fg = hero ? heroPal.fg : c.text
    const sub = hero ? heroPal.accent : c.subtext
    return (
      <Card
        large
        style={[styles.nextCard, hero ? { backgroundColor: heroPal.bg, borderColor: heroPal.bg } : shadow.hero]}
        onPress={() => goService(target)}
      >
        <View style={styles.nextHead}>
          <AppText variant="eyebrow" color={hero ? heroPal.accent : c.goldInk} style={styles.flex}>
            {`Twoja najbliższa służba${hero ? ` · ${relativeDay(target.date)}` : ''}`}
          </AppText>
          {hero
            ? <HeaderChip label={pointsChip} palette={heroPal} />
            : <Badge label={relativeDay(target.date)} tone="gold" />}
        </View>
        <View style={styles.nextMain}>
          <View style={[styles.dateTile, hero && styles.dateTileHero, { backgroundColor: c.primary }]}>
            <AppText style={[styles.dateDow, { color: c.gold }]}>{dayShort(target.date).toUpperCase()}</AppText>
            <AppText style={[styles.dateNum, hero && { fontSize: 34, lineHeight: 38 }]}>{dayNum(target.date)}</AppText>
            <AppText style={styles.dateTime}>{target.time}</AppText>
          </View>
          <View style={styles.flex}>
            <AppText style={[serif(), { fontSize: hero ? 36 : 22, lineHeight: hero ? 39 : 26, color: fg }]} numberOfLines={2}>
              {target.title}
            </AppText>
            <AppText style={[styles.nextSub, { color: sub }]} numberOfLines={2}>
              {`Ministrant · ${VESTMENT_NAMES[vest]}${hero ? ` · ${longDate(target.date)}` : ''}`}
            </AppText>
          </View>
          {!hero && <Icon name="chevron-right" size={22} color={c.iconMuted} />}
        </View>
        {next && (
          <View style={styles.nextActions}>
            {avail?.canCheckIn ? (
              <Button
                label="Potwierdź obecność"
                icon="account-check"
                variant={hero ? 'gold' : 'primary'}
                style={styles.flex}
                onPress={() => actions.checkIn(next)}
                loading={actions.busyId === next.id}
              />
            ) : (
              <Button
                label="Szczegóły służby"
                icon="text-box"
                variant={hero ? 'gold' : 'primary'}
                style={styles.flex}
                onPress={() => goService(next)}
              />
            )}
            {avail?.canSwap && !actions.pendingSwap(next) && (
              <IconButton icon="swap-horizontal" color={c.primary} accessibilityLabel="Poproś o zamianę" onPress={() => actions.openSwap(next)} />
            )}
            {avail?.canReportAbsence && (
              hero
                ? <Button label="Nie mogę być" icon="calendar-remove" variant={heroPal.statusBar === 'light' ? 'outlineLight' : 'secondary'} onPress={() => actions.openAbsence(next)} />
                : <IconButton icon="calendar-remove" color={c.danger} accessibilityLabel="Nie mogę być" onPress={() => actions.openAbsence(next)} />
            )}
          </View>
        )}
        {next && actions.pendingSwap(next) && (
          <View style={[styles.swapPending, { backgroundColor: hero ? 'rgba(255,255,255,0.14)' : c.goldSurface }]}>
            <Icon name="swap-horizontal" size={18} color={hero ? fg : c.goldText} />
            <AppText variant="small" style={[styles.flex, { color: hero ? fg : c.goldText }]} numberOfLines={1}>
              {`Czeka na odpowiedź: ${actions.pendingSwap(next)!.toName}`}
            </AppText>
          </View>
        )}
      </Card>
    )
  }

  // ── „W kościele” ─────────────────────────────────────────────────────────
  const church = (
    <Card large style={styles.church}>
      <View style={styles.churchHead}>
        <AppText variant="title">W kościele</AppText>
        <AppText variant="small" muted>{weekdayShortDate(day)}</AppText>
      </View>
      <DayStrip days={days} selected={day} onSelect={setDay} />
      <View style={[styles.dayList, { borderColor: c.border }]}>
        {dayServices.length === 0 ? (
          <AppText muted style={styles.dayEmpty}>Brak Mszy i nabożeństw w tym dniu.</AppText>
        ) : dayServices.map((s, i) => {
          const cat = CATEGORY_CONFIG[s.category] ?? CATEGORY_CONFIG.msza
          return (
            <Pressable
              key={s.id}
              onPress={() => goService(s)}
              style={({ hovered }: any) => [styles.dayRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.borderLight }, hovered && { backgroundColor: c.highlight }]}
            >
              <AppText style={[styles.dayTime, { color: c.text }]}>{s.time}</AppText>
              <View style={[styles.dayBar, { backgroundColor: cat.color }]} />
              <View style={styles.flex}>
                <AppText variant="bodyStrong" numberOfLines={1}>{s.title}</AppText>
                <AppText variant="small" muted>{cat.label}</AppText>
              </View>
              {s.mine && <Badge label="TY" tone="navy" />}
              <Icon name="chevron-right" size={20} color={c.iconMuted} />
            </Pressable>
          )
        })}
      </View>
    </Card>
  )

  // ── Skróty / prawa kolumna ───────────────────────────────────────────────
  const annCard = (
    <Card flush>
      <View style={styles.annHead}>
        <SectionHeader title="Ogłoszenia" action="Wszystkie →" onAction={() => router.push('/(tabs)/announcements')} style={styles.noMargin} />
      </View>
      {anns.length === 0
        ? <AppText muted style={styles.dayEmpty}>Brak ogłoszeń.</AppText>
        : anns.map((a, i) => (
          <Pressable
            key={a.id}
            onPress={() => router.push('/(tabs)/announcements')}
            style={[styles.annRow, { borderTopColor: c.borderLight }, i === 0 && { borderTopWidth: 1 }, i > 0 && { borderTopWidth: 1 }]}
          >
            <AppText variant="bodyStrong" numberOfLines={1}>{a.title}</AppText>
            <AppText variant="small" muted>{`${a.author?.full_name ?? 'Parafia'} · ${relativeDay(a.created_at.slice(0, 10))}`}</AppText>
          </Pressable>
        ))}
    </Card>
  )

  const pointsCard = (
    <Card large onPress={() => router.push('/(tabs)/points')}>
      <AppText variant="eyebrow" color={c.goldInk}>{`Twoje punkty`}</AppText>
      <View style={styles.pointsRow}>
        <AppText style={[serif(), styles.pointsBig, { color: c.text }]}>{points?.total ?? '—'}</AppText>
        <AppText variant="bodyStrong" muted>{`pkt · ${rankName ?? 'Ministrant'}`}</AppText>
      </View>
      <AppText variant="small" muted>
        {points ? `#${points.rank || '—'} w parafii · ${points.services} ${points.services === 1 ? 'służba' : 'służb'}` : ''}
      </AppText>
    </Card>
  )

  const onRefresh = async () => {
    setRefreshing(true)
    await Promise.all([refresh(), reload(), profile?.id ? useSwapStore.getState().load(profile.id) : null])
    setRefreshing(false)
  }

  if (isDesktop) {
    return (
      <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.desktop}>
        <View style={styles.desktopLeft}>
          <SwapInbox onChanged={refresh} />
          {nextCard(true)}
          {church}
        </View>
        <View style={styles.desktopRight}>
          {pointsCard}
          {annCard}
          <DailyWordCard />
        </View>
        {actions.sheets}
      </ScrollView>
    )
  }

  return (
    <View style={[styles.flex, { backgroundColor: c.bg }]}>
      <StatusBar style={pal.statusBar} />
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View style={[styles.header, { backgroundColor: pal.bg, paddingTop: insets.top + 8 }]}>
          <View style={styles.topRow}>
            <Image source={require('../../assets/images/icon.png')} style={styles.logo} />
            <AppText style={[styles.greeting, { color: pal.fg }]} numberOfLines={2}>
              {`Króluj nam Chryste,\n${firstName}`}
            </AppText>
            <NotificationBell tone="header" fg={pal.fg} />
            <Pressable accessibilityRole="button" accessibilityLabel="Profil" onPress={() => router.push('/(tabs)/profile')}>
              <Avatar name={profile?.full_name} avatarUrl={profile?.avatar_url} size={38} />
            </Pressable>
          </View>
          <AppText variant="eyebrow" color={pal.accent}>{liturgy.entry.typeLabel}</AppText>
          <AppText style={[serif(), styles.today, { color: pal.fg }]}>
            Dziś, <AppText style={[serif(true), styles.today, { color: pal.fg }]}>{dayMonth(today)}</AppText>
          </AppText>
          <AppText style={[styles.litName, { color: pal.fg }]}>{liturgy.entry.name}</AppText>
          <View style={styles.chips}>
            <HeaderChip label={liturgy.vestmentName} palette={pal} dot={VESTMENT_DOT[liturgy.color]} />
            <HeaderChip label={pointsChip} palette={pal} onPress={() => router.push('/(tabs)/points')} />
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.overlap}>{nextCard(false)}</View>
          <SwapInbox onChanged={refresh} />
          {church}
          <View style={styles.shortcuts}>
            <Card style={styles.shortcut} onPress={() => router.push('/(tabs)/announcements')}>
              <View style={styles.shortcutHead}>
                <Icon name="bullhorn" size={24} color={c.goldInk} />
                {unreadAnn > 0 && <Badge label={`${unreadAnn} ${pl(unreadAnn, ['nowe', 'nowe', 'nowych'])}`} tone="navy" />}
              </View>
              <AppText variant="bodyStrong">Ogłoszenia</AppText>
              <AppText variant="small" muted numberOfLines={2}>{anns[0]?.title ?? 'Brak nowych'}</AppText>
            </Card>
            <Card style={styles.shortcut} onPress={() => router.push('/(tabs)/wiedza')}>
              <Icon name="book-open-variant" size={24} color={c.goldInk} />
              <AppText variant="bodyStrong">Wiedza</AppText>
              <AppText variant="small" muted numberOfLines={2}>
                {readsOn && wiedzaRead > 0 ? `${wiedzaRead} z ${WIEDZA_KEYS.length} haseł przeczytanych` : 'Szaty, sprzęty, gesty'}
              </AppText>
            </Card>
          </View>
          <DailyWordCard />
        </View>
      </ScrollView>
      {actions.sheets}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  noMargin: { marginBottom: 0 },
  header: { paddingHorizontal: 22, paddingBottom: 72, gap: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  logo: { width: 34, height: 34, borderRadius: 9 },
  greeting: { ...sans(700), fontSize: 13, lineHeight: 17, flex: 1 },
  today: { fontSize: 40, lineHeight: 43 },
  litName: { ...sans(500), fontSize: 14, opacity: 0.92 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  body: { paddingHorizontal: 16, paddingBottom: 28, gap: 16 },
  overlap: { marginTop: -52 },
  nextCard: { gap: 14, padding: 18 },
  swapPending: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  nextHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nextMain: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  dateTile: { width: 62, borderRadius: 14, paddingVertical: 8, alignItems: 'center' },
  dateTileHero: { width: 84, paddingVertical: 12 },
  dateDow: { ...sans(800), fontSize: 11, letterSpacing: 0.6 },
  dateNum: { ...sans(800), fontSize: 26, lineHeight: 30, color: '#FFFFFF' },
  dateTime: { ...sans(700), fontSize: 12, color: '#C9D3E3' },
  nextSub: { ...sans(600), fontSize: 13, marginTop: 4 },
  nextActions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  church: { gap: 14, padding: 18 },
  churchHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  dayList: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13, cursor: 'pointer' } as any,
  dayTime: { ...sans(800), fontSize: 15, width: 46, fontVariant: ['tabular-nums'] },
  dayBar: { width: 3, height: 30, borderRadius: 2 },
  dayEmpty: { padding: 14 },
  shortcuts: { flexDirection: 'row', gap: 12 },
  shortcut: { flex: 1, gap: 4 },
  shortcutHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  annHead: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10 },
  annRow: { paddingHorizontal: 14, paddingVertical: 12, gap: 2, cursor: 'pointer' } as any,
  pointsRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 4 },
  pointsBig: { fontSize: 64, lineHeight: 68 },
  desktop: { flexDirection: 'row', gap: 20, padding: 28, paddingHorizontal: 32, alignItems: 'flex-start' },
  desktopLeft: { flex: 1.6, gap: 20 },
  desktopRight: { flex: 1, gap: 16 },
})
