import React, { useEffect, useMemo, useState } from 'react'
import {
  View, Text, FlatList, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Calendar, LocaleConfig } from 'react-native-calendars'
import { supabase } from '../../lib/supabase'
import { shadow } from '../../lib/shadows'
import { useAuthStore } from '../../stores/authStore'
import { getLiturgicalDay, getLiturgicalAccentColor, getLiturgicalBgColor } from '../../lib/liturgy'
import { STATUS_COLORS, STATUS_LABELS } from '../../lib/status'
import { MassTemplate } from '../../types/database'
import { CATEGORY_CONFIG, ScheduleCategory, AssignmentStatus } from '../../types/database'
import { useRealtimeTable } from '../../hooks/useRealtimeTable'

LocaleConfig.locales['pl'] = {
  monthNames: ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'],
  monthNamesShort: ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'],
  dayNames: ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'],
  dayNamesShort: ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb'],
  today: 'Dziś',
}
LocaleConfig.defaultLocale = 'pl'

const DAY_FULL = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota']

function getExpectedTimesFromTemplates(dateStr: string, templates: MassTemplate[]): string[] {
  const dow = new Date(dateStr + 'T12:00:00').getDay()
  return templates
    .filter(t => t.day_of_week === dow)
    .map(t => t.time.slice(0, 5))
}

