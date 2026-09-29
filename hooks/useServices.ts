import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useRealtimeTable } from './useRealtimeTable'
import type { AssignmentStatus, ScheduleCategory } from '../types/database'

export type ServicePerson = { profileId: string; name: string; status: AssignmentStatus; isMe: boolean }

export type MyAssignment = {
  id: string
  status: AssignmentStatus
  absence_reason: string | null
  admin_note: string | null
}

export type Service = {
  /** id służby albo `tpl-<data>-<id szablonu>` dla wolnego miejsca z rozkładu Mszy */
  id: string
  date: string
  /** HH:MM */
  time: string
  title: string
  category: ScheduleCategory
  notes: string | null
  /** wolne miejsce z rozkładu Mszy (służba jeszcze nie istnieje w bazie) */
  isTemplate: boolean
  mine: MyAssignment | null
  attended: boolean
  people: ServicePerson[]
}

/** Obsada: na Mszę potrzeba co najmniej jednego ministranta. */
export function staffing(s: Service): { count: number; staffed: boolean } {
  const count = s.people.filter(p => !['absent', 'excused', 'confirmed', 'swapped'].includes(p.status)).length
  return { count, staffed: count >= 1 }
}

/**
 * Służby parafii w zakresie dat (włącznie) + wolne miejsca z rozkładu Mszy,
 * z obsadą, moim przydziałem i moją obecnością. Odświeża się przez realtime.
 */
export function useServices(from: string, to: string) {
  const profile = useAuthStore(s => s.profile)
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!profile?.id || !profile.parish_id) return
    const [schedRes, tplRes] = await Promise.all([
      supabase
        .from('schedules')
        .select('id, date, time, title, category, notes')
        .eq('parish_id', profile.parish_id)
        .gte('date', from)
        .lte('date', to)
        .order('date').order('time'),
      supabase
        .from('mass_templates')
        .select('id, day_of_week, time, label')
        .eq('parish_id', profile.parish_id)
        .order('day_of_week').order('time'),
    ])
    const schedules = (schedRes.data ?? []) as any[]
    const ids = schedules.map(s => s.id)

    let assignments: any[] = []
    let attended = new Set<string>()
    if (ids.length) {
      const [aRes, attRes] = await Promise.all([
        supabase
          .from('schedule_assignments')
          .select('id, schedule_id, profile_id, status, absence_reason, admin_note, profile:profiles(full_name)')
          .in('schedule_id', ids),
        supabase
          .from('attendance')
          .select('schedule_id')
          .eq('profile_id', profile.id)
          .in('schedule_id', ids),
      ])
      assignments = aRes.data ?? []
      attended = new Set((attRes.data ?? []).map((a: any) => a.schedule_id))
    }

    const byService = new Map<string, any[]>()
    for (const a of assignments) {
      const list = byService.get(a.schedule_id) ?? []
      list.push(a)
      byService.set(a.schedule_id, list)
    }

    const list: Service[] = schedules.map(s => {
      const rows = byService.get(s.id) ?? []
      const mine = rows.find(r => r.profile_id === profile.id)
      return {
        id: s.id,
        date: s.date,
        time: (s.time ?? '').slice(0, 5),
        title: s.title,
        category: (s.category ?? 'msza') as ScheduleCategory,
        notes: s.notes ?? null,
        isTemplate: false,
        mine: mine
          ? { id: mine.id, status: mine.status, absence_reason: mine.absence_reason, admin_note: mine.admin_note }
          : null,
        attended: attended.has(s.id) || mine?.status === 'present',
        people: rows
          .map(r => ({ profileId: r.profile_id, name: r.profile?.full_name ?? '—', status: r.status, isMe: r.profile_id === profile.id }))
          .sort((a, b) => Number(b.isMe) - Number(a.isMe) || a.name.localeCompare(b.name, 'pl')),
      }
    })

    // Wolne miejsca z rozkładu Mszy tam, gdzie służba jeszcze nie powstała
    const templates = (tplRes.data ?? []) as any[]
    if (templates.length) {
      const taken = new Set(list.map(s => `${s.date}_${s.time}`))
      for (let d = from; d <= to; d = nextDay(d)) {
        const dow = new Date(d + 'T12:00:00').getDay()
        for (const t of templates.filter(t => t.day_of_week === dow)) {
          const time = t.time.slice(0, 5)
          if (taken.has(`${d}_${time}`)) continue
          list.push({
            id: `tpl-${d}-${t.id}`, date: d, time, title: t.label ?? 'Msza Święta', category: 'msza',
            notes: null, isTemplate: true, mine: null, attended: false, people: [],
          })
        }
      }
      list.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
    }

    setServices(list)
    setLoading(false)
  }, [profile?.id, profile?.parish_id, from, to])

  useEffect(() => { setLoading(true); load() }, [load])
  useRealtimeTable('schedule_assignments', () => { load() })
  useRealtimeTable('schedules', () => { load() }, profile?.parish_id ? `parish_id=eq.${profile.parish_id}` : undefined)

  return { services, loading, refresh: load }
}

function nextDay(d: string): string {
  const x = new Date(d + 'T12:00:00')
  x.setDate(x.getDate() + 1)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
