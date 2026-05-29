import { useEffect, useRef, useState, useMemo } from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, useWindowDimensions
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { shadow } from '../../lib/shadows'
import { useAuthStore } from '../../stores/authStore'
import { getLiturgicalDay, getLiturgicalAccentColor, getLiturgicalBgColor } from '../../lib/liturgy'
import { CATEGORY_CONFIG, getCatColors, ScheduleCategory, MassTemplate } from '../../types/database'
import { useRealtimeTable } from '../../hooks/useRealtimeTable'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getTemplatesForDate(dateStr: string, templates: MassTemplate[]): MassTemplate[] {
  const dow = new Date(dateStr + 'T12:00:00').getDay()
  return templates.filter(t => t.day_of_week === dow)
}

const DAY_SHORT = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb']

export default function HomeScreen() {
  const { profile } = useAuthStore()
  if (profile?.role === 'parent') return <ParentHomeView />
  return <MemberHomeView />
}

function MemberHomeView() {
  const { profile } = useAuthStore()
  const router = useRouter()
  const { width } = useWindowDimensions()
  const isWide = width >= 768

  const [summary, setSummary] = useState<{ total_points: number; services_count: number } | null>(null)
  const [rankPos, setRankPos] = useState<number>(0)
  const [nextDuties, setNextDuties] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [massTemplates, setMassTemplates] = useState<MassTemplate[]>([])
  const [upcomingSchedules, setUpcomingSchedules] = useState<any[]>([])

  const { colors: c, isDark } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  const today = localDateStr(new Date())
  const [selectedDay, setSelectedDay] = useState(today)

  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    return localDateStr(d)
  })

  const todayLiturgy = getLiturgicalDay(today)
  const litAccent = getLiturgicalAccentColor(todayLiturgy)
  const litBg = getLiturgicalBgColor(todayLiturgy)
  const firstName = profile?.full_name?.split(' ')[0] ?? '—'

  const fetchData = async () => {
    if (!profile?.id || !profile?.parish_id) return
    const [summaryRes, rankingRes, nextRes, templatesRes, schedulesRes] = await Promise.all([
      supabase.from('points_summary').select('total_points, services_count').eq('profile_id', profile.id).maybeSingle(),
      supabase.from('points_summary').select('profile_id').eq('parish_id', profile.parish_id).order('total_points', { ascending: false }),
      supabase.from('schedule_assignments')
        .select('id, status, schedule:schedules(id, title, date, time, category)')
        .eq('profile_id', profile.id)
        .gte('schedule.date', today)
        .order('schedule(date)', { ascending: true })
        .order('schedule(time)', { ascending: true })
        .limit(5),
      supabase.from('mass_templates')
        .select('*')
        .eq('parish_id', profile.parish_id)
        .order('day_of_week').order('time'),
      supabase.from('schedules')
        .select('*, group:groups(name)')
        .eq('parish_id', profile.parish_id)
        .gte('date', today)
        .lte('date', days[days.length - 1])
        .order('date').order('time'),
    ])
    if (summaryRes.data) setSummary(summaryRes.data as any)
    if (rankingRes.data) {
      const pos = (rankingRes.data as any[]).findIndex(r => r.profile_id === profile.id) + 1
      setRankPos(pos)
    }
    const valid = (nextRes.data ?? []).filter((a: any) => a.schedule !== null)
    setNextDuties(valid.slice(0, 3))
    setMassTemplates((templatesRes.data as MassTemplate[]) ?? [])
    setUpcomingSchedules(schedulesRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [profile?.id])
  useRealtimeTable('schedule_assignments', fetchData)

  const eventsForDay = (() => {
    const templateSlots = getTemplatesForDate(selectedDay, massTemplates)
    const templateTimes = new Set(templateSlots.map(t => t.time.slice(0, 5)))
    const daySchedules = upcomingSchedules.filter(s => s.date === selectedDay)
    const extraSchedules = daySchedules.filter(s => !templateTimes.has(s.time?.slice(0, 5)))

    const all: Array<{ time: string; title: string; category: ScheduleCategory; id: string }> = [
      ...templateSlots.map(t => ({
        time: t.time.slice(0, 5),
        title: t.label ?? 'Msza Święta',
        category: 'msza' as ScheduleCategory,
        id: `tpl-${t.id}`,
      })),
      ...extraSchedules.map(s => ({
        time: s.time?.slice(0, 5) ?? '',
        title: s.title,
        category: (s.category ?? 'msza') as ScheduleCategory,
        id: s.id,
      })),
    ]
    return all.sort((a, b) => a.time.localeCompare(b.time))
  })()

  const selectedLiturgy = getLiturgicalDay(selectedDay)

  const churchSection = (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>Co w kościele</Text>

      {/* Day strip — wrapped grid on wide, horizontal scroll on narrow */}
      {isWide ? (
        <View style={styles.dayStripWrap}>
          {days.map(d => {
            const date = new Date(d + 'T12:00:00')
            const isToday = d === today
            const isSelected = d === selectedDay
            return (
              <TouchableOpacity
                key={d}
                style={[styles.dayChip, styles.dayChipFill, isSelected && styles.dayChipSelected]}
                onPress={() => setSelectedDay(d)}
                activeOpacity={0.7}
              >
                <Text style={[styles.dayChipDow, isSelected && styles.dayChipTextSelected]}>
                  {isToday ? 'Dziś' : DAY_SHORT[date.getDay()]}
                </Text>
                <Text style={[styles.dayChipNum, isSelected && styles.dayChipTextSelected]}>
                  {date.getDate()}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, paddingBottom: 4 }}
        >
          {days.map(d => {
            const date = new Date(d + 'T12:00:00')
            const isToday = d === today
            const isSelected = d === selectedDay
            return (
              <TouchableOpacity
                key={d}
                style={[styles.dayChip, isSelected && styles.dayChipSelected]}
                onPress={() => setSelectedDay(d)}
                activeOpacity={0.7}
              >
                <Text style={[styles.dayChipDow, isSelected && styles.dayChipTextSelected]}>
                  {isToday ? 'Dziś' : DAY_SHORT[date.getDay()]}
                </Text>
                <Text style={[styles.dayChipNum, isSelected && styles.dayChipTextSelected]}>
                  {date.getDate()}
                </Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      )}

      {/* Liturgy for selected day */}
      {selectedLiturgy.type !== 'FERIA' && (
        <View style={styles.dayLiturgyRow}>
          {(() => {
            const ac = getLiturgicalAccentColor(selectedLiturgy)
            return ac ? <View style={[styles.liturgyDot, { backgroundColor: ac }]} /> : null
          })()}
          <Text style={styles.dayLiturgyText} numberOfLines={1}>{selectedLiturgy.name}</Text>
        </View>
      )}

      {/* Events list */}
      {eventsForDay.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="calendar-outline" size={24} color={c.iconMuted} />
          <Text style={styles.emptyText}>Brak wydarzeń w tym dniu</Text>
        </View>
      ) : (
        eventsForDay.map(ev => {
          const cat = getCatColors(ev.category, isDark)
          return (
            <View key={ev.id} style={[styles.eventRow, { borderLeftColor: cat.color }]}>
              <View style={[styles.eventTimeBadge, { backgroundColor: cat.bg }]}>
                <Text style={[styles.eventTime, { color: cat.color }]}>{ev.time}</Text>
              </View>
              <View style={styles.eventInfo}>
                <Text style={styles.eventTitle} numberOfLines={1}>{ev.title}</Text>
                <Text style={[styles.eventCat, { color: cat.color }]}>{cat.label}</Text>
              </View>
            </View>
          )
        })
      )}
    </View>
  )

  const dutiesSection = (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>Nadchodzące służby</Text>
      {nextDuties.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="calendar-outline" size={28} color={c.iconMuted} />
          <Text style={styles.emptyText}>Brak nadchodzących służb</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/schedule')}>
            <Text style={styles.emptyLink}>Przejdź do zapisów →</Text>
          </TouchableOpacity>
        </View>
      ) : (
        nextDuties.map((a: any) => {
          const sc = a.schedule
          const cat = getCatColors(sc.category as ScheduleCategory, isDark)
          return (
            <View key={a.id} style={[styles.dutyCard, { borderLeftColor: cat.color }]}>
              <View style={styles.dutyTop}>
                <View style={[styles.timeBadge, { backgroundColor: cat.bg }]}>
                  <Text style={[styles.timeText, { color: cat.color }]}>{sc.time?.slice(0, 5)}</Text>
                </View>
                <View style={styles.dutyInfo}>
                  <Text style={styles.dutyTitle} numberOfLines={1}>{sc.title}</Text>
                  <Text style={styles.dutyDate}>
                    {new Date(sc.date + 'T12:00:00').toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </Text>
                </View>
                <View style={[styles.catPill, { backgroundColor: cat.bg }]}>
                  <Text style={[styles.catPillText, { color: cat.color }]}>{cat.label}</Text>
                </View>
              </View>
            </View>
          )
        })
      )}
    </View>
  )

  const actionsSection = (
    <>
      <Text style={styles.sectionLabel}>Szybkie akcje</Text>
      <View style={styles.actionsRow}>
        <QuickAction icon="calendar-outline" color={c.primary} label="Zapisy" onPress={() => router.push('/(tabs)/schedule')} styles={styles} />
        <QuickAction icon="megaphone-outline" color={c.primary} label="Ogłoszenia" onPress={() => router.push('/(tabs)/announcements')} styles={styles} />
        <QuickAction icon="trophy-outline" color={c.gold} label="Punkty" onPress={() => router.push('/(tabs)/points')} styles={styles} />
      </View>
    </>
  )

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Greeting */}
      <View style={styles.greetingCard}>
        <Text style={styles.greetingName}>Witaj, {firstName}!</Text>
        <View style={styles.greetingMeta}>
          <Text style={styles.greetingRole}>Ministrant</Text>
          {rankPos > 0 && (
            <>
              <View style={styles.metaDot} />
              <Ionicons name="podium-outline" size={13} color="#fff" />
              <Text style={styles.greetingRank}>#{rankPos} w rankingu</Text>
            </>
          )}
        </View>
      </View>

      {/* Liturgy */}
      {todayLiturgy && (
        <View style={[styles.liturgyRow, litBg && { backgroundColor: litBg + '18', borderColor: litBg + '40' }]}>
          {litAccent && <View style={[styles.liturgyDot, { backgroundColor: litAccent }]} />}
          <Text style={styles.liturgyTypeLabel}>{todayLiturgy.typeLabel}:</Text>
          <Text style={styles.liturgyName} numberOfLines={2}>{todayLiturgy.name}</Text>
        </View>
      )}

      {/* Stats */}
      {loading ? (
        <ActivityIndicator color={c.primary} style={{ marginVertical: 8 }} />
      ) : (
        <View style={styles.statsRow}>
          <StatBox icon="trophy" iconColor={c.gold} value={summary?.total_points ?? 0} label="Punkty" styles={styles} />
          <StatBox icon="checkmark-circle" iconColor={c.success} value={summary?.services_count ?? 0} label="Służby" styles={styles} />
        </View>
      )}

      {/* Main content — responsive layout */}
      {!loading && (
        isWide ? (
          <View style={styles.wideRow}>
            <View style={styles.wideLeft}>{churchSection}</View>
            <View style={styles.wideRight}>
              {dutiesSection}
              <View style={{ gap: 10, marginTop: 6 }}>{actionsSection}</View>
            </View>
          </View>
        ) : (
          <>
            {churchSection}
            {dutiesSection}
            {actionsSection}
          </>
        )
      )}
    </ScrollView>
  )
}

type ChildSummary = {
  id: string
  full_name: string
  rank_name: string | null
  services_count: number
  nextDuty: { title: string; date: string; time: string | null } | null
  badges: string[]
}

function ParentHomeView() {
  const { profile } = useAuthStore()
  const router = useRouter()
  const firstName = profile?.full_name?.split(' ')[0] ?? '—'
  const today = localDateStr(new Date())
  const todayLiturgy = getLiturgicalDay(today)
  const litAccent = getLiturgicalAccentColor(todayLiturgy)
  const litBg = getLiturgicalBgColor(todayLiturgy)

  const [children, setChildren] = useState<ChildSummary[]>([])
  const [loading, setLoading] = useState(true)

  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  useEffect(() => {
    if (!profile?.id) return
    let cancelled = false
    const fetch = async () => {
      const { data: kids } = await supabase
        .from('profiles')
        .select('id, full_name, rank_id, ranks(name)')
        .eq('parent_id', profile.id)

      if (cancelled) return
      if (!kids || kids.length === 0) { setLoading(false); return }

      const results = await Promise.all(
        kids.map(async (k: any) => {
          const [summaryRes, nextRes, badgesRes] = await Promise.all([
            supabase.from('points_summary').select('services_count').eq('profile_id', k.id).maybeSingle(),
            supabase.from('schedule_assignments')
              .select('schedule:schedules(title, date, time)')
              .eq('profile_id', k.id)
              .gte('schedule.date', today)
              .order('schedule(date)', { ascending: true })
              .order('schedule(time)', { ascending: true })
              .limit(1)
              .maybeSingle(),
            supabase.from('member_badges')
              .select('badge_definition:badge_definitions(icon)')
              .eq('profile_id', k.id)
              .eq('is_active', true),
          ])
          const assignment = nextRes.data as any
          const nextDuty = assignment?.schedule ?? null
          return {
            id: k.id,
            full_name: k.full_name,
            rank_name: (k as any).ranks?.name ?? null,
            services_count: (summaryRes.data as any)?.services_count ?? 0,
            nextDuty,
            badges: ((badgesRes.data ?? []) as any[]).map((b: any) => b.badge_definition?.icon).filter(Boolean),
          }
        })
      )
      if (cancelled) return
      setChildren(results)
      setLoading(false)
    }
    fetch()
    return () => { cancelled = true }
  }, [profile?.id])

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.greetingCard}>
        <Text style={styles.greetingName}>Witaj, {firstName}!</Text>
        <View style={styles.greetingMeta}>
          <Text style={styles.greetingRole}>Rodzic</Text>
        </View>
      </View>

      {todayLiturgy && (
        <View style={[styles.liturgyRow, litBg && { backgroundColor: litBg + '18', borderColor: litBg + '40' }]}>
          {litAccent && <View style={[styles.liturgyDot, { backgroundColor: litAccent }]} />}
          <Text style={styles.liturgyTypeLabel}>{todayLiturgy.typeLabel}:</Text>
          <Text style={styles.liturgyName} numberOfLines={2}>{todayLiturgy.name}</Text>
        </View>
      )}

      <Text style={styles.sectionLabel}>Moje dzieci</Text>
      {loading ? (
        <ActivityIndicator color={c.primary} style={{ marginVertical: 8 }} />
      ) : children.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="people-outline" size={28} color={c.iconMuted} />
          <Text style={styles.emptyText}>Brak powiązanych kont dzieci</Text>
          <Text style={[styles.emptyText, { fontSize: 12, marginTop: 4 }]}>Poproś administratora o przypisanie konta</Text>
        </View>
      ) : (
        children.map(child => (
          <TouchableOpacity
            key={child.id}
            style={styles.childCard}
            onPress={() => router.push(`/(tabs)/member-profile?id=${child.id}`)}
            activeOpacity={0.8}
          >
            <View style={styles.childCardTop}>
              <View style={styles.childAvatarSmall}>
                <Ionicons name="person" size={16} color={c.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.childCardName}>{child.full_name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <Text style={[styles.childCardMeta, child.rank_name ? { color: c.primary, fontWeight: '500' } : {}]}>
                    {child.rank_name ?? 'Brak rangi'}
                  </Text>
                  {child.badges.slice(0, 3).map((icon: string, idx: number) => (
                    <Text key={idx} style={{ fontSize: 13 }}>{icon}</Text>
                  ))}
                  {child.badges.length > 3 && (
                    <Text style={styles.childCardMeta}>+{child.badges.length - 3}</Text>
                  )}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={c.textTertiary} />
            </View>
            {child.nextDuty ? (
              <View style={styles.childNextDuty}>
                <Ionicons name="calendar-outline" size={13} color={c.primary} />
                <Text style={styles.childNextDutyText} numberOfLines={1}>
                  Najbliższy dyżur: {child.nextDuty.title} ·{' '}
                  {new Date(child.nextDuty.date + 'T12:00:00').toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' })}
                  {' '}{child.nextDuty.time?.slice(0, 5)}
                </Text>
              </View>
            ) : (
              <View style={styles.childNextDuty}>
                <Ionicons name="calendar-outline" size={13} color={c.textTertiary} />
                <Text style={[styles.childNextDutyText, { color: c.textTertiary }]}>Brak nadchodzących dyżurów</Text>
              </View>
            )}
          </TouchableOpacity>
        ))
      )}

      <Text style={styles.sectionLabel}>Szybkie akcje</Text>
      <View style={styles.actionsRow}>
        <QuickAction icon="calendar-outline" color={c.primary} label="Dyżury dzieci" onPress={() => router.push('/(tabs)/schedule')} styles={styles} />
        <QuickAction icon="megaphone-outline" color={c.primary} label="Ogłoszenia" onPress={() => router.push('/(tabs)/announcements')} styles={styles} />
      </View>
    </ScrollView>
  )
}

function StatBox({ icon, iconColor, value, label, styles }: { icon: any; iconColor: string; value: number; label: string; styles: any }) {
  return (
    <View style={styles.statBox}>
      <Ionicons name={icon} size={22} color={iconColor} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

function QuickAction({ icon, color, label, onPress, styles }: { icon: any; color: string; label: string; onPress: () => void; styles: any }) {
  return (
    <TouchableOpacity style={styles.quickAction} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.quickIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </TouchableOpacity>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    content: { padding: 16, gap: 16 },

    greetingCard: {
      backgroundColor: c.primary, borderRadius: 16, padding: 20, gap: 8,
      ...shadow.brand,
    },
    greetingName: { fontSize: 24, fontWeight: '700', color: '#fff' },
    greetingMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    greetingRole: { fontSize: 13, color: c.white + 'CC', fontWeight: '500' },
    metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: c.white + '55' },
    greetingRank: { fontSize: 13, color: c.white + 'CC' },

    liturgyRow: {
      flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
      paddingHorizontal: 14, paddingVertical: 10, gap: 6,
      backgroundColor: c.goldSurface, borderRadius: 12,
      borderWidth: 1, borderColor: c.border,
    },
    liturgyDot: { width: 8, height: 8, borderRadius: 4 },
    liturgyTypeLabel: { fontSize: 12, color: c.gold, fontWeight: '600' },
    liturgyName: { fontSize: 13, color: c.text, flex: 1 },

    statsRow: { flexDirection: 'row', gap: 12 },
    statBox: {
      flex: 1, backgroundColor: c.surface, borderRadius: 12, padding: 16,
      alignItems: 'center', gap: 4,
      ...shadow.xs,
    },
    statValue: { fontSize: 26, fontWeight: '800', color: c.text, marginTop: 4 },
    statLabel: { fontSize: 11, color: c.subtext, textAlign: 'center' },

    // Responsive wide layout
    wideRow: { flexDirection: 'row', gap: 20, alignItems: 'flex-start' },
    wideLeft: { flex: 1 },
    wideRight: { flex: 1, gap: 16 },

    section: { gap: 10 },
    sectionLabel: {
      fontSize: 12, fontWeight: '700', color: c.textTertiary,
      textTransform: 'uppercase', letterSpacing: 0.8,
    },

    // Day scroller
    dayStripWrap: {
      flexDirection: 'row', flexWrap: 'wrap', gap: 6,
    },
    dayChip: {
      alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8,
      borderRadius: 12, backgroundColor: c.surface, minWidth: 48,
      ...shadow.xs,
    },
    dayChipFill: { flex: 1 },
    dayChipSelected: { backgroundColor: c.primary },
    dayChipDow: { fontSize: 11, fontWeight: '600', color: c.subtext },
    dayChipNum: { fontSize: 17, fontWeight: '700', color: c.text, marginTop: 2 },
    dayChipTextSelected: { color: '#fff' },

    dayLiturgyRow: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 2,
    },
    dayLiturgyText: { fontSize: 12, color: c.gold, fontStyle: 'italic', flex: 1 },

    emptyCard: {
      backgroundColor: c.surface, borderRadius: 12, padding: 20,
      alignItems: 'center', gap: 6,
      ...shadow.xs,
    },
    emptyText: { fontSize: 13, color: c.textTertiary },
    emptyLink: { fontSize: 13, color: c.primary, fontWeight: '600', marginTop: 2 },

    childCard: {
      backgroundColor: c.surface, borderRadius: 12, padding: 14,
      gap: 8, ...shadow.xs,
    },
    childCardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    childAvatarSmall: {
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: c.primaryAlpha08, justifyContent: 'center', alignItems: 'center',
    },
    childCardName: { fontSize: 15, fontWeight: '700', color: c.text },
    childCardMeta: { fontSize: 12, color: c.subtext, marginTop: 1 },
    childCardArrow: { padding: 4 },
    childNextDuty: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: c.bg },
    childNextDutyText: { flex: 1, fontSize: 12, color: c.primary, fontWeight: '500' },

    eventRow: {
      backgroundColor: c.surface, borderRadius: 10, borderLeftWidth: 3,
      padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10,
      ...shadow.xs,
    },
    eventTimeBadge: {
      borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5,
      minWidth: 46, alignItems: 'center',
    },
    eventTime: { fontSize: 13, fontWeight: '700' },
    eventInfo: { flex: 1 },
    eventTitle: { fontSize: 14, fontWeight: '600', color: c.text },
    eventCat: { fontSize: 11, fontWeight: '500', marginTop: 1 },

    dutyCard: {
      backgroundColor: c.surface, borderRadius: 12, padding: 12,
      borderLeftWidth: 4,
      ...shadow.xs,
    },
    dutyTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    timeBadge: {
      borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5,
      minWidth: 48, alignItems: 'center',
    },
    timeText: { fontSize: 13, fontWeight: '700' },
    dutyInfo: { flex: 1 },
    dutyTitle: { fontSize: 15, fontWeight: '600', color: c.text },
    dutyDate: { fontSize: 12, color: c.subtext, marginTop: 2 },
    catPill: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
    catPillText: { fontSize: 11, fontWeight: '600' },

    actionsRow: { flexDirection: 'row', gap: 10 },
    quickAction: {
      flex: 1, backgroundColor: c.surface, borderRadius: 14, padding: 14,
      alignItems: 'center', gap: 8,
      ...shadow.md,
    },
    quickIcon: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    quickLabel: { fontSize: 12, fontWeight: '600', color: c.text, textAlign: 'center' },
  })
}
