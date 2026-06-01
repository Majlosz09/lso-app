import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  View, Text, FlatList, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { supabase } from '../../lib/supabase'
import { shadow } from '../../lib/shadows'
import { useAuthStore } from '../../stores/authStore'
import { STATUS_COLORS, STATUS_LABELS } from '../../lib/status'
import { CATEGORY_CONFIG, getCatColors, ScheduleCategory, AssignmentStatus } from '../../types/database'
import { useRealtimeTable } from '../../hooks/useRealtimeTable'
import { validateGps, validateParishQr } from '../../lib/checkin'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'

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

  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

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
    return <View style={styles.center}><ActivityIndicator size="large" color={c.primary} /></View>
  }

  return (
    <FlatList
      data={items}
      keyExtractor={item => item.assignmentId}
      style={{ flex: 1, backgroundColor: c.bg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData() }} />}
      ListHeaderComponent={
        <Text style={styles.parentHeader}>Nadchodzące dyżury dzieci</Text>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name="calendar-outline" size={48} color={c.iconMuted} />
          <Text style={styles.emptyText}>Brak nadchodzących dyżurów</Text>
        </View>
      }
      renderItem={({ item }) => <ChildScheduleCard schedule={item} styles={styles} colors={c} />}
      contentContainerStyle={{ padding: 16, gap: 12 }}
    />
  )
}

function ChildScheduleCard({ schedule, styles, colors: c }: { schedule: any; styles: any; colors: Colors }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{schedule.title}</Text>
        <View style={[styles.pill, { backgroundColor: (STATUS_COLORS[schedule.myStatus] ?? c.subtext) + '22' }]}>
          <Text style={[styles.pillText, { color: STATUS_COLORS[schedule.myStatus] ?? c.subtext }]}>
            {STATUS_LABELS[schedule.myStatus] ?? schedule.myStatus}
          </Text>
        </View>
      </View>
      <View style={[styles.row, { marginBottom: 2 }]}>
        <Ionicons name="person-outline" size={14} color={c.primary} />
        <Text style={[styles.cardMeta, { color: c.primary, fontWeight: '600' }]}>{schedule.childName}</Text>
      </View>
      <MetaRow icon="calendar-outline" text={
        new Date(schedule.date + 'T12:00:00').toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })
      } styles={styles} />
      <MetaRow icon="time-outline" text={schedule.time?.slice(0, 5)} styles={styles} />
      {schedule.group && <MetaRow icon="people-outline" text={schedule.group.name} color={c.primary} styles={styles} />}
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
  styles: any
  colors: Colors
}

