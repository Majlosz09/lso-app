import React, { useEffect, useMemo, useState } from 'react'
import {
  View, Text, FlatList, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { shadow } from '../../lib/shadows'
import { useAuthStore } from '../../stores/authStore'
import { STATUS_COLORS, STATUS_LABELS } from '../../lib/status'
import { CATEGORY_CONFIG, ScheduleCategory, AssignmentStatus } from '../../types/database'
import { useRealtimeTable } from '../../hooks/useRealtimeTable'

function isCheckInWindowOpen(schedule: any): boolean {
  if (!schedule.time) return false
  const massStart = new Date(`${schedule.date}T${schedule.time.slice(0, 5)}`)
  const windowOpen  = new Date(massStart.getTime() - 30 * 60 * 1000)
  const windowClose = new Date(massStart.getTime() + 90 * 60 * 1000)
  const now = new Date()
  return now >= windowOpen && now <= windowClose
}

const DAY_SHORT = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb']

function getWeekDays(weekOffset: number): string[] {
  const today = new Date()
  const dow = today.getDay()
  const daysToMonday = dow === 0 ? -6 : 1 - dow
  const monday = new Date(today)
  monday.setDate(today.getDate() + daysToMonday + weekOffset * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d.toISOString().split('T')[0]
  })
}

function isSunday(dateStr: string): boolean {
  return new Date(dateStr + 'T12:00:00').getDay() === 0
}

function formatDateHeader(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })
}

export default function ScheduleScreen() {
  const { profile } = useAuthStore()
  if (profile?.role === 'parent') return <ParentScheduleView />
  return <MemberScheduleView />
}

function ParentScheduleView() {
  const { profile } = useAuthStore()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const today = new Date().toISOString().split('T')[0]

  const fetchData = async () => {
    if (!profile?.id) return
    const { data: children } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('parent_id', profile.id)

    if (!children || children.length === 0) {
      setItems([])
      setLoading(false)
      setRefreshing(false)
      return
    }

    const childMap = new Map(children.map((c: any) => [c.id, c.full_name]))
    const childIds = children.map((c: any) => c.id)

    const { data } = await supabase
      .from('schedule_assignments')
      .select(`
        id, status, profile_id,
        schedule:schedules(id, title, date, time, group:groups(name))
      `)
      .in('profile_id', childIds)

    if (data) {
      setItems(
        data
          .map((a: any) => ({
            ...a.schedule,
            assignmentId: a.id,
            childName: childMap.get(a.profile_id) ?? '?',
            myStatus: a.status,
          }))
          .filter((s: any) => s?.id && s.date >= today)
          .sort((a: any, b: any) => a.date.localeCompare(b.date))
      )
    }
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => { fetchData() }, [profile?.id])

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#534AB7" /></View>
  }

  return (
    <FlatList
      data={items}
      keyExtractor={item => item.assignmentId}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData() }} />}
      ListHeaderComponent={
        <Text style={styles.parentHeader}>Nadchodzące dyżury dzieci</Text>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name="calendar-outline" size={48} color="#ccc" />
          <Text style={styles.emptyText}>Brak nadchodzących dyżurów</Text>
        </View>
      }
      renderItem={({ item }) => <ChildScheduleCard schedule={item} />}
      contentContainerStyle={{ padding: 16, gap: 12 }}
    />
  )
}

function ChildScheduleCard({ schedule }: { schedule: any }) {

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{schedule.title}</Text>
        <View style={[styles.pill, { backgroundColor: (STATUS_COLORS[schedule.myStatus] ?? '#888') + '22' }]}>
          <Text style={[styles.pillText, { color: STATUS_COLORS[schedule.myStatus] ?? '#888' }]}>
            {STATUS_LABELS[schedule.myStatus] ?? schedule.myStatus}
          </Text>
        </View>
      </View>
      <View style={[styles.row, { marginBottom: 2 }]}>
        <Ionicons name="person-outline" size={14} color="#534AB7" />
        <Text style={[styles.cardMeta, { color: '#534AB7', fontWeight: '600' }]}>{schedule.childName}</Text>
      </View>
      <MetaRow icon="calendar-outline" text={
        new Date(schedule.date + 'T12:00:00').toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })
      } />
      <MetaRow icon="time-outline" text={schedule.time?.slice(0, 5)} />
      {schedule.group && <MetaRow icon="people-outline" text={schedule.group.name} color="#534AB7" />}
    </View>
  )
}

