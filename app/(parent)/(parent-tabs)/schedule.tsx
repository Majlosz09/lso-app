import { useEffect, useMemo, useState } from 'react'
import {
  View, Text, FlatList, StyleSheet,
  RefreshControl, ActivityIndicator, TouchableOpacity
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../../lib/supabase'
import { shadow } from '../../../lib/shadows'
import { useAuthStore } from '../../../stores/authStore'
import { STATUS_COLORS, STATUS_LABELS } from '../../../lib/status'
import { useTheme } from '../../../lib/ThemeContext'
import { Colors } from '../../../lib/theme'

export default function ScheduleScreen() {
  const { profile } = useAuthStore()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const today = new Date().toISOString().split('T')[0]

  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  const fetchData = async () => {
    if (!profile?.id) return
    const { data: children } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('parent_id', profile.id)

    if (!children || children.length === 0) {
      setItems([])
      setLoading(false)
      setRefreshing(false)
      return
    }

    const childMap = new Map(children.map((c: any) => [c.id, c.full_name]))
    const childIds = children.map((c: any) => c.id)

    const { data } = await supabase
      .from('schedule_assignments')
      .select(`
        id, status, profile_id,
        schedule:schedules(id, title, date, time, group:groups(name))
      `)
      .in('profile_id', childIds)

    if (data) {
      setItems(
        data
          .map((a: any) => ({
            ...a.schedule,
            assignmentId: a.id,
            childName: childMap.get(a.profile_id) ?? '?',
            myStatus: a.status,
          }))
          .filter((s: any) => s?.id && s.date >= today)
          .sort((a: any, b: any) => a.date.localeCompare(b.date))
      )
    }
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => { fetchData() }, [profile?.id])

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={c.primary} /></View>
  }

  return (
    <FlatList
      data={items}
      keyExtractor={item => item.assignmentId}
      style={{ flex: 1, backgroundColor: c.bg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData() }} />}
      ListHeaderComponent={
        <Text style={styles.parentHeader}>Nadchodzące dyżury dzieci</Text>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name="calendar-outline" size={48} color={c.iconMuted} />
          <Text style={styles.emptyText}>Brak nadchodzących dyżurów</Text>
        </View>
      }
      renderItem={({ item }) => <ChildScheduleCard schedule={item} styles={styles} colors={c} />}
      contentContainerStyle={{ padding: 16, gap: 12 }}
    />
  )
}

function ChildScheduleCard({ schedule, styles, colors: c }: { schedule: any; styles: any; colors: Colors }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{schedule.title}</Text>
        <View style={[styles.pill, { backgroundColor: (STATUS_COLORS[schedule.myStatus] ?? c.subtext) + '22' }]}>
          <Text style={[styles.pillText, { color: STATUS_COLORS[schedule.myStatus] ?? c.subtext }]}>
            {STATUS_LABELS[schedule.myStatus] ?? schedule.myStatus}
          </Text>
        </View>
      </View>
      <View style={[styles.row, { marginBottom: 2 }]}>
        <Ionicons name="person-outline" size={14} color={c.primary} />
        <Text style={[styles.cardMeta, { color: c.primary, fontWeight: '600' }]}>{schedule.childName}</Text>
      </View>
      <MetaRow icon="calendar-outline" text={
        new Date(schedule.date + 'T12:00:00').toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })
      } styles={styles} />
      <MetaRow icon="time-outline" text={schedule.time?.slice(0, 5)} styles={styles} />
      {schedule.group && <MetaRow icon="people-outline" text={schedule.group.name} color={c.primary} styles={styles} />}
    </View>
  )
}

function MetaRow({ icon, text, color, styles }: { icon: any; text: string; color?: string; styles: any }) {
  const { colors: c } = useTheme()
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={14} color={color ?? c.subtext} />
      <Text style={[styles.cardMeta, { color: color ?? c.subtext }]}>{text}</Text>
    </View>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    empty: { alignItems: 'center', marginTop: 60, gap: 10 },
    emptyText: { color: c.textTertiary, fontSize: 16 },
    parentHeader: { fontSize: 17, fontWeight: '700', color: c.text, marginBottom: 4 },
    card: {
      backgroundColor: c.surface, borderRadius: 12, padding: 12, gap: 4,
      ...shadow.md,
    },
    cardHeader: {
      flexDirection: 'row', justifyContent: 'space-between',
      alignItems: 'center', marginBottom: 2,
    },
    cardTitle: { fontSize: 16, fontWeight: '600', color: c.text, flex: 1 },
    pill: {
      flexDirection: 'row', alignItems: 'center', gap: 3,
      borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
    },
    pillText: { fontSize: 12, fontWeight: '500' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    cardMeta: { fontSize: 13 },
  })
}
