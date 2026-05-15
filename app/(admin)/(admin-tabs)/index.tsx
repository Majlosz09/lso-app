import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator,
} from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Calendar, LocaleConfig } from 'react-native-calendars'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../stores/authStore'
import { getLiturgicalDay, getLiturgicalAccentColor, getLiturgicalBgColor } from '../../../lib/liturgy'
import { shadow } from '../../../lib/shadows'

LocaleConfig.locales['pl'] = {
  monthNames: ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'],
  monthNamesShort: ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'],
  dayNames: ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'],
  dayNamesShort: ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb'],
  today: 'Dziś',
}
LocaleConfig.defaultLocale = 'pl'

type Stats = { members: number; unstaff: number; absent: number }

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function AdminHome() {
  const { profile } = useAuthStore()
  const router = useRouter()
  const [stats, setStats] = useState<Stats>({ members: 0, unstaff: 0, absent: 0 })
  const [statsLoading, setStatsLoading] = useState(true)
  const [scheduleDates, setScheduleDates] = useState<Set<string>>(new Set())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const today = localDateStr(new Date())

  // Load stats on focus
  const fetchStats = useCallback(() => {
    const nextWeek = new Date()
    nextWeek.setDate(nextWeek.getDate() + 7)
    const nextWeekStr = localDateStr(nextWeek)
    Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('role', 'member'),
      supabase.from('schedule_assignments').select('id', { count: 'exact', head: true }).eq('status', 'excused'),
      supabase.from('schedules').select('id, schedule_assignments(id)').gte('date', today).lte('date', nextWeekStr),
    ]).then(([membersRes, absentRes, unstaffRes]) => {
      const unstaffCount = (unstaffRes.data ?? []).filter((s: any) => s.schedule_assignments.length === 0).length
      setStats({ members: membersRes.count ?? 0, absent: absentRes.count ?? 0, unstaff: unstaffCount })
      setStatsLoading(false)
    }).catch(() => {
      setStatsLoading(false)
    })
  }, [today])

  useFocusEffect(fetchStats)

  // Fetch schedule dates for a month to mark calendar
  const fetchMonthSchedules = useCallback(async (year: number, month: number) => {
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    const { data } = await supabase.from('schedules').select('date').gte('date', start).lte('date', end)
    setScheduleDates(new Set((data ?? []).map((s: any) => s.date)))
  }, [])

  useEffect(() => {
    const now = new Date()
    fetchMonthSchedules(now.getFullYear(), now.getMonth() + 1)
  }, [])

  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {}
    scheduleDates.forEach(date => {
      marks[date] = { dots: [{ key: 'sched', color: '#534AB7' }], marked: true }
    })
    const sel = selectedDate ?? today
    marks[sel] = { ...(marks[sel] ?? {}), selected: true, selectedColor: '#534AB7' }
    return marks
  }, [scheduleDates, selectedDate, today])

  const todayLiturgy = getLiturgicalDay(today)
  const todayAccentColor = todayLiturgy ? getLiturgicalAccentColor(todayLiturgy) : null
  const todayBgColor = todayLiturgy ? getLiturgicalBgColor(todayLiturgy) : null
  const firstName = profile?.full_name?.split(' ')[0]

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.greeting}>
        <Text style={styles.greetingName}>Witaj, {firstName}!</Text>
        <Text style={styles.greetingSub}>Panel zarządzania LSO</Text>
      </View>

      {statsLoading ? (
        <ActivityIndicator color="#534AB7" style={{ marginVertical: 12 }} />
      ) : (
        <View style={styles.statsRow}>
          <StatCard icon="people" color="#27ae60" value={stats.members} label="Ministranci"
            onPress={() => router.push('/(admin)/(admin-tabs)/members')} />
          <StatCard icon="calendar-clear" color="#e67e22" value={stats.unstaff} label="Nieprzypisane służby (7 dni)"
            onPress={() => router.push('/(admin)/(admin-tabs)/schedules')} />
          <StatCard icon="alert-circle" color="#e74c3c" value={stats.absent} label="Prośby o usprawiedliwienie"
            onPress={() => router.push('/(admin)/absence-requests')} />
        </View>
      )}

      {!statsLoading && stats.absent > 0 && (
        <TouchableOpacity
          style={styles.absenceBanner}
          onPress={() => router.push('/(admin)/absence-requests')}
          activeOpacity={0.8}
        >
          <View style={styles.absenceBannerBadge}>
            <Text style={styles.absenceBannerBadgeText}>{stats.absent}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.absenceBannerTitle}>Usprawiedliwienia nieobecności</Text>
            <Text style={styles.absenceBannerSub}>
              {stats.absent === 1 ? '1 oczekuje' : `${stats.absent} oczekują`} na decyzję
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#e67e22" />
        </TouchableOpacity>
      )}

      {/* Today's liturgy banner */}
      {todayLiturgy && (
        <View style={[styles.liturgyRow, todayBgColor && { backgroundColor: todayBgColor + '18', borderColor: todayBgColor + '40' }]}>
          {todayAccentColor && <View style={[styles.liturgyDot, { backgroundColor: todayAccentColor }]} />}
          <Text style={styles.liturgyTypeLabel}>{todayLiturgy.typeLabel}:</Text>
          <Text style={styles.liturgyName} numberOfLines={2}>{todayLiturgy.name}</Text>
        </View>
      )}

      {/* Calendar */}
      <View style={styles.calendarCard}>
        <Calendar
          markingType="multi-dot"
          markedDates={markedDates}
          onDayPress={(day: { dateString: string }) => {
            setSelectedDate(day.dateString)
            router.push(`/(admin)/schedule-day?date=${day.dateString}`)
          }}
          onMonthChange={(month: { year: number; month: number }) => {
            fetchMonthSchedules(month.year, month.month)
          }}
          theme={{
            selectedDayBackgroundColor: '#534AB7',
            arrowColor: '#534AB7',
            dotColor: '#534AB7',
            selectedDotColor: '#fff',
          }}
          firstDay={1}
          enableSwipeMonths
          dayComponent={({ date, state, marking, onPress }: any) => {
            const isToday = date.dateString === today
            const isSelected = date.dateString === selectedDate
            const isDisabled = state === 'disabled'
            const lit = getLiturgicalDay(date.dateString)
            const litBg = lit ? getLiturgicalBgColor(lit) : null
            const dots: any[] = marking?.dots ?? []
            return (
              <TouchableOpacity onPress={() => onPress(date)} activeOpacity={0.7} style={styles.dayWrapper}>
                <View style={[
                  styles.dayCircle,
                  !isSelected && litBg && { backgroundColor: litBg + '40' },
                  isToday && !isSelected && styles.dayTodayCircle,
                  isSelected && styles.daySelectedCircle,
                ]}>
                  <Text style={[
                    styles.dayNum,
                    isSelected ? { color: '#fff' } : isDisabled ? { color: '#ccc' } : { color: '#1a1a1a' },
                    isToday && !isSelected && styles.dayTodayNum,
                  ]}>
                    {date.day}
                  </Text>
                </View>
                <View style={styles.dayDots}>
                  {dots.slice(0, 3).map((dot: any, i: number) => (
                    <View key={i} style={[styles.dayDot, { backgroundColor: isSelected ? '#ffffff99' : dot.color }]} />
                  ))}
                </View>
              </TouchableOpacity>
            )
          }}
        />
      </View>

      <Text style={styles.sectionLabel}>Szybkie akcje</Text>

      <View style={styles.actionsRow}>
        <QuickAction icon="add-circle-outline" color="#534AB7" label="Dodaj służbę"
          onPress={() => router.push('/(admin)/schedule-form')} />
        <QuickAction icon="trophy-outline" color="#f0a500" label="Przyznaj punkty"
          onPress={() => router.push('/(admin)/award-points')} />
        <QuickAction icon="megaphone-outline" color="#e74c3c" label="Nowe ogłoszenie"
          onPress={() => router.push('/(admin)/(admin-tabs)/announcements?openModal=true')} />
      </View>

      <Text style={styles.sectionLabel}>Ustawienia</Text>

      <TouchableOpacity style={styles.parishRow} onPress={() => router.push('/(admin)/parish-settings')} activeOpacity={0.75}>
        <View style={[styles.parishIcon, { backgroundColor: '#55555518' }]}>
          <Ionicons name="settings-outline" size={22} color="#555" />
        </View>
        <View style={styles.parishInfo}>
          <Text style={styles.parishTitle}>Parafia</Text>
          <Text style={styles.parishSub}>Ustawienia, Msza, Punktacja</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#ccc" />
      </TouchableOpacity>

      {profile?.role === 'member' && profile?.is_admin && (
        <TouchableOpacity style={styles.backToUserBtn} onPress={() => router.replace('/(tabs)')}>
          <Ionicons name="arrow-back-outline" size={18} color="#534AB7" />
          <Text style={styles.backToUserText}>Wróć do widoku ministranta</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  )
}

