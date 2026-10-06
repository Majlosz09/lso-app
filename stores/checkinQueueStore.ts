// Meldowania bez zasięgu: kolejka w telefonie + wysyłka po powrocie sieci (useCheckinQueueSync w AuthGate).
import { useEffect } from 'react'
import { AppState } from 'react-native'
import Toast from 'react-native-toast-message'
import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { QueuedCheckIn, addToQueue, dropExpired, isNetworkError, readQueue, writeQueue } from '../lib/offlineQueue'
import { useAuthStore } from './authStore'

type QueueState = {
  items: QueuedCheckIn[]
  loaded: boolean
  flushing: boolean
  load: () => Promise<void>
  enqueue: (item: QueuedCheckIn) => Promise<void>
  /** wysyła kolejkę zalogowanej osoby; zwraca liczbę wysłanych */
  flush: (profileId: string, opts?: { manual?: boolean }) => Promise<number>
}

export const useCheckinQueue = create<QueueState>((set, get) => ({
  items: [],
  loaded: false,
  flushing: false,
  load: async () => {
    if (get().loaded) return
    set({ items: await readQueue(), loaded: true })
  },
  enqueue: async (item) => {
    await get().load()
    const items = addToQueue(get().items, item)
    set({ items })
    await writeQueue(items)
  },
  flush: async (profileId, opts) => {
    await get().load()
    if (get().flushing) return 0
    const mine = get().items.filter(x => x.profileId === profileId)
    if (!mine.length) return 0
    set({ flushing: true })
    const { keep, expired } = dropExpired(mine)
    const done = new Set<string>(expired.map(x => x.key))
    let sent = 0, offline = false
    for (const it of keep) {
      const { data, error } = await supabase.rpc('check_in_offline', {
        p_date: it.date, p_time: it.time, p_client_time: it.clientTime, p_method: it.method,
        p_schedule_id: it.scheduleId, p_church_id: it.churchId,
      })
      if (error && isNetworkError(error)) { offline = true; break }
      done.add(it.key)
      if (error) {
        Toast.show({ type: 'error', text1: `Nie przyjęto obecności: ${it.title} ${it.time}`, text2: error.message })
      } else {
        sent++
        const r = data as any
        if (!r?.already_checked_in) Toast.show({
          type: 'success',
          text1: `Wysłano obecność: ${it.title} ${it.time}`,
          text2: r?.points_awarded > 0 ? `+${r.points_awarded} pkt` : undefined,
        })
      }
    }
    if (expired.length) Toast.show({ type: 'error', text1: 'Obecność nie została wysłana w 48 h', text2: 'Zgłoś ją opiekunowi.' })
    if (offline && opts?.manual) Toast.show({ type: 'info', text1: 'Nadal brak internetu', text2: 'Wyślemy, gdy wróci zasięg.' })
    const items = get().items.filter(x => !done.has(x.key))
    set({ items, flushing: false })
    await writeQueue(items)
    return sent
  },
}))

/** AuthGate: wysyła kolejkę przy starcie, powrocie do aplikacji i co minutę, dopóki coś czeka. */
export function useCheckinQueueSync() {
  const profileId = useAuthStore(s => s.profile?.id)
  const pending = useCheckinQueue(s => s.items.some(x => x.profileId === profileId))
  useEffect(() => {
    if (!profileId) return
    const q = useCheckinQueue.getState()
    q.load().then(() => q.flush(profileId))
    const sub = AppState.addEventListener('change', st => { if (st === 'active') useCheckinQueue.getState().flush(profileId) })
    const onOnline = () => useCheckinQueue.getState().flush(profileId)
    const w = typeof window !== 'undefined' && typeof window.addEventListener === 'function' ? window : null
    w?.addEventListener('online', onOnline)
    return () => { sub.remove(); w?.removeEventListener('online', onOnline) }
  }, [profileId])
  useEffect(() => {
    if (!profileId || !pending) return
    const t = setInterval(() => useCheckinQueue.getState().flush(profileId), 60_000)
    return () => clearInterval(t)
  }, [profileId, pending])
}
