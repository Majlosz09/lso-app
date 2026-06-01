import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, ScrollView
} from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../stores/authStore'
import { MassTemplate, getCatColors, ScheduleCategory } from '../../../types/database'
import { shadow } from '../../../lib/shadows'
import { useTheme } from '../../../lib/ThemeContext'
import { Colors } from '../../../lib/theme'

type AssignedProfile = { full_name: string }
type Assignment = { profile: AssignedProfile | null }
type WeekSchedule = {
  id: string
  title: string
  date: string
  time: string
  category: ScheduleCategory
  schedule_assignments: Assignment[]
}

type SlotItem = {
  key: string
  time: string
  title: string
  category: ScheduleCategory
  isTemplate: boolean
  schedule: WeekSchedule | null
}

const DAYS_PL = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota']

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getWeekBounds(offsetWeeks: number) {
  const now = new Date()
  const dayOfWeek = now.getDay()
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(now)
  monday.setDate(now.getDate() + diffToMonday + offsetWeeks * 7)
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  const fmt = (d: Date) => d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })
  return {
    start: monday,
    end: sunday,
    label: `${fmt(monday)} – ${fmt(sunday)} ${monday.getFullYear()}`,
  }
}

export default function SchedulesTab() {
  const router = useRouter()
  const { profile } = useAuthStore()
  const [weekOffset, setWeekOffset] = useState(0)
  const [schedules, setSchedules] = useState<WeekSchedule[]>([])
  const [templates, setTemplates] = useState<MassTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [creatingSlotKey, setCreatingSlotKey] = useState<string | null>(null)

  const { colors: c, isDark } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  const { start, end, label } = useMemo(() => getWeekBounds(weekOffset), [weekOffset])

  useEffect(() => {
    if (!profile?.parish_id) return
    supabase
      .from('mass_templates')
      .select('*')
      .eq('parish_id', profile.parish_id)
      .order('day_of_week')
      .order('time')
      .then(({ data }) => { if (data) setTemplates(data as MassTemplate[]) })
  }, [profile?.parish_id])

  const loadSchedules = useCallback(() => {
    setLoading(true)
    const startStr = localDateStr(start)
    const endStr = localDateStr(end)
    supabase
      .from('schedules')
      .select('id, title, date, time, category, schedule_assignments(profile:profiles(full_name))')
      .eq('parish_id', profile?.parish_id)
      .gte('date', startStr)
      .lte('date', endStr)
      .order('date')
      .order('time')
      .then(({ data, error }) => {
        if (!error && data) setSchedules(data as unknown as WeekSchedule[])
        setLoading(false)
      })
  }, [start, end])

  useFocusEffect(useCallback(() => { loadSchedules() }, [loadSchedules]))

  useEffect(() => { loadSchedules() }, [weekOffset])

  const weekDays = useMemo(() => {
    const days: { date: string; dow: number }[] = []
    const d = new Date(start)
    while (d <= end) {
      days.push({ date: localDateStr(d), dow: d.getDay() })
      d.setDate(d.getDate() + 1)
    }
    return days
  }, [start, end])

  const grouped = useMemo(() => {
    return weekDays.map(({ date, dow }) => {
      const daySchedules = schedules.filter(s => s.date === date)
      const scheduledSlots: SlotItem[] = daySchedules.map(s => ({
        key: s.id,
        time: s.time.slice(0, 5),
        title: s.title,
        category: s.category ?? 'msza',
        isTemplate: false,
        schedule: s,
      }))
      const scheduledTimes = new Set(scheduledSlots.map(s => s.time))
      const templateSlots: SlotItem[] = templates
        .filter(t => t.day_of_week === dow && !scheduledTimes.has(t.time.slice(0, 5)))
        .map(t => ({
          key: `tpl-${date}-${t.id}`,
          time: t.time.slice(0, 5),
          title: t.label ?? 'Msza Święta',
          category: 'msza' as ScheduleCategory,
          isTemplate: true,
          schedule: null,
        }))
      const slots = [...scheduledSlots, ...templateSlots]
        .sort((a, b) => a.time.localeCompare(b.time))
      return { date, dow, slots }
    }).filter(d => d.slots.length > 0)
  }, [weekDays, schedules, templates])

  const handleEmptySlot = async (date: string, slot: SlotItem) => {
    setCreatingSlotKey(slot.key)
    const { data, error } = await supabase
      .from('schedules')
      .insert({
        title: slot.title,
        date,
        time: slot.time + ':00',
        category: slot.category,
        group_id: null,
        location: '',
        gps_radius: 100,
        notes: null,
        created_by: profile?.id,
        parish_id: profile?.parish_id,
      })
      .select('id')
      .single()
    setCreatingSlotKey(null)
    if (!error && data) {
      router.push(`/(admin)/schedule-detail?id=${data.id}`)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.weekNav}>
        <TouchableOpacity onPress={() => setWeekOffset(w => w - 1)} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={c.primary} />
        </TouchableOpacity>
        <Text style={styles.weekLabel}>{label}</Text>
        <TouchableOpacity onPress={() => setWeekOffset(w => w + 1)} hitSlop={12}>
          <Ionicons name="chevron-forward" size={22} color={c.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.addRow}>
        <TouchableOpacity
          style={[styles.addButton, { flex: 1 }]}
          onPress={() => router.push('/(admin)/schedule-form')}
        >
          <Ionicons name="add" size={18} color={c.primary} />
          <Text style={styles.addButtonText}>Jednorazowa służba</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.addButton, { flex: 1 }]}
          onPress={() => router.push('/(admin)/schedule-series')}
        >
          <Ionicons name="calendar-outline" size={18} color={c.primary} />
          <Text style={styles.addButtonText}>Cykliczne służby</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      ) : grouped.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="calendar-outline" size={52} color={c.iconMuted} />
          <Text style={styles.emptyText}>Brak służb w tym tygodniu</Text>
          <TouchableOpacity onPress={() => setWeekOffset(0)}>
            <Text style={styles.emptyLink}>Wróć do bieżącego tygodnia</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          {grouped.map(({ date, dow, slots }) => {
            const d = new Date(date + 'T12:00:00')
            return (
              <View key={date} style={styles.dayGroup}>
                <View style={styles.dayHeader}>
                  <Text style={styles.dayName}>{DAYS_PL[dow]}</Text>
                  <Text style={styles.dayDate}>
                    {d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })}
                  </Text>
                </View>
                {slots.map(slot => {
                  const names = slot.schedule?.schedule_assignments
                    .map(a => a.profile?.full_name)
                    .filter(Boolean) ?? []
                  const isCreating = creatingSlotKey === slot.key
                  const cat = getCatColors(slot.category, isDark)

                  return (
                    <TouchableOpacity
                      key={slot.key}
                      style={[styles.card, { borderLeftColor: cat.color }]}
                      onPress={() => {
                        if (slot.schedule) {
                          router.push(`/(admin)/schedule-detail?id=${slot.schedule.id}`)
                        } else {
                          handleEmptySlot(date, slot)
                        }
                      }}
                      activeOpacity={0.75}
                      disabled={isCreating}
                    >
                      <View style={styles.cardTop}>
                        <View style={[styles.timeBadge, { backgroundColor: cat.bg }]}>
                          <Text style={[styles.timeText, { color: cat.color }]}>{slot.time}</Text>
                        </View>
                        <View style={styles.cardInfo}>
                          <Text style={styles.cardTitle} numberOfLines={1}>{slot.title}</Text>
                          <Text style={[styles.categoryLabel, { color: cat.color }]}>{cat.label}</Text>
                        </View>
                        {isCreating
                          ? <ActivityIndicator size="small" color={cat.color} />
                          : <Ionicons name="chevron-forward" size={16} color={c.iconMuted} />
                        }
                      </View>

                      {names.length > 0 ? (
                        <View style={styles.assigneesRow}>
                          <Ionicons name="people-outline" size={13} color={cat.color} />
                          <Text style={[styles.assigneesText, { color: cat.color }]} numberOfLines={2}>
                            {names.join(', ')}
                          </Text>
                          <Text style={[styles.countBadge, { color: cat.color, backgroundColor: cat.bg }]}>{names.length}</Text>
                        </View>
                      ) : (
                        <View style={styles.assigneesRow}>
                          <Ionicons name="person-outline" size={13} color={c.textTertiary} />
                          <Text style={[styles.assigneesText, { color: c.textTertiary }]}>
                            Brak zapisanych ministrantów
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  )
                })}
              </View>
            )
          })}
        </ScrollView>
      )}
    </View>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    weekNav: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: c.surface, paddingHorizontal: 20, paddingVertical: 13,
      borderBottomWidth: 1, borderBottomColor: c.primarySurface,
    },
    weekLabel: { fontSize: 14, fontWeight: '600', color: c.text },

    addRow: {
      flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 16, marginBottom: 8,
    },
    addButton: {
      flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center',
      backgroundColor: c.primaryAlpha08, borderRadius: 12, padding: 12,
      borderWidth: 1, borderColor: c.primaryAlpha20,
    },
    addButtonSeries: {},
    addButtonText: { color: c.primary, fontSize: 14, fontWeight: '600' },

    listContent: { padding: 16, gap: 4 },

    dayGroup: { marginBottom: 16 },
    dayHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 8 },
    dayName: { fontSize: 14, fontWeight: '700', color: c.text },
    dayDate: { fontSize: 12, color: c.subtext },

    card: {
      backgroundColor: c.surface, borderRadius: 12, padding: 12, marginBottom: 8,
      ...shadow.xs, gap: 8,
      borderLeftWidth: 4,
    },
    categoryLabel: { fontSize: 11, fontWeight: '600', marginTop: 1 },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    timeBadge: {
      borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5,
      minWidth: 48, alignItems: 'center',
    },
    timeText: { fontSize: 13, fontWeight: '700' },
    cardInfo: { flex: 1 },
    cardTitle: { fontSize: 15, fontWeight: '600', color: c.text, flexShrink: 1 },

    assigneesRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    assigneesText: { flex: 1, fontSize: 12, lineHeight: 16 },
    countBadge: {
      fontSize: 12, fontWeight: '700',
      borderRadius: 10,
      paddingHorizontal: 7, paddingVertical: 2,
    },

    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    emptyText: { color: c.textTertiary, fontSize: 15 },
    emptyLink: { color: c.primary, fontSize: 13, fontWeight: '600', marginTop: 4 },
  })
}
