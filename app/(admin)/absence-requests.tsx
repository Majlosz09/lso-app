import { useEffect, useState } from 'react'
import {
  View, Text, FlatList, StyleSheet,
  TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native'
import { Stack } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { shadow } from '../../lib/shadows'

const REJECTION_NOTE =
  'Usprawiedliwienie nie zostało zatwierdzone. Skontaktuj się z księdzem, aby wyjaśnić sytuację.'

type AbsenceRequest = {
  id: string
  absence_reason: string
  profile: { full_name: string }
  schedule: { title: string; date: string; time: string }
}

export default function AbsenceRequestsScreen() {
  const { profile } = useAuthStore()
  const [requests, setRequests] = useState<AbsenceRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [processingAll, setProcessingAll] = useState(false)

  const fetchRequests = async () => {
    const { data } = await supabase
      .from('schedule_assignments')
      .select('id, absence_reason, profile:profiles(full_name), schedule:schedules(title, date, time)')
      .eq('status', 'excused')
    const sorted = ((data ?? []) as AbsenceRequest[]).sort((a, b) =>
      a.schedule.date.localeCompare(b.schedule.date)
    )
    setRequests(sorted)
    setLoading(false)
  }

  useEffect(() => { fetchRequests() }, [])

  const handleApprove = async (id: string) => {
    setProcessingId(id)
    const { error } = await supabase
      .from('schedule_assignments')
      .update({ status: 'confirmed', admin_note: null })
      .eq('id', id)
    setProcessingId(null)
    if (error) { Alert.alert('Błąd', error.message); return }
    setRequests(prev => prev.filter(r => r.id !== id))
  }

  const handleReject = async (id: string) => {
    setProcessingId(id)
    const { error } = await supabase
      .from('schedule_assignments')
      .update({ status: 'absent', admin_note: REJECTION_NOTE })
      .eq('id', id)
    setProcessingId(null)
    if (error) { Alert.alert('Błąd', error.message); return }
    setRequests(prev => prev.filter(r => r.id !== id))
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
            const ids = requests.map(r => r.id)
            const { error } = await supabase
              .from('schedule_assignments')
              .update({ status: 'confirmed', admin_note: null })
              .in('id', ids)
            setProcessingAll(false)
            if (error) { Alert.alert('Błąd', error.message); return }
            setRequests([])
          },
        },
      ]
    )
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#534AB7" /></View>
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
              ? <ActivityIndicator size="small" color="#534AB7" />
              : (
                <>
                  <Ionicons name="checkmark-done-outline" size={18} color="#534AB7" />
                  <Text style={styles.bulkBtnText}>Zatwierdź wszystkie ({requests.length})</Text>
                </>
              )
            }
          </TouchableOpacity>
        ) : null}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="checkmark-circle-outline" size={56} color="#ccc" />
            <Text style={styles.emptyTitle}>Brak oczekujących zgłoszeń</Text>
            <Text style={styles.emptyText}>Wszystkie nieobecności zostały rozpatrzone</Text>
          </View>
        }
        renderItem={({ item }) => (
          <AbsenceCard
            request={item}
            processing={processingId === item.id}
            onApprove={() => handleApprove(item.id)}
            onReject={() => handleReject(item.id)}
          />
        )}
      />
    </>
  )
}

function AbsenceCard({ request, processing, onApprove, onReject }: {
  request: AbsenceRequest
  processing: boolean
  onApprove: () => void
  onReject: () => void
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
            <ActivityIndicator size="small" color="#534AB7" />
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

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  bulkBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#534AB711', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#534AB733', marginBottom: 4,
  },
  bulkBtnText: { fontSize: 15, fontWeight: '700', color: '#534AB7' },

  card: {
    backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden',
    ...shadow.md,
  },
  cardBody: { padding: 14, gap: 5 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  pendingBadge: { backgroundColor: '#e67e2222', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  pendingText: { fontSize: 10, fontWeight: '700', color: '#e67e22', letterSpacing: 0.3 },
  scheduleInfo: { fontSize: 12, color: '#888' },
  reasonBox: { backgroundColor: '#fff5f5', borderRadius: 8, padding: 8, marginTop: 2 },
  reasonText: { fontSize: 13, color: '#e74c3c', fontStyle: 'italic' },

  actions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  processingRow: { flex: 1, padding: 14, alignItems: 'center' },
  rejectBtn: { flex: 1, padding: 14, alignItems: 'center', backgroundColor: '#fff5f5' },
  rejectText: { fontSize: 13, fontWeight: '600', color: '#e74c3c' },
  divider: { width: 1, backgroundColor: '#f0f0f0' },
  approveBtn: { flex: 1, padding: 14, alignItems: 'center', backgroundColor: '#f0fdf4' },
  approveText: { fontSize: 13, fontWeight: '600', color: '#27ae60' },

  empty: { alignItems: 'center', marginTop: 80, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#aaa' },
  emptyText: { fontSize: 14, color: '#ccc', textAlign: 'center' },
})
