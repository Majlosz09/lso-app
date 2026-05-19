import { useEffect, useState, useMemo } from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  ActivityIndicator, Alert, TouchableOpacity,
  Modal, TextInput, Platform, KeyboardAvoidingView
} from 'react-native'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { STATUS_COLORS, STATUS_LABELS } from '../../lib/status'
import { CATEGORY_CONFIG, ScheduleCategory } from '../../types/database'
import { shadow } from '../../lib/shadows'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'

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
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
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

  const fetchSchedule = async () => {
    const [scheduleRes, attendanceRes] = await Promise.all([
      supabase
        .from('schedules')
        .select(`
          id, title, date, time, category, notes, series_id,
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
    if (error) Alert.alert('Błąd', error.message)
    else fetchSchedule()
  }

  const handleToggleAttendance = async (profileId: string) => {
    setTogglingAttendance(profileId)
    const assignment = schedule?.assignments.find(a => a.profile_id === profileId)
    if (attendanceIds.has(profileId)) {
      const { error } = await supabase.from('attendance').delete().eq('schedule_id', id).eq('profile_id', profileId)
      if (error) { Alert.alert('Błąd', error.message); setTogglingAttendance(null); return }
      setAttendanceIds(prev => { const s = new Set(prev); s.delete(profileId); return s })
      if (assignment && ['assigned', 'present'].includes(assignment.status)) {
        await handleChangeStatus(assignment.id, 'absent')
      }
    } else {
      const { error } = await supabase.from('attendance').insert({
        schedule_id: id, profile_id: profileId, method: 'manual',
        checked_at: new Date().toISOString(), marked_by: adminProfile?.id,
        parish_id: adminProfile?.parish_id,
      })
      if (error) { Alert.alert('Błąd', error.message); setTogglingAttendance(null); return }
      setAttendanceIds(prev => new Set([...prev, profileId]))
      if (assignment && assignment.status !== 'present') {
        await handleChangeStatus(assignment.id, 'present')
      }
    }
    setTogglingAttendance(null)
  }

  const openAddModal = async () => {
    const { data } = await supabase
      .from('profiles').select('id, full_name')
      .eq('role', 'member').eq('is_active', true).order('full_name')
    setAllMembers(data ?? [])
    setAddSearch('')
    setAddModalVisible(true)
  }

  const handleAdd = async (member: MemberOption) => {
    if (!schedule) return
    setAdding(true)
    const { error } = await supabase.from('schedule_assignments').insert({
      schedule_id: schedule.id, profile_id: member.id, role: 'ministrant', status: 'assigned',
    })
    setAdding(false)
    if (error) Alert.alert('Błąd', error.message)
    else { setAddModalVisible(false); fetchSchedule() }
  }

  const handleRemove = (assignmentId: string, name: string) => {
    Alert.alert('Usuń zapis', `Usunąć zapis ${name} z tej służby?`, [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń', style: 'destructive', onPress: async () => {
          setUpdatingId(assignmentId)
          const { error } = await supabase.from('schedule_assignments').delete().eq('id', assignmentId)
          setUpdatingId(null)
          if (error) { Alert.alert('Błąd', error.message); return }
          fetchSchedule()
        },
      },
    ])
  }

  const doDeleteSchedule = async () => {
    setDeleting(true)
    const { error } = await supabase.from('schedules').delete().eq('id', id)
    setDeleting(false)
    if (error) { Alert.alert('Błąd', error.message); return }
    router.back()
  }

  const doDeleteSeries = async () => {
    if (!schedule?.series_id) return
    setDeleting(true)
    const { error } = await supabase.from('schedules').delete().eq('series_id', schedule.series_id)
    setDeleting(false)
    if (error) { Alert.alert('Błąd', error.message); return }
    router.replace('/(admin)/(admin-tabs)/schedules')
  }

  const confirmDeleteSchedule = () => {
    setDeleteSheetVisible(false)
    if (Platform.OS === 'web') {
      if (window.confirm('Usunąć tę służbę?')) doDeleteSchedule()
    } else {
      Alert.alert('Usuń służbę', 'Usunąć tę służbę? Operacja jest nieodwracalna.', [
        { text: 'Anuluj', style: 'cancel' },
        { text: 'Usuń', style: 'destructive', onPress: doDeleteSchedule },
      ])
    }
  }

  const confirmDeleteSeries = () => {
    setDeleteSheetVisible(false)
    if (Platform.OS === 'web') {
      if (window.confirm('Usunąć całą serię? Wszystkie terminy zostaną trwale usunięte.')) doDeleteSeries()
    } else {
      Alert.alert('Usuń całą serię', 'Wszystkie terminy z tej serii zostaną trwale usunięte.', [
        { text: 'Anuluj', style: 'cancel' },
        { text: 'Usuń wszystkie', style: 'destructive', onPress: doDeleteSeries },
      ])
    }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={c.primary} /></View>
  }

  if (!schedule) {
    return <View style={styles.center}><Text style={{ color: c.subtext }}>Nie znaleziono służby</Text></View>
  }

  const assignedIds = new Set(schedule.assignments.map(a => a.profile_id))
  const filteredMembers = allMembers.filter(
    m => !assignedIds.has(m.id) && m.full_name.toLowerCase().includes(addSearch.toLowerCase())
  )

  const dateStr = new Date(schedule.date + 'T12:00:00').toLocaleDateString('pl-PL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  const cat = CATEGORY_CONFIG[schedule.category] ?? CATEGORY_CONFIG.msza
  const presentCount = attendanceIds.size
  const totalCount = schedule.assignments.length

  return (
    <>
      <Stack.Screen options={{
        title: schedule.title,
        headerRight: () => (
          deleting
            ? <ActivityIndicator size="small" color="#fff" style={{ marginRight: 4 }} />
            : <TouchableOpacity onPress={() => setDeleteSheetVisible(true)} hitSlop={12} style={{ marginRight: 4 }}>
                <Ionicons name="trash-outline" size={22} color="#fff" />
              </TouchableOpacity>
        ),
      }} />

      <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) }]}>

        {/* Info card */}
        <View style={[styles.infoCard, { borderLeftWidth: 4, borderLeftColor: cat.color }]}>
          <View style={styles.categoryBadge}>
            <View style={[styles.categoryDot, { backgroundColor: cat.color }]} />
            <Text style={[styles.categoryBadgeText, { color: cat.color }]}>{cat.label}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={15} color={c.subtext} />
            <Text style={styles.infoText}>{dateStr}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={15} color={c.subtext} />
            <Text style={styles.infoText}>{schedule.time?.slice(0, 5)}</Text>
          </View>
          {schedule.notes && (
            <View style={styles.infoRow}>
              <Ionicons name="document-text-outline" size={15} color={c.subtext} />
              <Text style={styles.infoText}>{schedule.notes}</Text>
            </View>
          )}
          {schedule.series_id && (
            <View style={[styles.infoRow, styles.seriesRow]}>
              <Ionicons name="list-outline" size={15} color={c.primary} />
              <Text style={styles.seriesText}>Część serii nabożeństw</Text>
            </View>
          )}
        </View>

        {/* Attendance summary */}
        <View style={styles.attendanceCard}>
          <View style={styles.attendanceStat}>
            <Text style={styles.attendanceNum}>{totalCount}</Text>
            <Text style={styles.attendanceLabel}>Zapisanych</Text>
          </View>
          <View style={styles.attendanceDivider} />
          <View style={styles.attendanceStat}>
            <Text style={[styles.attendanceNum, { color: '#16A34A' }]}>{presentCount}</Text>
            <Text style={styles.attendanceLabel}>Obecnych</Text>
          </View>
          <View style={styles.attendanceDivider} />
          <View style={styles.attendanceStat}>
            <Text style={[styles.attendanceNum, { color: '#EA580C' }]}>{totalCount - presentCount}</Text>
            <Text style={styles.attendanceLabel}>Nieobecnych</Text>
          </View>
        </View>

        {/* Assignments section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Ministranci</Text>
          <TouchableOpacity style={styles.addMemberBtn} onPress={openAddModal}>
            <Ionicons name="person-add-outline" size={15} color={c.primary} />
            <Text style={styles.addMemberText}>Dodaj</Text>
          </TouchableOpacity>
        </View>

        {schedule.assignments.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={44} color="#E5E7EB" />
            <Text style={styles.emptyTitle}>Nikt się jeszcze nie zapisał</Text>
            <Text style={styles.emptySubtitle}>Ministranci mogą się zapisać w aplikacji</Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {schedule.assignments.map(a => (
              <View key={a.id} style={styles.assignmentCard}>
                <View style={styles.assigneeLeft}>
                  <View style={styles.avatar}>
                    <Ionicons name="person" size={18} color={c.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.assigneeName}>{a.profile.full_name}</Text>
                    {a.profile.phone && <Text style={styles.assigneePhone}>{a.profile.phone}</Text>}
                    {(a.status === 'excused' || a.status === 'confirmed') && a.absence_reason && (
                      <View style={styles.absenceRow}>
                        <Ionicons name="chatbubble-outline" size={11} color="#DC2626" />
                        <Text style={styles.absenceText}>{a.absence_reason}</Text>
                      </View>
                    )}
                  </View>
                </View>

                <View style={styles.assigneeRight}>
                  <TouchableOpacity onPress={() => setStatusModalAssignment(a)} disabled={updatingId === a.id}>
                    <View style={[styles.statusPill, { backgroundColor: (STATUS_COLORS[a.status] ?? c.subtext) + '22' }]}>
                      <Text style={[styles.statusText, { color: STATUS_COLORS[a.status] ?? c.subtext }]}>
                        {STATUS_LABELS[a.status] ?? a.status}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <View style={styles.btnRow}>
                    {togglingAttendance === a.profile_id ? (
                      <ActivityIndicator size="small" color="#16A34A" />
                    ) : (
                      <TouchableOpacity onPress={() => handleToggleAttendance(a.profile_id)} hitSlop={8}>
                        <Ionicons
                          name={attendanceIds.has(a.profile_id) ? 'checkmark-circle' : 'ellipse-outline'}
                          size={24}
                          color={attendanceIds.has(a.profile_id) ? '#16A34A' : '#D1D5DB'}
                        />
                      </TouchableOpacity>
                    )}
                    {updatingId === a.id ? (
                      <ActivityIndicator size="small" color={c.primary} />
                    ) : (
                      <TouchableOpacity onPress={() => handleRemove(a.id, a.profile.full_name)} hitSlop={8}>
                        <Ionicons name="trash-outline" size={22} color="#DC2626" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Status modal */}
      <Modal visible={!!statusModalAssignment} transparent animationType="slide" onRequestClose={() => setStatusModalAssignment(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setStatusModalAssignment(null)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Zmień status</Text>
                <Text style={styles.modalSubtitle}>{statusModalAssignment?.profile.full_name}</Text>
              </View>
              <TouchableOpacity onPress={() => setStatusModalAssignment(null)} hitSlop={8}>
                <Ionicons name="close" size={24} color={c.subtext} />
              </TouchableOpacity>
            </View>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <TouchableOpacity
                key={key}
                style={styles.statusOption}
                onPress={async () => {
                  if (statusModalAssignment && statusModalAssignment.status !== key) {
                    await handleChangeStatus(statusModalAssignment.id, key)
                  }
                  setStatusModalAssignment(null)
                }}
              >
                <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[key] }]} />
                <Text style={[styles.statusOptionText, statusModalAssignment?.status === key && { fontWeight: '700', color: STATUS_COLORS[key] }]}>
                  {label}
                </Text>
                {statusModalAssignment?.status === key && <Ionicons name="checkmark" size={18} color={STATUS_COLORS[key]} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Add member modal */}
      <Modal visible={addModalVisible} transparent animationType="slide" onRequestClose={() => setAddModalVisible(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Dodaj ministranta</Text>
                <TouchableOpacity onPress={() => setAddModalVisible(false)} hitSlop={8}>
                  <Ionicons name="close" size={24} color={c.subtext} />
                </TouchableOpacity>
              </View>
              <View style={styles.searchBox}>
                <Ionicons name="search-outline" size={16} color={c.textTertiary} />
                <TextInput
                  style={styles.searchInput} placeholder="Szukaj po imieniu..." placeholderTextColor={c.textTertiary}
                  value={addSearch} onChangeText={setAddSearch} autoFocus
                />
              </View>
              <ScrollView style={styles.memberList} keyboardShouldPersistTaps="handled">
                {filteredMembers.length === 0 ? (
                  <View style={{ padding: 20, alignItems: 'center' }}>
                    <Text style={{ color: c.textTertiary }}>
                      {allMembers.length === assignedIds.size ? 'Wszyscy ministranci są już zapisani' : 'Brak wyników'}
                    </Text>
                  </View>
                ) : (
                  filteredMembers.map(m => (
                    <TouchableOpacity key={m.id} style={styles.memberRow} onPress={() => handleAdd(m)} disabled={adding}>
                      <View style={styles.memberAvatar}>
                        <Ionicons name="person" size={15} color={c.primary} />
                      </View>
                      <Text style={styles.memberName}>{m.full_name}</Text>
                      {adding ? <ActivityIndicator size="small" color={c.primary} /> : <Ionicons name="add-circle-outline" size={20} color={c.primary} />}
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Delete sheet */}
      <Modal visible={deleteSheetVisible} transparent animationType="slide" onRequestClose={() => setDeleteSheetVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setDeleteSheetVisible(false)}>
          <TouchableOpacity style={styles.deleteSheet} activeOpacity={1}>
            <View style={styles.deleteSheetHandle} />
            <Text style={styles.deleteSheetTitle}>{schedule?.title}</Text>
            <Text style={styles.deleteSheetSub}>
              {new Date((schedule?.date ?? '') + 'T12:00:00').toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}
              {'  ·  '}{schedule?.time?.slice(0, 5)}
            </Text>

            <TouchableOpacity style={styles.deleteOption} onPress={confirmDeleteSchedule}>
              <View style={styles.deleteOptionIcon}>
                <Ionicons name="trash-outline" size={20} color="#DC2626" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.deleteOptionTitle}>Usuń tę służbę</Text>
                <Text style={styles.deleteOptionSub}>Usuwa tylko ten jeden termin</Text>
              </View>
            </TouchableOpacity>

            {schedule?.series_id && (
              <TouchableOpacity style={[styles.deleteOption, styles.deleteOptionSeriesCard]} onPress={confirmDeleteSeries}>
                <View style={[styles.deleteOptionIcon, { backgroundColor: '#c0392b18' }]}>
                  <Ionicons name="trash" size={20} color="#c0392b" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.deleteOptionTitle, { color: '#c0392b' }]}>Usuń całą serię</Text>
                  <Text style={styles.deleteOptionSub}>Usuwa wszystkie terminy z tej serii</Text>
                </View>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.deleteCancelBtn} onPress={() => setDeleteSheetVisible(false)}>
              <Text style={styles.deleteCancelText}>Anuluj</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    content: { padding: 16, gap: 12 },

    infoCard: {
      backgroundColor: c.surface, borderRadius: 14, padding: 16, gap: 10,
      ...shadow.md,
    },
    categoryBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
    categoryDot: { width: 8, height: 8, borderRadius: 4 },
    categoryBadgeText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    infoText: { fontSize: 14, color: c.subtext, flex: 1, lineHeight: 20 },
    seriesRow: { paddingTop: 6, marginTop: 4, borderTopWidth: 1, borderTopColor: c.primarySurface },
    seriesText: { flex: 1, fontSize: 13, color: c.primary },

    attendanceCard: {
      backgroundColor: c.surface, borderRadius: 14, padding: 16,
      flexDirection: 'row', alignItems: 'center',
      ...shadow.md,
    },
    attendanceStat: { flex: 1, alignItems: 'center', gap: 2 },
    attendanceNum: { fontSize: 26, fontWeight: '800', color: c.text },
    attendanceLabel: { fontSize: 11, color: c.subtext },
    attendanceDivider: { width: 1, height: 36, backgroundColor: c.primarySurface },

    sectionHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: c.text },
    addMemberBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: c.primaryAlpha08, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
      borderWidth: 1, borderColor: c.primaryAlpha20,
    },
    addMemberText: { fontSize: 13, fontWeight: '600', color: c.primary },

    empty: { alignItems: 'center', gap: 8, paddingVertical: 32 },
    emptyTitle: { fontSize: 15, fontWeight: '600', color: c.textTertiary },
    emptySubtitle: { fontSize: 13, color: c.iconMuted, textAlign: 'center' },

    assignmentCard: {
      backgroundColor: c.surface, borderRadius: 12, padding: 12,
      flexDirection: 'row', alignItems: 'center', gap: 10,
      ...shadow.xs,
    },
    assigneeLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.primaryAlpha08, justifyContent: 'center', alignItems: 'center' },
    assigneeName: { fontSize: 14, fontWeight: '600', color: c.text },
    assigneePhone: { fontSize: 12, color: c.subtext, marginTop: 1 },
    absenceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 3 },
    absenceText: { fontSize: 11, color: c.danger, fontStyle: 'italic', flex: 1 },
    assigneeRight: { alignItems: 'flex-end', gap: 6 },
    statusPill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    statusText: { fontSize: 11, fontWeight: '600' },
    btnRow: { flexDirection: 'row', gap: 6 },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    modalSheet: { backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '75%' },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
    modalTitle: { fontSize: 17, fontWeight: '700', color: c.text },
    modalSubtitle: { fontSize: 13, color: c.subtext, marginTop: 2 },
    statusOption: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.primarySurface,
    },
    statusOptionText: { flex: 1, fontSize: 15, color: c.text },
    statusDot: { width: 10, height: 10, borderRadius: 5 },
    searchBox: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.bg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 10,
    },
    searchInput: { flex: 1, fontSize: 15, color: c.text },
    memberList: { maxHeight: 340 },
    memberRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
      borderBottomWidth: 1, borderBottomColor: c.primarySurface,
    },
    memberAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: c.primaryAlpha08, justifyContent: 'center', alignItems: 'center' },
    memberName: { flex: 1, fontSize: 15, color: c.text, fontWeight: '500' },

    deleteSheet: {
      backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
      padding: 20, paddingBottom: 32, gap: 4,
    },
    deleteSheetHandle: {
      width: 36, height: 4, borderRadius: 2, backgroundColor: c.border,
      alignSelf: 'center', marginBottom: 16,
    },
    deleteSheetTitle: { fontSize: 17, fontWeight: '700', color: c.text, marginBottom: 2 },
    deleteSheetSub: { fontSize: 13, color: c.subtext, marginBottom: 16 },
    deleteOption: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      backgroundColor: c.danger + '08', borderRadius: 14, padding: 14, marginBottom: 8,
    },
    deleteOptionSeriesCard: { backgroundColor: c.danger + '08' },
    deleteOptionIcon: {
      width: 40, height: 40, borderRadius: 12,
      backgroundColor: c.danger + '18', justifyContent: 'center', alignItems: 'center',
    },
    deleteOptionTitle: { fontSize: 15, fontWeight: '600', color: c.danger },
    deleteOptionSub: { fontSize: 12, color: c.textTertiary, marginTop: 2 },
    deleteCancelBtn: {
      marginTop: 4, paddingVertical: 14, borderRadius: 14,
      backgroundColor: c.bg, alignItems: 'center',
    },
    deleteCancelText: { fontSize: 15, fontWeight: '600', color: c.subtext },
  })
}
