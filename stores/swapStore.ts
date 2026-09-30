// N4: prośby o zamianę dyżuru — wspólny stan dla Domu, grafiku i szczegółów służby.
import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { localDateStr } from '../lib/dates'

export type OutgoingSwap = { id: string; scheduleId: string; toName: string }
export type IncomingSwap = {
  id: string
  scheduleId: string
  fromName: string
  message: string | null
  date: string
  time: string
  title: string
}

type SwapState = {
  /** moje otwarte prośby, po id służby */
  outgoing: Record<string, OutgoingSwap>
  /** otwarte prośby do mnie (przyszłe służby) */
  incoming: IncomingSwap[]
  load: (profileId: string) => Promise<void>
  request: (scheduleId: string, toProfileId: string) => Promise<string | null>
  respond: (offerId: string, accept: boolean) => Promise<string | null>
  cancel: (offerId: string) => Promise<string | null>
}

let lastProfile: string | null = null

/** Komunikat błędu RPC; brak funkcji = baza bez migracji 20261001020000. */
function rpcError(msg: string): string {
  return /request_swap|respond_swap|cancel_swap|schema cache/.test(msg) ? 'Zamiany nie są jeszcze włączone w tej bazie' : msg
}

export const useSwapStore = create<SwapState>((set, get) => ({
  outgoing: {},
  incoming: [],

  load: async (profileId) => {
    lastProfile = profileId
    const today = localDateStr()
    const [out, inc] = await Promise.all([
      supabase.from('swap_offers')
        .select('id, schedule_id, to:profiles!swap_offers_to_profile_id_fkey(full_name)')
        .eq('from_profile_id', profileId).eq('status', 'open'),
      supabase.from('swap_offers')
        .select('id, message, schedule:schedules!inner(id, date, time, title), from:profiles!swap_offers_from_profile_id_fkey(full_name)')
        .eq('to_profile_id', profileId).eq('status', 'open').gte('schedule.date', today),
    ])
    const outgoing: Record<string, OutgoingSwap> = {}
    for (const o of (out.data ?? []) as any[]) {
      outgoing[o.schedule_id] = { id: o.id, scheduleId: o.schedule_id, toName: o.to?.full_name ?? '—' }
    }
    const incoming = ((inc.data ?? []) as any[]).map(o => ({
      id: o.id,
      scheduleId: o.schedule.id,
      fromName: o.from?.full_name ?? '—',
      message: o.message ?? null,
      date: o.schedule.date,
      time: (o.schedule.time ?? '').slice(0, 5),
      title: o.schedule.title,
    })).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
    set({ outgoing, incoming })
  },

  request: async (scheduleId, toProfileId) => {
    const { error } = await supabase.rpc('request_swap', { p_schedule_id: scheduleId, p_to_profile_id: toProfileId })
    if (error) return rpcError(error.message)
    if (lastProfile) await get().load(lastProfile)
    return null
  },

  respond: async (offerId, accept) => {
    const { error } = await supabase.rpc('respond_swap', { p_offer_id: offerId, p_accept: accept })
    if (lastProfile) await get().load(lastProfile)
    return error ? rpcError(error.message) : null
  },

  cancel: async (offerId) => {
    const { error } = await supabase.rpc('cancel_swap', { p_offer_id: offerId })
    if (lastProfile) await get().load(lastProfile)
    return error ? rpcError(error.message) : null
  },
}))
