import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { STATUS_COLORS, STATUS_LABELS } from '../../lib/status'
import { CATEGORY_CONFIG, ScheduleCategory } from '../../types/database'
import { useTheme } from '../../lib/ThemeContext'
import { headerPalette, sans, serif, VESTMENT_NAMES, VestmentColor } from '../../lib/theme'
import { getLiturgicalDay } from '../../lib/liturgy'
import { longDate, longDateCap } from '../../lib/dates'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { AppText, Avatar, Button, Card, Chip, HeaderChip, Icon, ListRow, Sheet, TextField } from '../../components/ui'
import { SERVICE_MODE_INFO, ServiceMode } from '../../lib/massSchedule'
import { AdminRolesCard } from '../../components/services/RolesCard'

type Assignment = {
  id: string
  profile_id: string
  role: string
  status: string
  absence_reason: string | null
  profile: { full_name: string; phone: string | null }
}

type ScheduleDetail = {
  id: string
  title: string
  date: string
  time: string
  category: ScheduleCategory
  service_mode: ServiceMode
  notes: string | null
  series_id: string | null
  group: { name: string } | null
  assignments: Assignment[]
}

type MemberOption = { id: string; full_name: string }

export default function ScheduleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { profile: adminProfile } = useAuthStore()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { colors: c, isDark } = useTheme()
  const isDesktop = useIsDesktop()
  const [confirmSeries, setConfirmSeries] = useState(false)
  const [schedule, setSchedule] = useState<ScheduleDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [attendanceIds, setAttendanceIds] = useState<Set<string>>(new Set())
  const [togglingAttendance, setTogglingAttendance] = useState<string | null>(null)
  const [statusModalAssignment, setStatusModalAssignment] = useState<Assignment | null>(null)
  const [addModalVisible, setAddModalVisible] = useState(false)
  const [allMembers, setAllMembers] = useState<MemberOption[]>([])
  const [addSearch, setAddSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteSheetVisible, setDeleteSheetVisible] = useState(false)
  const [confirmAdd, setConfirmAdd] = useState<MemberOption | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; name: string } | null>(null)
  const [attendanceSheetVisible, setAttendanceSheetVisible] = useState(false)
  const [draftIds, setDraftIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const changeMode = async (m: ServiceMode) => {
    if (!schedule || schedule.service_mode === m) return
    const { error } = await supabase.from('schedules').update({ service_mode: m }).eq('id', schedule.id)
    if (error) { Toast.show({ type: 'error', text1: 'Nie zapisano', text2: error.message }); return }
    setSchedule({ ...schedule, service_mode: m })
    Toast.show({ type: 'success', text1: SERVICE_MODE_INFO[m].label })
  }

  const fetchSchedule = async () => {
    const [scheduleRes, attendanceRes] = await Promise.all([
      supabase
        .from('schedules')
        .select(`
          id, title, date, time, category, service_mode, notes, series_id,
          group:groups(name),
          assignments:schedule_assignments(
            id, profile_id, role, status, absence_reason,
            profile:profiles(full_name, phone)
          )
        `)
        .eq('id', id)
        .single(),
      supabase
        .from('attendance')
        .select('profile_id')
        .eq('schedule_id', id),
    ])

    if (scheduleRes.data) setSchedule(scheduleRes.data as any)
    setAttendanceIds(new Set((attendanceRes.data ?? []).map(a => a.profile_id)))
    setLoading(false)
  }

  useEffect(() => { fetchSchedule() }, [id])

  const handleChangeStatus = async (assignmentId: string, newStatus: string) => {
    setUpdatingId(assignmentId)
    const { error } = await supabase
      .from('schedule_assignments')
      .update({ status: newStatus })
      .eq('id', assignmentId)
    setUpdatingId(null)
    if (error) Toast.show({ type: 'error', text1: 'Błąd', text2: error.message })
    else fetchSchedule()
  }

  const handleToggleAttendance = async (profileId: string) => {
    setTogglingAttendance(profileId)
    const assignment = schedule?.assignments.find(a => a.profile_id === profileId)
    if (attendanceIds.has(profileId)) {
      const { error } = await supabase.from('attendance').delete().eq('schedule_id', id).eq('profile_id', profileId)
      if (error) { Toast.show({ type: 'error', text1: 'Błąd', text2: error.message }); setTogglingAttendance(null); return }
      setAttendanceIds(prev => { const s = new Set(prev); s.delete(profileId); return s })
      if (assignment && ['assigned', 'present'].includes(assignment.status)) {
        await handleChangeStatus(assignment.id, 'absent')
      }
    } else {
      const { error } = await supabase.rpc('check_in_and_award_points', {
        p_schedule_id: id,
        p_profile_id: profileId,
        p_parish_id: adminProfile?.parish_id,
      })
      if (error) { Toast.show({ type: 'error', text1: 'Błąd', text2: error.message }); setTogglingAttendance(null); return }
      setAttendanceIds(prev => new Set([...prev, profileId]))
      if (assignment && assignment.status !== 'present') {
        await handleChangeStatus(assignment.id, 'present')
      }
    }
    setTogglingAttendance(null)
  }

  const handleSaveAttendance = async () => {
    if (!schedule || !adminProfile?.parish_id) return
    setSaving(true)

    for (const profileId of draftIds) {
      if (!attendanceIds.has(profileId)) {
        const { error } = await supabase.rpc('check_in_and_award_points', {
          p_schedule_id: id,
          p_profile_id: profileId,
          p_parish_id: adminProfile.parish_id,
        })
        if (error) {
          Toast.show({ type: 'error', text1: 'Błąd zapisu', text2: error.message })
          setSaving(false)
          fetchSchedule()
          return
        }
        await supabase.from('schedule_assignments')
          .update({ status: 'present' })
          .eq('profile_id', profileId)
          .eq('schedule_id', id)
      }
    }

    for (const profileId of attendanceIds) {
      if (!draftIds.has(profileId)) {
        const { error } = await supabase.from('attendance').delete()
          .eq('schedule_id', id).eq('profile_id', profileId)
        if (error) {
          Toast.show({ type: 'error', text1: 'Błąd zapisu', text2: error.message })
          setSaving(false)
          fetchSchedule()
          return
        }
        await supabase.from('schedule_assignments')
          .update({ status: 'absent' })
          .eq('profile_id', profileId)
          .eq('schedule_id', id)
      }
    }

    setAttendanceIds(new Set(draftIds))
    setSaving(false)
    setAttendanceSheetVisible(false)
    Toast.show({
      type: 'success',
      text1: 'Obecność zapisana',
      text2: `${draftIds.size} ministrantów oznaczonych jako obecnych`,
    })
    fetchSchedule()
  }

  const openAddModal = async () => {
    const { data } = await supabase
      .from('profiles').select('id, full_name')
      .eq('parish_id', adminProfile!.parish_id)
      .eq('role', 'member').eq('is_active', true).order('full_name')
    setAllMembers(data ?? [])
    setAddSearch('')
    setAddModalVisible(true)
  }

  const handleAdd = (member: MemberOption) => {
    if (!schedule) return
    setConfirmAdd(member)
  }

  const doAdd = async () => {
    const member = confirmAdd
    if (!member || !schedule) return
    setConfirmAdd(null)
    setAdding(true)
    const { error } = await supabase.from('schedule_assignments').insert({
      schedule_id: schedule.id, profile_id: member.id, role: 'ministrant', status: 'assigned',
    })
    setAdding(false)
    if (error) {
      Toast.show({ type: 'error', text1: 'Błąd', text2: error.message })
    } else {
      setAddModalVisible(false)
      fetchSchedule()
      Toast.show({ type: 'success', text1: `Dodano ${member.full_name}` })
    }
  }

  const handleRemove = (assignmentId: string, name: string) => {
    setConfirmRemove({ id: assignmentId, name })
  }

  const doRemove = async () => {
    const item = confirmRemove
    if (!item) return
    setConfirmRemove(null)
    setUpdatingId(item.id)
    const { error } = await supabase.from('schedule_assignments').delete().eq('id', item.id)
    setUpdatingId(null)
    if (error) { Toast.show({ type: 'error', text1: 'Błąd', text2: error.message }); return }
    fetchSchedule()
  }

  const doDeleteSchedule = async () => {
    setDeleting(true)
    const { error } = await supabase.from('schedules').delete().eq('id', id)
    setDeleting(false)
    if (error) { Toast.show({ type: 'error', text1: 'Błąd', text2: error.message }); return }
    router.back()
  }

  const doDeleteSeries = async () => {
    if (!schedule?.series_id) return
    setDeleting(true)
    const { error } = await supabase.from('schedules').delete().eq('series_id', schedule.series_id)
    setDeleting(false)
    if (error) { Toast.show({ type: 'error', text1: 'Błąd', text2: error.message }); return }
    router.replace('/(admin)/(admin-tabs)/schedules')
  }

  if (loading) {
    return <View style={[styles.center, { backgroundColor: c.bg }]}><ActivityIndicator size="large" color={c.primary} /></View>
  }

  if (!schedule) {
    return <View style={[styles.center, { backgroundColor: c.bg }]}><AppText muted>Nie znaleziono służby</AppText></View>
  }

  const assignedIds = new Set(schedule.assignments.map(a => a.profile_id))
  const filteredMembers = allMembers.filter(
    m => !assignedIds.has(m.id) && m.full_name.toLowerCase().includes(addSearch.toLowerCase())
  )

  const lit = getLiturgicalDay(schedule.date)
  const vest = (lit.color ?? 'GREEN') as VestmentColor
  const pal = headerPalette(vest, isDark)
  const catCfg = CATEGORY_CONFIG[schedule.category] ?? CATEGORY_CONFIG.msza
  const presentCount = attendanceIds.size
  const totalCount = schedule.assignments.length

  const openAttendanceList = async () => {
    const { data } = await supabase
      .from('profiles').select('id, full_name')
      .eq('parish_id', adminProfile!.parish_id)
      .eq('role', 'member').eq('is_active', true).order('full_name')
    setAllMembers(data ?? [])
    setDraftIds(new Set(attendanceIds))
    setAttendanceSheetVisible(true)
  }

  return (
    <>
      <Stack.Screen options={{ title: schedule.title, headerShown: false }} />

      <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 16 }}>
        <View style={[styles.head, { backgroundColor: pal.bg, paddingTop: isDesktop ? 22 : insets.top + 8 }, isDesktop && styles.headDesktop]}>
          <StatusBar style={pal.statusBar} />
          <View style={styles.headTop}>
            {!isDesktop ? (
              <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(admin)/(admin-tabs)/schedules'))} style={styles.back} accessibilityRole="button">
                <Icon name="chevron-left" size={22} color={pal.fg} />
                <AppText style={[styles.backText, { color: pal.fg }]}>Wstecz</AppText>
              </Pressable>
            ) : <View />}
            <Pressable
              onPress={() => setDeleteSheetVisible(true)}
              disabled={deleting}
              accessibilityRole="button"
              accessibilityLabel="Usuń służbę"
              style={[styles.headIcon, { backgroundColor: pal.chip }]}
            >
              {deleting ? <ActivityIndicator size="small" color={pal.fg} /> : <Icon name="delete" size={20} color={pal.fg} />}
            </Pressable>
          </View>
          <AppText variant="eyebrow" color={pal.accent}>{`${catCfg.label} · ${VESTMENT_NAMES[vest]}`}</AppText>
          <AppText style={[serif(), styles.title, { color: pal.fg }]}>{schedule.title}</AppText>
          <AppText style={[styles.when, { color: pal.fg }]}>{`${longDateCap(schedule.date)} · ${schedule.time?.slice(0, 5)}`}</AppText>
          <AppText style={[styles.lit, { color: pal.fg }]} numberOfLines={2}>{lit.name}</AppText>
          {schedule.series_id && <HeaderChip label="Część cyklu służb" palette={pal} />}
        </View>

        <View style={[styles.body, isDesktop && styles.bodyDesktop]}>
          <View style={styles.stats}>
            {[
              [String(totalCount), 'zapisanych', c.text],
              [String(presentCount), 'obecnych', c.success],
              [String(totalCount - presentCount), 'nieobecnych', c.dangerStrong],
            ].map(([v, l, col]) => (
              <Card key={l} style={styles.stat}>
                <AppText style={[styles.statValue, { color: col }]}>{v}</AppText>
                <AppText variant="small" muted>{l}</AppText>
              </Card>
            ))}
          </View>

          {!!schedule.notes && (
            <View style={[styles.note, { backgroundColor: c.goldSurface }]}>
              <Icon name="information" size={20} color={c.goldInk} />
              <AppText style={[styles.noteText, { color: c.goldText }]}>{schedule.notes}</AppText>
            </View>
          )}

          <Card style={styles.modeCard}>
            <AppText variant="eyebrow" color={c.goldInk}>Zapisy, obecność i punkty</AppText>
            <View style={styles.modeChips}>
              {(['signup', 'assigned', 'none'] as ServiceMode[]).map(m => (
                <Chip key={m} label={SERVICE_MODE_INFO[m].short} selected={schedule.service_mode === m} onPress={() => changeMode(m)} />
              ))}
            </View>
            <AppText variant="small" muted>
              {SERVICE_MODE_INFO[schedule.service_mode ?? 'signup'].hint + ' Dotyczy tylko tej służby — stały układ zmienisz w Rozkładzie Mszy.'}
            </AppText>
          </Card>

          {schedule.category === 'zbiorka' && schedule.service_mode !== 'none' && (
            <Button label="Lista obecności na zbiórce" icon="check-all" onPress={openAttendanceList} />
          )}

          {schedule.category === 'msza' && <AdminRolesCard scheduleId={schedule.id} onChanged={fetchSchedule} />}

          <Card flush>
            <View style={[styles.sectionHead, { borderBottomColor: c.borderLight }]}>
              <AppText variant="eyebrow" color={c.goldInk} style={styles.flex}>Obsada</AppText>
              <Button label="Przydziel" icon="account-plus" compact variant="secondary" onPress={openAddModal} />
            </View>
            {schedule.assignments.length === 0 ? (
              <View style={styles.empty}>
                <Icon name="account-group" size={36} color={c.iconMuted} />
                <AppText variant="bodyStrong">Nikt się jeszcze nie zapisał</AppText>
                <AppText variant="small" muted>Przydziel ministranta albo poczekaj, aż ktoś zapisze się w aplikacji.</AppText>
              </View>
            ) : schedule.assignments.map((a, i) => {
              const present = attendanceIds.has(a.profile_id)
              return (
                <View key={a.id} style={[styles.person, i > 0 && { borderTopWidth: 1, borderTopColor: c.borderLight }]}>
                  <Avatar name={a.profile.full_name} size={38} color={c.primary} textColor={c.gold} />
                  <View style={styles.flex}>
                    <AppText variant="bodyStrong">{a.profile.full_name}</AppText>
                    {a.role && a.role !== 'ministrant' && <AppText variant="small" color={c.goldInk}>{a.role}</AppText>}
                    {!!a.profile.phone && <AppText variant="small" muted>{a.profile.phone}</AppText>}
                    {(a.status === 'excused' || a.status === 'confirmed') && !!a.absence_reason && (
                      <AppText variant="small" color={c.dangerStrong}>{`Powód: ${a.absence_reason}`}</AppText>
                    )}
                  </View>
                  <Pressable onPress={() => setStatusModalAssignment(a)} disabled={updatingId === a.id} accessibilityRole="button">
                    <View style={[styles.statusPill, { backgroundColor: (STATUS_COLORS[a.status] ?? c.subtext) + '22' }]}>
                      <AppText style={[styles.statusText, { color: STATUS_COLORS[a.status] ?? c.subtext }]}>
                        {STATUS_LABELS[a.status] ?? a.status}
                      </AppText>
                    </View>
                  </Pressable>
                  {schedule.service_mode === 'none' && !present ? null : togglingAttendance === a.profile_id ? (
                    <ActivityIndicator size="small" color={c.success} />
                  ) : (
                    <Pressable
                      onPress={() => handleToggleAttendance(a.profile_id)}
                      hitSlop={8}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: present }}
                      accessibilityLabel={`Obecność: ${a.profile.full_name}`}
                    >
                      <Icon name={present ? 'check-circle' : 'checkbox-blank-circle-outline'} size={26} color={present ? c.success : c.iconMuted} filled />
                    </Pressable>
                  )}
                  {updatingId === a.id ? (
                    <ActivityIndicator size="small" color={c.primary} />
                  ) : (
                    <Pressable onPress={() => handleRemove(a.id, a.profile.full_name)} hitSlop={8} accessibilityLabel="Usuń zapis">
                      <Icon name="close" size={22} color={c.dangerStrong} filled />
                    </Pressable>
                  )}
                </View>
              )
            })}
          </Card>
          <AppText variant="small" muted style={styles.hint}>
            Kółko przy osobie zaznacza obecność (z punktami wg reguł). Dotknij statusu, aby go zmienić.
          </AppText>
        </View>
      </ScrollView>

      {/* Status */}
      <Sheet
        visible={!!statusModalAssignment}
        onClose={() => setStatusModalAssignment(null)}
        eyebrow={statusModalAssignment?.profile.full_name}
        title="Zmień status"
      >
        <Card flush>
          {Object.entries(STATUS_LABELS).map(([key, label], i) => (
            <ListRow
              key={key}
              first={i === 0}
              title={label}
              left={<View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[key] }]} />}
              right={statusModalAssignment?.status === key ? <Icon name="check" size={20} color={c.primary} /> : undefined}
              selected={statusModalAssignment?.status === key}
              onPress={async () => {
                if (statusModalAssignment && statusModalAssignment.status !== key) {
                  await handleChangeStatus(statusModalAssignment.id, key)
                }
                setStatusModalAssignment(null)
              }}
            />
          ))}
        </Card>
      </Sheet>

      {/* Przydziel */}
      <Sheet visible={addModalVisible} onClose={() => setAddModalVisible(false)} title="Przydziel ministranta" eyebrow={schedule.title}>
        <TextField placeholder="Szukaj po imieniu…" value={addSearch} onChangeText={setAddSearch} autoFocus />
        <Card flush>
          {filteredMembers.length === 0 ? (
            <AppText muted style={styles.pad}>
              {allMembers.length === assignedIds.size ? 'Wszyscy ministranci są już zapisani.' : 'Brak wyników.'}
            </AppText>
          ) : filteredMembers.map((m, i) => (
            <ListRow
              key={m.id}
              first={i === 0}
              title={m.full_name}
              left={<Avatar name={m.full_name} size={34} color={c.primary} textColor={c.gold} />}
              right={adding ? <ActivityIndicator size="small" color={c.primary} /> : <Icon name="plus-circle" size={22} color={c.primary} filled />}
              onPress={() => handleAdd(m)}
            />
          ))}
        </Card>
      </Sheet>

      {/* Usuń */}
      <Sheet
        visible={deleteSheetVisible}
        onClose={() => { setDeleteSheetVisible(false); setConfirmSeries(false) }}
        eyebrow={`${longDate(schedule.date)} · ${schedule.time?.slice(0, 5)}`}
        title={confirmSeries ? 'Usunąć cały cykl?' : `Usunąć: ${schedule.title}?`}
        footer={confirmSeries ? (
          <>
            <Button label="Usuń wszystkie terminy" variant="danger" onPress={() => { setDeleteSheetVisible(false); setConfirmSeries(false); doDeleteSeries() }} />
            <Button label="Anuluj" variant="secondary" onPress={() => setConfirmSeries(false)} />
          </>
        ) : undefined}
      >
        {confirmSeries ? (
          <AppText muted>Znikną WSZYSTKIE terminy z tego cyklu razem z zapisami. Tej operacji nie można cofnąć.</AppText>
        ) : (
          <Card flush>
            <ListRow first icon="delete" destructive title="Usuń tę służbę" subtitle="Tylko ten jeden termin" onPress={() => { setDeleteSheetVisible(false); doDeleteSchedule() }} />
            {schedule.series_id && (
              <ListRow icon="delete-sweep" destructive title="Usuń cały cykl" subtitle="Wszystkie terminy z tej serii" onPress={() => setConfirmSeries(true)} />
            )}
          </Card>
        )}
      </Sheet>

      {/* Potwierdzenia dodania / usunięcia zapisu */}
      <Sheet
        visible={!!confirmAdd}
        onClose={() => setConfirmAdd(null)}
        title="Przydzielić?"
        footer={<><Button label="Przydziel" onPress={doAdd} /><Button label="Anuluj" variant="secondary" onPress={() => setConfirmAdd(null)} /></>}
      >
        <AppText muted>{`${confirmAdd?.full_name} zostanie dopisany do tej służby.`}</AppText>
      </Sheet>
      <Sheet
        visible={!!confirmRemove}
        onClose={() => setConfirmRemove(null)}
        title="Usunąć zapis?"
        footer={<><Button label="Usuń" variant="danger" onPress={doRemove} /><Button label="Anuluj" variant="secondary" onPress={() => setConfirmRemove(null)} /></>}
      >
        <AppText muted>{`${confirmRemove?.name} zostanie wypisany z tej służby.`}</AppText>
      </Sheet>

      {/* Lista obecności (zbiórka) */}
      <Sheet
        visible={attendanceSheetVisible}
        onClose={() => { if (!saving) setAttendanceSheetVisible(false) }}
        eyebrow={schedule.title}
        title="Lista obecności"
        footer={
          <>
            <AppText variant="small" muted style={styles.center2}>{`${draftIds.size} z ${allMembers.length} obecnych`}</AppText>
            <Button label="Zapisz listę" onPress={handleSaveAttendance} loading={saving} />
          </>
        }
      >
        <Card flush>
          {allMembers.map((m, i) => {
            const on = draftIds.has(m.id)
            return (
              <ListRow
                key={m.id}
                first={i === 0}
                title={m.full_name}
                left={<Avatar name={m.full_name} size={34} color={c.primary} textColor={c.gold} />}
                right={<Icon name={on ? 'check-circle' : 'checkbox-blank-circle-outline'} size={26} color={on ? c.success : c.iconMuted} filled />}
                onPress={() => setDraftIds(prev => {
                  const s = new Set(prev)
                  if (s.has(m.id)) s.delete(m.id)
                  else s.add(m.id)
                  return s
                })}
              />
            )
          })}
        </Card>
      </Sheet>
    </>
  )
}

const styles = StyleSheet.create({
  modeCard: { gap: 8 },
  modeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  flex: { flex: 1, minWidth: 0 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  center2: { textAlign: 'center' },
  pad: { padding: 14 },
  head: { paddingHorizontal: 22, paddingBottom: 22, gap: 6 },
  headDesktop: { marginHorizontal: 32, marginTop: 24, borderRadius: 22 },
  headTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  back: { flexDirection: 'row', alignItems: 'center', marginLeft: -6 },
  backText: { ...sans(700), fontSize: 13 },
  headIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 34, lineHeight: 37 },
  when: { ...sans(700), fontSize: 14 },
  lit: { ...sans(500), fontSize: 13, opacity: 0.9 },
  body: { padding: 16, gap: 14 },
  bodyDesktop: { paddingHorizontal: 32, maxWidth: 900 },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { ...sans(800), fontSize: 24, fontVariant: ['tabular-nums'] },
  note: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 14, alignItems: 'flex-start' },
  noteText: { ...sans(500), fontSize: 13, lineHeight: 19, flex: 1 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  empty: { alignItems: 'center', gap: 6, padding: 24 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  statusText: { ...sans(700), fontSize: 11 },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  hint: { paddingHorizontal: 4 },
})
