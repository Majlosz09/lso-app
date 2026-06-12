import { useEffect, useState, useMemo } from 'react'
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { getCatColors, ScheduleCategory } from '../../types/database'
import { shadow } from '../../lib/shadows'
import { getLiturgicalDay, getLiturgicalVestmentColor, VESTMENT_LABELS } from '../../lib/liturgy'
import { useTheme } from '../../lib/ThemeContext'
import { useAuthStore } from '../../stores/authStore'
import { Colors } from '../../lib/theme'

type DaySchedule = {
  id: string
  title: string
  time: string
  category: ScheduleCategory
  schedule_assignments: { profile: { full_name: string } | null }[]
}

export default function ScheduleDayScreen() {
  const { date: initialDate } = useLocalSearchParams<{ date: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { colors: c, isDark } = useTheme()
  const { profile } = useAuthStore()
  const styles = useMemo(() => createStyles(c), [c])
  const [currentDate, setCurrentDate] = useState(initialDate ?? '')
  const [schedules, setSchedules] = useState<DaySchedule[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentDate || !profile?.parish_id) { setLoading(false); return }
    setLoading(true)
    supabase
      .from('schedules')
      .select('id, title, time, category, schedule_assignments(profile:profiles(full_name))')
      .eq('date', currentDate)
      .eq('parish_id', profile.parish_id)
      .order('time')
      .then(({ data }) => {
        setSchedules((data ?? []) as unknown as DaySchedule[])
        setLoading(false)
      })
  }, [currentDate, profile?.parish_id])

  const d = currentDate ? new Date(currentDate + 'T12:00:00') : null
  const dayTitle = d
    ? d.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  const lit = currentDate ? getLiturgicalDay(currentDate) : null
  const vestmentColor = lit ? getLiturgicalVestmentColor(lit) : c.subtext
  const vestmentLabel = lit ? (VESTMENT_LABELS[lit.color ?? ''] ?? lit.color ?? '') : ''

  const adjacentDate = (offset: -1 | 1) => {
    const base = new Date((currentDate ?? '') + 'T12:00:00')
    base.setDate(base.getDate() + offset)
    return base.toISOString().split('T')[0]
  }

  const formatShort = (dateStr: string) =>
    new Date(dateStr + 'T12:00:00').toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' })

  const prevDate = currentDate ? adjacentDate(-1) : null
  const nextDate = currentDate ? adjacentDate(1) : null

  return (
    <>
      <Stack.Screen options={{ title: dayTitle }} />
      <View style={{ flex: 1, backgroundColor: c.bg }}>

      {/* Pasek nawigacji między dniami */}
      <View style={styles.navBar}>
        <TouchableOpacity
          style={styles.navBtn}
          onPress={() => prevDate && setCurrentDate(prevDate)}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={18} color={c.primary} />
          <Text style={styles.navBtnText}>{prevDate ? formatShort(prevDate) : ''}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.navBtn, { flexDirection: 'row-reverse' }]}
          onPress={() => nextDate && setCurrentDate(nextDate)}
          hitSlop={8}
        >
          <Ionicons name="chevron-forward" size={18} color={c.primary} />
          <Text style={styles.navBtnText}>{nextDate ? formatShort(nextDate) : ''}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) }]}>

        {/* Liturgical info banner */}
        {lit && (
          <View style={[styles.liturgyBanner, { backgroundColor: vestmentColor + '18', borderColor: vestmentColor + '55' }]}>
            <View style={[styles.vestmentStrip, { backgroundColor: vestmentColor }]} />
            <View style={styles.liturgyContent}>
              <Text style={[styles.liturgyType, { color: vestmentColor }]}>{lit.typeLabel}</Text>
              <Text style={styles.liturgyName}>{lit.name}</Text>
              <View style={[styles.colorChip, { backgroundColor: vestmentColor + '22', borderColor: vestmentColor + '55' }]}>
                <View style={[styles.colorDot, { backgroundColor: vestmentColor }]} />
                <Text style={[styles.colorChipText, { color: vestmentColor }]}>Ornat {vestmentLabel.toLowerCase()}</Text>
              </View>
            </View>
          </View>
        )}

        {loading ? (
          <ActivityIndicator size="large" color={c.primary} style={{ marginTop: 40 }} />
        ) : schedules.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={48} color="#E5E7EB" />
            <Text style={styles.emptyText}>Brak służb w tym dniu</Text>
            <TouchableOpacity style={styles.addBtn} onPress={() => router.push(`/(admin)/schedule-form?date=${currentDate}`)}>
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={styles.addBtnText}>Dodaj służbę</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {schedules.map(s => {
              const cat = getCatColors(s.category, isDark)
              const names = s.schedule_assignments.map(a => a.profile?.full_name).filter(Boolean) as string[]
              return (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.card, { borderLeftColor: cat.color }]}
                  onPress={() => router.push(`/(admin)/schedule-detail?id=${s.id}`)}
                  activeOpacity={0.75}
                >
                  <View style={styles.cardTop}>
                    <View style={[styles.timeBadge, { backgroundColor: cat.bg }]}>
                      <Text style={[styles.timeText, { color: cat.color }]}>{s.time.slice(0, 5)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle} numberOfLines={1}>{s.title}</Text>
                      <Text style={[styles.categoryLabel, { color: cat.color }]}>{cat.label}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={c.iconMuted} />
                  </View>
                  {names.length > 0 ? (
                    <View style={styles.assigneesRow}>
                      <Ionicons name="people-outline" size={13} color={cat.color} />
                      <Text style={[styles.assigneesText, { color: cat.color }]} numberOfLines={1}>
                        {names.join(', ')}
                      </Text>
                      <Text style={[styles.countBadge, { color: cat.color, backgroundColor: cat.bg }]}>{names.length}</Text>
                    </View>
                  ) : (
                    <View style={styles.assigneesRow}>
                      <Ionicons name="person-outline" size={13} color={c.textTertiary} />
                      <Text style={[styles.assigneesText, { color: c.textTertiary }]}>Brak zapisanych ministrantów</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )
            })}
            <TouchableOpacity style={styles.addBtnRow} onPress={() => router.push(`/(admin)/schedule-form?date=${currentDate}`)}>
              <Ionicons name="add" size={16} color={c.primary} />
              <Text style={styles.addBtnRowText}>Dodaj służbę w tym dniu</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
      </View>
    </>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    navBar: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      backgroundColor: c.surface, paddingHorizontal: 8, paddingVertical: 8,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    navBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 },
    navBtnText: { fontSize: 13, color: c.primary, fontWeight: '600' },

    scroll: { flex: 1 },
    content: { padding: 16, gap: 8 },

    liturgyBanner: {
      flexDirection: 'row', borderRadius: 14, borderWidth: 1,
      overflow: 'hidden', marginBottom: 4,
    },
    vestmentStrip: { width: 6 },
    liturgyContent: { flex: 1, padding: 12, gap: 5 },
    liturgyType: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
    liturgyName: { fontSize: 15, fontWeight: '600', color: c.text, lineHeight: 20 },
    colorChip: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      alignSelf: 'flex-start', borderRadius: 20, borderWidth: 1,
      paddingHorizontal: 10, paddingVertical: 4,
    },
    colorDot: { width: 10, height: 10, borderRadius: 5 },
    colorChipText: { fontSize: 12, fontWeight: '600' },

    empty: { alignItems: 'center', gap: 16, marginTop: 40 },
    emptyText: { fontSize: 15, color: c.textTertiary },
    addBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: c.primary, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10,
    },
    addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

    card: {
      backgroundColor: c.surface, borderRadius: 12, padding: 12,
      ...shadow.xs,
      gap: 8, borderLeftWidth: 4,
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    timeBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, minWidth: 48, alignItems: 'center' },
    timeText: { fontSize: 13, fontWeight: '700' },
    cardTitle: { fontSize: 15, fontWeight: '600', color: c.text },
    categoryLabel: { fontSize: 11, fontWeight: '600', marginTop: 1 },
    assigneesRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    assigneesText: { flex: 1, fontSize: 12, lineHeight: 16 },
    countBadge: { fontSize: 12, fontWeight: '700', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },

    addBtnRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      paddingVertical: 14, borderRadius: 12,
      borderWidth: 1, borderColor: c.primaryAlpha20, borderStyle: 'dashed',
    },
    addBtnRowText: { fontSize: 14, color: c.primary, fontWeight: '600' },
  })
}
