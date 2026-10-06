import { useState, useMemo, useCallback } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import Toast from 'react-native-toast-message'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../stores/authStore'
import { useTheme } from '../../../lib/ThemeContext'
import { sans, serif } from '../../../lib/theme'
import { pl } from '../../../lib/dates'
import { attendanceRate } from '../../../lib/serviceRules'
import { useIsDesktop } from '../../../hooks/useIsDesktop'
import { useLiturgyHeader } from '../../../hooks/useLiturgyHeader'
import {
  AppText, Avatar, Badge, Button, Card, HeaderChip, Icon, IconButton, ListRow, ScreenHeader, Segmented, Sheet, TextField,
} from '../../../components/ui'
import { TourTarget } from '../../../components/tour/TourTarget'

type Member = {
  id: string
  full_name: string
  role: 'member' | 'parent' | 'admin'
  phone: string | null
  rocznik: number | null
  total_points?: number
  services?: number
  attendance?: number | null
  rankName?: string | null
  managed?: boolean
  rank_id?: string | null
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
  const isDesktop = useIsDesktop()
  const { palette } = useLiturgyHeader()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // odświeżaj po powrocie (np. po usunięciu osoby z parafii w szczegółach)
  useFocusEffect(useCallback(() => {
    const fetchAll = async () => {
      supabase.rpc('get_pending_members').then(({ data }) => setWaiting((data ?? []) as Pending[]))
      const [profilesRes, pointsRes, ranksRes, assignRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, role, phone, rocznik, role_before_admin, rank_id, managed')
          .eq('parish_id', adminProfile!.parish_id)
          .in('role', ['member', 'parent', 'admin'])
          .eq('is_active', true)
          .order('full_name'),
        supabase.from('points_summary').select('profile_id, total_points, services_count').eq('parish_id', adminProfile!.parish_id),
        supabase.from('ranks').select('id, name').or(`parish_id.is.null,parish_id.eq.${adminProfile!.parish_id}`),
        supabase.from('schedule_assignments').select('profile_id, status, schedule:schedules!inner(parish_id, date)')
          .eq('schedule.parish_id', adminProfile!.parish_id).lt('schedule.date', new Date().toISOString().slice(0, 10)),
      ])
      const rankName = new Map(((ranksRes.data ?? []) as any[]).map(r => [r.id, r.name]))
      const statuses = new Map<string, string[]>()
      for (const a of (assignRes.data ?? []) as any[]) {
        const list = statuses.get(a.profile_id) ?? []
        list.push(a.status)
        statuses.set(a.profile_id, list)
      }
      const servicesMap: Record<string, number> = {}
      for (const p of (pointsRes.data ?? []) as any[]) servicesMap[p.profile_id] = p.services_count

      const pointsMap: Record<string, number> = {}
      for (const p of (pointsRes.data ?? [])) {
        pointsMap[p.profile_id] = p.total_points
      }

      setMembers(
        (profilesRes.data ?? []).map((p: any) => ({
          ...p,
          total_points: pointsMap[p.id] ?? 0,
          services: servicesMap[p.id] ?? 0,
          attendance: attendanceRate(statuses.get(p.id) ?? []),
          rankName: p.rank_id ? rankName.get(p.rank_id) ?? null : null,
          managed: !!p.managed,
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
    const list = members.filter(m => m.role === filter && (q === '' || m.full_name.toLowerCase().includes(q)))
    return filter === 'member' ? [...list].sort((a, b) => (b.total_points ?? 0) - (a.total_points ?? 0)) : list
  }, [members, filter, search])

  const handleMemberPress = useCallback((id: string) => {
    if (isDesktop && filter === 'member') setSelectedId(id)
    else router.push(`/(admin)/member-detail?id=${id}`)
  }, [router, isDesktop, filter])

  const selected = isDesktop && filter === 'member' ? (filtered.find(m => m.id === selectedId) ?? filtered[0]) : undefined
  const rateColor = (r: number | null | undefined) => r == null ? c.subtext : r >= 85 ? c.success : r >= 70 ? c.goldInk : c.dangerStrong
  const memberCount = members.filter(m => m.role === 'member').length

  const pendingBox = waiting.length > 0 && (
    <Card flush style={{ borderColor: c.gold }}>
      <View style={styles.cardHead}><AppText variant="eyebrow" color={c.goldInk}>{`Czekają na zatwierdzenie (${waiting.length})`}</AppText></View>
      {waiting.map(p => (
        <View key={p.id} style={[styles.pendRow, { borderTopColor: c.borderLight }]}>
          <Avatar name={p.full_name} size={38} color={c.goldSurface} textColor={c.goldText} />
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{p.full_name}</AppText>
            <AppText variant="small" muted numberOfLines={2}>
              {`${p.role === 'parent' ? 'Rodzic' : `Ministrant${p.rocznik ? `, rocznik ${p.rocznik}` : ''}`}${p.children ? ` · dzieci: ${p.children}` : ''}`}
            </AppText>
            {!!(p.email || p.phone) && <AppText variant="small" muted>{[p.email, p.phone].filter(Boolean).join(' · ')}</AppText>}
          </View>
          {busyId === p.id ? <ActivityIndicator color={c.primary} /> : (
            <View style={styles.pendActions}>
              {isDesktop
                ? <Button label="Odrzuć" variant="secondary" compact onPress={() => setRejecting(p)} />
                : <IconButton icon="close" color={c.danger} accessibilityLabel="Odrzuć" size={40} onPress={() => setRejecting(p)} />}
              <Button label="Zatwierdź" compact onPress={() => approve(p)} />
            </View>
          )}
        </View>
      ))}
    </Card>
  )

  const segments = (
    <Segmented
      value={filter}
      onChange={f => setFilter(f as Filter)}
      options={[
        { value: 'member', label: `Ministranci` },
        { value: 'parent', label: 'Rodzice' },
        { value: 'admin', label: 'Opiekunowie' },
      ]}
    />
  )

  const emptyState = (
    <View style={styles.empty}>
      <Icon name="account-group" size={40} color={c.iconMuted} />
      <AppText muted>{search !== '' ? 'Brak wyników wyszukiwania' : 'Brak osób w tej grupie'}</AppText>
      {search === '' && filter !== 'admin' && (
        <>
          <AppText variant="small" muted>
            Zaproś kodem: <AppText variant="bodyStrong">{parish?.invite_code ?? '—'}</AppText>
          </AppText>
          <Button label="Zarządzaj kodem zaproszenia" variant="secondary" compact onPress={() => router.push('/(admin)/parish-settings')} />
        </>
      )}
    </View>
  )

  const adminList = (
    <Card flush>
      {filtered.length === 0 ? emptyState : filtered.map((m, i) => (
        <ListRow
          key={m.id}
          first={i === 0}
          icon="shield-account"
          title={m.full_name}
          subtitle={m.phone ?? 'Brak telefonu'}
          right={m.id === adminProfile?.id ? <Badge label="Ty" tone="navy" /> : (
            <Pressable onPress={() => handleRevokeAdmin(m)} hitSlop={8} accessibilityLabel="Odbierz uprawnienia">
              <Icon name="account-remove" size={22} color={c.dangerStrong} />
            </Pressable>
          )}
        />
      ))}
      <View style={styles.pad}>
        <Button label="Przydziel prawa opiekuna" icon="account-plus" variant="secondary" onPress={handleOpenAssignModal} />
      </View>
    </Card>
  )

  const peopleList = (
    <Card flush>
      {filtered.length === 0 ? emptyState : filtered.map((m, i) => (
        <ListRow
          key={m.id}
          first={i === 0}
          left={<Avatar name={m.full_name} size={40} color={c.primary} textColor={c.gold} />}
          title={m.full_name}
          subtitle={m.role === 'parent'
            ? (m.phone ?? 'Rodzic')
            : `${m.rankName ?? 'Ministrant'} · ${m.total_points ?? 0} pkt${m.managed ? ' · bez konta' : ''}`}
          right={m.role === 'member' ? (
            <View style={styles.rowRight}>
              <AppText style={[styles.rate, { color: rateColor(m.attendance) }]}>{m.attendance != null ? `${m.attendance}%` : '—'}</AppText>
              <Icon name="chevron-right" size={22} color={c.iconMuted} />
            </View>
          ) : undefined}
          onPress={() => handleMemberPress(m.id)}
        />
      ))}
    </Card>
  )

  const table = (
    <Card flush>
      <View style={[styles.tr, styles.th, { borderBottomColor: c.border }]}>
        {['#', 'Ministrant', 'Ranga', 'Punkty', 'Służby', 'Frekwencja'].map((h, i) => (
          <AppText key={h} style={[styles.thText, { color: c.subtext }, COLS[i]]}>{h}</AppText>
        ))}
      </View>
      {filtered.length === 0 ? emptyState : filtered.map((m, i) => {
        const sel = selected?.id === m.id
        return (
          <Pressable
            key={m.id}
            onPress={() => handleMemberPress(m.id)}
            style={({ hovered }: any) => [
              styles.tr,
              { borderTopColor: c.borderLight },
              i > 0 && { borderTopWidth: 1 },
              (sel || hovered) && { backgroundColor: sel ? c.goldSurface : c.highlight },
            ]}
          >
            <AppText variant="small" muted style={COLS[0]}>{i + 1}</AppText>
            <View style={[COLS[1], styles.nameCell]}>
              <Avatar name={m.full_name} size={30} color={c.primary} textColor={c.gold} />
              <AppText variant="bodyStrong" numberOfLines={1} style={styles.flex}>{m.full_name}</AppText>
            </View>
            <AppText variant="small" muted style={COLS[2]} numberOfLines={1}>{m.rankName ?? '—'}</AppText>
            <AppText style={[styles.num, COLS[3], { color: c.text }]}>{m.total_points ?? 0}</AppText>
            <AppText style={[styles.num, COLS[4], { color: c.text }]}>{m.services ?? 0}</AppText>
            <AppText style={[styles.num, COLS[5], { color: rateColor(m.attendance) }]}>{m.attendance != null ? `${m.attendance}%` : '—'}</AppText>
          </Pressable>
        )
      })}
    </Card>
  )

  const sidePanel = selected && (
    <Card large style={styles.side}>
      <View style={styles.sideHead}>
        <Avatar name={selected.full_name} size={56} color={c.primary} textColor={c.gold} />
        <View style={styles.flex}>
          <AppText style={[serif(), styles.sideName, { color: c.text }]}>{selected.full_name}</AppText>
          <AppText variant="small" muted>
            {`${selected.rankName ?? 'Ministrant'} · #${filtered.findIndex(m => m.id === selected.id) + 1} w parafii`}
          </AppText>
        </View>
      </View>
      <View style={styles.sideStats}>
        {[[String(selected.total_points ?? 0), 'pkt'], [selected.attendance != null ? `${selected.attendance}%` : '—', 'frekwencja'], [String(selected.services ?? 0), 'służb']].map(([v, l]) => (
          <View key={l} style={[styles.sideStat, { backgroundColor: c.bg }]}>
            <AppText style={[styles.sideStatV, { color: c.text }]}>{v}</AppText>
            <AppText variant="small" muted>{l}</AppText>
          </View>
        ))}
      </View>
      {!!selected.phone && <AppText variant="small" muted>{`Telefon: ${selected.phone}`}</AppText>}
      <View style={styles.sideActions}>
        <Button label="Przyznaj punkty" icon="star-circle" style={styles.flex} onPress={() => router.push(`/(admin)/award-points?preselect_id=${selected.id}` as any)} />
        <Button label="Pełny profil" icon="account" variant="secondary" style={styles.flex} onPress={() => router.push(`/(admin)/member-detail?id=${selected.id}`)} />
      </View>
    </Card>
  )

  const search_ = (onHeader: boolean) => (
    <View style={[styles.search, { backgroundColor: c.surface, borderColor: onHeader ? 'transparent' : c.inputBorder }]}>
      <Icon name="magnify" size={20} color={c.subtext} />
      <TextInput
        style={[styles.searchInput, { color: c.text }]}
        placeholder="Szukaj po imieniu…"
        placeholderTextColor={c.textTertiary}
        value={search}
        onChangeText={setSearch}
      />
      {search !== '' && (
        <Pressable onPress={() => setSearch('')} hitSlop={8}><Icon name="close-circle" size={18} color={c.iconMuted} filled /></Pressable>
      )}
    </View>
  )

  const sheets = (
    <>
      <Sheet visible={assignModalVisible} onClose={() => setAssignModalVisible(false)} title="Przydziel prawa opiekuna">
        <TextField placeholder="Szukaj po imieniu…" value={candidateSearch} onChangeText={setCandidateSearch} />
        {assignLoading ? <ActivityIndicator color={c.primary} /> : (() => {
          const q = candidateSearch.toLowerCase()
          const list = candidates.filter(p => q === '' || p.full_name.toLowerCase().includes(q))
          return (
            <Card flush>
              {list.length === 0 ? (
                <AppText muted style={styles.pad}>{candidates.length === 0 ? 'Brak osób do awansowania.' : 'Brak wyników.'}</AppText>
              ) : list.map((p, i) => (
                <ListRow
                  key={p.id}
                  first={i === 0}
                  icon={p.role === 'parent' ? 'human-male-female-child' : 'account'}
                  title={p.full_name}
                  subtitle={p.role === 'parent' ? 'Rodzic' : 'Ministrant'}
                  onPress={() => handleGrantAdmin(p)}
                />
              ))}
            </Card>
          )
        })()}
      </Sheet>
      <Sheet
        visible={rejecting !== null}
        onClose={() => setRejecting(null)}
        title="Odrzucić prośbę?"
        footer={<><Button label="Odrzuć" variant="danger" onPress={doReject} /><Button label="Anuluj" variant="secondary" onPress={() => setRejecting(null)} /></>}
      >
        <AppText muted>{`${rejecting?.full_name ?? ''} nie zostanie dodany do parafii. Jeśli to pomyłka, może ponownie wpisać kod.`}</AppText>
      </Sheet>
      <Sheet
        visible={pendingRevoke !== null}
        onClose={() => setPendingRevoke(null)}
        title="Odebrać uprawnienia?"
        footer={<><Button label="Odbierz" variant="danger" onPress={doRevoke} /><Button label="Anuluj" variant="secondary" onPress={() => setPendingRevoke(null)} /></>}
      >
        <AppText muted>{`${pendingRevoke?.full_name ?? ''} przestanie być opiekunem parafii.`}</AppText>
      </Sheet>
      <Sheet
        visible={pendingGrant !== null}
        onClose={() => setPendingGrant(null)}
        title="Nadać uprawnienia opiekuna?"
        footer={<><Button label="Nadaj" onPress={doGrant} /><Button label="Anuluj" variant="secondary" onPress={() => setPendingGrant(null)} /></>}
      >
        <AppText muted>{`${pendingGrant?.full_name ?? ''} będzie mógł zarządzać grafikiem, członkami i ustawieniami parafii.`}</AppText>
      </Sheet>
    </>
  )

  if (isDesktop) {
    return (
      <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.desktop}>
        <View style={styles.deskBar}>
          <View style={styles.deskSearch}>{search_(false)}</View>
          <View style={styles.deskSeg}>{segments}</View>
          <Badge label={`Kod: ${parish?.invite_code ?? '—'}`} tone="gold" />
          <TourTarget id="members:import"><Button label="Dodaj / importuj" icon="account-multiple-plus" variant="secondary" compact onPress={() => router.push('/(admin)/import-members' as any)} /></TourTarget>
        </View>
        <View style={styles.cols}>
          <View style={styles.colMain}>
            {pendingBox}
            {loading ? <ActivityIndicator color={c.primary} /> : filter === 'admin' ? adminList : filter === 'member' ? table : peopleList}
          </View>
          {filter === 'member' && <View style={styles.colSide}>{sidePanel}</View>}
        </View>
        {sheets}
      </ScrollView>
    )
  }

  return (
    <View style={[styles.flex, { backgroundColor: c.bg }]}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <ScreenHeader
          title="Członkowie"
          eyebrow={`${memberCount} ${pl(memberCount, ['ministrant', 'ministrantów', 'ministrantów'])}`}
          right={<HeaderChip label={`kod ${parish?.invite_code ?? '—'}`} palette={palette} onPress={() => router.push('/(admin)/parish-settings')} />}
        >
          {search_(true)}
        </ScreenHeader>
        <View style={styles.body}>
          {pendingBox}
          <TourTarget id="members:import"><Button label="Dodaj / importuj ministrantów" icon="account-multiple-plus" variant="secondary" compact onPress={() => router.push('/(admin)/import-members' as any)} /></TourTarget>
          {segments}
          {loading ? <ActivityIndicator color={c.primary} /> : filter === 'admin' ? adminList : peopleList}
        </View>
      </ScrollView>
      {sheets}
    </View>
  )
}

const COLS = [
  { width: 32 },
  { flex: 2.2, minWidth: 0 },
  { flex: 1.3, minWidth: 0 },
  { width: 70, textAlign: 'right' as const },
  { width: 70, textAlign: 'right' as const },
  { width: 96, textAlign: 'right' as const },
]

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  pad: { padding: 14 },
  body: { padding: 16, gap: 14, paddingBottom: 32 },
  cardHead: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 8 },
  pendRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1 },
  pendActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  empty: { alignItems: 'center', gap: 8, padding: 24 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rate: { ...sans(800), fontSize: 14, fontVariant: ['tabular-nums'] },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, borderRadius: 14, paddingHorizontal: 14, borderWidth: 1 },
  searchInput: { flex: 1, height: '100%', fontSize: 15, ...sans(600), outlineStyle: 'none' } as any,
  desktop: { padding: 28, paddingHorizontal: 32, gap: 16 },
  deskBar: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  deskSearch: { flex: 1, maxWidth: 360 },
  deskSeg: { width: 380 },
  cols: { flexDirection: 'row', gap: 20, alignItems: 'flex-start' },
  colMain: { flex: 1.5, gap: 16 },
  colSide: { flex: 1 },
  tr: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11, cursor: 'pointer' } as any,
  th: { borderBottomWidth: 1, paddingVertical: 10 },
  thText: { ...sans(800), fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },
  nameCell: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  num: { ...sans(700), fontSize: 14, fontVariant: ['tabular-nums'] },
  side: { gap: 14, padding: 22 },
  sideHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  sideName: { fontSize: 30, lineHeight: 33 },
  sideStats: { flexDirection: 'row', gap: 10 },
  sideStat: { flex: 1, borderRadius: 14, padding: 14, gap: 2 },
  sideStatV: { ...sans(800), fontSize: 22, fontVariant: ['tabular-nums'] },
  sideActions: { flexDirection: 'row', gap: 10 },
})
