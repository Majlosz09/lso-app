import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, Image,
  ActivityIndicator, TouchableOpacity, Modal, Alert
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { STATUS_COLORS, STATUS_LABELS } from '../../lib/status'
import { shadow } from '../../lib/shadows'

type MemberProfile = {
  id: string
  full_name: string
  role: string
  phone: string | null
  rocznik: number | null
  avatar_url: string | null
  rank_id: string | null
}

type RankRow = { id: string; name: string; order: number; is_system: boolean }

type AssignmentRow = {
  id: string
  status: string
  schedule: { id: string; title: string; date: string; time: string }
}

type PointRow = {
  id: string
  amount: number
  reason: string
  created_at: string
}

const ROLE_LABELS: Record<string, string> = {
  member: 'Ministrant',
  parent: 'Rodzic',
  admin: 'Administrator',
}

export default function MemberDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [profile, setProfile] = useState<MemberProfile | null>(null)
  const [summary, setSummary] = useState<{ total_points: number; services_count: number } | null>(null)
  const [rank, setRank] = useState<number | null>(null)
  const [upcoming, setUpcoming] = useState<AssignmentRow[]>([])
  const [history, setHistory] = useState<AssignmentRow[]>([])
  const [points, setPoints] = useState<PointRow[]>([])
  const [loading, setLoading] = useState(true)
  const [ranksList, setRanksList] = useState<RankRow[]>([])
  const [rankModalVisible, setRankModalVisible] = useState(false)

  useEffect(() => {
    supabase.from('ranks').select('*').order('order').then(({ data }) => {
      setRanksList(data ?? [])
    })
  }, [])

  useEffect(() => {
    if (!id) return
    const today = new Date().toISOString().split('T')[0]

    const queries: Promise<any>[] = [
      supabase.from('profiles').select('id, full_name, role, phone, rocznik, avatar_url, rank_id').eq('id', id).single(),
      supabase.from('schedule_assignments')
        .select('id, status, schedule:schedules(id, title, date, time)')
        .eq('profile_id', id)
        .gte('schedule.date', today)
        .order('schedule(date)', { ascending: true })
        .limit(5),
      supabase.from('schedule_assignments')
        .select('id, status, schedule:schedules(id, title, date, time)')
        .eq('profile_id', id)
        .lt('schedule.date', today)
        .order('schedule(date)', { ascending: false })
        .limit(10),
      supabase.from('points')
        .select('id, amount, reason, created_at')
        .eq('profile_id', id)
        .order('created_at', { ascending: false })
        .limit(10),
    ]

    Promise.all(queries).then(([profileRes, upcomingRes, historyRes, pointsRes]) => {
      if (profileRes.data) setProfile(profileRes.data)

      const filterValid = (rows: any[]) =>
        (rows ?? []).filter((r: any) => r.schedule !== null)

      setUpcoming(filterValid(upcomingRes.data ?? []))
      setHistory(filterValid(historyRes.data ?? []))
      setPoints(pointsRes.data ?? [])
      setLoading(false)
    })
  }, [id])

  useEffect(() => {
    if (!profile || profile.role !== 'member') return
    Promise.all([
      supabase.from('points_summary').select('total_points, services_count').eq('profile_id', id).maybeSingle(),
      supabase.from('points_summary').select('profile_id').order('total_points', { ascending: false }),
    ]).then(([sumRes, rankRes]) => {
      if (sumRes.data) setSummary(sumRes.data as any)
      if (rankRes.data) {
        const pos = (rankRes.data as any[]).findIndex(r => r.profile_id === id) + 1
        setRank(pos > 0 ? pos : null)
      }
    })
  }, [profile])

  const handleChangeRank = async (rankId: string | null) => {
    const { error } = await supabase
      .from('profiles')
      .update({ rank_id: rankId })
      .eq('id', id)
    if (error) {
      Alert.alert('Błąd', error.message)
    } else {
      setProfile(prev => prev ? { ...prev, rank_id: rankId } : prev)
    }
    setRankModalVisible(false)
  }

  if (loading || !profile) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#534AB7" /></View>
  }

  const isMember = profile.role === 'member'
  const memberRankObj = ranksList.find(r => r.id === profile.rank_id) ?? null

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      {/* Header */}
      <View style={styles.headerCard}>
        {profile.avatar_url ? (
          <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
        ) : (
          <View style={styles.avatarCircle}>
            <Ionicons name="person" size={36} color="#534AB7" />
          </View>
        )}
        <Text style={styles.name}>{profile.full_name}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{ROLE_LABELS[profile.role] ?? profile.role}</Text>
        </View>
        {profile.phone && (
          <View style={styles.infoRow}>
            <Ionicons name="call-outline" size={14} color="#888" />
            <Text style={styles.infoText}>{profile.phone}</Text>
          </View>
        )}
        {isMember && profile.rocznik && (
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={14} color="#888" />
            <Text style={styles.infoText}>Rocznik {profile.rocznik}</Text>
          </View>
        )}
        {isMember && (
          <TouchableOpacity
            style={memberRankObj ? styles.rankPill : styles.rankPillEmpty}
            onPress={() => setRankModalVisible(true)}
          >
            <Ionicons name="ribbon-outline" size={13} color={memberRankObj ? '#e67e22' : '#aaa'} />
            <Text style={memberRankObj ? styles.rankText : styles.rankTextEmpty}>
              {memberRankObj ? memberRankObj.name : 'Przypisz rangę'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal
        visible={rankModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRankModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setRankModalVisible(false)}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Wybierz rangę</Text>
              <TouchableOpacity onPress={() => setRankModalVisible(false)} hitSlop={8}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.rankOption}
              onPress={() => handleChangeRank(null)}
            >
              <Ionicons name="remove-circle-outline" size={20} color="#aaa" />
              <Text style={[styles.rankOptionText, { color: '#aaa' }]}>Brak rangi</Text>
              {!profile.rank_id && <Ionicons name="checkmark" size={18} color="#534AB7" />}
            </TouchableOpacity>

            {ranksList.map(r => (
              <TouchableOpacity
                key={r.id}
                style={styles.rankOption}
                onPress={() => handleChangeRank(r.id)}
              >
                <Ionicons name="ribbon" size={20} color="#e67e22" />
                <Text style={[
                  styles.rankOptionText,
                  profile.rank_id === r.id && { fontWeight: '700', color: '#e67e22' },
                ]}>
                  {r.name}
                </Text>
                {profile.rank_id === r.id && <Ionicons name="checkmark" size={18} color="#e67e22" />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Statystyki — tylko dla ministrancóin */}
      {isMember && (
        <View style={styles.statsRow}>
          <StatCard icon="trophy" color="#f0a500" value={summary?.total_points ?? 0} label="Punkty" />
          <StatCard icon="checkmark-circle" color="#27ae60" value={summary?.services_count ?? 0} label="Służby" />
          {rank && <StatCard icon="podium" color="#534AB7" value={`#${rank}`} label="Ranking" />}
        </View>
      )}

      {/* Akcja: przyznaj punkty */}
      {isMember && (
        <TouchableOpacity
          style={styles.awardButton}
          onPress={() => router.push(`/(admin)/award-points?preselect_id=${id}`)}
        >
          <Ionicons name="trophy-outline" size={18} color="#fff" />
          <Text style={styles.awardButtonText}>Przyznaj punkty</Text>
        </TouchableOpacity>
      )}

      {/* Nadchodzące dyżury */}
      <Section title="Nadchodzące dyżury">
        {upcoming.length === 0 ? (
          <EmptyRow text="Brak nadchodzących dyżurów" />
        ) : (
          upcoming.map(a => (
            <ServiceRow key={a.id} assignment={a} />
          ))
        )}
      </Section>

      {/* Historia służb */}
      <Section title="Historia służb (ostatnie 10)">
        {history.length === 0 ? (
          <EmptyRow text="Brak historii służb" />
        ) : (
          history.map(a => (
            <ServiceRow key={a.id} assignment={a} />
          ))
        )}
      </Section>

      {/* Historia punktów — tylko dla ministrancóin */}
      {isMember && (
        <Section title="Historia punktów (ostatnie 10)">
          {points.length === 0 ? (
            <EmptyRow text="Brak przyznanych punktów" />
          ) : (
            points.map((p, i) => (
              <View key={p.id} style={[styles.pointRow, i < points.length - 1 && styles.rowBorder]}>
                <View style={[styles.pointAmount, { backgroundColor: (p.amount >= 0 ? '#27ae60' : '#e74c3c') + '18' }]}>
                  <Text style={[styles.pointAmountText, { color: p.amount >= 0 ? '#27ae60' : '#e74c3c' }]}>
                    {p.amount >= 0 ? '+' : ''}{p.amount}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pointReason}>{p.reason}</Text>
                  <Text style={styles.pointDate}>
                    {new Date(p.created_at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </Text>
                </View>
              </View>
            ))
          )}
        </Section>
      )}
    </ScrollView>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  )
}

function EmptyRow({ text }: { text: string }) {
  return (
    <View style={styles.emptyRow}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  )
}

function ServiceRow({ assignment }: { assignment: AssignmentRow }) {
  const sc = assignment.schedule
  const color = STATUS_COLORS[assignment.status] ?? '#888'
  return (
    <View style={[styles.serviceRow, styles.rowBorder]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.serviceTitle}>{sc.title}</Text>
        <Text style={styles.serviceDate}>
          {new Date(sc.date).toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' })}
          {' · '}{sc.time?.slice(0, 5)}
        </Text>
      </View>
      <View style={[styles.statusPill, { backgroundColor: color + '22' }]}>
        <Text style={[styles.statusText, { color }]}>{STATUS_LABELS[assignment.status] ?? assignment.status}</Text>
      </View>
    </View>
  )
}

function StatCard({ icon, color, value, label }: { icon: any; color: string; value: number | string; label: string }) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { padding: 16, gap: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  headerCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20,
    alignItems: 'center', gap: 6,
    ...shadow.md,
  },
  avatarCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#534AB711', justifyContent: 'center', alignItems: 'center',
    marginBottom: 4,
  },
  avatarImage: {
    width: 72, height: 72, borderRadius: 36, marginBottom: 4,
  },
  name: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  roleBadge: { backgroundColor: '#534AB722', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  roleText: { fontSize: 12, color: '#534AB7', fontWeight: '600' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoText: { fontSize: 13, color: '#666' },
  rankPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#e67e2218', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  rankPillEmpty: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#f0f0f0', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  rankText: { fontSize: 12, color: '#e67e22', fontWeight: '600' },
  rankTextEmpty: { fontSize: 12, color: '#aaa' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#1a1a1a' },
  rankOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  rankOptionText: { flex: 1, fontSize: 15, color: '#1a1a1a' },

  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12,
    alignItems: 'center', gap: 3,
    ...shadow.xs,
  },
  statValue: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  statLabel: { fontSize: 11, color: '#888', textAlign: 'center' },

  awardButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#534AB7', borderRadius: 12, padding: 14,
  },
  awardButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  section: { gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionCard: {
    backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden',
    ...shadow.xs,
  },

  emptyRow: { padding: 16, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#aaa' },

  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  serviceTitle: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  serviceDate: { fontSize: 12, color: '#888', marginTop: 2 },
  statusPill: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '600' },

  pointRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  pointAmount: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, minWidth: 44, alignItems: 'center' },
  pointAmountText: { fontSize: 14, fontWeight: '700' },
  pointReason: { fontSize: 14, color: '#1a1a1a', fontWeight: '500' },
  pointDate: { fontSize: 12, color: '#aaa', marginTop: 2 },
})
