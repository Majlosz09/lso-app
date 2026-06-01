import { useEffect, useState, useMemo } from 'react'
import {
  View, Text, FlatList, StyleSheet,
  RefreshControl, ActivityIndicator, TouchableOpacity, Alert
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { Schedule } from '../../types/database'
import { shadow } from '../../lib/shadows'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'
import { useAuthStore } from '../../stores/authStore'

type ScheduleWithGroup = Schedule & { group?: { name: string } }

export default function AdminSchedules() {
  const router = useRouter()
  const [schedules, setSchedules] = useState<ScheduleWithGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const { colors: c } = useTheme()
  const { profile } = useAuthStore()
  const styles = useMemo(() => createStyles(c), [c])

  const fetchSchedules = async () => {
    if (!profile?.parish_id) { setLoading(false); setRefreshing(false); return }
    const { data, error } = await supabase
      .from('schedules')
      .select('*, group:groups(name)')
      .eq('parish_id', profile.parish_id)
      .order('date', { ascending: false })

    if (!error && data) setSchedules(data)
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => { fetchSchedules() }, [profile?.parish_id])

  const onRefresh = () => { setRefreshing(true); fetchSchedules() }

  const handleDelete = (id: string, title: string) => {
    Alert.alert('Usuń służbę', `Czy na pewno chcesz usunąć "${title}"?\nWszyscy zapisy zostaną usunięte.`, [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń', style: 'destructive', onPress: async () => {
          const { error } = await supabase.from('schedules').delete().eq('id', id)
          if (error) Alert.alert('Błąd', error.message)
          else setSchedules(prev => prev.filter(s => s.id !== id))
        },
      },
    ])
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={c.primary} /></View>
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.addButton} onPress={() => router.push('/(admin)/schedule-form')}>
        <Ionicons name="add" size={20} color="#fff" />
        <Text style={styles.addButtonText}>Dodaj nową służbę</Text>
      </TouchableOpacity>

      <FlatList
        data={schedules}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={48} color={c.iconMuted} />
            <Text style={styles.emptyText}>Brak służb w grafiku</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => router.push(`/(admin)/schedule-detail?id=${item.id}`)}>
            <ScheduleCard
              schedule={item}
              onDelete={() => handleDelete(item.id, item.title)}
              c={c}
              styles={styles}
            />
          </TouchableOpacity>
        )}
        contentContainerStyle={{ padding: 16, gap: 10 }}
      />
    </View>
  )
}

function ScheduleCard({ schedule, onDelete, c, styles }: {
  schedule: ScheduleWithGroup
  onDelete: () => void
  c: Colors
  styles: ReturnType<typeof createStyles>
}) {
  const isPast = new Date(schedule.date) < new Date()

  return (
    <View style={[styles.card, isPast && styles.cardPast]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={1}>{schedule.title}</Text>
        <View style={styles.cardHeaderRight}>
          {isPast && (
            <View style={styles.pastBadge}>
              <Text style={styles.pastBadgeText}>Miniona</Text>
            </View>
          )}
          <TouchableOpacity onPress={onDelete} hitSlop={10}>
            <Ionicons name="trash-outline" size={18} color={c.danger} />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.row}>
        <Ionicons name="calendar-outline" size={13} color={c.subtext} />
        <Text style={styles.cardMeta}>
          {new Date(schedule.date).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}
          {' · '}{schedule.time?.slice(0, 5)}
        </Text>
      </View>
      {!!schedule.location && (
        <View style={styles.row}>
          <Ionicons name="location-outline" size={13} color={c.subtext} />
          <Text style={styles.cardMeta}>{schedule.location}</Text>
        </View>
      )}
      {schedule.group && (
        <View style={styles.row}>
          <Ionicons name="people-outline" size={13} color={c.primary} />
          <Text style={[styles.cardMeta, { color: c.primary }]}>{schedule.group.name}</Text>
        </View>
      )}
    </View>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    addButton: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: c.primary, margin: 16, marginBottom: 0,
      borderRadius: 12, padding: 14, justifyContent: 'center',
    },
    addButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },

    card: {
      backgroundColor: c.surface, borderRadius: 12, padding: 14, gap: 5,
      ...shadow.xs,
    },
    cardPast: { opacity: 0.55 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cardTitle: { fontSize: 15, fontWeight: '600', color: c.text, flex: 1, marginRight: 8 },
    pastBadge: { backgroundColor: c.borderLight, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
    pastBadgeText: { fontSize: 11, color: c.subtext },
    row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    cardMeta: { fontSize: 13, color: c.subtext },
    empty: { alignItems: 'center', marginTop: 60, gap: 12 },
    emptyText: { color: c.textTertiary, fontSize: 15 },
  })
}
