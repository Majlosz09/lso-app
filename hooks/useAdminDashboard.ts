import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { addDays, localDateStr, weekDays } from '../lib/dates'
import { attendanceRate } from '../lib/serviceRules'

export type DayStaffing = { date: string; staffed: number; total: number }
export type UpcomingService = { id: string; date: string; time: string; title: string; people: number }

export type AdminDashboard = {
  members: number
  unstaffed7: number
  firstUnstaffed: UpcomingService | null
  excuses: { count: number; names: string[] }
  /** zgłoszenia obecności po fakcie */
  attendanceReports: { count: number; names: string[] }
  /** ścieżka formacji: spełnili wymagania do kolejnego stopnia */
  promotions: { count: number; names: string[] }
  pending: { count: number; names: string[] }
  reports: number
  avgAttendance: number | null
  week: DayStaffing[]
  upcoming: UpcomingService[]
}

const ACTIVE = (s: string) => !['absent', 'excused', 'confirmed', 'swapped'].includes(s)

/** Dane pulpitu opiekuna: kafle, „wymaga uwagi”, obsada tygodnia, najbliższe służby. */
export function useAdminDashboard() {
  const parishId = useAuthStore(s => s.profile?.parish_id)
  const [data, setData] = useState<AdminDashboard | null>(null)

  const load = useCallback(async () => {
    if (!parishId) return
    const today = localDateStr()
    const week = weekDays(0)
    const from = week[0] < today ? week[0] : today
    const to = addDays(today, 7) > week[6] ? addDays(today, 7) : week[6]
    const since30 = addDays(today, -30)

    const [members, pending, reports, excuses, services, past, attReports, ready] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true })
        .eq('parish_id', parishId).eq('is_active', true).eq('role', 'member'),
      supabase.rpc('get_pending_members'),
      supabase.from('chat_reports').select('id', { count: 'exact', head: true }).is('resolved_at', null),
      supabase.from('schedule_assignments')
        .select('id, profile:profiles(full_name), schedule:schedules!inner(parish_id)')
        .eq('status', 'excused').eq('schedule.parish_id', parishId),
      supabase.from('schedules').select('id, date, time, title, category, service_mode, schedule_assignments(status)')
        .eq('parish_id', parishId).gte('date', from).lte('date', to).order('date').order('time'),
      supabase.from('schedule_assignments').select('status, schedule:schedules!inner(parish_id, date)')
        .eq('schedule.parish_id', parishId).gte('schedule.date', since30).lt('schedule.date', today),
      supabase.from('attendance_reports').select('id, profile:profiles!attendance_reports_profile_id_fkey(full_name)')
        .eq('parish_id', parishId).eq('status', 'pending'),
      supabase.rpc('formation_ready'),
    ])

    const svc = ((services.data ?? []) as any[]).map(s => ({
      id: s.id, date: s.date, time: (s.time ?? '').slice(0, 5), title: s.title, mode: s.service_mode, category: s.category,
      people: (s.schedule_assignments ?? []).filter((a: any) => ACTIVE(a.status)).length,
    }))
    const next7 = svc.filter(s => s.date >= today && s.date <= addDays(today, 7))
    // „bez obsady” tylko tam, gdzie liczymy obecność (tryb none = Msza bez ministrantów)
    const unstaffed = next7.filter(s => s.people === 0 && s.mode !== 'none' && s.category !== 'zbiorka')
    const firstName = (n?: string) => (n ?? '').split(' ')[0]
    const excuseRows = (excuses.data ?? []) as any[]
    const pendingRows = (Array.isArray(pending.data) ? pending.data : []) as any[]

    setData({
      members: members.count ?? 0,
      unstaffed7: unstaffed.length,
      firstUnstaffed: unstaffed[0] ?? null,
      promotions: {
        count: Array.isArray(ready.data) ? ready.data.length : 0,
        names: (Array.isArray(ready.data) ? ready.data : []).map((r: any) => firstName(r.full_name)).filter(Boolean),
      },
      attendanceReports: {
        count: ((attReports.data ?? []) as any[]).length,
        names: ((attReports.data ?? []) as any[]).map(r => firstName(r.profile?.full_name)).filter(Boolean),
      },
      excuses: { count: excuseRows.length, names: excuseRows.map(e => firstName(e.profile?.full_name)).filter(Boolean) },
      pending: { count: pendingRows.length, names: pendingRows.map(p => firstName(p.full_name)).filter(Boolean) },
      reports: reports.count ?? 0,
      avgAttendance: attendanceRate(((past.data ?? []) as any[]).map(a => a.status)),
      week: week.map(d => {
        const day = svc.filter(s => s.date === d)
        return { date: d, total: day.length, staffed: day.filter(s => s.people > 0).length }
      }),
      upcoming: next7.slice(0, 6),
    })
  }, [parishId])

  useFocusEffect(useCallback(() => { load() }, [load]))
  return { data, reload: load }
}
