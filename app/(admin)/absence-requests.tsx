import { useEffect, useState, useMemo } from 'react'
import {
  View, Text, FlatList, StyleSheet,
  TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native'
import { Stack } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { shadow } from '../../lib/shadows'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'

const REJECTION_NOTE =
  'Usprawiedliwienie nie zostało zatwierdzone. Skontaktuj się z księdzem, aby wyjaśnić sytuację.'

type AbsenceRequest = {
  id: string
  absence_reason: string
  profile: { full_name: string }
  schedule: { title: string; date: string; time: string | null }
}

export default function AbsenceRequestsScreen() {
  const { profile } = useAuthStore()
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
  const [requests, setRequests] = useState<AbsenceRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [processingAll, setProcessingAll] = useState(false)

  const fetchRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('schedule_assignments')
        .select('id, absence_reason, profile:profiles(full_name), schedule:schedules!inner(title, date, time, parish_id)')
        .eq('status', 'excused')
        .eq('schedule.parish_id', profile?.parish_id)
      if (error) { Alert.alert('Błąd', error.message); return }
      const sorted = ((data ?? []) as unknown as AbsenceRequest[]).sort((a, b) =>
        a.schedule.date.localeCompare(b.schedule.date)
      )
      setRequests(sorted)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchRequests() }, [])

  const handleApprove = (request: AbsenceRequest) => {
    const dateStr = new Date(request.schedule.date + 'T12:00:00').toLocaleDateString('pl-PL', {
      weekday: 'short', day: 'numeric', month: 'long',
    })
    Alert.alert(
      'Zatwierdź nieobecność',
      `Zatwierdzić nieobecność ${request.profile.full_name} na służbie ${dateStr}?`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Zatwierdź',
          onPress: async () => {
            setProcessingId(request.id)
            try {
              const { error } = await supabase
                .from('schedule_assignments')
                .update({ status: 'confirmed', admin_note: null })
                .eq('id', request.id)
              if (error) { Alert.alert('Błąd', error.message); return }
              setRequests(prev => prev.filter(r => r.id !== request.id))
            } finally {
              setProcessingId(null)
            }
          },
        },
      ]
    )
  }

  const handleReject = (request: AbsenceRequest) => {
    Alert.alert(
      'Odrzuć nieobecność',
      `Odrzucić zgłoszenie nieobecności ${request.profile.full_name}?`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Odrzuć',
          style: 'destructive',
          onPress: async () => {
            setProcessingId(request.id)
            try {
              const { error } = await supabase
                .from('schedule_assignments')
                .update({ status: 'absent', admin_note: REJECTION_NOTE })
                .eq('id', request.id)
              if (error) { Alert.alert('Błąd', error.message); return }
              setRequests(prev => prev.filter(r => r.id !== request.id))
            } finally {
              setProcessingId(null)
            }
          },
        },
      ]
    )
  }

  const handleApproveAll = () => {
    Alert.alert(
      'Zatwierdź wszystkie',
      `Zatwierdzić ${requests.length} oczekujące zgłoszenia?`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Zatwierdź wszystkie',
          onPress: async () => {
            setProcessingAll(true)
            try {
              const ids = requests.map(r => r.id)
              const { error } = await supabase
                .from('schedule_assignments')
                .update({ status: 'confirmed', admin_note: null })
                .in('id', ids)
              if (error) { Alert.alert('Błąd', error.message); return }
              setRequests([])
            } finally {
              setProcessingAll(false)
            }
          },
        },
      ]
    )
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={c.primary} /></View>
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Usprawiedliwienia nieobecności' }} />
      <FlatList
        data={requests}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListHeaderComponent={requests.length >= 2 ? (
          <TouchableOpacity
            style={[styles.bulkBtn, processingAll && { opacity: 0.6 }]}
            onPress={handleApproveAll}
            disabled={processingAll}
          >
            {processingAll
              ? <ActivityIndicator size="small" color={c.primary} />
              : (
                <>
                  <Ionicons name="checkmark-done-outline" size={18} color={c.primary} />
                  <Text style={styles.bulkBtnText}>Zatwierdź wszystkie ({requests.length})</Text>
                </>
              )
            }
          </TouchableOpacity>
        ) : null}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="checkmark-circle-outline" size={56} color={c.iconMuted} />
            <Text style={styles.emptyTitle}>Brak oczekujących zgłoszeń</Text>
            <Text style={styles.emptyText}>Wszystkie nieobecności zostały rozpatrzone</Text>
          </View>
        }
        renderItem={({ item }) => (
          <AbsenceCard
            request={item}
            processing={processingId === item.id}
            onApprove={() => handleApprove(item)}
            onReject={() => handleReject(item)}
            styles={styles}
            colors={c}
          />
        )}
      />
    </>
  )
}

