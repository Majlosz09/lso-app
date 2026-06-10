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
import { useTheme } from '../../../lib/ThemeContext'
import { Colors } from '../../../lib/theme'

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

  const { colors: c, isDark } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  const today = localDateStr(new Date())

  // Load stats on focus
  const fetchStats = useCallback(() => {
    const nextWeek = new Date()
    nextWeek.setDate(nextWeek.getDate() + 7)
    const nextWeekStr = localDateStr(nextWeek)
    Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('parish_id', profile?.parish_id).eq('is_active', true).eq('role', 'member'),
      supabase.from('schedule_assignments').select('id, profile:profiles!inner(parish_id)', { count: 'exact' }).eq('status', 'excused').eq('profile.parish_id', profile?.parish_id),
      supabase.from('schedules').select('id, schedule_assignments(id)').eq('parish_id', profile?.parish_id).gte('date', today).lte('date', nextWeekStr),
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
    const { data } = await supabase.from('schedules').select('date').eq('parish_id', profile?.parish_id).gte('date', start).lte('date', end)
    setScheduleDates(new Set((data ?? []).map((s: any) => s.date)))
  }, [])

  useEffect(() => {
    const now = new Date()
    fetchMonthSchedules(now.getFullYear(), now.getMonth() + 1)
  }, [])

  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {}
    scheduleDates.forEach(date => {
      marks[date] = { dots: [{ key: 'sched', color: c.primary }], marked: true }
    })
    const sel = selectedDate ?? today
    marks[sel] = { ...(marks[sel] ?? {}), selected: true, selectedColor: c.primary }
    return marks
  }, [scheduleDates, selectedDate, today, c.primary])

  const todayLiturgy = getLiturgicalDay(today)
  const todayAccentColor = getLiturgicalAccentColor(todayLiturgy)
  const todayBgColor = getLiturgicalBgColor(todayLiturgy)
  const firstName = profile?.full_name?.split(' ')[0]

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.greeting}>
        <Text style={styles.greetingName}>Witaj, {firstName}!</Text>
        <Text style={styles.greetingSub}>Panel zarządzania LSO</Text>
      </View>

      {statsLoading ? (
        <ActivityIndicator color={c.primary} style={{ marginVertical: 12 }} />
      ) : (
        <View style={styles.statsRow}>
          <StatCard icon="people" color="#16A34A" value={stats.members} label="Ministranci"
            onPress={() => router.push('/(admin)/(admin-tabs)/members')} styles={styles} />
          <StatCard icon="calendar-clear" color="#EA580C" value={stats.unstaff} label="Nieprzypisane służby (7 dni)"
            onPress={() => router.push('/(admin)/(admin-tabs)/schedules')} styles={styles} />
          <StatCard icon="alert-circle" color={c.danger} value={stats.absent} label="Prośby o usprawiedliwienie"
            onPress={() => router.push('/(admin)/absence-requests')} styles={styles} />
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
          <Ionicons name="chevron-forward" size={16} color="#EA580C" />
        </TouchableOpacity>
      )}

      {/* Today's liturgy banner */}
      {todayLiturgy.type !== 'FERIA' && (
        <View style={[styles.liturgyRow, todayBgColor && { backgroundColor: todayBgColor + '18', borderColor: todayBgColor + '40' }]}>
          {todayAccentColor && <View style={[styles.liturgyDot, { backgroundColor: todayAccentColor }]} />}
          <Text style={styles.liturgyTypeLabel}>{todayLiturgy.typeLabel}:</Text>
          <Text style={styles.liturgyName} numberOfLines={2}>{todayLiturgy.name}</Text>
        </View>
      )}

      {/* Calendar */}
      <View style={styles.calendarCard}>
        <Calendar
          key={isDark ? 'dark' : 'light'}
          markingType="multi-dot"
          markedDates={markedDates}
          onDayPress={(day: { dateString: string }) => {
            setSelectedDate(day.dateString)
            router.push(`/(admin)/schedule-day?date=${day.dateString}`)
          }}
          onMonthChange={(month: { year: number; month: number }) => {
            fetchMonthSchedules(month.year, month.month)
          }}
          style={{ backgroundColor: c.surface }}
          theme={{
            selectedDayBackgroundColor: c.primary,
            arrowColor: c.primary,
            dotColor: c.primary,
            selectedDotColor: '#fff',
            calendarBackground: c.surface,
            backgroundColor: c.surface,
            dayTextColor: c.text,
            monthTextColor: c.primary,
            textSectionTitleColor: c.subtext,
            textDisabledColor: c.iconMuted,
            todayTextColor: c.primary,
          }}
          firstDay={1}
          enableSwipeMonths
          dayComponent={({ date, state, marking, onPress }: any) => {
            const isToday = date.dateString === today
            const isSelected = date.dateString === selectedDate
            const isDisabled = state === 'disabled'
            const lit = getLiturgicalDay(date.dateString)
            const litBg = getLiturgicalBgColor(lit)
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
                    isSelected ? { color: '#fff' } : isDisabled ? { color: c.iconMuted } : { color: c.text },
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
        <QuickAction icon="add-circle-outline" color={c.primary} label="Dodaj służbę"
          onPress={() => router.push('/(admin)/schedule-form')} styles={styles} />
        <QuickAction icon="trophy-outline" color={c.gold} label="Przyznaj punkty"
          onPress={() => router.push('/(admin)/award-points')} styles={styles} />
        <QuickAction icon="megaphone-outline" color={c.danger} label="Ogłoszenia"
          onPress={() => router.push('/(admin)/(admin-tabs)/announcements')} styles={styles} />
      </View>

      <Text style={styles.sectionLabel}>Ustawienia</Text>

      <TouchableOpacity style={styles.parishRow} onPress={() => router.push('/(admin)/statistics')} activeOpacity={0.75}>
        <View style={[styles.parishIcon, { backgroundColor: c.primaryAlpha08 }]}>
          <Ionicons name="bar-chart-outline" size={22} color={c.primary} />
        </View>
        <View style={styles.parishInfo}>
          <Text style={styles.parishTitle}>Statystyki</Text>
          <Text style={styles.parishSub}>Frekwencja, aktywność, punkty</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={c.iconMuted} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.parishRow} onPress={() => router.push('/(admin)/parish-settings')} activeOpacity={0.75}>
        <View style={[styles.parishIcon, { backgroundColor: c.borderLight }]}>
          <Ionicons name="settings-outline" size={22} color={c.subtext} />
        </View>
        <View style={styles.parishInfo}>
          <Text style={styles.parishTitle}>Parafia</Text>
          <Text style={styles.parishSub}>Ustawienia, Msza, Punktacja</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={c.iconMuted} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.parishRow} onPress={() => router.push('/(admin)/badge-management')} activeOpacity={0.75}>
        <View style={[styles.parishIcon, { backgroundColor: '#FFC10718' }]}>
          <Ionicons name="ribbon-outline" size={22} color="#FFC107" />
        </View>
        <View style={styles.parishInfo}>
          <Text style={styles.parishTitle}>Odznaki</Text>
          <Text style={styles.parishSub}>Wyróżnienia ministrantów</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={c.iconMuted} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.parishRow} onPress={() => router.push('/(admin)/rank-assignment')} activeOpacity={0.75}>
        <View style={[styles.parishIcon, { backgroundColor: c.primaryAlpha08 }]}>
          <Ionicons name="ribbon" size={22} color={c.primary} />
        </View>
        <View style={styles.parishInfo}>
          <Text style={styles.parishTitle}>Przydziel rangi</Text>
          <Text style={styles.parishSub}>Masowe przypisywanie rang formacyjnych</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={c.iconMuted} />
      </TouchableOpacity>

      {profile?.role === 'member' && profile?.is_admin && (
        <TouchableOpacity style={styles.backToUserBtn} onPress={() => router.replace('/(tabs)')}>
          <Ionicons name="arrow-back-outline" size={18} color={c.primary} />
          <Text style={styles.backToUserText}>Wróć do widoku ministranta</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  )
}

