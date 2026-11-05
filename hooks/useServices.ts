import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import type { AssignmentStatus, ScheduleCategory } from '../types/database'
import { ServiceMode, slotTitle } from '../lib/massSchedule'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { pruneServicesCache, servicesCacheKey } from '../lib/servicesCache'
import { localDateStr } from '../lib/dates'
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

type ServicesResult = { list: Service[]; offline: boolean }

async function fetchServices(profileId: string, parishId: string, from: string, to: string): Promise<ServicesResult> {
    const [schedRes, tplRes, chRes] = await Promise.all([
      supabase
        .from('schedules')
        .select('id, date, time, title, category, service_mode, notes, church_id')
        .eq('parish_id', parishId)
        .gte('date', from)
        .lte('date', to)
        .order('date').order('time'),
      // obowiązujący rozkład (stały + zmiany okresowe)
      supabase.rpc('mass_slots', { p_parish: parishId, p_from: from, p_to: to }),
      supabase.from('churches').select('id, name, short_name, is_main, lat, lng, gps_radius').eq('parish_id', parishId),
    ])
    const cacheKey = servicesCacheKey(profileId, from, to)
    if (schedRes.error && isNetworkError(schedRes.error)) {
      // bez zasięgu: ostatnio pobrany grafik (żeby dało się zameldować w zakrystii bez sieci)
      try {
        const raw = await AsyncStorage.getItem(cacheKey)
        if (raw) return { list: JSON.parse(raw) as Service[], offline: true }
      } catch { /* brak pamięci */ }
      return { list: [], offline: true }
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
          .eq('profile_id', profileId)
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
      const mine = rows.find(r => r.profile_id === profileId)
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
          .map(r => ({ profileId: r.profile_id, name: r.profile?.full_name ?? '—', status: r.status, isMe: r.profile_id === profileId, role: r.role ?? 'ministrant' }))
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

    try { await Promise.resolve(AsyncStorage.setItem(cacheKey, JSON.stringify(list))) } catch { /* bez pamięci */ }
    pruneServicesCache(profileId, localDateStr(new Date()))
    return { list, offline: false }
}

// ── Odświeżanie przez realtime: jedna subskrypcja na aplikację (wcześniej każda kopia hooka — Pulpit, Grafik,
// Obecność — miała własne kanały i przeładowywała się osobno przy każdej zmianie). Seria zmian (np. „Ułóż grafik”)
// = jedno odświeżenie po 1,5 s. Odświeżane są tylko widoczne ekrany; pozostałe pobiorą dane przy powrocie.
const SERVICES_KEY = 'services'
const EMPTY: Service[] = []
let rtChannels: ReturnType<typeof supabase.channel>[] = []
let rtParish: string | null = null
let rtUsers = 0
let rtTimer: ReturnType<typeof setTimeout> | null = null

function subscribeServicesRealtime(qc: QueryClient, parishId: string): () => void {
  if (rtChannels.length && rtParish !== parishId) { rtChannels.forEach(ch => supabase.removeChannel(ch)); rtChannels = [] }
  rtUsers++
  if (!rtChannels.length) {
    rtParish = parishId
    const bump = () => {
      if (rtTimer) clearTimeout(rtTimer)
      rtTimer = setTimeout(() => { rtTimer = null; qc.invalidateQueries({ queryKey: [SERVICES_KEY] }) }, 1500)
    }
    const id = Math.random().toString(36).slice(2, 8)
    // Osobne kanały: gdy tabela nie jest w publikacji Realtime, serwer odrzuca CAŁY kanał. Na LSO-dev (2026-11-05)
    // schedules w publikacji nie ma — we wspólnym kanale przestałyby docierać też zmiany przydziałów.
    // Przydziały bez kolumny parafii: Realtime i tak dostarcza tylko wiersze widoczne przez RLS (własna parafia).
    rtChannels = [
      supabase.channel(`services-a-${parishId}-${id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_assignments' }, bump)
        .subscribe(),
      supabase.channel(`services-s-${parishId}-${id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'schedules', filter: `parish_id=eq.${parishId}` }, bump)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'schedules', filter: `parish_id=eq.${parishId}` }, bump)
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'schedules' }, bump)
        .subscribe(),
    ]
  }
  return () => {
    rtUsers--
    if (rtUsers <= 0 && rtChannels.length) { rtChannels.forEach(ch => supabase.removeChannel(ch)); rtChannels = []; rtParish = null; rtUsers = 0 }
  }
}

/**
 * Służby parafii w zakresie dat (włącznie) + wolne miejsca z rozkładu Mszy,
 * z obsadą, moim przydziałem i moją obecnością. Dane wspólne dla ekranów z tym samym zakresem (React Query),
 * odświeżane przez realtime.
 */
export function useServices(from: string, to: string) {
  const profile = useAuthStore(s => s.profile)
  const queued = useCheckinQueue(st => st.items)
  const qc = useQueryClient()
  const profileId = profile?.id, parishId = profile?.parish_id
  const query = useQuery({
    queryKey: [SERVICES_KEY, profileId, parishId, from, to],
    queryFn: () => fetchServices(profileId!, parishId!, from, to),
    enabled: !!profileId && !!parishId,
    staleTime: 30_000,
  })
  // po akcji (zapis, meldowanie) odśwież grafik na wszystkich ekranach — widoczne od razu, reszta przy powrocie
  const load = useCallback(async () => { await qc.invalidateQueries({ queryKey: [SERVICES_KEY] }) }, [qc])

  useEffect(() => {
    if (!parishId) return
    return subscribeServicesRealtime(qc, parishId)
  }, [qc, parishId])

  // kolejka wysłana → odśwież (obecność jest już w bazie)
  const prevQueued = useRef(queued.length)
  useEffect(() => {
    if (queued.length < prevQueued.current) load()
    prevQueued.current = queued.length
  }, [queued.length])

  // obecność czekająca w kolejce telefonu = już potwierdzona (nie meldujemy drugi raz)
  const services = query.data?.list ?? EMPTY
  const shown = useMemo(() => {
    const pendingKeys = new Set(queued.filter(q => q.profileId === profileId).map(q => q.key))
    return pendingKeys.size && profileId
      ? services.map(s => pendingKeys.has(queueKey(profileId, s.date, s.time, s.churchId)) ? { ...s, attended: true } : s)
      : services
  }, [services, queued, profileId])

  return { services: shown, loading: query.isLoading || (!query.data && !!profileId && !!parishId), offline: query.data?.offline ?? false, refresh: load }
}

