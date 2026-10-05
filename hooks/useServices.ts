import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useRealtimeTable } from './useRealtimeTable'
import type { AssignmentStatus, ScheduleCategory } from '../types/database'
import { ServiceMode, slotTitle } from '../lib/massSchedule'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { isNetworkError, queueKey } from '../lib/offlineQueue'
import { useCheckinQueue } from '../stores/checkinQueueStore'

export type ServicePerson = { profileId: string; name: string; status: AssignmentStatus; isMe: boolean; role: string }

export type MyAssignment = {
  id: string
  status: AssignmentStatus
  absence_reason: string | null
  admin_note: string | null
}

export type Service = {
  /** id służby albo `tpl-<data>-<godzina>-<kościół>` dla pozycji z rozkładu, dla której służba jeszcze nie istnieje */
  id: string
  date: string
  /** HH:MM */
  time: string
  title: string
  category: ScheduleCategory
  /** zapisy / grafik opiekuna / bez obecności i punktów */
  serviceMode: ServiceMode
  /** kościół / kaplica (null = baza bez kościołów) */
  churchId: string | null
  /** nazwa do pokazania — tylko gdy parafia ma kilka kościołów i to nie jest kościół główny */
  churchName: string | null
  /** GPS kościoła tej służby (do potwierdzenia obecności) */
  churchGps: { lat: number; lng: number; radius: number } | null
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
  /** grafik z pamięci telefonu (brak internetu) */
  const [offline, setOffline] = useState(false)
  const queued = useCheckinQueue(st => st.items)

  const load = useCallback(async () => {
    if (!profile?.id || !profile.parish_id) return
    const [schedRes, tplRes, chRes] = await Promise.all([
      supabase
        .from('schedules')
        .select('id, date, time, title, category, service_mode, notes, church_id')
        .eq('parish_id', profile.parish_id)
        .gte('date', from)
        .lte('date', to)
        .order('date').order('time'),
      // obowiązujący rozkład (stały + zmiany okresowe)
      supabase.rpc('mass_slots', { p_parish: profile.parish_id, p_from: from, p_to: to }),
      supabase.from('churches').select('id, name, short_name, is_main, lat, lng, gps_radius').eq('parish_id', profile.parish_id),
    ])
    const cacheKey = `services-cache:v1:${profile.id}:${from}:${to}`
    if (schedRes.error && isNetworkError(schedRes.error)) {
      // bez zasięgu: ostatnio pobrany grafik (żeby dało się zameldować w zakrystii bez sieci)
      try {
        const raw = await AsyncStorage.getItem(cacheKey)
        if (raw) { setServices(JSON.parse(raw)); setOffline(true) }
      } catch { /* brak pamięci */ }
      setLoading(false)
      return
    }
    const churches = (chRes.data ?? []) as any[]
    const churchById = new Map(churches.map(ch => [ch.id, ch]))
    const churchInfo = (id: string | null | undefined) => {
      const ch = id ? churchById.get(id) : churches.find(x => x.is_main)
      return {
        churchId: ch?.id ?? null,
        churchName: ch && churches.length > 1 && !ch.is_main ? (ch.short_name?.trim() || ch.name) : null,
        churchGps: ch?.lat != null && ch?.lng != null ? { lat: ch.lat, lng: ch.lng, radius: ch.gps_radius ?? 200 } : null,
      }
    }
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
        ...churchInfo(s.church_id),
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
      const taken = new Set(list.map(s => `${s.date}_${s.time}_${s.churchId ?? ''}`))
      for (const t of slots) {
        const time = String(t.slot_time).slice(0, 5)
        if (taken.has(`${t.slot_date}_${time}_${t.church_id ?? churchInfo(null).churchId ?? ''}`)) continue
        list.push({
          id: `tpl-${t.slot_date}-${time}-${t.church_id ?? 'main'}`, date: t.slot_date, time, title: slotTitle(t), category: t.category,
          serviceMode: t.service_mode, ...churchInfo(t.church_id), notes: null, isTemplate: true, mine: null, attended: false, people: [],
        })
      }
      list.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
    }

    setServices(list)
    setOffline(false)
    setLoading(false)
    try { await Promise.resolve(AsyncStorage.setItem(cacheKey, JSON.stringify(list))) } catch { /* bez pamięci */ }
  }, [profile?.id, profile?.parish_id, from, to])

  useEffect(() => { setLoading(true); load() }, [load])
  // kolejka wysłana → odśwież (obecność jest już w bazie)
  const prevQueued = useRef(queued.length)
  useEffect(() => {
    if (queued.length < prevQueued.current) load()
    prevQueued.current = queued.length
  }, [queued.length])
  useRealtimeTable('schedule_assignments', () => { load() })
  useRealtimeTable('schedules', () => { load() }, profile?.parish_id ? `parish_id=eq.${profile.parish_id}` : undefined)

  // obecność czekająca w kolejce telefonu = już potwierdzona (nie meldujemy drugi raz)
  const pendingKeys = new Set(queued.filter(q => q.profileId === profile?.id).map(q => q.key))
  const shown = pendingKeys.size && profile?.id
    ? services.map(s => pendingKeys.has(queueKey(profile.id, s.date, s.time, s.churchId)) ? { ...s, attended: true } : s)
    : services

  return { services: shown, loading, offline, refresh: load }
}

