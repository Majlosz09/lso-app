import { useState, useMemo, useCallback } from 'react'
import {
  View, Text, FlatList, StyleSheet,
  TouchableOpacity, TextInput, ActivityIndicator, Modal,
} from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../stores/authStore'
import { shadow } from '../../../lib/shadows'
import { useTheme } from '../../../lib/ThemeContext'
import { Colors } from '../../../lib/theme'
import Toast from 'react-native-toast-message'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { MemberRow, MemberRowData } from '../../../components/MemberRow'

type Member = {
  id: string
  full_name: string
  role: 'member' | 'parent' | 'admin'
  phone: string | null
  rocznik: number | null
  total_points?: number
  role_before_admin?: string | null
}

type Filter = 'member' | 'parent' | 'admin'

type Pending = {
  id: string
  full_name: string
  role: 'member' | 'parent'
  phone: string | null
  rocznik: number | null
  email: string | null
  children: string | null
}

export default function MembersTab() {
  const router = useRouter()
  const { parish, profile: adminProfile } = useAuthStore()
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('member')
  const [assignModalVisible, setAssignModalVisible] = useState(false)
  const [candidateSearch, setCandidateSearch] = useState('')
  const [candidates, setCandidates] = useState<Member[]>([])
  const [assignLoading, setAssignLoading] = useState(false)
  const [pendingRevoke, setPendingRevoke] = useState<Member | null>(null)
  const [pendingGrant, setPendingGrant] = useState<Member | null>(null)
  // Osoby, które dołączyły kodem i czekają na zatwierdzenie
  const [waiting, setWaiting] = useState<Pending[]>([])
  const [rejecting, setRejecting] = useState<Pending | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  // odświeżaj po powrocie (np. po usunięciu osoby z parafii w szczegółach)
  useFocusEffect(useCallback(() => {
    const fetchAll = async () => {
      supabase.rpc('get_pending_members').then(({ data }) => setWaiting((data ?? []) as Pending[]))
      const [profilesRes, pointsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, role, phone, rocznik, role_before_admin')
          .eq('parish_id', adminProfile!.parish_id)
          .in('role', ['member', 'parent', 'admin'])
          .eq('is_active', true)
          .order('full_name'),
        supabase.from('points_summary').select('profile_id, total_points').eq('parish_id', adminProfile!.parish_id),
      ])

      const pointsMap: Record<string, number> = {}
      for (const p of (pointsRes.data ?? [])) {
        pointsMap[p.profile_id] = p.total_points
      }

      setMembers(
        (profilesRes.data ?? []).map((p: any) => ({
          ...p,
          total_points: pointsMap[p.id] ?? 0,
        }))
      )
      setLoading(false)
    }
    fetchAll()
  }, [adminProfile?.parish_id]))

  const handleRevokeAdmin = (item: Member) => {
    if (item.id === adminProfile!.id) {
      Toast.show({ type: 'error', text1: 'Błąd', text2: 'Nie możesz usunąć własnych uprawnień administratora.' })
      return
    }
    setPendingRevoke(item)
  }

  const doRevoke = async () => {
    if (!pendingRevoke) return
    const item = pendingRevoke
    setPendingRevoke(null)

    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('parish_id', adminProfile!.parish_id)
      .eq('role', 'admin')

    if ((count ?? 0) <= 1) {
      Toast.show({ type: 'error', text1: 'Błąd', text2: 'Nie można usunąć jedynego administratora parafii.' })
      return
    }

    const restoredRole = item.role_before_admin ?? 'member'
    const { error } = await supabase
      .from('profiles')
      .update({ role: restoredRole, role_before_admin: null })
      .eq('id', item.id)

    if (error) {
      Toast.show({ type: 'error', text1: 'Błąd', text2: error.message })
    } else {
      setMembers(prev => prev.map(m =>
        m.id === item.id
          ? { ...m, role: restoredRole as Member['role'], role_before_admin: null }
          : m
      ))
      Toast.show({ type: 'success', text1: 'Uprawnienia usunięte', text2: `${item.full_name} jest teraz ${restoredRole === 'parent' ? 'rodzicem' : 'ministrantem'}` })
    }
  }

  const handleOpenAssignModal = async () => {
    setAssignLoading(true)
    setAssignModalVisible(true)
    setCandidateSearch('')
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, phone, rocznik, role_before_admin')
      .eq('parish_id', adminProfile!.parish_id)
      .in('role', ['member', 'parent'])
      .eq('is_active', true)
      .order('full_name')
    if (error) {
      Toast.show({ type: 'error', text1: 'Błąd', text2: 'Nie udało się załadować listy członków.' })
    }
    setCandidates(data ?? [])
    setAssignLoading(false)
  }

  const handleGrantAdmin = (candidate: Member) => {
    setPendingGrant(candidate)
  }

  const doGrant = async () => {
    if (!pendingGrant) return
    const candidate = pendingGrant
    setPendingGrant(null)
    setAssignModalVisible(false)

    const { error } = await supabase
      .from('profiles')
      .update({ role: 'admin', role_before_admin: candidate.role })
      .eq('id', candidate.id)

    if (error) {
      Toast.show({ type: 'error', text1: 'Błąd', text2: error.message })
    } else {
      setCandidates([])
      setMembers(prev => [...prev, { ...candidate, role: 'admin', role_before_admin: candidate.role }])
      Toast.show({ type: 'success', text1: 'Uprawnienia nadane', text2: `${candidate.full_name} jest teraz administratorem` })
    }
  }

  const approve = async (p: Pending) => {
    setBusyId(p.id)
    const { error } = await supabase.rpc('approve_member', { p_profile_id: p.id })
    setBusyId(null)
    if (error) { Toast.show({ type: 'error', text1: 'Błąd', text2: error.message }); return }
    setWaiting(prev => prev.filter(x => x.id !== p.id))
    setMembers(prev => [...prev, { id: p.id, full_name: p.full_name, role: p.role, phone: p.phone, rocznik: p.rocznik, total_points: 0 }]
      .sort((a, b) => a.full_name.localeCompare(b.full_name)))
    Toast.show({ type: 'success', text1: 'Zatwierdzono', text2: p.full_name })
  }

  const doReject = async () => {
    if (!rejecting) return
    const p = rejecting
    setRejecting(null)
    setBusyId(p.id)
    const { error } = await supabase.rpc('remove_member_from_parish', { p_profile_id: p.id })
    setBusyId(null)
    if (error) { Toast.show({ type: 'error', text1: 'Błąd', text2: error.message }); return }
    setWaiting(prev => prev.filter(x => x.id !== p.id))
    Toast.show({ type: 'success', text1: 'Prośba odrzucona', text2: p.full_name })
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return members.filter(
      m => m.role === filter && (q === '' || m.full_name.toLowerCase().includes(q))
    )
  }, [members, filter, search])

  const handleMemberPress = useCallback((id: string) => {
    router.push(`/(admin)/member-detail?id=${id}`)
  }, [router])

  const renderItem = useCallback(({ item }: { item: Member }) => {
    if (filter === 'admin') {
      return (
        <View style={styles.row}>
          <View style={styles.avatar}>
            <Ionicons name="shield-checkmark" size={18} color={c.primary} />
          </View>
          <View style={styles.rowInfo}>
            <Text style={styles.name}>{item.full_name}</Text>
            <Text style={styles.sub}>{item.phone ?? 'Brak telefonu'}</Text>
          </View>
          <TouchableOpacity
            onPress={() => handleRevokeAdmin(item)}
            hitSlop={8}
            style={styles.revokeBtn}
          >
            <Ionicons name="person-remove-outline" size={20} color="#DC2626" />
          </TouchableOpacity>
        </View>
      )
    }
    return (
      <MemberRow
        member={item as MemberRowData}
        onPress={() => handleMemberPress(item.id)}
      />
    )
  }, [filter, styles, c.primary, handleRevokeAdmin, handleMemberPress])

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color={c.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Szukaj po imieniu..."
            placeholderTextColor={c.textTertiary}
            value={search}
            onChangeText={setSearch}
          />
          {search !== '' && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={c.iconMuted} />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.chipRow}>
          {(['member', 'parent', 'admin'] as Filter[]).map(f => (
            <TouchableOpacity
              key={f}
              style={[styles.chip, filter === f && styles.chipActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
                {f === 'member' ? 'Ministranci' : f === 'parent' ? 'Rodzice' : 'Admini'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={c.primary} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={waiting.length > 0 ? (
            <View style={styles.pendingBox}>
              <Text style={styles.pendingTitle}>Oczekują na zatwierdzenie ({waiting.length})</Text>
              {waiting.map(p => (
                <View key={p.id} style={styles.pendingRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{p.full_name}</Text>
                    <Text style={styles.sub}>
                      {p.role === 'parent' ? 'Rodzic' : `Ministrant${p.rocznik ? `, rocznik ${p.rocznik}` : ''}`}
                      {p.children ? ` · dzieci: ${p.children}` : ''}
                    </Text>
                    <Text style={styles.sub}>{[p.email, p.phone].filter(Boolean).join(' · ')}</Text>
                  </View>
                  {busyId === p.id ? <ActivityIndicator color={c.primary} /> : (
                    <View style={styles.pendingActions}>
                      <TouchableOpacity style={styles.rejectBtn} onPress={() => setRejecting(p)} hitSlop={6}>
                        <Ionicons name="close" size={18} color={c.danger} />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.approveBtn} onPress={() => approve(p)} hitSlop={6}>
                        <Ionicons name="checkmark" size={18} color="#fff" />
                        <Text style={styles.approveText}>Zatwierdź</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))}
            </View>
          ) : null}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={48} color={c.iconMuted} />
              <Text style={styles.emptyText}>
                {search !== '' ? 'Brak wyników wyszukiwania' : 'Brak użytkowników'}
              </Text>
              {search === '' && filter !== 'admin' && (
                <>
                  <Text style={styles.emptyHint}>
                    Zaproś ministrantów kodem:{' '}
                    <Text style={styles.emptyCode}>{parish?.invite_code ?? '—'}</Text>
                  </Text>
                  <TouchableOpacity
                    style={styles.emptyBtn}
                    onPress={() => router.push('/(admin)/parish-settings')}
                  >
                    <Text style={styles.emptyBtnText}>Zarządzaj kodem zaproszenia</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          }
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListFooterComponent={
            filter === 'admin' ? (
              <TouchableOpacity style={styles.assignBtn} onPress={handleOpenAssignModal}>
                <Ionicons name="person-add-outline" size={18} color="#fff" />
                <Text style={styles.assignBtnText}>Przydziel prawa admina</Text>
              </TouchableOpacity>
            ) : null
          }
        />
      )}

      <Modal
        visible={assignModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAssignModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setAssignModalVisible(false)}
          />
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Przydziel prawa admina</Text>
              <TouchableOpacity onPress={() => setAssignModalVisible(false)} hitSlop={8}>
                <Ionicons name="close" size={24} color={c.subtext} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalSearchBox}>
              <Ionicons name="search-outline" size={16} color={c.textTertiary} />
              <TextInput
                style={styles.modalSearchInput}
                placeholder="Szukaj po imieniu..."
                placeholderTextColor={c.textTertiary}
                value={candidateSearch}
                onChangeText={setCandidateSearch}
              />
            </View>

            {assignLoading ? (
              <ActivityIndicator color={c.primary} style={{ padding: 24 }} />
            ) : (() => {
              const q = candidateSearch.toLowerCase()
              const filteredCandidates = candidates.filter(p =>
                q === '' || p.full_name.toLowerCase().includes(q)
              )
              return filteredCandidates.length === 0 ? (
                <View style={styles.modalEmpty}>
                  <Text style={styles.modalEmptyText}>
                    {candidates.length === 0
                      ? 'Brak ministrantów ani rodziców do promowania'
                      : 'Brak wyników wyszukiwania'}
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={filteredCandidates}
                  keyExtractor={item => item.id}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.candidateOption}
                      onPress={() => handleGrantAdmin(item)}
                    >
                      <Ionicons
                        name={item.role === 'parent' ? 'people-outline' : 'person-outline'}
                        size={20}
                        color={c.primary}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.candidateName}>{item.full_name}</Text>
                        <Text style={styles.candidateRole}>
                          {item.role === 'parent' ? 'Rodzic' : 'Ministrant'}
                        </Text>
                      </View>
                      <Ionicons name="shield-outline" size={16} color={c.textTertiary} />
                    </TouchableOpacity>
                  )}
                  style={{ maxHeight: 360 }}
                />
              )
            })()}
          </View>
        </View>
      </Modal>

      <ConfirmDialog
        visible={rejecting !== null}
        title="Odrzucić prośbę?"
        message={`${rejecting?.full_name ?? ''} nie zostanie dodany do parafii. Jeśli to pomyłka, osoba może ponownie wpisać kod.`}
        confirmText="Odrzuć"
        destructive
        onConfirm={doReject}
        onCancel={() => setRejecting(null)}
      />

      <ConfirmDialog
        visible={pendingRevoke !== null}
        title="Usuń uprawnienia admina"
        message={`Czy na pewno chcesz usunąć uprawnienia administratora dla ${pendingRevoke?.full_name ?? ''}?`}
        confirmText="Usuń"
        destructive
        onConfirm={doRevoke}
        onCancel={() => setPendingRevoke(null)}
      />

      <ConfirmDialog
        visible={pendingGrant !== null}
        title="Nadaj uprawnienia admina"
        message={`Nadać uprawnienia administratora dla ${pendingGrant?.full_name ?? ''}?`}
        confirmText="Nadaj"
        onConfirm={doGrant}
        onCancel={() => setPendingGrant(null)}
      />
    </View>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    topBar: {
      backgroundColor: c.surface, paddingHorizontal: 16, paddingTop: 12,
      paddingBottom: 10, gap: 10, borderBottomWidth: 1, borderBottomColor: c.primarySurface,
    },
    searchBox: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.bg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9,
    },
    searchInput: { flex: 1, fontSize: 15, color: c.text },
    chipRow: { flexDirection: 'row', gap: 8 },
    chip: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: c.primarySurface },
    chipActive: { backgroundColor: c.primary },
    chipText: { fontSize: 13, fontWeight: '600', color: c.subtext },
    chipTextActive: { color: '#fff' },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: c.surface, borderRadius: 12, padding: 12,
      ...shadow.xs,
    },
    avatar: {
      width: 38, height: 38, borderRadius: 19,
      backgroundColor: c.primaryAlpha08, justifyContent: 'center', alignItems: 'center',
    },
    rowInfo: { flex: 1 },
    name: { fontSize: 15, fontWeight: '600', color: c.text },
    sub: { fontSize: 12, color: c.subtext, marginTop: 2 },
    pointsBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 3,
      backgroundColor: c.gold + '15', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3,
    },
    pointsText: { fontSize: 12, fontWeight: '700', color: c.gold },
    revokeBtn: {
      padding: 6,
    },
    assignBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: c.primary, borderRadius: 12, padding: 14, marginTop: 8,
    },
    assignBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
    modalSheet: {
      backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
      padding: 20, paddingBottom: 36,
    },
    modalHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12,
    },
    modalTitle: { fontSize: 17, fontWeight: '700', color: c.text },
    modalSearchBox: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.bg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9,
      marginBottom: 8,
    },
    modalSearchInput: { flex: 1, fontSize: 15, color: c.text },
    candidateOption: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.primarySurface,
    },
    candidateName: { fontSize: 15, color: c.text, fontWeight: '500' },
    candidateRole: { fontSize: 12, color: c.subtext, marginTop: 1 },
    modalEmpty: { padding: 24, alignItems: 'center' },
    modalEmptyText: { fontSize: 14, color: c.textTertiary, textAlign: 'center' },
    empty: { alignItems: 'center', marginTop: 60, gap: 12, paddingHorizontal: 32 },
    emptyText: { color: c.textTertiary, fontSize: 15 },
    emptyHint: { fontSize: 13, color: c.textTertiary, textAlign: 'center' },
    emptyCode: { fontWeight: '700', color: c.primary },
    emptyBtn: {
      marginTop: 4, paddingHorizontal: 20, paddingVertical: 10,
      backgroundColor: c.primaryAlpha08, borderRadius: 10, borderWidth: 1, borderColor: c.primaryAlpha20,
    },
    emptyBtnText: { fontSize: 14, color: c.primary, fontWeight: '600' },
    listContent: { padding: 16, gap: 8 },
    pendingBox: {
      backgroundColor: c.surface, borderRadius: 14, padding: 12, gap: 4, marginBottom: 8,
      borderWidth: 1.5, borderColor: '#F59E0B', ...shadow.xs,
    },
    pendingTitle: { fontSize: 13, fontWeight: '700', color: '#B45309', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
    pendingRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border,
    },
    pendingActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rejectBtn: { padding: 8, borderRadius: 10, borderWidth: 1, borderColor: c.danger + '55' },
    approveBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: '#16A34A', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
    },
    approveText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  })
}