function getTemplatesForDate(dateStr: string, templates: MassTemplate[]): MassTemplate[] {
  const dow = new Date(dateStr + 'T12:00:00').getDay()
  return templates.filter(t => t.day_of_week === dow)
}

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
  const [activeTab, setActiveTab] = useState<'mine' | 'signup' | 'history'>('mine')

  // "Moje służby" data
  const [mySchedules, setMySchedules] = useState<any[]>([])
  const [loadingMine, setLoadingMine] = useState(true)
  const [refreshingMine, setRefreshingMine] = useState(false)
  const [unsigningId, setUnsigningId] = useState<string | null>(null)
  const [reportingAbsenceId, setReportingAbsenceId] = useState<string | null>(null)
  const [absenceModal, setAbsenceModal] = useState<{ visible: boolean; assignmentId: string; title: string; reason: string }>(
    { visible: false, assignmentId: '', title: '', reason: '' }
  )
  const [pastSchedules, setPastSchedules] = useState<any[]>([])
  const [massTemplates, setMassTemplates] = useState<MassTemplate[]>([])

  useEffect(() => {
    if (!profile?.parish_id) return
    supabase.from('mass_templates')
      .select('*')
      .eq('parish_id', profile.parish_id)
      .order('day_of_week').order('time')
      .then(({ data }) => {
        setMassTemplates((data as MassTemplate[]) ?? [])
      })
  }, [profile?.parish_id])

  // "Zapisy" data
  const [allSchedules, setAllSchedules] = useState<any[]>([])
  const [loadingSignup, setLoadingSignup] = useState(true)
  const [refreshingSignup, setRefreshingSignup] = useState(false)
  const [signingUpId, setSigningUpId] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const today = new Date().toISOString().split('T')[0]
  const thirtyDaysLater = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0] })()

  const fetchMine = async () => {
    if (!profile?.id) return

    const { data: assignments } = await supabase
      .from('schedule_assignments')
      .select('id, role, status, schedule_id, absence_reason, admin_note')
      .eq('profile_id', profile.id)

    if (!assignments?.length) {
      setMySchedules([])
      setPastSchedules([])
      setLoadingMine(false)
      setRefreshingMine(false)
      return
    }

    const scheduleIds = assignments.map((a: any) => a.schedule_id)

    const [schedulesRes, attendanceRes, recurringRes] = await Promise.all([
      supabase
        .from('schedules')
        .select('*, group:groups(name)')
        .in('id', scheduleIds)
        .order('date', { ascending: true }),
      supabase
        .from('attendance')
        .select('id, schedule_id, method, checked_at')
        .eq('profile_id', profile.id)
        .in('schedule_id', scheduleIds),
      supabase
        .from('recurring_commitments')
        .select('id, day_of_week, time_slot')
        .eq('profile_id', profile.id),
    ])

    const aMap = new Map(assignments.map((a: any) => [a.schedule_id, a]))
    const attMap = new Map((attendanceRes.data ?? []).map((a: any) => [a.schedule_id, a]))
    const recurMap = new Map(
      (recurringRes.data ?? []).map((c: any) => [`${c.day_of_week}_${c.time_slot}`, c])
    )

    const allWithMeta = (schedulesRes.data ?? []).map((s: any) => {
      const dow = new Date(s.date + 'T12:00:00').getDay()
      const timeKey = `${dow}_${s.time?.slice(0, 5)}`
      return {
        ...s,
        assignmentId: aMap.get(s.id)?.id,
        myRole: aMap.get(s.id)?.role,
        myStatus: aMap.get(s.id)?.status,
        myAbsenceReason: aMap.get(s.id)?.absence_reason ?? null,
        myAdminNote: aMap.get(s.id)?.admin_note ?? null,
        attendance: attMap.get(s.id) ?? null,
        recurringCommitment: recurMap.get(timeKey) ?? null,
      }
    })

    setMySchedules(allWithMeta.filter((s: any) => s.date >= today))
    setPastSchedules(allWithMeta.filter((s: any) => s.date < today).reverse())
    setLoadingMine(false)
    setRefreshingMine(false)
  }

  const fetchSignup = async () => {
    if (!profile?.id) return
    const [schedulesRes, assignmentsRes] = await Promise.all([
      supabase
        .from('schedules')
        .select('*, group:groups(name)')
        .gte('date', today)
        .order('date', { ascending: true }),
      supabase
        .from('schedule_assignments')
        .select('id, schedule_id, status')
        .eq('profile_id', profile.id),
    ])

    const scheduleIds = schedulesRes.data?.map((s: any) => s.id) ?? []
    let attendanceMap = new Map<string, any>()
    if (scheduleIds.length > 0) {
      const { data: attData } = await supabase
        .from('attendance')
        .select('id, schedule_id, method, checked_at')
        .eq('profile_id', profile.id)
        .in('schedule_id', scheduleIds)
      attendanceMap = new Map((attData ?? []).map((a: any) => [a.schedule_id, a]))
    }

    const assignmentMap = new Map(
      assignmentsRes.data?.map((a: any) => [a.schedule_id, a]) ?? []
    )

    setAllSchedules(
      schedulesRes.data?.map(s => ({
        ...s,
        assignment: assignmentMap.get(s.id) ?? null,
        attendance: attendanceMap.get(s.id) ?? null,
      })) ?? []
    )
    setLoadingSignup(false)
    setRefreshingSignup(false)
  }

  const baseDates = useMemo(() => {
    const marks: Record<string, any> = {}
    // Marks from actual schedules
    for (const s of allSchedules) {
      if (!marks[s.date]) marks[s.date] = { dots: [], marked: true }
      if (marks[s.date].dots.length < 3) {
        marks[s.date].dots.push({ key: s.id, color: s.assignment ? '#f0a500' : '#534AB7' })
      }
    }
    // Faint marks for template-based days with no schedule yet
    const now = new Date()
    for (let i = 0; i < 60; i++) {
      const d = new Date(now)
      d.setDate(now.getDate() + i)
      const dateStr = d.toISOString().split('T')[0]
      if (!marks[dateStr] && massTemplates.some(t => t.day_of_week === d.getDay())) {
        marks[dateStr] = { dots: [{ key: 'tpl', color: '#534AB766' }], marked: true }
      }
    }
    return marks
  }, [allSchedules, massTemplates])

  const markedDates = useMemo(() => {
    if (!selectedDate) return baseDates
    return {
      ...baseDates,
      [selectedDate]: { ...(baseDates[selectedDate] ?? {}), selected: true, selectedColor: '#534AB7' },
    }
  }, [baseDates, selectedDate])

  const findScheduleForTime = (date: string, time: string) => {
    const [th, tm] = time.split(':')
    return allSchedules.find(s => {
      if (s.date !== date) return false
      const [sh, sm] = s.time.split(':')
      return parseInt(sh) === parseInt(th) && sm === tm.padStart(2, '0')
    }) ?? null
  }

  useEffect(() => {
    fetchMine()
    fetchSignup()
  }, [profile?.id])

  useRealtimeTable('schedule_assignments', () => { fetchMine(); fetchSignup() })

  const unsignOne = async (assignmentId: string) => {
    setUnsigningId(assignmentId)
    await supabase.from('schedule_assignments').delete().eq('id', assignmentId)
    setUnsigningId(null)
    fetchMine()
    fetchSignup()
  }

  const unsignCycle = async (assignmentId: string, commitmentId: string) => {
    setUnsigningId(assignmentId)
    await Promise.all([
      supabase.from('schedule_assignments').delete().eq('id', assignmentId),
      supabase.from('recurring_commitments').delete().eq('id', commitmentId),
    ])
    setUnsigningId(null)
    fetchMine()
    fetchSignup()
  }

  const handleUnsign = (assignmentId: string, title: string, recurringCommitment?: any) => {
    if (recurringCommitment) {
      Alert.alert(
        'Wypisz się',
        `Ten dyżur jest częścią cyklu. Co chcesz zrobić?`,
        [
          { text: 'Anuluj', style: 'cancel' },
          { text: 'Tylko tę służbę', onPress: () => unsignOne(assignmentId) },
          { text: 'Cały cykl', style: 'destructive', onPress: () => unsignCycle(assignmentId, recurringCommitment.id) },
        ]
      )
    } else {
      Alert.alert('Wypisz się', `Wypisać się ze służby "${title}"?`, [
        { text: 'Anuluj', style: 'cancel' },
        { text: 'Wypisz', style: 'destructive', onPress: () => unsignOne(assignmentId) },
      ])
    }
  }

  const reportAbsence = async (assignmentId: string, reason: string) => {
    setReportingAbsenceId(assignmentId)
    const { data, error } = await supabase
      .from('schedule_assignments')
      .update({ status: 'excused', absence_reason: reason })
      .eq('id', assignmentId)
      .select('id')
    setReportingAbsenceId(null)
    if (error) {
      Alert.alert('Błąd', error.message)
      return
    }
    if (!data || data.length === 0) {
      Alert.alert('Błąd uprawnień', 'Brak polityki RLS — uruchom w Supabase:\n\nCREATE POLICY "member_update_own_assignment"\nON schedule_assignments FOR UPDATE\nTO authenticated\nUSING (profile_id = auth.uid())\nWITH CHECK (profile_id = auth.uid());')
      return
    }
    setAbsenceModal({ visible: false, assignmentId: '', title: '', reason: '' })
    setMySchedules(prev => prev.map(s =>
      s.assignmentId === assignmentId
        ? { ...s, myStatus: 'excused', myAbsenceReason: reason }
        : s
    ))
    fetchMine()
  }

  const handleReportAbsence = (assignmentId: string, title: string) => {
    setAbsenceModal({ visible: true, assignmentId, title, reason: '' })
  }

  const handleSignUpForSlot = async (date: string, timeSlot: string, mode: 'once' | 'recurring') => {
    setSigningUpId(`${date}_${timeSlot}`)

    const { data, error } = await supabase.rpc('sign_up_for_slot', {
      p_date: date,
      p_time_label: timeSlot,
      p_mode: mode,
    })

    if (error) {
      Alert.alert('Błąd', error.message)
      setSigningUpId(null)
      return
    }

    if (mode === 'recurring') {
      const dow = new Date(date + 'T12:00:00').getDay()
      Alert.alert(
        'Cykl aktywny',
        `Zapisano cyklicznie na każdą ${DAY_FULL[dow]} o ${timeSlot}. Objęto ${(data as any)?.count ?? 1} służb w kalendarzu.`
      )
    }

    setSigningUpId(null)
    fetchMine()
    fetchSignup()
  }

  return (
    <View style={styles.container}>
      <View style={styles.segmentBar}>
        <TouchableOpacity
          style={[styles.segment, activeTab === 'mine' && styles.segmentActive]}
          onPress={() => setActiveTab('mine')}
        >
          <Text style={[styles.segmentText, activeTab === 'mine' && styles.segmentTextActive]}>Służby</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segment, activeTab === 'signup' && styles.segmentActive]}
          onPress={() => setActiveTab('signup')}
        >
          <Text style={[styles.segmentText, activeTab === 'signup' && styles.segmentTextActive]}>Zapisy</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segment, activeTab === 'history' && styles.segmentActive]}
          onPress={() => setActiveTab('history')}
        >
          <Text style={[styles.segmentText, activeTab === 'history' && styles.segmentTextActive]}>Historia</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'mine' ? (
        loadingMine ? (
          <View style={styles.center}><ActivityIndicator size="large" color="#534AB7" /></View>
        ) : (
          <FlatList
            style={{ flex: 1 }}
            data={mySchedules.filter((s: any) => s.date > today && s.date <= thirtyDaysLater)}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={refreshingMine} onRefresh={() => { setRefreshingMine(true); fetchMine() }} />}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="calendar-outline" size={48} color="#ccc" />
                <Text style={styles.emptyText}>Brak dyżurów w najbliższym miesiącu</Text>
                <TouchableOpacity onPress={() => setActiveTab('signup')}>
                  <Text style={styles.emptyLink}>Przejdź do zapisów →</Text>
                </TouchableOpacity>
              </View>
            }
            ListHeaderComponent={((): React.ReactElement | null => {
              const todaySchedules = mySchedules.filter((s: any) => s.date === today)
              if (todaySchedules.length === 0) return null
              return (
                <View style={styles.todaySection}>
                  <View style={styles.todayBadge}>
                    <Ionicons name="flash" size={13} color="#fff" />
                    <Text style={styles.todayBadgeText}>DZIŚ</Text>
                  </View>
                  {todaySchedules.map((item: any) => (
                    <MyScheduleCard
                      key={item.id}
                      schedule={item}
                      unsigning={unsigningId === item.assignmentId}
                      onUnsign={() => handleUnsign(item.assignmentId, item.title, item.recurringCommitment)}
                      onAttendanceSaved={fetchMine}
                      reporting={reportingAbsenceId === item.assignmentId}
                      onReportAbsence={() => handleReportAbsence(item.assignmentId, item.title)}
                    />
                  ))}
                </View>
              )
            })()}
            renderItem={({ item }) => (
              <MyScheduleCard
                schedule={item}
                unsigning={unsigningId === item.assignmentId}
                onUnsign={() => handleUnsign(item.assignmentId, item.title, item.recurringCommitment)}
                onAttendanceSaved={fetchMine}
                reporting={reportingAbsenceId === item.assignmentId}
                onReportAbsence={() => handleReportAbsence(item.assignmentId, item.title)}
              />
            )}
            contentContainerStyle={{ padding: 16, gap: 12 }}
          />
        )
      ) : activeTab === 'history' ? (
        loadingMine ? (
          <View style={styles.center}><ActivityIndicator size="large" color="#534AB7" /></View>
        ) : (
          <FlatList
            style={{ flex: 1 }}
            data={pastSchedules}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={refreshingMine} onRefresh={() => { setRefreshingMine(true); fetchMine() }} />}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="time-outline" size={48} color="#ccc" />
                <Text style={styles.emptyText}>Brak historii dyżurów</Text>
              </View>
            }
            renderItem={({ item }) => (
              <MyScheduleCard
                schedule={item}
                unsigning={false}
                onUnsign={() => {}}
                onAttendanceSaved={fetchMine}
                reporting={false}
                onReportAbsence={() => {}}
              />
            )}
            contentContainerStyle={{ padding: 16, gap: 12 }}
          />
        )
      ) : (
        loadingSignup ? (
          <View style={styles.center}><ActivityIndicator size="large" color="#534AB7" /></View>
        ) : (
          <View style={{ flex: 1 }}>
            <Calendar
              markingType="multi-dot"
              markedDates={markedDates}
              onDayPress={(day: { dateString: string }) => setSelectedDate(day.dateString)}
              theme={{
                selectedDayBackgroundColor: '#534AB7',
                arrowColor: '#534AB7',
                dotColor: '#534AB7',
                selectedDotColor: '#fff',
              }}
              firstDay={1}
              style={styles.calendar}
              dayComponent={({ date, state, marking, onPress }: any) => {
                const isToday = state === 'today'
                const isSelected = date.dateString === selectedDate
                const isDisabled = state === 'disabled'
                const lit = getLiturgicalDay(date.dateString)
                const litBg = lit ? getLiturgicalBgColor(lit) : null
                const dots: any[] = marking?.dots ?? []
                return (
                  <TouchableOpacity onPress={() => onPress(date)} activeOpacity={0.7}
                    style={styles.dayWrapper}>
                    <View style={[
                      styles.dayCircle,
                      !isSelected && litBg && { backgroundColor: litBg + '40' },
                      isToday && !isSelected && styles.dayTodayCircle,
                      isSelected && styles.daySelectedCircle,
                    ]}>
                      <Text style={[
                        styles.dayNum,
                        isSelected
                          ? { color: '#fff' }
                          : isDisabled
                          ? { color: '#ccc' }
                          : { color: '#1a1a1a' },
                        isToday && !isSelected && styles.dayTodayNum,
                      ]}>
                        {date.day}
                      </Text>
                    </View>
                    <View style={styles.dayDots}>
                      {dots.slice(0, 3).map((dot: any, i: number) => (
                        <View key={i} style={[styles.dayDot,
                          { backgroundColor: isSelected ? '#ffffff99' : dot.color }]} />
                      ))}
                    </View>
                  </TouchableOpacity>
                )
              }}
            />

            {!selectedDate ? (
              <View style={styles.calendarPlaceholder}>
                <Ionicons name="calendar-outline" size={36} color="#ccc" />
                <Text style={styles.calendarPlaceholderText}>Wybierz dzień z kalendarza</Text>
              </View>
            ) : (
              <View style={{ flex: 1 }}>
                {(() => {
                  const lit = getLiturgicalDay(selectedDate)
                  if (!lit) return null
                  const accentColor = getLiturgicalAccentColor(lit)
                  const bgColor = getLiturgicalBgColor(lit)
                  return (
                    <View style={[styles.liturgyRow, bgColor && { backgroundColor: bgColor + '18', borderColor: bgColor + '40' }]}>
                      {accentColor && <View style={[styles.liturgyDot, { backgroundColor: accentColor }]} />}
                      <Text style={styles.liturgyTypeLabel}>{lit.typeLabel}:</Text>
                      <Text style={styles.liturgyName} numberOfLines={2}>{lit.name}</Text>
                    </View>
                  )
                })()}
                <ScrollView
                  contentContainerStyle={{ padding: 16, gap: 12 }}
                  refreshControl={<RefreshControl refreshing={refreshingSignup} onRefresh={() => { setRefreshingSignup(true); fetchSignup() }} />}
                >
                  {(() => {
                    const templateTimes = new Set(
                      getTemplatesForDate(selectedDate, massTemplates).map(t => t.time.slice(0, 5))
                    )
                    const templateSlots = getTemplatesForDate(selectedDate, massTemplates)
                    const extraSchedules = allSchedules.filter(s =>
                      s.date === selectedDate && !templateTimes.has(s.time?.slice(0, 5))
                    )
                    const allSlots = [
                      ...templateSlots.map(t => ({ type: 'template' as const, t })),
                      ...extraSchedules.map(s => ({ type: 'extra' as const, s })),
                    ].sort((a, b) => {
                      const ta = a.type === 'template' ? a.t.time.slice(0, 5) : a.s.time?.slice(0, 5) ?? ''
                      const tb = b.type === 'template' ? b.t.time.slice(0, 5) : b.s.time?.slice(0, 5) ?? ''
                      return ta.localeCompare(tb)
                    })

                    return allSlots.map(item => {
                      if (item.type === 'template') {
                        const { t } = item
                        const time = t.time.slice(0, 5)
                        const schedule = findScheduleForTime(selectedDate, time)
                        return (
                          <TimeSlotCard
                            key={`tpl-${time}`}
                            date={selectedDate}
                            time={time}
                            label={t.label ?? undefined}
                            schedule={schedule}
                            signingUp={signingUpId === `${selectedDate}_${time}`}
                            onSignUp={(mode) => handleSignUpForSlot(selectedDate, time, mode)}
                            onUnsign={schedule?.assignment
                              ? () => handleUnsign(schedule.assignment.id, time)
                              : undefined}
                          />
                        )
                      } else {
                        const { s } = item
                        const time = s.time?.slice(0, 5) ?? ''
                        return (
                          <ExtraScheduleCard
                            key={`extra-${s.id}`}
                            schedule={s}
                            signingUp={signingUpId === `${selectedDate}_${time}`}
                            onSignUp={() => handleSignUpForSlot(selectedDate, time, 'once')}
                            onUnsign={s.assignment ? () => handleUnsign(s.assignment.id, s.title) : undefined}
                          />
                        )
                      }
                    })
                  })()}
                </ScrollView>
              </View>
            )}
          </View>
        )
      )}

      <Modal
        visible={absenceModal.visible}
        transparent
        animationType="slide"
        onRequestClose={() => setAbsenceModal({ visible: false, assignmentId: '', title: '', reason: '' })}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Zgłoś nieobecność</Text>
            <Text style={styles.modalSubtitle}>{absenceModal.title}</Text>
            <TextInput
              style={styles.absenceInput}
              placeholder="Podaj powód nieobecności..."
              placeholderTextColor="#bbb"
              value={absenceModal.reason}
              onChangeText={(text) => setAbsenceModal(prev => ({ ...prev, reason: text }))}
              multiline
              numberOfLines={3}
              maxLength={300}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setAbsenceModal({ visible: false, assignmentId: '', title: '', reason: '' })}
              >
                <Text style={styles.cancelBtnText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, absenceModal.reason.trim().length < 3 && { opacity: 0.5 }]}
                onPress={() => reportAbsence(absenceModal.assignmentId, absenceModal.reason.trim())}
                disabled={absenceModal.reason.trim().length < 3 || reportingAbsenceId !== null}
              >
                {reportingAbsenceId
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.confirmBtnText}>Wyślij</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  )
}