function AbsenceCard({ request, processing, onApprove, onReject, styles, colors: c }: {
  request: AbsenceRequest
  processing: boolean
  onApprove: () => void
  onReject: () => void
  styles: any
  colors: Colors
}) {
  const dateStr = new Date(request.schedule.date + 'T12:00:00').toLocaleDateString('pl-PL', {
    weekday: 'short', day: 'numeric', month: 'long',
  })
  return (
    <View style={styles.card}>
      <View style={styles.cardBody}>
        <View style={styles.cardHeader}>
          <Text style={styles.name}>{request.profile.full_name}</Text>
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingText}>OCZEKUJE</Text>
          </View>
        </View>
        <Text style={styles.scheduleInfo}>
          {request.schedule.title} · {request.schedule.time?.slice(0, 5)} · {dateStr}
        </Text>
        <View style={styles.reasonBox}>
          <Text style={styles.reasonText}>"{request.absence_reason}"</Text>
        </View>
      </View>
      <View style={styles.actions}>
        {processing ? (
          <View style={styles.processingRow}>
            <ActivityIndicator size="small" color={c.primary} />
          </View>
        ) : (
          <>
            <TouchableOpacity style={styles.rejectBtn} onPress={onReject}>
              <Text style={styles.rejectText}>Odrzuć</Text>
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.approveBtn} onPress={onApprove}>
              <Text style={styles.approveText}>Zatwierdź</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    bulkBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: c.primaryAlpha08, borderRadius: 12, padding: 14,
      borderWidth: 1, borderColor: c.primaryAlpha20, marginBottom: 4,
    },
    bulkBtnText: { fontSize: 15, fontWeight: '700', color: c.primary },

    card: {
      backgroundColor: c.surface, borderRadius: 14, overflow: 'hidden',
      ...shadow.md,
    },
    cardBody: { padding: 14, gap: 5 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    name: { fontSize: 15, fontWeight: '700', color: c.text },
    pendingBadge: { backgroundColor: '#EA580C22', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
    pendingText: { fontSize: 10, fontWeight: '700', color: '#EA580C', letterSpacing: 0.3 },
    scheduleInfo: { fontSize: 12, color: c.subtext },
    reasonBox: { backgroundColor: c.danger + '08', borderRadius: 8, padding: 8, marginTop: 2 },
    reasonText: { fontSize: 13, color: c.danger, fontStyle: 'italic' },

    actions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: c.primarySurface },
    processingRow: { flex: 1, padding: 14, alignItems: 'center' },
    rejectBtn: { flex: 1, padding: 14, alignItems: 'center', backgroundColor: c.danger + '08' },
    rejectText: { fontSize: 13, fontWeight: '600', color: c.danger },
    divider: { width: 1, backgroundColor: c.primarySurface },
    approveBtn: { flex: 1, padding: 14, alignItems: 'center', backgroundColor: c.success + '10' },
    approveText: { fontSize: 13, fontWeight: '600', color: c.success },

    empty: { alignItems: 'center', marginTop: 80, gap: 10 },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: c.textTertiary },
    emptyText: { fontSize: 14, color: c.iconMuted, textAlign: 'center' },
  })
}