function StatCard({ icon, color, value, label, onPress, styles }: {
  icon: any; color: string; value: number; label: string; onPress?: () => void; styles: any
}) {
  return (
    <TouchableOpacity style={[styles.statCard, { borderTopColor: color }]} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </TouchableOpacity>
  )
}

function QuickAction({ icon, color, label, onPress, styles }: {
  icon: any; color: string; label: string; onPress: () => void; styles: any
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

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    content: { padding: 16, gap: 16 },

    greeting: { gap: 2 },
    greetingName: { fontSize: 24, fontWeight: '700', color: c.text },
    greetingSub: { fontSize: 13, color: c.subtext },

    statsRow: { flexDirection: 'row', gap: 10 },
    statCard: {
      flex: 1, backgroundColor: c.surface, borderRadius: 12,
      padding: 12, gap: 4, alignItems: 'center', borderTopWidth: 3,
      ...shadow.md,
    },
    statValue: { fontSize: 26, fontWeight: '800', color: c.text, marginTop: 4 },
    statLabel: { fontSize: 11, color: c.subtext, lineHeight: 14, textAlign: 'center' },

    liturgyRow: {
      flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
      paddingHorizontal: 14, paddingVertical: 10, gap: 6,
      backgroundColor: c.goldSurface, borderRadius: 12,
      borderWidth: 1, borderColor: c.border,
    },
    liturgyDot: { width: 8, height: 8, borderRadius: 4 },
    liturgyTypeLabel: { fontSize: 12, color: c.gold, fontWeight: '600' },
    liturgyName: { fontSize: 13, color: c.text, flex: 1 },

    calendarCard: {
      backgroundColor: c.surface, borderRadius: 16, overflow: 'hidden',
      borderBottomWidth: 1, borderBottomColor: c.border,
      ...shadow.md,
    },

    dayWrapper: { alignItems: 'center', paddingVertical: 2, width: 32 },
    dayCircle: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    dayTodayCircle: { borderWidth: 2, borderColor: c.primary },
    daySelectedCircle: { backgroundColor: c.primary },
    dayNum: { fontSize: 13, fontWeight: '400' },
    dayTodayNum: { fontWeight: '700' },
    dayDots: { flexDirection: 'row', gap: 2, marginTop: 1, minHeight: 5 },
    dayDot: { width: 4, height: 4, borderRadius: 2 },

    sectionLabel: {
      fontSize: 12, fontWeight: '700', color: c.textTertiary,
      textTransform: 'uppercase', letterSpacing: 0.8,
    },
    actionsRow: { flexDirection: 'row', gap: 10 },
    quickAction: {
      flex: 1, backgroundColor: c.surface, borderRadius: 14, padding: 14,
      alignItems: 'center', gap: 8,
      ...shadow.md,
    },
    quickActionIcon: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    quickActionLabel: { fontSize: 12, fontWeight: '600', color: c.text, textAlign: 'center', lineHeight: 16 },
    parishRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: c.surface, borderRadius: 14, padding: 14,
      ...shadow.md,
    },
    parishIcon: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    parishInfo: { flex: 1 },
    parishTitle: { fontSize: 15, fontWeight: '600', color: c.text },
    parishSub: { fontSize: 12, color: c.textTertiary, marginTop: 2 },

    backToUserBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 6, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: c.primaryAlpha20,
    },
    backToUserText: { fontSize: 14, color: c.primary, fontWeight: '500' },

    absenceBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: c.goldSurface, borderRadius: 14, padding: 14,
      borderWidth: 1.5, borderColor: '#EA580C',
    },
    absenceBannerBadge: {
      width: 28, height: 28, borderRadius: 14,
      backgroundColor: '#EA580C', justifyContent: 'center', alignItems: 'center',
    },
    absenceBannerBadgeText: { fontSize: 13, fontWeight: '800', color: '#fff' },
    absenceBannerTitle: { fontSize: 14, fontWeight: '700', color: c.text },
    absenceBannerSub: { fontSize: 12, color: c.subtext, marginTop: 1 },
  })
}