function MyScheduleCard({ schedule, unsigning, onUnsign, onAttendanceSaved, reporting, onReportAbsence }: {
  schedule: any
  unsigning: boolean
  onUnsign: () => void
  onAttendanceSaved: () => void
  reporting: boolean
  onReportAbsence: () => void
}) {
  const { profile } = useAuthStore()
  const [checking, setChecking] = useState(false)
  const [localAttendance, setLocalAttendance] = useState<any>(null)

  const today = new Date().toISOString().split('T')[0]
  const isPast = schedule.date < today
  const canCheckIn = isCheckInWindowOpen(schedule)
  const displayAttendance = localAttendance ?? schedule.attendance
  const hasAttendance = !!displayAttendance

  const pillColor = hasAttendance ? '#27ae60'
    : (isPast && schedule.myStatus === 'assigned') ? '#e74c3c'
    : (STATUS_COLORS[schedule.myStatus] ?? '#888')
  const pillLabel = hasAttendance ? 'Obecny'
    : (isPast && schedule.myStatus === 'assigned') ? 'Nieobecny'
    : (STATUS_LABELS[schedule.myStatus] ?? schedule.myStatus)

  const handleCheckIn = async () => {
    setChecking(true)
    const now = new Date().toISOString()
    const { error } = await supabase.from('attendance').insert({
      schedule_id: schedule.id,
      profile_id: profile?.id,
      method: 'manual',
      lat: null,
      lng: null,
      checked_at: now,
      parish_id: profile?.parish_id,
    })
    if (error) {
      Alert.alert('Błąd', error.code === '23505' ? 'Obecność już zarejestrowana.' : error.message)
      setChecking(false)
      return
    }
    setLocalAttendance({ method: 'manual', checked_at: now })
    setChecking(false)
    onAttendanceSaved()
  }

  return (
    <View style={[styles.card, { borderLeftWidth: 3, borderLeftColor: pillColor }]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{schedule.title}</Text>
        <View style={[styles.pill, { backgroundColor: pillColor + '22' }]}>
          <Text style={[styles.pillText, { color: pillColor }]}>
            {pillLabel}
          </Text>
        </View>
      </View>
      <MetaRow icon="calendar-outline" text={
        new Date(schedule.date + 'T12:00:00').toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })
      } />
      <MetaRow icon="time-outline" text={schedule.time?.slice(0, 5)} />
      {schedule.notes && <MetaRow icon="document-text-outline" text={schedule.notes} />}
      {schedule.group && <MetaRow icon="people-outline" text={schedule.group.name} color="#534AB7" />}

      {hasAttendance ? (
        <View style={styles.attBadge}>
          <Ionicons name="checkmark-circle" size={14} color="#27ae60" />
          <Text style={styles.attBadgeText}>
            {'Obecność potwierdzona · '}
            {new Date(displayAttendance.checked_at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      ) : isPast ? (
        <View style={styles.absentBadge}>
          <Ionicons name="close-circle-outline" size={14} color="#bbb" />
          <Text style={styles.absentText}>Brak potwierdzenia obecności</Text>
        </View>
      ) : canCheckIn ? (
        <TouchableOpacity
          style={[styles.checkBtn, checking && { opacity: 0.6 }]}
          onPress={handleCheckIn}
          disabled={checking}
        >
          {checking ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={15} color="#fff" />
              <Text style={styles.checkBtnText}>Potwierdź obecność</Text>
            </>
          )}
        </TouchableOpacity>
      ) : null}

      {(schedule.myStatus === 'excused') && schedule.myAbsenceReason && (
        <View style={styles.absenceReasonBadge}>
          <Ionicons name="chatbubble-outline" size={13} color="#e67e22" />
          <Text style={styles.absenceReasonText}>{schedule.myAbsenceReason}</Text>
        </View>
      )}

      {schedule.myStatus === 'confirmed' && (
        <View style={styles.confirmedBadge}>
          <Ionicons name="checkmark-circle" size={13} color="#2980b9" />
          <Text style={styles.confirmedText}>Nieobecność usprawiedliwiona</Text>
        </View>
      )}

      {schedule.myStatus === 'absent' && schedule.myAdminNote && (
        <View style={styles.rejectionBadge}>
          <Ionicons name="alert-circle-outline" size={13} color="#e74c3c" />
          <Text style={styles.rejectionText}>{schedule.myAdminNote}</Text>
        </View>
      )}

      {!isPast && schedule.myStatus === 'assigned' && (
        <View style={{ gap: 6, marginTop: 2 }}>
          <TouchableOpacity style={styles.unsignBtn} onPress={onUnsign} disabled={unsigning}>
            {unsigning
              ? <ActivityIndicator size="small" color="#e74c3c" />
              : <Text style={styles.unsignText}>Wypisz się</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity style={styles.reportAbsenceBtn} onPress={onReportAbsence} disabled={reporting}>
            {reporting
              ? <ActivityIndicator size="small" color="#f0a500" />
              : (
                <>
                  <Ionicons name="alert-circle-outline" size={14} color="#f0a500" />
                  <Text style={styles.reportAbsenceText}>Zgłoś nieobecność</Text>
                </>
              )
            }
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

function TimeSlotCard({ time, label, schedule, signingUp, onSignUp, onUnsign }: {
  date?: string
  time: string
  label?: string
  schedule: any | null
  signingUp: boolean
  onSignUp: (mode: 'once' | 'recurring') => void
  onUnsign: (() => void) | undefined
}) {
  const [mode, setMode] = useState<'once' | 'recurring'>('once')
  const isSignedUp = !!schedule?.assignment
  const cat = CATEGORY_CONFIG.msza

  return (
    <View style={[styles.card, { borderLeftWidth: 3, borderLeftColor: cat.color }, isSignedUp && styles.cardSigned]}>
      <View style={styles.cardHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{label ?? 'Msza Święta'}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <Text style={{ fontSize: 12, color: '#999' }}>{time}</Text>
              <View style={[styles.pill, { backgroundColor: cat.bg }]}>
                <Text style={[styles.pillText, { color: cat.color }]}>{cat.label}</Text>
              </View>
            </View>
          </View>
        </View>
        {isSignedUp && (
          <View style={[styles.pill, { backgroundColor: '#f0a50022' }]}>
            <Ionicons name="checkmark-circle" size={13} color="#f0a500" />
            <Text style={[styles.pillText, { color: '#f0a500' }]}>Zapisany</Text>
          </View>
        )}
      </View>

      {schedule?.group && <MetaRow icon="people-outline" text={schedule.group.name} color="#534AB7" />}

      {isSignedUp ? (
        <TouchableOpacity style={styles.unsignBtn} onPress={onUnsign}>
          <Text style={styles.unsignText}>Wypisz się</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.signupRow}>
          <View style={styles.modeToggle}>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'once' && styles.modeBtnActive]}
              onPress={() => setMode('once')}
            >
              <Ionicons name="calendar-outline" size={13} color={mode === 'once' ? '#fff' : '#888'} />
              <Text style={[styles.modeBtnText, mode === 'once' && styles.modeBtnTextActive]}>
                Jednorazowo
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'recurring' && styles.modeBtnActive]}
              onPress={() => setMode('recurring')}
            >
              <Ionicons name="repeat" size={13} color={mode === 'recurring' ? '#fff' : '#888'} />
              <Text style={[styles.modeBtnText, mode === 'recurring' && styles.modeBtnTextActive]}>
                Cyklicznie
              </Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.signupBtn, signingUp && { opacity: 0.6 }]}
            onPress={() => onSignUp(mode)}
            disabled={signingUp}
          >
            {signingUp
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.signupBtnText}>Zapisz się</Text>
            }
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

function ExtraScheduleCard({ schedule, signingUp, onSignUp, onUnsign }: {
  schedule: any
  signingUp: boolean
  onSignUp: () => void
  onUnsign: (() => void) | undefined
}) {
  const { profile } = useAuthStore()
  const [localAttendance, setLocalAttendance] = useState<any>(null)
  const [checking, setChecking] = useState(false)

  const cat = CATEGORY_CONFIG[schedule.category as ScheduleCategory] ?? CATEGORY_CONFIG.msza
  const isNabozenstwo = schedule.category !== 'msza'
  const isSignedUp = !!schedule.assignment
  const displayAttendance = localAttendance ?? schedule.attendance
  const hasAttendance = !!displayAttendance
  const canCheckIn = isCheckInWindowOpen(schedule)

  const handleCheckIn = async () => {
    setChecking(true)
    const now = new Date().toISOString()
    const { error } = await supabase.from('attendance').insert({
      schedule_id: schedule.id,
      profile_id: profile?.id,
      method: 'manual',
      lat: null,
      lng: null,
      checked_at: now,
      parish_id: profile?.parish_id,
    })
    if (error) {
      Alert.alert('Błąd', error.code === '23505' ? 'Obecność już zarejestrowana.' : error.message)
      setChecking(false)
      return
    }
    setLocalAttendance({ method: 'manual', checked_at: now })
    setChecking(false)
  }

  return (
    <View style={[styles.card, { borderLeftWidth: 3, borderLeftColor: cat.color }, !isNabozenstwo && isSignedUp && styles.cardSigned]}>
      <View style={styles.cardHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{schedule.title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <Text style={{ fontSize: 12, color: '#999' }}>{schedule.time?.slice(0, 5)}</Text>
              <View style={[styles.pill, { backgroundColor: cat.bg }]}>
                <Text style={[styles.pillText, { color: cat.color }]}>{cat.label}</Text>
              </View>
            </View>
          </View>
        </View>
        {!isNabozenstwo && isSignedUp && (
          <View style={[styles.pill, { backgroundColor: '#f0a50022' }]}>
            <Ionicons name="checkmark-circle" size={13} color="#f0a500" />
            <Text style={[styles.pillText, { color: '#f0a500' }]}>Zapisany</Text>
          </View>
        )}
      </View>
      {schedule.group && <MetaRow icon="people-outline" text={schedule.group.name} color="#534AB7" />}
      {isNabozenstwo ? (
        hasAttendance ? (
          <View style={styles.attBadge}>
            <Ionicons name="checkmark-circle" size={14} color="#27ae60" />
            <Text style={styles.attBadgeText}>
              {'Obecność potwierdzona · '}
              {new Date(displayAttendance.checked_at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        ) : canCheckIn ? (
          <TouchableOpacity
            style={[styles.checkBtn, checking && { opacity: 0.6 }]}
            onPress={handleCheckIn}
            disabled={checking}
          >
            {checking ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={15} color="#fff" />
                <Text style={styles.checkBtnText}>Potwierdź obecność</Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.absentBadge}>
            <Ionicons name="information-circle-outline" size={14} color="#bbb" />
            <Text style={styles.absentText}>Obecność potwierdź w dniu nabożeństwa</Text>
          </View>
        )
      ) : isSignedUp ? (
        <TouchableOpacity style={styles.unsignBtn} onPress={onUnsign}>
          <Text style={styles.unsignText}>Wypisz się</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.signupBtn, signingUp && { opacity: 0.6 }]}
          onPress={onSignUp}
          disabled={signingUp}
        >
          {signingUp
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.signupBtnText}>Zapisz się</Text>
          }
        </TouchableOpacity>
      )}
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
