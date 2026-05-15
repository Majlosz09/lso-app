import { useEffect, useRef, useState } from 'react'
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
import { CATEGORY_CONFIG, ScheduleCategory, MassTemplate } from '../../types/database'
import { useRealtimeTable } from '../../hooks/useRealtimeTable'

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

  const today = localDateStr(new Date())
  const [selectedDay, setSelectedDay] = useState(today)

  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    return localDateStr(d)
  })

  const todayLiturgy = getLiturgicalDay(today)
  const litAccent = todayLiturgy ? getLiturgicalAccentColor(todayLiturgy) : null
  const litBg = todayLiturgy ? getLiturgicalBgColor(todayLiturgy) : null
  const firstName = profile?.full_name?.split(' ')[0] ?? '—'

  const fetchData = async () => {
    if (!profile?.id || !profile?.parish_id) return
    const [summaryRes, rankingRes, nextRes, templatesRes, schedulesRes] = await Promise.all([
      supabase.from('points_summary').select('total_points, services_count').eq('profile_id', profile.id).maybeSingle(),
      supabase.from('points_summary').select('profile_id').order('total_points', { ascending: false }),
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
      {selectedLiturgy && (
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
          <Ionicons name="calendar-outline" size={24} color="#ccc" />
          <Text style={styles.emptyText}>Brak wydarzeń w tym dniu</Text>
        </View>
      ) : (
        eventsForDay.map(ev => {
          const cat = CATEGORY_CONFIG[ev.category] ?? CATEGORY_CONFIG.msza
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
          <Ionicons name="calendar-outline" size={28} color="#ccc" />
          <Text style={styles.emptyText}>Brak nadchodzących służb</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/schedule')}>
            <Text style={styles.emptyLink}>Przejdź do zapisów →</Text>
          </TouchableOpacity>
        </View>
      ) : (
        nextDuties.map((a: any) => {
          const sc = a.schedule
          const cat = CATEGORY_CONFIG[sc.category as ScheduleCategory] ?? CATEGORY_CONFIG.msza
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
        <QuickAction icon="calendar-outline" color="#534AB7" label="Zapisy" onPress={() => router.push('/(tabs)/schedule')} />
        <QuickAction icon="megaphone-outline" color="#2980b9" label="Ogłoszenia" onPress={() => router.push('/(tabs)/announcements')} />
        <QuickAction icon="trophy-outline" color="#f0a500" label="Punkty" onPress={() => router.push('/(tabs)/points')} />
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
        <ActivityIndicator color="#534AB7" style={{ marginVertical: 8 }} />
      ) : (
        <View style={styles.statsRow}>
          <StatBox icon="trophy" iconColor="#f0a500" value={summary?.total_points ?? 0} label="Punkty" />
          <StatBox icon="checkmark-circle" iconColor="#27ae60" value={summary?.services_count ?? 0} label="Służby" />
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

function ParentHomeView() {
  const { profile } = useAuthStore()
  const router = useRouter()
  const firstName = profile?.full_name?.split(' ')[0] ?? '—'
  const today = localDateStr(new Date())
  const todayLiturgy = getLiturgicalDay(today)
  const litAccent = todayLiturgy ? getLiturgicalAccentColor(todayLiturgy) : null
  const litBg = todayLiturgy ? getLiturgicalBgColor(todayLiturgy) : null

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

      <Text style={styles.sectionLabel}>Szybkie akcje</Text>
      <View style={styles.actionsRow}>
        <QuickAction icon="calendar-outline" color="#534AB7" label="Dyżury dzieci" onPress={() => router.push('/(tabs)/schedule')} />
        <QuickAction icon="megaphone-outline" color="#2980b9" label="Ogłoszenia" onPress={() => router.push('/(tabs)/announcements')} />
      </View>
    </ScrollView>
  )
}

function StatBox({ icon, iconColor, value, label }: { icon: any; iconColor: string; value: number; label: string }) {
  return (
    <View style={styles.statBox}>
      <Ionicons name={icon} size={22} color={iconColor} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

function QuickAction({ icon, color, label, onPress }: { icon: any; color: string; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.quickAction} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.quickIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { padding: 16, gap: 16 },

  greetingCard: {
    backgroundColor: '#534AB7', borderRadius: 16, padding: 20, gap: 8,
    ...shadow.brand,
  },
  greetingName: { fontSize: 24, fontWeight: '700', color: '#fff' },
  greetingMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  greetingRole: { fontSize: 13, color: '#ffffffcc', fontWeight: '500' },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: '#ffffff55' },
  greetingRank: { fontSize: 13, color: '#ffffffcc' },

  liturgyRow: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
    paddingHorizontal: 14, paddingVertical: 10, gap: 6,
    backgroundColor: '#fffbf0', borderRadius: 12,
    borderWidth: 1, borderColor: '#f0e8c8',
  },
  liturgyDot: { width: 8, height: 8, borderRadius: 4 },
  liturgyTypeLabel: { fontSize: 12, color: '#a07800', fontWeight: '600' },
  liturgyName: { fontSize: 13, color: '#5a4000', flex: 1 },

  statsRow: { flexDirection: 'row', gap: 12 },
  statBox: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 16,
    alignItems: 'center', gap: 4,
    ...shadow.xs,
  },
  statValue: { fontSize: 26, fontWeight: '800', color: '#1a1a1a', marginTop: 4 },
  statLabel: { fontSize: 11, color: '#888', textAlign: 'center' },

  // Responsive wide layout
  wideRow: { flexDirection: 'row', gap: 20, alignItems: 'flex-start' },
  wideLeft: { flex: 1 },
  wideRight: { flex: 1, gap: 16 },

  section: { gap: 10 },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: '#aaa',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },

  // Day scroller
  dayStripWrap: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
  },
  dayChip: {
    alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 12, backgroundColor: '#fff', minWidth: 48,
    ...shadow.xs,
  },
  dayChipFill: { flex: 1 },
  dayChipSelected: { backgroundColor: '#534AB7' },
  dayChipDow: { fontSize: 11, fontWeight: '600', color: '#888' },
  dayChipNum: { fontSize: 17, fontWeight: '700', color: '#1a1a1a', marginTop: 2 },
  dayChipTextSelected: { color: '#fff' },

  dayLiturgyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 2,
  },
  dayLiturgyText: { fontSize: 12, color: '#a07800', fontStyle: 'italic', flex: 1 },

  emptyCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 20,
    alignItems: 'center', gap: 6,
    ...shadow.xs,
  },
  emptyText: { fontSize: 13, color: '#aaa' },
  emptyLink: { fontSize: 13, color: '#534AB7', fontWeight: '600', marginTop: 2 },

  eventRow: {
    backgroundColor: '#fff', borderRadius: 10, borderLeftWidth: 3,
    padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10,
    ...shadow.xs,
  },
  eventTimeBadge: {
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5,
    minWidth: 46, alignItems: 'center',
  },
  eventTime: { fontSize: 13, fontWeight: '700' },
  eventInfo: { flex: 1 },
  eventTitle: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  eventCat: { fontSize: 11, fontWeight: '500', marginTop: 1 },

  dutyCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 12,
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
  dutyTitle: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  dutyDate: { fontSize: 12, color: '#888', marginTop: 2 },
  catPill: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  catPillText: { fontSize: 11, fontWeight: '600' },

  actionsRow: { flexDirection: 'row', gap: 10 },
  quickAction: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 14,
    alignItems: 'center', gap: 8,
    ...shadow.md,
  },
  quickIcon: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  quickLabel: { fontSize: 12, fontWeight: '600', color: '#1a1a1a', textAlign: 'center' },
})
