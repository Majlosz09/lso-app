import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { slotTitle } from '../../../lib/massSchedule'
import { useAuthStore } from '../../../stores/authStore'
import { ScheduleCategory, CATEGORY_CONFIG } from '../../../types/database'
import { useTheme } from '../../../lib/ThemeContext'
import { sans, serif, VESTMENT_DOT, VestmentColor } from '../../../lib/theme'
import { getLiturgicalDay } from '../../../lib/liturgy'
import { dayShort, localDateStr, pl, shortDate, weekDays as weekOf } from '../../../lib/dates'
import { useIsDesktop } from '../../../hooks/useIsDesktop'
import { useLiturgyHeader } from '../../../hooks/useLiturgyHeader'
import { ChoiceCard } from '../../../components/auth/formParts'
import { AppText, Button, Card, Icon, ScreenHeader, Sheet } from '../../../components/ui'

type Assignment = { status: string; profile: { full_name: string } | null }
type WeekSchedule = {
  id: string
  title: string
  date: string
  time: string
  category: ScheduleCategory
  service_mode: string
  schedule_assignments: Assignment[]
}
type SlotItem = {
  key: string
  time: string
  title: string
  category: ScheduleCategory
  /** none = bez obecności i punktów (nie alarmujemy o braku obsady) */
  mode: string
  isTemplate: boolean
  schedule: WeekSchedule | null
  names: string[]
}

const INACTIVE = ['absent', 'excused', 'confirmed', 'swapped']

