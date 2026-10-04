import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useRealtimeTable } from './useRealtimeTable'
import type { AssignmentStatus, ScheduleCategory } from '../types/database'
import { ServiceMode, slotTitle } from '../lib/massSchedule'

export type ServicePerson = { profileId: string; name: string; status: AssignmentStatus; isMe: boolean; role: string }

export type MyAssignment = {
  id: string
  status: AssignmentStatus
  absence_reason: string | null
  admin_note: string | null
}

export type Service = {
  /** id służby albo `tpl-<data>-<godzina>` dla pozycji z rozkładu, dla której służba jeszcze nie istnieje */
  id: string
  date: string
  /** HH:MM */
  time: string
  title: string
  category: ScheduleCategory
  /** zapisy / grafik opiekuna / bez obecności i punktów */
  serviceMode: ServiceMode
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
        .select('id, date, time, title, category, service_mode, notes')
        .eq('parish_id', profile.parish_id)
        .gte('date', from)
        .lte('date', to)
        .order('date').order('time'),
      // obowiązujący rozkład (stały + zmiany okresowe)
      supabase.rpc('mass_slots', { p_parish: profile.parish_id, p_from: from, p_to: to }),
    ])
    const schedules = (schedRes.data ?? []) as any[]
    const ids = schedules.map(s => s.id)

    let assignments: any[] = []
    let attended = new Set<string>()
    if (ids.length) {
      const [aRes, attRes] = await Promise.all([
        supabase
          .from('schedule_assignments')
          .select('id, schedule_id, profile_id, role, status, absence_reason, admin_note, profile:profiles(full_name)')
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
        serviceMode: (s.service_mode ?? 'signup') as ServiceMode,
        notes: s.notes ?? null,
        isTemplate: false,
        mine: mine
          ? { id: mine.id, status: mine.status, absence_reason: mine.absence_reason, admin_note: mine.admin_note }
          : null,
        attended: attended.has(s.id) || mine?.status === 'present',
        people: rows
          .map(r => ({ profileId: r.profile_id, name: r.profile?.full_name ?? '—', status: r.status, isMe: r.profile_id === profile.id, role: r.role ?? 'ministrant' }))
          .sort((a, b) => Number(b.isMe) - Number(a.isMe) || a.name.localeCompare(b.name, 'pl')),
      }
    })

    // Pozycje rozkładu, dla których służba jeszcze nie powstała
    const slots = (tplRes.data ?? []) as any[]
    if (slots.length) {
      const taken = new Set(list.map(s => `${s.date}_${s.time}`))
      for (const t of slots) {
        const time = String(t.slot_time).slice(0, 5)
        if (taken.has(`${t.slot_date}_${time}`)) continue
        list.push({
          id: `tpl-${t.slot_date}-${time}`, date: t.slot_date, time, title: slotTitle(t), category: t.category,
          serviceMode: t.service_mode, notes: null, isTemplate: true, mine: null, attended: false, people: [],
        })
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

