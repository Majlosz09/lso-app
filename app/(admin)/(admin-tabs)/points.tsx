import { useEffect, useState, useMemo } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  FlatList, ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Platform, Keyboard
} from 'react-native'
import Toast from 'react-native-toast-message'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../stores/authStore'
import { Profile, PointRule, ServiceType, SERVICE_TYPE_LABELS } from '../../../types/database'
import { useRealtimeTable } from '../../../hooks/useRealtimeTable'
import { shadow } from '../../../lib/shadows'
import { useTheme } from '../../../lib/ThemeContext'
import { Colors } from '../../../lib/theme'
import { ConfirmDialog } from '../../../components/ConfirmDialog'

type RankedMember = { id: string; full_name: string; total_points: number; rank: number }

type Tab = 'ranking' | 'award'

export default function PointsTab() {
  const { profile: adminProfile } = useAuthStore()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('ranking')

  const [ranking, setRanking] = useState<RankedMember[]>([])
  const [rankingLoading, setRankingLoading] = useState(true)

  const [members, setMembers] = useState<Profile[]>([])
  const [membersLoading, setMembersLoading] = useState(true)
  const [pointRules, setPointRules] = useState<PointRule[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Profile | null>(null)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState(false)

  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  const loadRanking = () => {
    setRankingLoading(true)
    Promise.all([
      supabase.from('points_summary').select('profile_id, total_points').eq('parish_id', adminProfile?.parish_id).order('total_points', { ascending: false }),
      supabase.from('profiles').select('id, full_name').eq('parish_id', adminProfile?.parish_id).eq('role', 'member').eq('is_active', true),
    ]).then(([summaryRes, profilesRes]) => {
      const nameMap: Record<string, string> = {}
      for (const p of (profilesRes.data ?? [])) nameMap[p.id] = p.full_name

      setRanking(
        (summaryRes.data ?? [])
          .filter(s => nameMap[s.profile_id])
          .map((s, i) => ({
            id: s.profile_id,
            full_name: nameMap[s.profile_id],
            total_points: s.total_points,
            rank: i + 1,
          }))
      )
      setRankingLoading(false)
    })
  }

  useEffect(() => { loadRanking() }, [])
  useRealtimeTable('points', loadRanking)
  useRealtimeTable('attendance', loadRanking)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .eq('parish_id', adminProfile?.parish_id)
      .eq('is_active', true)
      .eq('role', 'member')
      .order('full_name')
      .then(({ data }) => {
        if (data) setMembers(data)
        setMembersLoading(false)
      })
    supabase
      .from('point_rules')
      .select('*')
      .eq('parish_id', adminProfile?.parish_id)
      .order('points', { ascending: false })
      .then(({ data }) => { if (data) setPointRules(data as PointRule[]) })
  }, [])

  const filtered = members.filter(m =>
    m.full_name.toLowerCase().includes(search.toLowerCase())
  )

  const handleSubmit = () => {
    if (!selected) { Toast.show({ type: 'error', text1: 'Błąd', text2: 'Wybierz ministranta.' }); return }
    const amt = parseInt(amount)
    if (isNaN(amt) || amt === 0) { Toast.show({ type: 'error', text1: 'Błąd', text2: 'Wpisz prawidłową liczbę punktów (np. 1 lub -1).' }); return }
    if (!reason.trim()) { Toast.show({ type: 'error', text1: 'Błąd', text2: 'Wpisz powód.' }); return }
    Keyboard.dismiss()
    setConfirmDialog(true)
  }

  const doSubmit = async () => {
    setConfirmDialog(false)
    const amt = parseInt(amount)
    const sign = amt > 0 ? '+' : ''
    setSubmitting(true)
    const { error } = await supabase.from('points').insert({
      profile_id: selected!.id,
      amount: amt,
      reason: reason.trim(),
      awarded_by: adminProfile?.id,
      parish_id: adminProfile?.parish_id,
    })
    setSubmitting(false)
    if (error) {
      Toast.show({ type: 'error', text1: 'Błąd', text2: error.message })
    } else {
      Toast.show({ type: 'success', text1: `Przyznano ${sign}${amt} pkt`, text2: `dla ${selected!.full_name}` })
      setSelected(null); setAmount(''); setReason(''); setSearch('')
      loadRanking()
    }
  }

  const medalColor = (rank: number) =>
    rank === 1 ? '#FFD700' : rank === 2 ? '#C0C0C0' : rank === 3 ? '#CD7F32' : c.primary

  return (
    <View style={styles.container}>
      <View style={styles.segmentRow}>
        {(['ranking', 'award'] as Tab[]).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.segment, tab === t && styles.segmentActive]}
            onPress={() => setTab(t)}
          >
            <Ionicons
              name={t === 'ranking' ? 'trophy-outline' : 'add-circle-outline'}
              size={16}
              color={tab === t ? c.primary : c.textTertiary}
            />
            <Text style={[styles.segmentText, tab === t && styles.segmentTextActive]}>
              {t === 'ranking' ? 'Ranking' : 'Przyznaj punkty'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'ranking' ? (
        rankingLoading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={c.primary} /></View>
        ) : (
          <FlatList
            data={ranking}
            keyExtractor={item => item.id}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="trophy-outline" size={48} color={c.iconMuted} />
                <Text style={styles.emptyText}>Brak danych punktowych</Text>
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.rankRow}
                onPress={() => router.push(`/(admin)/member-detail?id=${item.id}`)}
                activeOpacity={0.75}
              >
                <View style={[styles.rankBadge, { backgroundColor: medalColor(item.rank) + '22' }]}>
                  <Text style={[styles.rankNum, { color: medalColor(item.rank) }]}>
                    {item.rank <= 3 ? ['🥇', '🥈', '🥉'][item.rank - 1] : item.rank}
                  </Text>
                </View>
                <Text style={styles.rankName} numberOfLines={1}>{item.full_name}</Text>
                <View style={styles.pointsBadge}>
                  <Text style={styles.pointsValue}>{item.total_points}</Text>
                  <Text style={styles.pointsLabel}>pkt</Text>
                </View>
              </TouchableOpacity>
            )}
            contentContainerStyle={{ padding: 16, gap: 8 }}
          />
        )
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            style={styles.awardScroll}
            contentContainerStyle={styles.awardContent}
            keyboardShouldPersistTaps="handled"
          >
            {selected ? (
              <View style={styles.selectedCard}>
                <View style={styles.selectedInfo}>
                  <Ionicons name="person-circle-outline" size={36} color={c.primary} />
                  <View>
                    <Text style={styles.selectedName}>{selected.full_name}</Text>
                    <Text style={styles.selectedRole}>ministrant</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => setSelected(null)}>
                  <Ionicons name="close-circle" size={24} color={c.iconMuted} />
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <Text style={styles.label}>Wybierz ministranta *</Text>
                <View style={styles.searchBox}>
                  <Ionicons name="search-outline" size={18} color={c.textTertiary} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Szukaj po imieniu..."
                    placeholderTextColor={c.textTertiary}
                    value={search}
                    onChangeText={setSearch}
                  />
                </View>
                {membersLoading ? (
                  <ActivityIndicator color={c.primary} style={{ marginTop: 20 }} />
                ) : (
                  <View style={styles.memberList}>
                    {filtered.map(m => (
                      <TouchableOpacity
                        key={m.id}
                        style={styles.memberRow}
                        onPress={() => setSelected(m)}
                      >
                        <Ionicons name="person-outline" size={18} color={c.subtext} />
                        <Text style={styles.memberName}>{m.full_name}</Text>
                        <Ionicons name="chevron-forward" size={16} color={c.border} />
                      </TouchableOpacity>
                    ))}
                    {filtered.length === 0 && (
                      <View style={{ padding: 20, alignItems: 'center' }}>
                        <Text style={{ color: c.textTertiary }}>Brak wyników</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}

            {selected && (
              <>
                {pointRules.length > 0 && (
                  <>
                    <Text style={styles.label}>Typ służby</Text>
                    <View style={styles.rulesRow}>
                      {pointRules.map(r => (
                        <TouchableOpacity
                          key={r.id}
                          style={[styles.ruleChip, amount === String(r.points) && reason === SERVICE_TYPE_LABELS[r.service_type as ServiceType] && styles.ruleChipActive]}
                          onPress={() => { setAmount(String(r.points)); setReason(SERVICE_TYPE_LABELS[r.service_type as ServiceType]) }}
                        >
                          <Text style={[styles.ruleChipLabel, amount === String(r.points) && reason === SERVICE_TYPE_LABELS[r.service_type as ServiceType] && styles.ruleChipLabelActive]}>
                            {SERVICE_TYPE_LABELS[r.service_type as ServiceType]}
                          </Text>
                          <Text style={[styles.ruleChipPts, amount === String(r.points) && reason === SERVICE_TYPE_LABELS[r.service_type as ServiceType] && styles.ruleChipLabelActive]}>
                            {r.points} pkt
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}
                <Text style={styles.label}>Liczba punktów * (ujemna = odjęcie)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="np. 1 lub -1"
                  placeholderTextColor={c.textTertiary}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="numbers-and-punctuation"
                />
                <Text style={styles.label}>Powód *</Text>
                <TextInput
                  style={[styles.input, styles.inputMultiline]}
                  placeholder="np. Służba podczas Mszy Świętej"
                  placeholderTextColor={c.textTertiary}
                  value={reason}
                  onChangeText={setReason}
                  multiline
                  numberOfLines={3}
                />
                <TouchableOpacity
                  style={[styles.submitButton, submitting && { opacity: 0.6 }]}
                  onPress={handleSubmit}
                  disabled={submitting}
                >
                  {submitting
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.submitText}>Zatwierdź</Text>
                  }
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
      <ConfirmDialog
        visible={confirmDialog}
        title="Przyznaj punkty"
        message={`Przyznać ${parseInt(amount) > 0 ? '+' : ''}${parseInt(amount) || 0} pkt dla ${selected?.full_name ?? ''}?`}
        confirmText="Przyznaj"
        onConfirm={doSubmit}
        onCancel={() => setConfirmDialog(false)}
      />
    </View>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    segmentRow: {
      flexDirection: 'row', backgroundColor: c.surface,
      borderBottomWidth: 1, borderBottomColor: c.primarySurface,
    },
    segment: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 6, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent',
    },
    segmentActive: { borderBottomColor: c.primary },
    segmentText: { fontSize: 14, fontWeight: '600', color: c.textTertiary },
    segmentTextActive: { color: c.primary },

    rankRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: c.surface, borderRadius: 12, padding: 12,
      ...shadow.xs,
    },
    rankBadge: {
      width: 38, height: 38, borderRadius: 19,
      justifyContent: 'center', alignItems: 'center',
    },
    rankNum: { fontSize: 15, fontWeight: '700' },
    rankName: { flex: 1, fontSize: 15, fontWeight: '600', color: c.text },
    pointsBadge: { alignItems: 'flex-end' },
    pointsValue: { fontSize: 18, fontWeight: '700', color: c.primary },
    pointsLabel: { fontSize: 11, color: c.textTertiary, marginTop: -2 },

    empty: { alignItems: 'center', marginTop: 60, gap: 12 },
    emptyText: { color: c.textTertiary, fontSize: 15 },

    awardScroll: { flex: 1 },
    awardContent: { padding: 16, gap: 8 },

    selectedCard: {
      backgroundColor: c.primaryAlpha08, borderRadius: 12, padding: 14,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      borderWidth: 1, borderColor: c.primaryAlpha20, marginBottom: 4,
    },
    selectedInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    selectedName: { fontSize: 16, fontWeight: '600', color: c.text },
    selectedRole: { fontSize: 13, color: c.subtext, marginTop: 1 },

    label: { fontSize: 13, fontWeight: '600', color: c.subtext, marginTop: 8 },

    searchBox: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.surface, borderRadius: 10, padding: 11,
      borderWidth: 1, borderColor: c.border, marginTop: 4,
    },
    searchInput: { flex: 1, fontSize: 15, color: c.text },

    memberList: {
      backgroundColor: c.surface, borderRadius: 10, marginTop: 8,
      borderWidth: 1, borderColor: c.border, overflow: 'hidden',
    },
    memberRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      padding: 14, borderBottomWidth: 1, borderBottomColor: c.primarySurface,
    },
    memberName: { flex: 1, fontSize: 15, color: c.text },

    input: {
      backgroundColor: c.surface, borderRadius: 10, padding: 13,
      fontSize: 15, color: c.text, borderWidth: 1, borderColor: c.border,
    },
    inputMultiline: { minHeight: 80, textAlignVertical: 'top' },

    submitButton: {
      backgroundColor: c.primary, borderRadius: 12, padding: 16,
      alignItems: 'center', marginTop: 8,
    },
    submitText: { color: '#fff', fontSize: 16, fontWeight: '600' },

    rulesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
    ruleChip: {
      borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
      backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
      alignItems: 'center',
    },
    ruleChipActive: { backgroundColor: c.primary, borderColor: c.primary },
    ruleChipLabel: { fontSize: 13, fontWeight: '600', color: c.subtext },
    ruleChipPts: { fontSize: 11, color: c.textTertiary, marginTop: 1 },
    ruleChipLabelActive: { color: '#fff' },
  })
}