export default function SchedulesTab() {
  const router = useRouter()
  const isDesktop = useIsDesktop()
  const { profile } = useAuthStore()
  const { colors: c } = useTheme()
  const { palette } = useLiturgyHeader()
  const [weekOffset, setWeekOffset] = useState(0)
  const [schedules, setSchedules] = useState<WeekSchedule[]>([])
  const [slots, setSlots] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [creatingSlotKey, setCreatingSlotKey] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const days = useMemo(() => weekOf(weekOffset), [weekOffset])
  const today = localDateStr()

  // obowiązujący rozkład tygodnia (stały + zmiany okresowe)
  useEffect(() => {
    if (!profile?.parish_id) return
    supabase.rpc('mass_slots', { p_parish: profile.parish_id, p_from: days[0], p_to: days[6] })
      .then(({ data }) => { if (data) setSlots(data as any[]) })
  }, [profile?.parish_id, days])

  const loadSchedules = useCallback(() => {
    if (!profile?.parish_id) return
    setLoading(true)
    supabase
      .from('schedules')
      .select('id, title, date, time, category, service_mode, schedule_assignments(status, profile:profiles(full_name))')
      .eq('parish_id', profile.parish_id)
      .gte('date', days[0])
      .lte('date', days[6])
      .order('date')
      .order('time')
      .then(({ data, error }) => {
        if (!error && data) setSchedules(data as unknown as WeekSchedule[])
        setLoading(false)
      })
  }, [days, profile?.parish_id])

  useFocusEffect(useCallback(() => { loadSchedules() }, [loadSchedules]))

  const grouped = useMemo(() => days.map(date => {
    const scheduled: SlotItem[] = schedules.filter(s => s.date === date).map(s => ({
      key: s.id,
      time: s.time.slice(0, 5),
      title: s.title,
      category: s.category ?? 'msza',
      mode: s.service_mode ?? 'signup',
      isTemplate: false,
      schedule: s,
      names: s.schedule_assignments.filter(a => !INACTIVE.includes(a.status)).map(a => a.profile?.full_name ?? '').filter(Boolean),
    }))
    const times = new Set(scheduled.map(s => s.time))
    const tpl: SlotItem[] = slots
      .filter(t => t.slot_date === date && !times.has(String(t.slot_time).slice(0, 5)))
      .map(t => ({
        key: `tpl-${date}-${t.entry_id}`, time: String(t.slot_time).slice(0, 5), title: slotTitle(t),
        category: t.category as ScheduleCategory, mode: t.service_mode, isTemplate: true, schedule: null, names: [],
      }))
    return { date, slots: [...scheduled, ...tpl].sort((a, b) => a.time.localeCompare(b.time)) }
  }), [days, schedules, slots])

  const allSlots = grouped.flatMap(g => g.slots).filter(s => s.mode !== 'none')
  const staffedCount = allSlots.filter(s => s.names.length > 0).length

  // Wolne miejsce z rozkładu Mszy → tworzy służbę i otwiera jej szczegóły (jak dotąd)
  const handleEmptySlot = async (date: string, slot: SlotItem) => {
    setCreatingSlotKey(slot.key)
    const { data, error } = await supabase
      .from('schedules')
      .insert({
        title: slot.title, date, time: slot.time + ':00', category: slot.category, group_id: null,
        location: '', gps_radius: 100, notes: null, created_by: profile?.id, parish_id: profile?.parish_id,
      })
      .select('id')
      .single()
    setCreatingSlotKey(null)
    if (!error && data) router.push(`/(admin)/schedule-detail?id=${data.id}`)
  }

  const open = (date: string, slot: SlotItem) =>
    slot.schedule ? router.push(`/(admin)/schedule-detail?id=${slot.schedule.id}`) : handleEmptySlot(date, slot)

  const weekLabel = `${shortDate(days[0])} – ${shortDate(days[6])}`

  const weekNav = (onHeader: boolean) => (
    <View style={[styles.weekNav, { backgroundColor: onHeader ? palette.chip : c.surface, borderColor: onHeader ? 'transparent' : c.border }]}>
      <Pressable accessibilityLabel="Poprzedni tydzień" onPress={() => setWeekOffset(w => Math.max(-52, w - 1))} hitSlop={6}>
        <Icon name="chevron-left" size={20} color={onHeader ? palette.fg : c.primary} />
      </Pressable>
      <AppText style={[styles.weekText, { color: onHeader ? palette.fg : c.text }]}>{weekLabel}</AppText>
      <Pressable accessibilityLabel="Następny tydzień" onPress={() => setWeekOffset(w => Math.min(104, w + 1))} hitSlop={6}>
        <Icon name="chevron-right" size={20} color={onHeader ? palette.fg : c.primary} />
      </Pressable>
    </View>
  )

  const addSheet = (
    <Sheet visible={addOpen} onClose={() => setAddOpen(false)} title="Dodaj służbę">
      <ChoiceCard icon="calendar-plus" title="Jednorazowa służba" subtitle="Jeden termin: dzień, godzina, rodzaj"
        onPress={() => { setAddOpen(false); router.push('/(admin)/schedule-form') }} />
      <ChoiceCard icon="calendar-multiple" title="Cykl służb" subtitle="Seria terminów, np. roraty albo różaniec"
        onPress={() => { setAddOpen(false); router.push('/(admin)/schedule-series') }} />
      <ChoiceCard icon="calendar-sync" title="Stałe dyżury ministrantów" subtitle="Kto służy co tydzień o danej godzinie"
        onPress={() => { setAddOpen(false); router.push('/(admin)/recurring-assignments') }} />
    </Sheet>
  )

  const staffText = (s: SlotItem) => s.mode === 'none' && !s.names.length
    ? 'bez punktów'
    : s.isTemplate
    ? 'wolne miejsce z rozkładu'
    : s.names.length ? `${s.names.length} ${pl(s.names.length, ['ministrant', 'ministrantów', 'ministrantów'])}` : 'bez obsady'
  const staffColor = (s: SlotItem) => (s.names.length ? c.success : s.mode === 'none' ? c.subtext : s.isTemplate ? c.goldInk : c.dangerStrong)

  // ── Web: siatka tygodnia ─────────────────────────────────────────────────
  if (isDesktop) {
    return (
      <View style={[styles.flex, { backgroundColor: c.bg }]}>
        <View style={styles.deskBar}>
          {weekNav(false)}
          <AppText variant="small" muted style={styles.flex}>{`${staffedCount} z ${allSlots.length} służb obsadzonych`}</AppText>
          <Button label="Stałe dyżury" icon="calendar-sync" variant="secondary" compact onPress={() => router.push('/(admin)/recurring-assignments')} />
          <Button label="Cykl służb" icon="calendar-multiple" variant="secondary" compact onPress={() => router.push('/(admin)/schedule-series')} />
          <Button label="Dodaj służbę" icon="plus" compact onPress={() => router.push('/(admin)/schedule-form')} />
        </View>
        {loading ? <ActivityIndicator color={c.primary} style={styles.loader} /> : (
          <ScrollView contentContainerStyle={styles.grid}>
            {grouped.map(({ date, slots }) => {
              const lit = getLiturgicalDay(date)
              const vest = (lit.color ?? 'GREEN') as VestmentColor
              const isToday = date === today
              return (
                <View key={date} style={styles.gridCol}>
                  <Pressable
                    onPress={() => router.push(`/(admin)/schedule-day?date=${date}` as any)}
                    style={[styles.dayHead, { backgroundColor: isToday ? c.primary : c.surface, borderColor: isToday ? c.primary : c.border }]}
                  >
                    <View style={styles.rowBetween}>
                      <AppText style={[styles.dayHeadTitle, { color: isToday ? '#FFFFFF' : c.text }]}>
                        {dayShort(date)} <AppText style={[styles.dayHeadDate, { color: isToday ? '#C9D3E3' : c.subtext }]}>{shortDate(date)}</AppText>
                      </AppText>
                      <View style={[styles.dot, { backgroundColor: VESTMENT_DOT[vest] }, vest === 'WHITE' && { borderWidth: 1, borderColor: c.gold }]} />
                    </View>
                    <AppText style={[styles.dayHeadLit, { color: isToday ? '#C9D3E3' : c.subtext }]} numberOfLines={1}>{lit.typeLabel}</AppText>
                  </Pressable>
                  {slots.length === 0 && (
                    <View style={[styles.noSvc, { borderColor: c.iconMuted }]}><AppText variant="small" muted>Brak służb</AppText></View>
                  )}
                  {slots.map(s => (
                    <Card key={s.key} style={styles.gCard} onPress={() => open(date, s)}>
                      <View style={styles.rowBetween}>
                        <AppText style={[styles.gTime, { color: c.text }]}>{s.time}</AppText>
                        {creatingSlotKey === s.key
                          ? <ActivityIndicator size="small" color={c.primary} />
                          : <AppText style={[styles.gCount, { color: staffColor(s) }]}>{s.names.length}</AppText>}
                      </View>
                      <AppText variant="bodyStrong" numberOfLines={2}>{s.title}</AppText>
                      {s.names.map(n => (
                        <View key={n} style={[styles.person, { backgroundColor: c.borderLight }]}>
                          <AppText style={[styles.personRole, { color: c.subtext }]}>MINISTRANT</AppText>
                          <AppText style={[styles.personName, { color: c.text }]} numberOfLines={1}>{n}</AppText>
                        </View>
                      ))}
                      {s.names.length === 0 && (
                        <View style={[styles.person, styles.assign, { borderColor: c.gold, backgroundColor: c.highlight }]}>
                          <AppText style={[styles.personName, { color: c.goldInk }]}>+ Przydziel</AppText>
                        </View>
                      )}
                    </Card>
                  ))}
                </View>
              )
            })}
          </ScrollView>
        )}
      </View>
    )
  }

  // ── Telefon ──────────────────────────────────────────────────────────────
  return (
    <View style={[styles.flex, { backgroundColor: c.bg }]}>
      <ScrollView>
        <ScreenHeader
          eyebrow="Grafik parafii"
          title={weekLabel}
          subtitle={`${staffedCount} z ${allSlots.length} służb obsadzonych`}
          right={
            <Pressable onPress={() => setAddOpen(true)} style={[styles.addBtn, { backgroundColor: c.gold }]} accessibilityRole="button">
              <Icon name="plus" size={18} color="#071C3A" />
              <AppText style={styles.addText}>Dodaj</AppText>
            </Pressable>
          }
        >
          {weekNav(true)}
        </ScreenHeader>
        <View style={styles.body}>
          {loading ? <ActivityIndicator color={c.primary} style={styles.loader} /> : grouped.filter(g => g.slots.length).length === 0 ? (
            <View style={[styles.noSvc, { borderColor: c.iconMuted, padding: 24 }]}>
              <AppText muted>Brak służb w tym tygodniu.</AppText>
              <Pressable onPress={() => setWeekOffset(0)}><AppText variant="label" color={c.primary}>Wróć do bieżącego tygodnia</AppText></Pressable>
            </View>
          ) : grouped.filter(g => g.slots.length).map(({ date, slots }) => {
            const lit = getLiturgicalDay(date)
            const vest = (lit.color ?? 'GREEN') as VestmentColor
            return (
              <View key={date} style={styles.group}>
                <View style={styles.groupHead}>
                  <View style={[styles.dot, { backgroundColor: VESTMENT_DOT[vest] }, vest === 'WHITE' && { borderWidth: 1, borderColor: c.gold }]} />
                  <AppText style={[styles.groupDay, { color: c.text }]}>{`${dayShort(date)} ${shortDate(date)}`}</AppText>
                  <AppText variant="small" muted numberOfLines={1} style={styles.flex}>{lit.name}</AppText>
                </View>
                {slots.map(s => {
                  const cat = CATEGORY_CONFIG[s.category] ?? CATEGORY_CONFIG.msza
                  return (
                    <Card key={s.key} onPress={() => open(date, s)} style={styles.mCard}>
                      <View style={styles.mTop}>
                        <AppText style={[styles.mTime, { color: c.text }]}>{s.time}</AppText>
                        <View style={[styles.catLine, { backgroundColor: cat.color }]} />
                        <View style={styles.flex}>
                          <AppText variant="bodyStrong" numberOfLines={1}>{s.title}</AppText>
                          <AppText style={[styles.mStaff, { color: staffColor(s) }]}>{staffText(s)}</AppText>
                        </View>
                        {creatingSlotKey === s.key ? <ActivityIndicator size="small" color={c.primary} /> : <Icon name="chevron-right" size={22} color={c.iconMuted} />}
                      </View>
                      {s.names.length > 0 && (
                        <AppText variant="small" muted numberOfLines={2} style={styles.mNames}>{s.names.join(', ')}</AppText>
                      )}
                      <View style={[styles.mBar, { backgroundColor: c.borderLight }]}>
                        <View style={[styles.mBarFill, { width: s.names.length ? '100%' : '0%', backgroundColor: c.successStrong }]} />
                      </View>
                    </Card>
                  )
                })}
              </View>
            )
          })}
        </View>
      </ScrollView>
      {addSheet}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  loader: { marginTop: 40 },
  weekNav: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, borderWidth: 1, alignSelf: 'flex-start' },
  weekText: { ...sans(700), fontSize: 13, fontVariant: ['tabular-nums'] },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  addText: { ...sans(800), fontSize: 14, color: '#071C3A' },
  body: { padding: 16, gap: 16, paddingBottom: 32 },
  group: { gap: 8 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  groupDay: { ...sans(700), fontSize: 13 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  mCard: { gap: 8 },
  mTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mTime: { ...sans(800), fontSize: 16, width: 48, fontVariant: ['tabular-nums'] },
  catLine: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  mStaff: { ...sans(600), fontSize: 12 },
  mNames: { marginLeft: 63 },
  mBar: { height: 5, borderRadius: 3, overflow: 'hidden' },
  mBarFill: { height: 5, borderRadius: 3 },
  noSvc: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 14, padding: 14, alignItems: 'center', gap: 8 },
  deskBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 32, paddingTop: 24, paddingBottom: 14 },
  grid: { flexDirection: 'row', gap: 10, paddingHorizontal: 32, paddingBottom: 32, alignItems: 'flex-start' },
  gridCol: { flex: 1, minWidth: 0, gap: 8 },
  dayHead: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, gap: 2, cursor: 'pointer' } as any,
  dayHeadTitle: { ...sans(800), fontSize: 15 },
  dayHeadDate: { ...sans(600), fontSize: 12 },
  dayHeadLit: { ...sans(500), fontSize: 11 },
  gCard: { gap: 6, padding: 12 },
  gTime: { ...sans(800), fontSize: 16, fontVariant: ['tabular-nums'] },
  gCount: { ...sans(800), fontSize: 12 },
  person: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, gap: 1 },
  personRole: { ...sans(800), fontSize: 9, letterSpacing: 0.8 },
  personName: { ...sans(700), fontSize: 12 },
  assign: { borderWidth: 1 },
})