function StatCard({ icon, color, value, label, onPress }: {
  icon: any; color: string; value: number; label: string; onPress?: () => void
}) {
  return (
    <TouchableOpacity style={[styles.statCard, { borderTopColor: color }]} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </TouchableOpacity>
  )
}

function QuickAction({ icon, color, label, onPress }: {
  icon: any; color: string; label: string; onPress: () => void
}) {
  return (
    <TouchableOpacity style={styles.quickAction} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.quickActionIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { padding: 16, gap: 16 },

  greeting: { gap: 2 },
  greetingName: { fontSize: 24, fontWeight: '700', color: '#1a1a1a' },
  greetingSub: { fontSize: 13, color: '#888' },

  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12,
    padding: 12, gap: 4, alignItems: 'center', borderTopWidth: 3,
    ...shadow.md,
  },
  statValue: { fontSize: 26, fontWeight: '800', color: '#1a1a1a', marginTop: 4 },
  statLabel: { fontSize: 11, color: '#888', lineHeight: 14, textAlign: 'center' },

  liturgyRow: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
    paddingHorizontal: 14, paddingVertical: 10, gap: 6,
    backgroundColor: '#fffbf0', borderRadius: 12,
    borderWidth: 1, borderColor: '#f0e8c8',
  },
  liturgyDot: { width: 8, height: 8, borderRadius: 4 },
  liturgyTypeLabel: { fontSize: 12, color: '#a07800', fontWeight: '600' },
  liturgyName: { fontSize: 13, color: '#5a4000', flex: 1 },

  calendarCard: {
    backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden',
    borderBottomWidth: 1, borderBottomColor: '#e8e8e8',
    ...shadow.md,
  },

  dayWrapper: { alignItems: 'center', paddingVertical: 2, width: 32 },
  dayCircle: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  dayTodayCircle: { borderWidth: 2, borderColor: '#534AB7' },
  daySelectedCircle: { backgroundColor: '#534AB7' },
  dayNum: { fontSize: 13, fontWeight: '400' },
  dayTodayNum: { fontWeight: '700' },
  dayDots: { flexDirection: 'row', gap: 2, marginTop: 1, minHeight: 5 },
  dayDot: { width: 4, height: 4, borderRadius: 2 },

  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: '#aaa',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  actionsRow: { flexDirection: 'row', gap: 10 },
  quickAction: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 14,
    alignItems: 'center', gap: 8,
    ...shadow.md,
  },
  quickActionIcon: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  quickActionLabel: { fontSize: 12, fontWeight: '600', color: '#1a1a1a', textAlign: 'center', lineHeight: 16 },
  parishRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    ...shadow.md,
  },
  parishIcon: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  parishInfo: { flex: 1 },
  parishTitle: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  parishSub: { fontSize: 12, color: '#aaa', marginTop: 2 },

  backToUserBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#534AB733',
  },
  backToUserText: { fontSize: 14, color: '#534AB7', fontWeight: '500' },

  absenceBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff3e0', borderRadius: 14, padding: 14,
    borderWidth: 1.5, borderColor: '#e67e22',
  },
  absenceBannerBadge: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#e67e22', justifyContent: 'center', alignItems: 'center',
  },
  absenceBannerBadgeText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  absenceBannerTitle: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  absenceBannerSub: { fontSize: 12, color: '#888', marginTop: 1 },
})