interface WeekStripProps {
  weekDays: string[]
  selectedDate: string
  onSelect: (date: string) => void
  onPrev: () => void
  onNext: () => void
  eventDates: Set<string>
}

function WeekStrip({ weekDays, selectedDate, onSelect, onPrev, onNext, eventDates }: WeekStripProps) {
  const today = new Date().toISOString().split('T')[0]
  return (
    <View style={styles.weekStripContainer}>
      <TouchableOpacity onPress={onPrev} style={styles.weekArrow} hitSlop={8}>
        <Ionicons name="chevron-back" size={20} color="#534AB7" />
      </TouchableOpacity>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.weekDaysScroll}>
        {weekDays.map(date => {
          const d = new Date(date + 'T12:00:00')
          const isSelected = date === selectedDate
          const isToday = date === today
          const hasEvents = eventDates.has(date)
          return (
            <TouchableOpacity key={date} onPress={() => onSelect(date)}
              style={styles.dayPill} activeOpacity={0.7}>
              <Text style={[styles.dayPillLabel, isSelected && { color: '#534AB7' }]}>
                {DAY_SHORT[d.getDay()]}
              </Text>
              <View style={[
                styles.dayPillCircle,
                isSelected && styles.dayPillSelected,
                isToday && !isSelected && styles.dayPillToday,
              ]}>
                <Text style={[
                  styles.dayPillNum,
                  isSelected && { color: '#fff', fontWeight: '800' },
                  isToday && !isSelected && { color: '#534AB7', fontWeight: '700' },
                ]}>
                  {d.getDate()}
                </Text>
              </View>
              {hasEvents
                ? <View style={[styles.dayPillDot, isSelected && { backgroundColor: '#fff' }]} />
                : <View style={styles.dayPillDotEmpty} />
              }
            </TouchableOpacity>
          )
        })}
      </ScrollView>
      <TouchableOpacity onPress={onNext} style={styles.weekArrow} hitSlop={8}>
        <Ionicons name="chevron-forward" size={20} color="#534AB7" />
      </TouchableOpacity>
    </View>
  )
}

interface ScheduleTileProps {
  schedule: any
  checkingIn: boolean
  signingUp: boolean
  unsigning: boolean
  reporting: boolean
  onCheckIn: () => void
  onSignUp: () => void
  onUnsign: () => void
  onReportAbsence: () => void
}