function WeekStrip({ weekDays, selectedDate, onSelect, onPrev, onNext, eventDates, styles, colors: c }: WeekStripProps) {
  const today = new Date().toISOString().split('T')[0]
  return (
    <View style={styles.weekStripContainer}>
      <TouchableOpacity onPress={onPrev} style={styles.weekArrow} hitSlop={8}>
        <Ionicons name="chevron-back" size={20} color={c.primary} />
      </TouchableOpacity>
      <View style={styles.weekDaysRow}>
        {weekDays.map(date => {
          const d = new Date(date + 'T12:00:00')
          const isSelected = date === selectedDate
          const isToday = date === today
          const hasEvents = eventDates.has(date)
          return (
            <TouchableOpacity key={date} onPress={() => onSelect(date)}
              style={styles.dayPill} activeOpacity={0.7}>
              <Text style={[styles.dayPillLabel, isSelected && { color: c.primary }]}>
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
                  isToday && !isSelected && { color: c.primary, fontWeight: '700' },
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
      </View>
      <TouchableOpacity onPress={onNext} style={styles.weekArrow} hitSlop={8}>
        <Ionicons name="chevron-forward" size={20} color={c.primary} />
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
  styles: any
  colors: Colors
}

function ScheduleTile({
  schedule, checkingIn, signingUp, unsigning, reporting,
  onCheckIn, onSignUp, onUnsign, onReportAbsence,
  styles, colors: c,
}: ScheduleTileProps) {
  const { isDark } = useTheme()
  const assignment = schedule.assignment
  const alreadyCheckedIn = schedule.hasAttendance || assignment?.status === 'present'
  const windowOpen = isCheckInWindowOpen(schedule)
  const isSun = isSunday(schedule.date)
  const cat = schedule.category as ScheduleCategory
  const cfg = getCatColors(cat, isDark)
  const status: AssignmentStatus | undefined = assignment?.status

  // Border color: colored border only when window is open and not yet checked in
  let borderColor = c.border
  if (!isSun && windowOpen && !alreadyCheckedIn) {
    borderColor = (cat === 'msza' && assignment) ? c.success : c.primary
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
          style={[styles.tileBtn, { backgroundColor: isAssigned ? c.success : c.primary }]}
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
              ? <ActivityIndicator size="small" color={c.danger} />
              : <Text style={[styles.tileBtnText, { color: c.danger }]}>Wypisz się</Text>
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
              ? <ActivityIndicator size="small" color={c.primary} />
              : <Text style={[styles.tileBtnText, { color: c.primary }]}>Zapisz się</Text>
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
          style={[styles.tileBtn, { backgroundColor: c.primary }]}
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
              <MetaRow icon="time-outline" text={schedule.time.slice(0, 5)} styles={styles} />
            )}
            {schedule.group?.name && (
              <MetaRow icon="people-outline" text={schedule.group.name} color={c.primary} styles={styles} />
            )}
          </View>
          {/* Status badges */}
          <View style={styles.badgeRow}>
            {alreadyCheckedIn && (
              <View style={[styles.pill, { backgroundColor: c.success + '33' }]}>
                <Text style={[styles.pillText, { color: c.success }]}>OBECNY</Text>
              </View>
            )}
            {!alreadyCheckedIn && assignment && (
              <View style={[styles.pill, { backgroundColor: c.success + '33' }]}>
                <Text style={[styles.pillText, { color: c.success }]}>DYŻUR</Text>
              </View>
            )}
            {status && !['assigned', 'present'].includes(status) && (
              <View style={[styles.pill, { backgroundColor: (STATUS_COLORS[status] ?? c.subtext) + '22' }]}>
                <Text style={[styles.pillText, { color: STATUS_COLORS[status] ?? c.subtext }]}>
                  {STATUS_LABELS[status] ?? status}
                </Text>
              </View>
            )}
            {assignment?.admin_note && (
              <View style={[styles.pill, { backgroundColor: c.danger + '22' }]}>
                <Text style={[styles.pillText, { color: c.danger }]}>
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
          <Text style={styles.actionHint}>Poinformuje admina, że nie możesz przyjść.</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

function MemberScheduleView() {
  const { profile, parish } = useAuthStore()
  const today = new Date().toISOString().split('T')[0]

  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  // Week navigation
  const [weekOffset, setWeekOffset] = useState(0)
  const [weekDays, setWeekDays] = useState<string[]>(() => getWeekDays(0))
  const [selectedDate, setSelectedDate] = useState<string>(today)

  // Unified schedule data
  const [weekSchedules, setWeekSchedules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // QR scanner
  const [cameraPermission, requestCameraPermission] = useCameraPermissions()
  const [qrScannerVisible, setQrScannerVisible] = useState(false)
  const [qrPendingSchedule, setQrPendingSchedule] = useState<any | null>(null)
  const qrScannedRef = useRef(false)

  // Action states
  const [checkingInId, setCheckingInId] = useState<string | null>(null)
  const [signingUpId, setSigningUpId] = useState<string | null>(null)
  const [unsigningId, setUnsigningId] = useState<string | null>(null)
  const [reportingAbsenceId, setReportingAbsenceId] = useState<string | null>(null)
  const [absenceModal, setAbsenceModal] = useState<{
    visible: boolean; assignmentId: string; title: string; reason: string
  }>({ visible: false, assignmentId: '', title: '', reason: '' })
  const [signUpModal, setSignUpModal] = useState<{ visible: boolean; schedule: any | null }>
    ({ visible: false, schedule: null })


  useEffect(() => {
    const days = getWeekDays(weekOffset)
    setWeekDays(days)
    if (!days.includes(selectedDate)) setSelectedDate(days[0])
  }, [weekOffset])

  const fetchWeekSchedules = async (days: string[] = weekDays) => {
    if (!profile?.id || !profile?.parish_id || days.length === 0) return
    const [weekStart, weekEnd] = [days[0], days[days.length - 1]]

    const [schedulesRes, assignmentsRes, templatesRes] = await Promise.all([
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
      supabase
        .from('mass_templates')
        .select('*')
        .eq('parish_id', profile.parish_id)
        .order('day_of_week').order('time'),
    ])

    let schedules = schedulesRes.data ?? []

    const scheduleIds = schedules.map((s: any) => s.id)
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

    // Fill in template virtual slots for any day/time not covered by real schedules
    const allTemplates: any[] = templatesRes.data ?? []
    if (allTemplates.length > 0) {
      const scheduledKeys = new Set(schedules.map((s: any) => `${s.date}_${s.time?.slice(0, 5)}`))
      for (const day of days) {
        const dow = new Date(day + 'T12:00:00').getDay()
        for (const t of allTemplates.filter((t: any) => t.day_of_week === dow)) {
          const key = `${day}_${t.time.slice(0, 5)}`
          if (!scheduledKeys.has(key)) {
            schedules.push({
              id: `tpl-${day}-${t.id}`,
              title: t.label ?? 'Msza Święta',
              date: day,
              time: t.time,
              category: 'msza',
              group: null,
              isTemplate: true,
            })
          }
        }
      }
      schedules.sort((a: any, b: any) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''))
    }

    setWeekSchedules(
      schedules.map((s: any) => ({
        ...s,
        assignment: assignmentMap.get(s.id) ?? null,
        hasAttendance: attendanceSet.has(s.id),
      }))
    )
    setLoading(false)
    setRefreshing(false)
  }


  useEffect(() => {
    fetchWeekSchedules(weekDays)
  }, [profile?.id, weekDays])

  useRealtimeTable('schedule_assignments', () => {
    fetchWeekSchedules(weekDays)
  })
  useRealtimeTable('schedules', () => {
    fetchWeekSchedules(weekDays)
  })

  // --- Handlers ---

  const doCheckIn = async (schedule: any) => {
    setCheckingInId(schedule.id)
    let scheduleId = schedule.id
    let assignmentId = schedule.assignment?.id ?? null

    if (schedule.isTemplate) {
      const { data: signUpData, error: signUpErr } = await supabase.rpc('sign_up_for_slot', {
        p_date: schedule.date,
        p_time_label: schedule.time.slice(0, 5),
        p_mode: 'once',
      })
      if (signUpErr && !signUpErr.message.includes('Już jesteś zapisany')) {
        setCheckingInId(null)
        Alert.alert('Błąd', signUpErr.message)
        return
      }
      if (signUpData) {
        scheduleId = (signUpData as any).schedule_id
      } else {
        const { data: sch } = await supabase
          .from('schedules').select('id')
          .eq('parish_id', profile!.parish_id)
          .eq('date', schedule.date)
          .gte('time', schedule.time.slice(0, 5) + ':00')
          .lt('time', schedule.time.slice(0, 5) + ':59')
          .maybeSingle()
        if (!sch) { setCheckingInId(null); Alert.alert('Błąd', 'Nie znaleziono służby.'); return }
        scheduleId = sch.id
      }
    }

    const { data, error } = await supabase.rpc('check_in_and_award_points', {
      p_schedule_id: scheduleId,
      p_profile_id: profile!.id,
      p_parish_id: profile!.parish_id,
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

  const handleCheckIn = async (schedule: any) => {
    const mode = parish?.attendance_mode ?? 'button'

    if (mode === 'gps') {
      if (!parish?.lat || !parish?.lng) {
        Alert.alert('Błąd konfiguracji', 'Admin nie skonfigurował lokalizacji kościoła w ustawieniach parafii.')
        return
      }
      setCheckingInId(schedule.id)
      const result = await validateGps({
        parishLat: parish.lat,
        parishLng: parish.lng,
        parishRadius: parish.gps_radius ?? 200,
      })
      setCheckingInId(null)
      if (!result.success) { Alert.alert('Nie można zameldować', (result as any).message); return }
      await doCheckIn(schedule)
      return
    }

    if (mode === 'qr') {
      if (!cameraPermission?.granted) {
        const { granted } = await requestCameraPermission()
        if (!granted) { Alert.alert('Brak dostępu', 'Zezwól aplikacji na dostęp do kamery.'); return }
      }
      qrScannedRef.current = false
      setQrPendingSchedule(schedule)
      setQrScannerVisible(true)
      return
    }

    await doCheckIn(schedule)
  }

  const handleSignUp = (schedule: any) => {
    setSignUpModal({ visible: true, schedule })
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
    const { error } = await supabase.from('schedule_assignments').delete().eq('id', assignmentId)
    setUnsigningId(null)
    if (error) { Alert.alert('Błąd', error.message); return }
    fetchWeekSchedules(weekDays)
  }

  const unsignCycle = async (assignmentId: string, commitmentId: string) => {
    setUnsigningId(assignmentId)
    const [r1, r2] = await Promise.all([
      supabase.from('schedule_assignments').delete().eq('id', assignmentId),
      supabase.from('recurring_commitments').delete().eq('id', commitmentId),
    ])
    setUnsigningId(null)
    if (r1.error || r2.error) { Alert.alert('Błąd', (r1.error ?? r2.error)!.message); return }
    fetchWeekSchedules(weekDays)
  }

  const [unsignModal, setUnsignModal] = useState<{
    visible: boolean; assignmentId: string; commitmentId: string | null; title: string
  }>({ visible: false, assignmentId: '', commitmentId: null, title: '' })

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
    setUnsignModal({
      visible: true,
      assignmentId: a.id,
      commitmentId: commitment?.id ?? null,
      title: schedule.title,
    })
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
          styles={styles}
          colors={c}
        />
        <View style={styles.center}><ActivityIndicator size="large" color={c.primary} /></View>
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
        styles={styles}
        colors={c}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: c.bg }}
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
            <Ionicons name="calendar-outline" size={48} color={c.iconMuted} />
            <Text style={styles.emptyTitle}>Brak służb w tym dniu</Text>
            <Text style={styles.emptySubtitle}>
              Nie masz przypisanych służb w tym dniu. Sprawdź inny dzień lub tydzień.
            </Text>
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
              styles={styles}
              colors={c}
            />
          ))
        )}

      </ScrollView>

      {/* Unsign modal */}
      <Modal visible={unsignModal.visible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Wypisz się</Text>
            {unsignModal.commitmentId ? (
              <>
                <Text style={styles.modalSubtitle}>Ten dyżur jest częścią cyklu. Co chcesz zrobić?</Text>
                <View style={styles.modalBtns}>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnCancel]}
                    onPress={() => setUnsignModal(m => ({ ...m, visible: false }))}
                  >
                    <Text style={styles.modalBtnCancelText}>Anuluj</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, { backgroundColor: c.danger }]}
                    onPress={() => {
                      const id = unsignModal.assignmentId
                      setUnsignModal(m => ({ ...m, visible: false }))
                      unsignOne(id)
                    }}
                  >
                    <Text style={styles.modalBtnSubmitText}>Tylko tę</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, { backgroundColor: c.danger }]}
                    onPress={() => {
                      const { assignmentId, commitmentId } = unsignModal
                      setUnsignModal(m => ({ ...m, visible: false }))
                      unsignCycle(assignmentId, commitmentId!)
                    }}
                  >
                    <Text style={styles.modalBtnSubmitText}>Cały cykl</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.modalSubtitle}>Wypisać się ze służby „{unsignModal.title}"?</Text>
                <View style={styles.modalBtns}>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnCancel]}
                    onPress={() => setUnsignModal(m => ({ ...m, visible: false }))}
                  >
                    <Text style={styles.modalBtnCancelText}>Anuluj</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnSubmit]}
                    onPress={() => {
                      const id = unsignModal.assignmentId
                      setUnsignModal(m => ({ ...m, visible: false }))
                      unsignOne(id)
                    }}
                  >
                    <Text style={styles.modalBtnSubmitText}>Wypisz</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Sign-up modal */}
      <Modal visible={signUpModal.visible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Zapisz się</Text>
            <Text style={styles.modalSubtitle}>
              {signUpModal.schedule?.title}{'\n'}
              {signUpModal.schedule ? formatDateHeader(signUpModal.schedule.date) : ''}, {signUpModal.schedule?.time?.slice(0, 5)}
            </Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setSignUpModal({ visible: false, schedule: null })}
              >
                <Text style={styles.modalBtnCancelText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: c.primary }]}
                onPress={() => {
                  const s = signUpModal.schedule
                  setSignUpModal({ visible: false, schedule: null })
                  doSignUp(s.id, s.date, s.time?.slice(0, 5), 'once')
                }}
              >
                <Text style={styles.modalBtnSubmitText}>Jednorazowo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: c.success }]}
                onPress={() => {
                  const s = signUpModal.schedule
                  setSignUpModal({ visible: false, schedule: null })
                  doSignUp(s.id, s.date, s.time?.slice(0, 5), 'recurring')
                }}
              >
                <Text style={styles.modalBtnSubmitText}>Cyklicznie</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* QR Scanner modal */}
      <Modal visible={qrScannerVisible} animationType="slide" onRequestClose={() => setQrScannerVisible(false)}>
        <View style={styles.qrScannerContainer}>
          <CameraView
            style={styles.qrCamera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={(e) => {
              if (qrScannedRef.current) return
              const value = e.data
              if (!validateParishQr(value, profile!.parish_id!)) {
                Alert.alert('Nieprawidłowy kod', 'Ten kod QR nie należy do Twojej parafii.')
                return
              }
              qrScannedRef.current = true
              setQrScannerVisible(false)
              const pending = qrPendingSchedule
              setQrPendingSchedule(null)
              if (pending) doCheckIn(pending)
            }}
          />
          <View style={styles.qrScannerOverlay}>
            <View style={styles.qrScannerFrame} />
            <Text style={styles.qrScannerHint}>Skieruj kamerę na kod QR w zakrystii</Text>
          </View>
          <TouchableOpacity style={styles.qrScannerClose} onPress={() => setQrScannerVisible(false)}>
            <Ionicons name="close-circle" size={44} color="#fff" />
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Absence modal */}
      <Modal visible={absenceModal.visible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Zgłoś nieobecność</Text>
            <Text style={styles.modalSubtitle}>{absenceModal.title}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Powód nieobecności..."
              placeholderTextColor={c.textTertiary}
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

function MetaRow({ icon, text, color, styles }: { icon: any; text: string; color?: string; styles: any }) {
  const { colors: c } = useTheme()
  const effectiveColor = color ?? c.subtext
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={14} color={effectiveColor} />
      <Text style={[styles.cardMeta, { color: effectiveColor }]}>{text}</Text>
    </View>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    segmentBar: {
      flexDirection: 'row', margin: 16, marginBottom: 0,
      backgroundColor: c.border, borderRadius: 10, padding: 3,
    },
    segment: {
      flex: 1, paddingVertical: 8, borderRadius: 8,
      alignItems: 'center', justifyContent: 'center',
    },
    segmentActive: {
      backgroundColor: c.surface,
      ...shadow.md,
    },
    segmentText: { fontSize: 14, fontWeight: '500', color: c.subtext },
    segmentTextActive: { color: c.text },

    empty: { alignItems: 'center', marginTop: 60, gap: 10 },
    emptyText: { color: c.textTertiary, fontSize: 16 },
    emptyTitle: { color: c.text, fontSize: 16, fontWeight: '600' },
    emptySubtitle: { color: c.textTertiary, fontSize: 14, textAlign: 'center', maxWidth: 260, lineHeight: 20 },
    emptyLink: { color: c.primary, fontSize: 14, fontWeight: '500' },
    actionHint: { fontSize: 11, color: c.textTertiary, marginTop: 2 },

    card: {
      backgroundColor: c.surface, borderRadius: 12, padding: 12, gap: 4,
      ...shadow.md,
    },
    cardSigned: { borderLeftWidth: 3, borderLeftColor: c.gold },
    cardHeader: {
      flexDirection: 'row', justifyContent: 'space-between',
      alignItems: 'center', marginBottom: 2,
    },
    cardTitle: { fontSize: 16, fontWeight: '600', color: c.text, flex: 1 },
    pill: {
      flexDirection: 'row', alignItems: 'center', gap: 3,
      borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
    },
    pillText: { fontSize: 12, fontWeight: '500' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    cardMeta: { fontSize: 13 },

    unsignBtn: { alignSelf: 'flex-end', marginTop: 6 },
    unsignText: { fontSize: 13, color: c.danger, fontWeight: '500' },

    signupRow: { marginTop: 10, gap: 8 },
    modeToggle: {
      flexDirection: 'row', gap: 6,
      backgroundColor: c.primarySurface, borderRadius: 8, padding: 3,
    },
    modeBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 5, paddingVertical: 7, borderRadius: 6,
    },
    modeBtnActive: { backgroundColor: c.primary },
    modeBtnText: { fontSize: 13, fontWeight: '500', color: c.subtext },
    modeBtnTextActive: { color: '#fff' },
    signupBtn: {
      backgroundColor: c.primary, borderRadius: 8, padding: 12,
      alignItems: 'center',
    },
    signupBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },

    calendar: { borderBottomWidth: 1, borderBottomColor: c.border },
    calendarPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 60 },
    calendarPlaceholderText: { color: c.textTertiary, fontSize: 15 },

    massTimesRow: {
      flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
      paddingHorizontal: 16, paddingVertical: 10, gap: 6,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    massTimesLabel: { fontSize: 13, color: c.subtext },
    massTimePill: { backgroundColor: c.primarySurface, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    massTimePillText: { fontSize: 13, color: c.primary, fontWeight: '500' },

    liturgyRow: {
      flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
      paddingHorizontal: 16, paddingVertical: 8, gap: 6,
      backgroundColor: c.goldSurface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    liturgyDot: { width: 8, height: 8, borderRadius: 4 },
    liturgyTypeLabel: { fontSize: 12, color: c.gold, fontWeight: '600' },
    liturgyName: { fontSize: 13, color: c.text, flex: 1 },

    parentHeader: { fontSize: 17, fontWeight: '700', color: c.text, marginBottom: 4 },

    todaySection: {
      backgroundColor: c.primarySurface, borderRadius: 12,
      borderLeftWidth: 3, borderLeftColor: c.primary,
      padding: 12, marginBottom: 8, gap: 10,
    },
    todayBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
      backgroundColor: c.primary, borderRadius: 6,
      paddingHorizontal: 8, paddingVertical: 3,
    },
    todayBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },

    attBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      backgroundColor: c.successSurface, borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 6, marginTop: 6,
    },
    attBadgeText: { fontSize: 13, color: c.success, fontWeight: '500' },

    absentBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      backgroundColor: c.bg, borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 6, marginTop: 6,
    },
    absentText: { fontSize: 13, color: c.textTertiary },

    checkBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      backgroundColor: c.primary, borderRadius: 8,
      paddingVertical: 10, marginTop: 8,
    },
    checkBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },

    extraAttendanceBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.primarySurface, borderRadius: 10, padding: 14, marginTop: 4,
    },
    extraAttendanceBannerText: { flex: 1, color: c.primary, fontWeight: '600', fontSize: 14 },

    modalOverlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
      padding: 24, gap: 12,
    },
    modalTitle: { fontSize: 18, fontWeight: '700', color: c.text },
    modalSubtitle: { fontSize: 14, color: c.subtext, marginBottom: 4 },
    slotRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      padding: 12, borderRadius: 10, backgroundColor: c.bg,
    },
    slotRowSelected: { backgroundColor: c.primarySurface },
    slotText: { fontSize: 15, color: c.text, fontWeight: '500' },
    radio: {
      width: 20, height: 20, borderRadius: 10,
      borderWidth: 2, borderColor: c.iconMuted,
      alignItems: 'center', justifyContent: 'center',
    },
    radioSelected: { borderColor: c.primary },
    radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.primary },
    modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
    cancelBtn: {
      flex: 1, padding: 14, borderRadius: 10,
      backgroundColor: c.primarySurface, alignItems: 'center',
    },
    cancelBtnText: { fontSize: 15, fontWeight: '600', color: c.subtext },
    confirmBtn: {
      flex: 1, padding: 14, borderRadius: 10,
      backgroundColor: c.primary, alignItems: 'center',
    },
    confirmBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },

    modalEmpty: { alignItems: 'center', paddingVertical: 16, gap: 8 },
    modalEmptyText: { fontSize: 15, color: c.subtext, fontWeight: '500', textAlign: 'center' },
    modalEmptySubtext: { fontSize: 13, color: c.textTertiary, textAlign: 'center', lineHeight: 18 },

    reportAbsenceBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5,
    },
    reportAbsenceText: { fontSize: 13, color: c.gold, fontWeight: '500' },

    absenceReasonBadge: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 6,
      backgroundColor: c.dangerSurface, borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 7, marginTop: 2,
    },
    absenceReasonText: { fontSize: 12, color: c.danger, flex: 1, fontStyle: 'italic' },

    confirmedBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: c.primarySurface, borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 6, marginTop: 2,
    },
    confirmedText: { fontSize: 12, color: c.primary, fontWeight: '500' },

    rejectionBadge: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 6,
      backgroundColor: c.dangerSurface, borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 7, marginTop: 2,
    },
    rejectionText: { fontSize: 12, color: c.danger, flex: 1, lineHeight: 17 },

    absenceInput: {
      borderWidth: 1, borderColor: c.border, borderRadius: 10,
      padding: 12, fontSize: 14, color: c.text,
      minHeight: 80, textAlignVertical: 'top', marginBottom: 4,
    },

    dayHeader: { fontSize: 16, fontWeight: '700', color: c.text, marginBottom: 4 },
    historiaToggle: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      marginTop: 8, padding: 12, backgroundColor: c.bg, borderRadius: 10,
    },
    historiaTitleText: { fontSize: 13, fontWeight: '700', color: c.subtext },
    modalInput: {
      backgroundColor: c.bg, borderRadius: 10, padding: 12,
      fontSize: 14, color: c.text, minHeight: 80, textAlignVertical: 'top',
    },
    modalBtns: { flexDirection: 'row', gap: 10 },
    modalBtn: { flex: 1, borderRadius: 10, padding: 13, alignItems: 'center' },
    modalBtnCancel: { backgroundColor: c.primarySurface },
    modalBtnCancelText: { fontSize: 14, fontWeight: '600', color: c.subtext },
    modalBtnSubmit: { backgroundColor: c.danger },
    modalBtnSubmitText: { fontSize: 14, fontWeight: '700', color: '#fff' },

    dayWrapper: { alignItems: 'center', paddingVertical: 2, width: 32 },
    dayCircle: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    dayTodayCircle: { borderWidth: 2, borderColor: c.primary },
    daySelectedCircle: { backgroundColor: c.primary },
    dayNum: { fontSize: 13, fontWeight: '400' },
    dayTodayNum: { fontWeight: '700' },
    dayDots: { flexDirection: 'row', gap: 2, marginTop: 1, minHeight: 5 },
    dayDot: { width: 4, height: 4, borderRadius: 2 },

    weekStripContainer: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: c.surface, paddingVertical: 10,
      borderBottomWidth: 1, borderBottomColor: c.primarySurface,
    },
    weekArrow: { paddingHorizontal: 8 },
    weekDaysRow: { flex: 1, flexDirection: 'row' },
    dayPill: { flex: 1, alignItems: 'center', paddingVertical: 2 },
    dayPillLabel: { fontSize: 10, fontWeight: '700', color: c.textTertiary, marginBottom: 2 },
    dayPillCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    dayPillSelected: { backgroundColor: c.primary },
    dayPillToday: { backgroundColor: c.primaryAlpha08 },
    dayPillNum: { fontSize: 14, fontWeight: '600', color: c.text },
    dayPillDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: c.primary, marginTop: 2 },
    dayPillDotEmpty: { width: 4, height: 4, marginTop: 2 },

    schedTile: {
      backgroundColor: c.surface, borderRadius: 12, borderWidth: 1.5,
      padding: 12, ...shadow.xs,
    },
    schedTileTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    schedTileLeft: { flex: 1 },
    schedTileAction: { justifyContent: 'center' },
    schedTileTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
    schedTileTitle: { fontSize: 14, fontWeight: '700', color: c.text },
    schedTileMeta: { gap: 1, marginBottom: 4 },
    catBadge: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
    catBadgeText: { fontSize: 9, fontWeight: '700' },
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
    tileBtn: {
      borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7,
      minWidth: 80, alignItems: 'center',
    },
    tileBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
    tileBtnOutline: { backgroundColor: c.goldSurface, borderWidth: 1, borderColor: '#EA580C' },
    tileBtnSecondary: { backgroundColor: c.primarySurface },
    absenceLink: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: c.bg },
    absenceLinkText: { fontSize: 12, color: c.danger, fontWeight: '600' },

    qrScannerContainer: { flex: 1, backgroundColor: '#000' },
    qrCamera: { flex: 1 },
    qrScannerOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
    qrScannerFrame: { width: 240, height: 240, borderWidth: 2, borderColor: '#fff', borderRadius: 12 },
    qrScannerHint: { color: '#fff', marginTop: 20, fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
    qrScannerClose: { position: 'absolute', top: 52, right: 20 },
  })
}
