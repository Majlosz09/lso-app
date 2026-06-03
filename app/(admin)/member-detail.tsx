import { useEffect, useState, useMemo } from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  ActivityIndicator, TouchableOpacity, Modal, Alert, TextInput
} from 'react-native'
import Toast from 'react-native-toast-message'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { STATUS_COLORS, STATUS_LABELS } from '../../lib/status'
import { shadow } from '../../lib/shadows'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'
import { AvatarImage } from '../../components/AvatarImage'

type MemberProfile = {
  id: string
  full_name: string
  role: string
  phone: string | null
  rocznik: number | null
  avatar_url: string | null
  rank_id: string | null
  parent_id: string | null
}

type ParentEntry = { id: string; full_name: string }

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

type BadgeRow = {
  id: string
  awarded_at: string
  awarded_by: string | null
  note: string | null
  badge_definition: { id: string; name: string; icon: string; type: string } | null
  awarder: { full_name: string } | null
}

type ManualBadgeDef = {
  id: string
  name: string
  icon: string
  criteria_key: string
  parish_id: string | null
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
  const { profile: adminProfile } = useAuthStore()
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  const [profile, setProfile] = useState<MemberProfile | null>(null)
  const [summary, setSummary] = useState<{ total_points: number; services_count: number } | null>(null)
  const [rank, setRank] = useState<number | null>(null)
  const [upcoming, setUpcoming] = useState<AssignmentRow[]>([])
  const [history, setHistory] = useState<AssignmentRow[]>([])
  const [points, setPoints] = useState<PointRow[]>([])
  const [loading, setLoading] = useState(true)
  const [ranksList, setRanksList] = useState<RankRow[]>([])
  const [rankModalVisible, setRankModalVisible] = useState(false)
  const [parentName, setParentName] = useState<string | null>(null)
  const [parentsList, setParentsList] = useState<ParentEntry[]>([])
  const [parentModalVisible, setParentModalVisible] = useState(false)
  const [badges, setBadges] = useState<BadgeRow[]>([])
  const [awardSheetVisible, setAwardSheetVisible] = useState(false)
  const [manualBadgeDefs, setManualBadgeDefs] = useState<ManualBadgeDef[] | null>(null)
  const [selectedBadgeDef, setSelectedBadgeDef] = useState<ManualBadgeDef | null>(null)
  const [awardNote, setAwardNote] = useState('')
  const [awarding, setAwarding] = useState(false)

  useEffect(() => {
    supabase.from('ranks').select('*').order('order').then(({ data }) => {
      setRanksList(data ?? [])
    })
  }, [])

  useEffect(() => {
    if (!id || !adminProfile?.parish_id) return
    const today = new Date().toISOString().split('T')[0]

    const queries: PromiseLike<any>[] = [
      supabase.from('profiles').select('id, full_name, role, phone, rocznik, avatar_url, rank_id, parent_id').eq('id', id).single(),
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
        .eq('parish_id', adminProfile?.parish_id)
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
      supabase.from('points_summary').select('profile_id').eq('parish_id', adminProfile?.parish_id).order('total_points', { ascending: false }),
    ]).then(([sumRes, rankRes]) => {
      if (sumRes.data) setSummary(sumRes.data as any)
      if (rankRes.data) {
        const pos = (rankRes.data as any[]).findIndex(r => r.profile_id === id) + 1
        setRank(pos > 0 ? pos : null)
      }
    })
  }, [profile])

  useEffect(() => {
    if (!profile?.parent_id) { setParentName(null); return }
    supabase.from('profiles').select('full_name').eq('id', profile.parent_id).single().then(({ data }) => {
      setParentName(data?.full_name ?? null)
    })
  }, [profile?.parent_id])

  const loadBadges = async () => {
    const { data, error } = await supabase
      .from('member_badges')
      .select(`
        id, awarded_at, awarded_by, note,
        badge_definition:badge_definitions(id, name, icon, type),
        awarder:profiles!awarded_by(full_name)
      `)
      .eq('profile_id', id)
      .eq('is_active', true)
      .order('awarded_at', { ascending: false })
    if (error) { console.error('[member-detail] loadBadges error:', error); return }
    const seen = new Set<string>()
    const deduped = (data ?? [])
      .filter((b: any) => b.badge_definition !== null)
      .filter((b: any) => {
        const key = b.badge_definition.id
        if (seen.has(key)) return false
        seen.add(key)
        return true
      }) as BadgeRow[]
    setBadges(deduped)
  }

  useEffect(() => {
    if (!id) return
    loadBadges()
  }, [id])

  const handleChangeRank = async (rankId: string | null) => {
    setRankModalVisible(false)
    const { error } = await supabase
      .from('profiles')
      .update({ rank_id: rankId })
      .eq('id', id)
    if (error) {
      Toast.show({ type: 'error', text1: 'Błąd', text2: error.message })
    } else {
      setProfile(prev => prev ? { ...prev, rank_id: rankId } : prev)
      Toast.show({ type: 'success', text1: 'Ranga zmieniona' })
    }
  }

  const openParentPicker = async () => {
    if (parentsList.length === 0) {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('parish_id', adminProfile!.parish_id)
        .eq('role', 'parent')
        .order('full_name')
      setParentsList(data ?? [])
    }
    setParentModalVisible(true)
  }

  const handleChangeParent = async (parentId: string | null) => {
    const { error } = await supabase
      .from('profiles')
      .update({ parent_id: parentId })
      .eq('id', id)
    if (error) {
      Alert.alert('Błąd', error.message)
    } else {
      setProfile(prev => prev ? { ...prev, parent_id: parentId } : prev)
      setParentName(parentId ? (parentsList.find(p => p.id === parentId)?.full_name ?? null) : null)
    }
    setParentModalVisible(false)
  }

  const openAwardSheet = async () => {
    if (manualBadgeDefs === null) {
      const { data } = await supabase
        .from('badge_definitions')
        .select('id, name, icon, criteria_key, parish_id')
        .eq('type', 'manual')
        .or(`parish_id.is.null,parish_id.eq.${adminProfile!.parish_id}`)
        .order('name')
      setManualBadgeDefs(data ?? [])
    }
    setAwardSheetVisible(true)
  }

  const handleAwardBadge = () => {
    if (!selectedBadgeDef) return
    Alert.alert(
      'Przyznaj odznakę',
      `Przyznać odznakę „${selectedBadgeDef.name}" ministrancowi ${profile!.full_name}?`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Przyznaj',
          onPress: async () => {
            setAwarding(true)
            const { error } = await supabase.from('member_badges').insert({
              profile_id: id,
              badge_definition_id: selectedBadgeDef.id,
              awarded_by: adminProfile!.id,
              note: awardNote.trim() || null,
              is_active: true,
            })
            setAwarding(false)
            if (error) {
              Alert.alert('Błąd', error.message === 'duplicate key value violates unique constraint "member_badges_profile_id_badge_definition_id_key"'
                ? 'Ta odznaka została już wcześniej przyznana.'
                : error.message)
              return
            }
            setAwardSheetVisible(false)
            setAwardNote('')
            setSelectedBadgeDef(null)
            loadBadges()
          },
        },
      ]
    )
  }

  if (loading || !profile) {
    return <View style={styles.center}><ActivityIndicator size="large" color={c.primary} /></View>
  }

  const isMember = profile.role === 'member'
  const memberRankObj = ranksList.find(r => r.id === profile.rank_id) ?? null

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      {/* Header */}
      <View style={styles.headerCard}>
        <AvatarImage avatarUrl={profile.avatar_url} size={72} />
        <Text style={styles.name}>{profile.full_name}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{ROLE_LABELS[profile.role] ?? profile.role}</Text>
        </View>
        {profile.phone && (
          <View style={styles.infoRow}>
            <Ionicons name="call-outline" size={14} color={c.subtext} />
            <Text style={styles.infoText}>{profile.phone}</Text>
          </View>
        )}
        {isMember && profile.rocznik && (
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={14} color={c.subtext} />
            <Text style={styles.infoText}>Rocznik {profile.rocznik}</Text>
          </View>
        )}
        {isMember && (
          <TouchableOpacity
            style={memberRankObj ? styles.rankPill : styles.rankPillEmpty}
            onPress={() => setRankModalVisible(true)}
          >
            <Ionicons name="ribbon-outline" size={13} color={memberRankObj ? '#EA580C' : c.textTertiary} />
            <Text style={memberRankObj ? styles.rankText : styles.rankTextEmpty}>
              {memberRankObj ? memberRankObj.name : 'Przypisz rangę'}
            </Text>
          </TouchableOpacity>
        )}
        {isMember && (
          <TouchableOpacity
            style={profile.parent_id ? styles.parentPill : styles.rankPillEmpty}
            onPress={openParentPicker}
          >
            <Ionicons name="people-outline" size={13} color={profile.parent_id ? '#0EA5E9' : c.textTertiary} />
            <Text style={profile.parent_id ? styles.parentText : styles.rankTextEmpty}>
              {parentName ?? 'Przypisz rodzica'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal
        visible={parentModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setParentModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setParentModalVisible(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Wybierz rodzica</Text>
              <TouchableOpacity onPress={() => setParentModalVisible(false)} hitSlop={8}>
                <Ionicons name="close" size={24} color={c.subtext} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.rankOption} onPress={() => handleChangeParent(null)}>
              <Ionicons name="remove-circle-outline" size={20} color={c.textTertiary} />
              <Text style={[styles.rankOptionText, { color: c.textTertiary }]}>Brak rodzica</Text>
              {!profile?.parent_id && <Ionicons name="checkmark" size={18} color={c.primary} />}
            </TouchableOpacity>
            {parentsList.length === 0 ? (
              <View style={styles.emptyRow}>
                <Text style={styles.emptyText}>Brak kont rodziców w parafii</Text>
              </View>
            ) : (
              parentsList.map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.rankOption}
                  onPress={() => handleChangeParent(p.id)}
                >
                  <Ionicons name="person-outline" size={20} color="#0EA5E9" />
                  <Text style={[
                    styles.rankOptionText,
                    profile?.parent_id === p.id && { fontWeight: '700', color: '#0EA5E9' },
                  ]}>
                    {p.full_name}
                  </Text>
                  {profile?.parent_id === p.id && <Ionicons name="checkmark" size={18} color="#0EA5E9" />}
                </TouchableOpacity>
              ))
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={rankModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRankModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setRankModalVisible(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Wybierz rangę</Text>
              <TouchableOpacity onPress={() => setRankModalVisible(false)} hitSlop={8}>
                <Ionicons name="close" size={24} color={c.subtext} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.rankOption}
              onPress={() => handleChangeRank(null)}
            >
              <Ionicons name="remove-circle-outline" size={20} color={c.textTertiary} />
              <Text style={[styles.rankOptionText, { color: c.textTertiary }]}>Brak rangi</Text>
              {!profile.rank_id && <Ionicons name="checkmark" size={18} color={c.primary} />}
            </TouchableOpacity>

            {ranksList.map(r => (
              <TouchableOpacity
                key={r.id}
                style={styles.rankOption}
                onPress={() => handleChangeRank(r.id)}
              >
                <Ionicons name="ribbon" size={20} color="#EA580C" />
                <Text style={[
                  styles.rankOptionText,
                  profile.rank_id === r.id && { fontWeight: '700', color: '#EA580C' },
                ]}>
                  {r.name}
                </Text>
                {profile.rank_id === r.id && <Ionicons name="checkmark" size={18} color="#EA580C" />}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* Statystyki — tylko dla ministrancóin */}
      {isMember && (
        <View style={styles.statsRow}>
          <StatCard icon="trophy" color="#FFC107" value={summary?.total_points ?? 0} label="Punkty" styles={styles} />
          <StatCard icon="checkmark-circle" color="#16A34A" value={summary?.services_count ?? 0} label="Służby" styles={styles} />
          {rank && <StatCard icon="podium" color={c.primary} value={`#${rank}`} label="Ranking" styles={styles} />}
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

      {/* Odznaki */}
      {isMember && (
        <Section title="Odznaki" styles={styles}>
          {badges.length === 0 ? (
            <EmptyRow text="Brak przyznanych odznak" styles={styles} />
          ) : (
            badges.map((b, i) => (
              <View key={b.id} style={[styles.badgeRow, i < badges.length - 1 && styles.rowBorder]}>
                <Text style={styles.badgeRowIcon}>{b.badge_definition?.icon ?? '🏅'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.badgeRowName}>{b.badge_definition?.name ?? ''}</Text>
                  <Text style={styles.badgeRowMeta}>
                    {new Date(b.awarded_at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {b.awarder ? ` · ${b.awarder.full_name}` : ' · System'}
                  </Text>
                  {b.note ? <Text style={styles.badgeRowNote}>{b.note}</Text> : null}
                </View>
              </View>
            ))
          )}
          <TouchableOpacity style={styles.awardBadgeBtn} onPress={openAwardSheet}>
            <Ionicons name="ribbon-outline" size={16} color={c.primary} />
            <Text style={styles.awardBadgeBtnText}>Przyznaj odznakę</Text>
          </TouchableOpacity>
        </Section>
      )}

      {/* Nadchodzące dyżury */}
      <Section title="Nadchodzące dyżury" styles={styles}>
        {upcoming.length === 0 ? (
          <EmptyRow text="Brak nadchodzących dyżurów" styles={styles} />
        ) : (
          upcoming.map(a => (
            <ServiceRow key={a.id} assignment={a} styles={styles} c={c} />
          ))
        )}
      </Section>

      {/* Historia służb */}
      <Section title="Historia służb (ostatnie 10)" styles={styles}>
        {history.length === 0 ? (
          <EmptyRow text="Brak historii służb" styles={styles} />
        ) : (
          history.map(a => (
            <ServiceRow key={a.id} assignment={a} styles={styles} c={c} />
          ))
        )}
      </Section>

      {/* Historia punktów — tylko dla ministrancóin */}
      {isMember && (
        <Section title="Historia punktów (ostatnie 10)" styles={styles}>
          {points.length === 0 ? (
            <EmptyRow text="Brak przyznanych punktów" styles={styles} />
          ) : (
            points.map((p, i) => (
              <View key={p.id} style={[styles.pointRow, i < points.length - 1 && styles.rowBorder]}>
                <View style={[styles.pointAmount, { backgroundColor: (p.amount >= 0 ? '#16A34A' : '#DC2626') + '18' }]}>
                  <Text style={[styles.pointAmountText, { color: p.amount >= 0 ? '#16A34A' : '#DC2626' }]}>
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

      {/* Bottom sheet: przyznaj odznakę */}
      <Modal
        visible={awardSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => { setAwardSheetVisible(false); setSelectedBadgeDef(null); setAwardNote('') }}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => { setAwardSheetVisible(false); setSelectedBadgeDef(null); setAwardNote('') }}
          />
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Przyznaj odznakę</Text>
              <TouchableOpacity
                onPress={() => { setAwardSheetVisible(false); setSelectedBadgeDef(null); setAwardNote('') }}
                hitSlop={8}
              >
                <Ionicons name="close" size={24} color={c.subtext} />
              </TouchableOpacity>
            </View>

            {!manualBadgeDefs || manualBadgeDefs.length === 0 ? (
              <ActivityIndicator color={c.primary} style={{ padding: 16 }} />
            ) : (
              manualBadgeDefs.map(def => (
                <TouchableOpacity
                  key={def.id}
                  style={[styles.rankOption, selectedBadgeDef?.id === def.id && { backgroundColor: c.primarySurface }]}
                  onPress={() => setSelectedBadgeDef(def)}
                >
                  <Text style={{ fontSize: 20 }}>{def.icon}</Text>
                  <Text style={[styles.rankOptionText, selectedBadgeDef?.id === def.id && { color: c.primary, fontWeight: '700' }]}>
                    {def.name}
                  </Text>
                  {selectedBadgeDef?.id === def.id && <Ionicons name="checkmark" size={18} color={c.primary} />}
                </TouchableOpacity>
              ))
            )}

            <TextInput
              style={styles.awardNoteInput}
              placeholder="Notatka (opcjonalnie)..."
              placeholderTextColor={c.textTertiary}
              value={awardNote}
              onChangeText={setAwardNote}
              multiline
              numberOfLines={2}
            />

            <TouchableOpacity
              style={[styles.awardButton, (!selectedBadgeDef || awarding) && { opacity: 0.4 }]}
              onPress={handleAwardBadge}
              disabled={!selectedBadgeDef || awarding}
            >
              {awarding
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.awardButtonText}>Przyznaj</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  )
}

function Section({ title, children, styles }: { title: string; children: React.ReactNode; styles: any }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  )
}

function EmptyRow({ text, styles }: { text: string; styles: any }) {
  return (
    <View style={styles.emptyRow}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  )
}

function ServiceRow({ assignment, styles, c }: { assignment: AssignmentRow; styles: any; c: Colors }) {
  const sc = assignment.schedule
  const color = STATUS_COLORS[assignment.status] ?? c.subtext
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

function StatCard({ icon, color, value, label, styles }: { icon: any; color: string; value: number | string; label: string; styles: any }) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    content: { padding: 16, gap: 16 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    headerCard: {
      backgroundColor: c.surface, borderRadius: 16, padding: 20,
      alignItems: 'center', gap: 6,
      ...shadow.md,
    },
    name: { fontSize: 20, fontWeight: '700', color: c.text },
    roleBadge: { backgroundColor: c.primaryAlpha12, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
    roleText: { fontSize: 12, color: c.primary, fontWeight: '600' },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    infoText: { fontSize: 13, color: c.subtext },
    rankPill: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      backgroundColor: '#EA580C18', borderRadius: 10,
      paddingHorizontal: 10, paddingVertical: 4,
    },
    rankPillEmpty: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      backgroundColor: c.primarySurface, borderRadius: 10,
      paddingHorizontal: 10, paddingVertical: 4,
    },
    rankText: { fontSize: 12, color: '#EA580C', fontWeight: '600' },
    rankTextEmpty: { fontSize: 12, color: c.textTertiary },
    parentPill: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      backgroundColor: '#0EA5E918', borderRadius: 10,
      paddingHorizontal: 10, paddingVertical: 4,
    },
    parentText: { fontSize: 12, color: '#0EA5E9', fontWeight: '600' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
    modalSheet: {
      backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
      padding: 20, paddingBottom: 36,
    },
    modalHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12,
    },
    modalTitle: { fontSize: 17, fontWeight: '700', color: c.text },
    rankOption: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.primarySurface,
    },
    rankOptionText: { flex: 1, fontSize: 15, color: c.text },

    statsRow: { flexDirection: 'row', gap: 10 },
    statCard: {
      flex: 1, backgroundColor: c.surface, borderRadius: 12, padding: 12,
      alignItems: 'center', gap: 3,
      ...shadow.xs,
    },
    statValue: { fontSize: 20, fontWeight: '700', color: c.text },
    statLabel: { fontSize: 11, color: c.subtext, textAlign: 'center' },

    awardButton: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: c.primary, borderRadius: 12, padding: 14,
    },
    awardButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },

    section: { gap: 8 },
    sectionTitle: { fontSize: 13, fontWeight: '600', color: c.subtext, textTransform: 'uppercase', letterSpacing: 0.5 },
    sectionCard: {
      backgroundColor: c.surface, borderRadius: 12, overflow: 'hidden',
      ...shadow.xs,
    },

    emptyRow: { padding: 16, alignItems: 'center' },
    emptyText: { fontSize: 14, color: c.textTertiary },

    serviceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: c.primarySurface },
    serviceTitle: { fontSize: 14, fontWeight: '600', color: c.text },
    serviceDate: { fontSize: 12, color: c.subtext, marginTop: 2 },
    statusPill: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
    statusText: { fontSize: 11, fontWeight: '600' },

    pointRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
    pointAmount: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, minWidth: 44, alignItems: 'center' },
    pointAmountText: { fontSize: 14, fontWeight: '700' },
    pointReason: { fontSize: 14, color: c.text, fontWeight: '500' },
    pointDate: { fontSize: 12, color: c.textTertiary, marginTop: 2 },

    badgeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12 },
    badgeRowIcon: { fontSize: 22, lineHeight: 26 },
    badgeRowName: { fontSize: 14, fontWeight: '600', color: c.text },
    badgeRowMeta: { fontSize: 12, color: c.subtext, marginTop: 2 },
    badgeRowNote: { fontSize: 12, color: c.textTertiary, marginTop: 2, fontStyle: 'italic' },
    awardBadgeBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      padding: 12, borderTopWidth: 1, borderTopColor: c.primarySurface,
    },
    awardBadgeBtnText: { fontSize: 14, fontWeight: '600', color: c.primary },
    awardNoteInput: {
      backgroundColor: c.bg, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 10,
      fontSize: 14, color: c.text, borderWidth: 1, borderColor: c.border,
      marginTop: 12, marginBottom: 4, minHeight: 60, textAlignVertical: 'top',
    },
  })
}