function ScheduleTile({
  schedule, checkingIn, signingUp, unsigning, reporting,
  onCheckIn, onSignUp, onUnsign, onReportAbsence,
}: ScheduleTileProps) {
  const assignment = schedule.assignment
  const alreadyCheckedIn = schedule.hasAttendance || assignment?.status === 'present'
  const windowOpen = isCheckInWindowOpen(schedule)
  const isSun = isSunday(schedule.date)
  const cat = schedule.category as ScheduleCategory
  const cfg = CATEGORY_CONFIG[cat]
  const status: AssignmentStatus | undefined = assignment?.status

  // Border color: colored border only when window is open and not yet checked in
  let borderColor = '#eee'
  if (!isSun && windowOpen && !alreadyCheckedIn) {
    borderColor = (cat === 'msza' && assignment) ? '#27ae60' : '#534AB7'
  }

  // Determine the primary action button
  let actionButton: React.ReactElement | null = null

  if (alreadyCheckedIn) {
    // No button — badge OBECNY shown in badges section below
  } else if (isSun) {
    // No action for Sunday masses
  } else if (cat === 'msza') {
    if (windowOpen) {
      const isAssigned = !!assignment
      actionButton = (
        <TouchableOpacity
          style={[styles.tileBtn, { backgroundColor: isAssigned ? '#27ae60' : '#534AB7' }]}
          onPress={onCheckIn}
          disabled={checkingIn}
        >
          {checkingIn
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.tileBtnText}>Obecny</Text>
          }
        </TouchableOpacity>
      )
    } else if (!status || status === 'assigned') {
      if (assignment) {
        actionButton = (
          <TouchableOpacity
            style={[styles.tileBtn, styles.tileBtnOutline]}
            onPress={onUnsign}
            disabled={unsigning}
          >
            {unsigning
              ? <ActivityIndicator size="small" color="#e67e22" />
              : <Text style={[styles.tileBtnText, { color: '#e67e22' }]}>Wypisz się</Text>
            }
          </TouchableOpacity>
        )
      } else {
        actionButton = (
          <TouchableOpacity
            style={[styles.tileBtn, styles.tileBtnSecondary]}
            onPress={onSignUp}
            disabled={signingUp}
          >
            {signingUp
              ? <ActivityIndicator size="small" color="#534AB7" />
              : <Text style={[styles.tileBtnText, { color: '#534AB7' }]}>Zapisz się</Text>
            }
          </TouchableOpacity>
        )
      }
    }
  } else {
    // nabozenstwo or zbiorka
    if (windowOpen) {
      actionButton = (
        <TouchableOpacity
          style={[styles.tileBtn, { backgroundColor: '#534AB7' }]}
          onPress={onCheckIn}
          disabled={checkingIn}
        >
          {checkingIn
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.tileBtnText}>Obecny</Text>
          }
        </TouchableOpacity>
      )
    }
  }

  return (
    <View style={[styles.schedTile, { borderColor }]}>
      <View style={styles.schedTileTop}>
        <View style={styles.schedTileLeft}>
          <View style={styles.schedTileTitleRow}>
            <Text style={styles.schedTileTitle}>{schedule.title}</Text>
            <View style={[styles.catBadge, { backgroundColor: cfg.bg }]}>
              <Text style={[styles.catBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
          </View>
          <View style={styles.schedTileMeta}>
            {schedule.time && (
              <MetaRow icon="time-outline" text={schedule.time.slice(0, 5)} />
            )}
            {schedule.group?.name && (
              <MetaRow icon="people-outline" text={schedule.group.name} color="#534AB7" />
            )}
          </View>
          {/* Status badges */}
          <View style={styles.badgeRow}>
            {alreadyCheckedIn && (
              <View style={[styles.pill, { backgroundColor: '#27ae6022' }]}>
                <Text style={[styles.pillText, { color: '#27ae60' }]}>OBECNY</Text>
              </View>
            )}
            {!alreadyCheckedIn && assignment && (
              <View style={[styles.pill, { backgroundColor: '#27ae6022' }]}>
                <Text style={[styles.pillText, { color: '#27ae60' }]}>DYŻUR</Text>
              </View>
            )}
            {status && !['assigned', 'present'].includes(status) && (
              <View style={[styles.pill, { backgroundColor: (STATUS_COLORS[status] ?? '#888') + '22' }]}>
                <Text style={[styles.pillText, { color: STATUS_COLORS[status] ?? '#888' }]}>
                  {STATUS_LABELS[status] ?? status}
                </Text>
              </View>
            )}
            {assignment?.admin_note && (
              <View style={[styles.pill, { backgroundColor: '#e74c3c22' }]}>
                <Text style={[styles.pillText, { color: '#e74c3c' }]}>
                  {assignment.admin_note}
                </Text>
              </View>
            )}
          </View>
        </View>
        {actionButton && <View style={styles.schedTileAction}>{actionButton}</View>}
      </View>
      {/* Absence reporting for assigned tiles */}
      {assignment && !alreadyCheckedIn && !windowOpen && !['excused', 'absent', 'confirmed'].includes(status ?? '') && (
        <TouchableOpacity style={styles.absenceLink} onPress={onReportAbsence} disabled={reporting}>
          <Text style={styles.absenceLinkText}>Zgłoś nieobecność</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

function MemberScheduleView() {
  const { profile } = useAuthStore()
  const today = new Date().toISOString().split('T')[0]

  // Week navigation
  const [weekOffset, setWeekOffset] = useState(0)
  const [weekDays, setWeekDays] = useState<string[]>(() => getWeekDays(0))
  const [selectedDate, setSelectedDate] = useState<string>(today)

  // Unified schedule data
  const [weekSchedules, setWeekSchedules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Action states
  const [checkingInId, setCheckingInId] = useState<string | null>(null)
  const [signingUpId, setSigningUpId] = useState<string | null>(null)
  const [unsigningId, setUnsigningId] = useState<string | null>(null)
  const [reportingAbsenceId, setReportingAbsenceId] = useState<string | null>(null)
  const [absenceModal, setAbsenceModal] = useState<{
    visible: boolean; assignmentId: string; title: string; reason: string
  }>({ visible: false, assignmentId: '', title: '', reason: '' })

  // History
  const [pastAssignments, setPastAssignments] = useState<any[]>([])
  const [historyExpanded, setHistoryExpanded] = useState(false)

  useEffect(() => {
    const days = getWeekDays(weekOffset)
    setWeekDays(days)
    if (!days.includes(selectedDate)) setSelectedDate(days[0])
  }, [weekOffset])

  const fetchWeekSchedules = async (days: string[] = weekDays) => {
    if (!profile?.id || !profile?.parish_id || days.length === 0) return
    const [weekStart, weekEnd] = [days[0], days[days.length - 1]]

    const [schedulesRes, assignmentsRes] = await Promise.all([
      supabase
        .from('schedules')
        .select('*, group:groups(name)')
        .eq('parish_id', profile.parish_id)
        .gte('date', weekStart)
        .lte('date', weekEnd)
        .order('date').order('time'),
      supabase
        .from('schedule_assignments')
        .select('id, schedule_id, status, absence_reason, admin_note')
        .eq('profile_id', profile.id),
    ])

    const scheduleIds = (schedulesRes.data ?? []).map((s: any) => s.id)
    let attendanceSet = new Set<string>()
    if (scheduleIds.length > 0) {
      const { data: attData } = await supabase
        .from('attendance')
        .select('schedule_id')
        .eq('profile_id', profile.id)
        .in('schedule_id', scheduleIds)
      attendanceSet = new Set((attData ?? []).map((a: any) => a.schedule_id))
    }

    const assignmentMap = new Map(
      (assignmentsRes.data ?? []).map((a: any) => [a.schedule_id, a])
    )

    setWeekSchedules(
      (schedulesRes.data ?? []).map((s: any) => ({
        ...s,
        assignment: assignmentMap.get(s.id) ?? null,
        hasAttendance: attendanceSet.has(s.id),
      }))
    )
    setLoading(false)
    setRefreshing(false)
  }

  const fetchPastAssignments = async () => {
    if (!profile?.id) return
    const { data: assignments } = await supabase
      .from('schedule_assignments')
      .select('id, status, schedule_id, absence_reason, admin_note')
      .eq('profile_id', profile.id)
    if (!assignments?.length) { setPastAssignments([]); return }

    const { data: schedules } = await supabase
      .from('schedules')
      .select('id, title, date, time, category, group:groups(name)')
      .in('id', assignments.map((a: any) => a.schedule_id))
      .lt('date', today)
      .order('date', { ascending: false })
      .limit(30)

    const aMap = new Map(assignments.map((a: any) => [a.schedule_id, a]))
    setPastAssignments(
      (schedules ?? []).map((s: any) => ({
        ...s,
        assignment: aMap.get(s.id) ?? null,
        hasAttendance: false,
      }))
    )
  }

  useEffect(() => {
    fetchWeekSchedules(weekDays)
    fetchPastAssignments()
  }, [profile?.id, weekDays])

  useRealtimeTable('schedule_assignments', () => {
    fetchWeekSchedules(weekDays)
    fetchPastAssignments()
  })

  // --- Handlers ---

  const handleCheckIn = async (schedule: any) => {
    setCheckingInId(schedule.id)
    const assignmentId = schedule.assignment?.id ?? null
    const { data, error } = await supabase.rpc('check_in_and_award_points', {
      p_schedule_id: schedule.id,
      p_assignment_id: assignmentId,
    })
    setCheckingInId(null)
    if (error) { Alert.alert('Błąd', error.message); return }
    const result = data as any
    if (result.already_checked_in) {
      Alert.alert('', 'Obecność już zaznaczona.')
    } else if (result.points_awarded > 0) {
      Alert.alert('', `+${result.points_awarded} pkt — ${result.reason}`)
    } else {
      Alert.alert('', 'Obecność zaznaczona.')
    }
    fetchWeekSchedules(weekDays)
  }

  const handleSignUp = (schedule: any) => {
    Alert.alert(
      'Zapisz się',
      `${schedule.title}\n${formatDateHeader(schedule.date)}, ${schedule.time?.slice(0, 5)}`,
      [
        { text: 'Anuluj', style: 'cancel' },
        { text: 'Jednorazowo', onPress: () => doSignUp(schedule.id, schedule.date, schedule.time?.slice(0, 5), 'once') },
        { text: 'Cyklicznie', onPress: () => doSignUp(schedule.id, schedule.date, schedule.time?.slice(0, 5), 'recurring') },
      ]
    )
  }

  const doSignUp = async (scheduleId: string, date: string, timeSlot: string, mode: 'once' | 'recurring') => {
    const key = `${date}_${timeSlot}`
    setSigningUpId(key)
    const { data, error } = await supabase.rpc('sign_up_for_slot', {
      p_date: date,
      p_time_label: timeSlot,
      p_mode: mode,
    })
    setSigningUpId(null)
    if (error) { Alert.alert('Błąd', error.message); return }
    if (mode === 'recurring') {
      const dow = new Date(date + 'T12:00:00').getDay()
      const DAY_FULL_LOCAL = ['Niedzielę', 'Poniedziałek', 'Wtorek', 'Środę', 'Czwartek', 'Piątek', 'Sobotę']
      Alert.alert('Cykl aktywny',
        `Zapisano cyklicznie na każd${dow === 0 || dow === 3 || dow === 6 ? 'ą' : 'y'} ${DAY_FULL_LOCAL[dow]} o ${timeSlot}. Objęto ${(data as any)?.count ?? 1} służb.`
      )
    }
    fetchWeekSchedules(weekDays)
  }

  const unsignOne = async (assignmentId: string) => {
    setUnsigningId(assignmentId)
    await supabase.from('schedule_assignments').delete().eq('id', assignmentId)
    setUnsigningId(null)
    fetchWeekSchedules(weekDays)
  }

  const unsignCycle = async (assignmentId: string, commitmentId: string) => {
    setUnsigningId(assignmentId)
    await Promise.all([
      supabase.from('schedule_assignments').delete().eq('id', assignmentId),
      supabase.from('recurring_commitments').delete().eq('id', commitmentId),
    ])
    setUnsigningId(null)
    fetchWeekSchedules(weekDays)
  }

  const handleUnsign = async (schedule: any) => {
    const a = schedule.assignment
    if (!a) return
    const dow = new Date(schedule.date + 'T12:00:00').getDay()
    const timeSlot = schedule.time?.slice(0, 5)
    const { data: commitment } = await supabase
      .from('recurring_commitments')
      .select('id')
      .eq('profile_id', profile!.id)
      .eq('day_of_week', dow)
      .eq('time_slot', timeSlot)
      .maybeSingle()
    if (commitment) {
      Alert.alert('Wypisz się', `Ten dyżur jest częścią cyklu. Co chcesz zrobić?`, [
        { text: 'Anuluj', style: 'cancel' },
        { text: 'Tylko tę służbę', onPress: () => unsignOne(a.id) },
        { text: 'Cały cykl', style: 'destructive', onPress: () => unsignCycle(a.id, commitment.id) },
      ])
    } else {
      Alert.alert('Wypisz się', `Wypisać się ze służby "${schedule.title}"?`, [
        { text: 'Anuluj', style: 'cancel' },
        { text: 'Wypisz', style: 'destructive', onPress: () => unsignOne(a.id) },
      ])
    }
  }

  const reportAbsence = async (assignmentId: string, reason: string) => {
    setReportingAbsenceId(assignmentId)
    const { error } = await supabase
      .from('schedule_assignments')
      .update({ status: 'excused', absence_reason: reason })
      .eq('id', assignmentId)
    setReportingAbsenceId(null)
    if (error) { Alert.alert('Błąd', error.message); return }
    setAbsenceModal({ visible: false, assignmentId: '', title: '', reason: '' })
    fetchWeekSchedules(weekDays)
  }

  // --- Derived data ---

  const eventDates = useMemo(
    () => new Set(weekSchedules.map((s: any) => s.date)),
    [weekSchedules]
  )

  const daySchedules = useMemo(
    () => weekSchedules.filter((s: any) => s.date === selectedDate),
    [weekSchedules, selectedDate]
  )

  // --- Render ---

  if (loading) {
    return (
      <View style={styles.container}>
        <WeekStrip
          weekDays={weekDays} selectedDate={selectedDate}
          onSelect={setSelectedDate}
          onPrev={() => setWeekOffset(o => o - 1)}
          onNext={() => setWeekOffset(o => o + 1)}
          eventDates={eventDates}
        />
        <View style={styles.center}><ActivityIndicator size="large" color="#534AB7" /></View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <WeekStrip
        weekDays={weekDays} selectedDate={selectedDate}
        onSelect={setSelectedDate}
        onPrev={() => setWeekOffset(o => o - 1)}
        onNext={() => setWeekOffset(o => o + 1)}
        eventDates={eventDates}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchWeekSchedules(weekDays) }}
          />
        }
      >
        <Text style={styles.dayHeader}>{formatDateHeader(selectedDate)}</Text>

        {daySchedules.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={40} color="#ccc" />
            <Text style={styles.emptyText}>Brak służb w tym dniu</Text>
          </View>
        ) : (
          daySchedules.map((schedule: any) => (
            <ScheduleTile
              key={schedule.id}
              schedule={schedule}
              checkingIn={checkingInId === schedule.id}
              signingUp={signingUpId === `${schedule.date}_${schedule.time?.slice(0, 5)}`}
              unsigning={unsigningId === schedule.assignment?.id}
              reporting={reportingAbsenceId === schedule.assignment?.id}
              onCheckIn={() => handleCheckIn(schedule)}
              onSignUp={() => handleSignUp(schedule)}
              onUnsign={() => handleUnsign(schedule)}
              onReportAbsence={() => setAbsenceModal({
                visible: true,
                assignmentId: schedule.assignment?.id ?? '',
                title: schedule.title,
                reason: '',
              })}
            />
          ))
        )}

        {/* Historia służb */}
        <TouchableOpacity
          style={styles.historiaToggle}
          onPress={() => setHistoryExpanded(e => !e)}
        >
          <Text style={styles.historiaTitleText}>Historia służb</Text>
          <Ionicons
            name={historyExpanded ? 'chevron-up' : 'chevron-down'}
            size={16} color="#888"
          />
        </TouchableOpacity>

        {historyExpanded && pastAssignments.map((schedule: any) => (
          <ScheduleTile
            key={schedule.id}
            schedule={schedule}
            checkingIn={false}
            signingUp={false}
            unsigning={false}
            reporting={false}
            onCheckIn={() => {}}
            onSignUp={() => {}}
            onUnsign={() => {}}
            onReportAbsence={() => {}}
          />
        ))}
      </ScrollView>

      {/* Absence modal */}
      <Modal visible={absenceModal.visible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Zgłoś nieobecność</Text>
            <Text style={styles.modalSubtitle}>{absenceModal.title}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Powód nieobecności..."
              placeholderTextColor="#aaa"
              multiline
              value={absenceModal.reason}
              onChangeText={r => setAbsenceModal(m => ({ ...m, reason: r }))}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setAbsenceModal({ visible: false, assignmentId: '', title: '', reason: '' })}
              >
                <Text style={styles.modalBtnCancelText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnSubmit]}
                onPress={() => reportAbsence(absenceModal.assignmentId, absenceModal.reason)}
                disabled={!absenceModal.reason.trim() || !!reportingAbsenceId}
              >
                {reportingAbsenceId
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.modalBtnSubmitText}>Zgłoś</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

function MetaRow({ icon, text, color = '#666' }: { icon: any; text: string; color?: string }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={[styles.cardMeta, { color }]}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  segmentBar: {
    flexDirection: 'row', margin: 16, marginBottom: 0,
    backgroundColor: '#e8e8e8', borderRadius: 10, padding: 3,
  },
  segment: {
    flex: 1, paddingVertical: 8, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: '#fff',
    ...shadow.md,
  },
  segmentText: { fontSize: 14, fontWeight: '500', color: '#888' },
  segmentTextActive: { color: '#1a1a1a' },

  empty: { alignItems: 'center', marginTop: 80, gap: 10 },
  emptyText: { color: '#aaa', fontSize: 16 },
  emptyLink: { color: '#534AB7', fontSize: 14, fontWeight: '500' },

  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 12, gap: 4,
    ...shadow.md,
  },
  cardSigned: { borderLeftWidth: 3, borderLeftColor: '#f0a500' },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 2,
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#1a1a1a', flex: 1 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
  },
  pillText: { fontSize: 12, fontWeight: '500' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardMeta: { fontSize: 13 },

  unsignBtn: { alignSelf: 'flex-end', marginTop: 6 },
  unsignText: { fontSize: 13, color: '#e74c3c', fontWeight: '500' },

  signupRow: { marginTop: 10, gap: 8 },
  modeToggle: {
    flexDirection: 'row', gap: 6,
    backgroundColor: '#f0f0f0', borderRadius: 8, padding: 3,
  },
  modeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 7, borderRadius: 6,
  },
  modeBtnActive: { backgroundColor: '#534AB7' },
  modeBtnText: { fontSize: 13, fontWeight: '500', color: '#888' },
  modeBtnTextActive: { color: '#fff' },
  signupBtn: {
    backgroundColor: '#534AB7', borderRadius: 8, padding: 12,
    alignItems: 'center',
  },
  signupBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  calendar: { borderBottomWidth: 1, borderBottomColor: '#e8e8e8' },
  calendarPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 60 },
  calendarPlaceholderText: { color: '#aaa', fontSize: 15 },

  massTimesRow: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
    paddingHorizontal: 16, paddingVertical: 10, gap: 6,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e8e8e8',
  },
  massTimesLabel: { fontSize: 13, color: '#888' },
  massTimePill: { backgroundColor: '#f0eef9', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  massTimePillText: { fontSize: 13, color: '#534AB7', fontWeight: '500' },

  liturgyRow: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
    paddingHorizontal: 16, paddingVertical: 8, gap: 6,
    backgroundColor: '#fffbf0', borderBottomWidth: 1, borderBottomColor: '#f0e8c8',
  },
  liturgyDot: { width: 8, height: 8, borderRadius: 4 },
  liturgyTypeLabel: { fontSize: 12, color: '#a07800', fontWeight: '600' },
  liturgyName: { fontSize: 13, color: '#5a4000', flex: 1 },

  parentHeader: { fontSize: 17, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },

  todaySection: {
    backgroundColor: '#f0eef9', borderRadius: 12,
    borderLeftWidth: 3, borderLeftColor: '#534AB7',
    padding: 12, marginBottom: 8, gap: 10,
  },
  todayBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    backgroundColor: '#534AB7', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  todayBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },

  attBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#eafaf2', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, marginTop: 6,
  },
  attBadgeText: { fontSize: 13, color: '#27ae60', fontWeight: '500' },

  absentBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#f5f5f5', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, marginTop: 6,
  },
  absentText: { fontSize: 13, color: '#bbb' },

  checkBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#534AB7', borderRadius: 8,
    paddingVertical: 10, marginTop: 8,
  },
  checkBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  extraAttendanceBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F0EEFF', borderRadius: 10, padding: 14, marginTop: 4,
  },
  extraAttendanceBannerText: { flex: 1, color: '#534AB7', fontWeight: '600', fontSize: 14 },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, gap: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  modalSubtitle: { fontSize: 14, color: '#888', marginBottom: 4 },
  slotRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, borderRadius: 10, backgroundColor: '#f5f5f5',
  },
  slotRowSelected: { backgroundColor: '#F0EEFF' },
  slotText: { fontSize: 15, color: '#1a1a1a', fontWeight: '500' },
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: '#ccc',
    alignItems: 'center', justifyContent: 'center',
  },
  radioSelected: { borderColor: '#534AB7' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#534AB7' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancelBtn: {
    flex: 1, padding: 14, borderRadius: 10,
    backgroundColor: '#f0f0f0', alignItems: 'center',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: '#666' },
  confirmBtn: {
    flex: 1, padding: 14, borderRadius: 10,
    backgroundColor: '#534AB7', alignItems: 'center',
  },
  confirmBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },

  modalEmpty: { alignItems: 'center', paddingVertical: 16, gap: 8 },
  modalEmptyText: { fontSize: 15, color: '#555', fontWeight: '500', textAlign: 'center' },
  modalEmptySubtext: { fontSize: 13, color: '#aaa', textAlign: 'center', lineHeight: 18 },

  reportAbsenceBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5,
  },
  reportAbsenceText: { fontSize: 13, color: '#f0a500', fontWeight: '500' },

  absenceReasonBadge: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: '#fdf0ee', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7, marginTop: 2,
  },
  absenceReasonText: { fontSize: 12, color: '#e74c3c', flex: 1, fontStyle: 'italic' },

  confirmedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#eaf4fb', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, marginTop: 2,
  },
  confirmedText: { fontSize: 12, color: '#2980b9', fontWeight: '500' },

  rejectionBadge: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: '#fff3f3', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7, marginTop: 2,
  },
  rejectionText: { fontSize: 12, color: '#e74c3c', flex: 1, lineHeight: 17 },

  absenceInput: {
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10,
    padding: 12, fontSize: 14, color: '#1a1a1a',
    minHeight: 80, textAlignVertical: 'top', marginBottom: 4,
  },

  dayHeader: { fontSize: 16, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
  historiaToggle: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 8, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 10,
  },
  historiaTitleText: { fontSize: 13, fontWeight: '700', color: '#888' },
  modalInput: {
    backgroundColor: '#f5f5f5', borderRadius: 10, padding: 12,
    fontSize: 14, color: '#1a1a1a', minHeight: 80, textAlignVertical: 'top',
  },
  modalBtns: { flexDirection: 'row', gap: 10 },
  modalBtn: { flex: 1, borderRadius: 10, padding: 13, alignItems: 'center' },
  modalBtnCancel: { backgroundColor: '#f0f0f0' },
  modalBtnCancelText: { fontSize: 14, fontWeight: '600', color: '#888' },
  modalBtnSubmit: { backgroundColor: '#e74c3c' },
  modalBtnSubmitText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  dayWrapper: { alignItems: 'center', paddingVertical: 2, width: 32 },
  dayCircle: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  dayTodayCircle: { borderWidth: 2, borderColor: '#534AB7' },
  daySelectedCircle: { backgroundColor: '#534AB7' },
  dayNum: { fontSize: 13, fontWeight: '400' },
  dayTodayNum: { fontWeight: '700' },
  dayDots: { flexDirection: 'row', gap: 2, marginTop: 1, minHeight: 5 },
  dayDot: { width: 4, height: 4, borderRadius: 2 },

  weekStripContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  weekArrow: { paddingHorizontal: 8 },
  weekDaysScroll: { paddingHorizontal: 4, gap: 2 },
  dayPill: { alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2, minWidth: 38 },
  dayPillLabel: { fontSize: 10, fontWeight: '700', color: '#aaa', marginBottom: 2 },
  dayPillCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dayPillSelected: { backgroundColor: '#534AB7' },
  dayPillToday: { backgroundColor: '#534AB714' },
  dayPillNum: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  dayPillDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#534AB7', marginTop: 2 },
  dayPillDotEmpty: { width: 4, height: 4, marginTop: 2 },

  schedTile: {
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5,
    padding: 12, ...shadow.xs,
  },
  schedTileTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  schedTileLeft: { flex: 1 },
  schedTileAction: { justifyContent: 'center' },
  schedTileTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  schedTileTitle: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  schedTileMeta: { gap: 1, marginBottom: 4 },
  catBadge: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  catBadgeText: { fontSize: 9, fontWeight: '700' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  tileBtn: {
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7,
    minWidth: 80, alignItems: 'center',
  },
  tileBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  tileBtnOutline: { backgroundColor: '#fff3e0', borderWidth: 1, borderColor: '#e67e22' },
  tileBtnSecondary: { backgroundColor: '#f0f0f0' },
  absenceLink: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f5f5f5' },
  absenceLinkText: { fontSize: 12, color: '#e74c3c', fontWeight: '600' },
})
