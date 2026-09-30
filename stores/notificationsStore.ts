// N3: centrum powiadomień (tabela notifications, zapisywana przez triggery w bazie).
// Przed migracją 20261001050000 tabeli nie ma — dzwonek się wtedy nie pokazuje (available = false).
import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export type AppNotification = {
  id: string
  type: string
  title: string
  body: string | null
  data: Record<string, any>
  created_at: string
  read_at: string | null
}

type State = {
  available: boolean
  items: AppNotification[]
  unread: number
  profileId: string | null
  load: (profileId: string) => Promise<void>
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
}

let channel: ReturnType<typeof supabase.channel> | null = null

const countUnread = (items: AppNotification[]) => items.filter(n => !n.read_at).length

export const useNotificationsStore = create<State>((set, get) => ({
  available: false,
  items: [],
  unread: 0,
  profileId: null,

  load: async (profileId) => {
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, title, body, data, created_at, read_at')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) { set({ available: false, profileId }); return }
    const items = (data ?? []) as AppNotification[]
    set({ available: true, items, unread: countUnread(items), profileId })

    if (!channel || (channel as any).__profile !== profileId) {
      if (channel) supabase.removeChannel(channel)
      channel = supabase
        .channel(`notifications-${profileId}-${Math.random().toString(36).slice(2, 7)}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `profile_id=eq.${profileId}` },
          payload => {
            const n = payload.new as AppNotification
            const items = [n, ...get().items.filter(x => x.id !== n.id)].slice(0, 50)
            set({ items, unread: countUnread(items) })
          })
        .subscribe()
      ;(channel as any).__profile = profileId
    }
  },

  markRead: async (id) => {
    const now = new Date().toISOString()
    const items = get().items.map(n => (n.id === id && !n.read_at ? { ...n, read_at: now } : n))
    set({ items, unread: countUnread(items) })
    await supabase.from('notifications').update({ read_at: now }).eq('id', id).is('read_at', null)
  },

  markAllRead: async () => {
    const { profileId } = get()
    if (!profileId) return
    const now = new Date().toISOString()
    const items = get().items.map(n => (n.read_at ? n : { ...n, read_at: now }))
    set({ items, unread: 0 })
    await supabase.from('notifications').update({ read_at: now }).eq('profile_id', profileId).is('read_at', null)
  },
}))

/** Dokąd prowadzi powiadomienie (zależnie od roli). */
export function notificationHref(n: AppNotification, role: 'member' | 'parent' | 'admin'): string {
  if (role === 'admin') {
    if (n.type === 'excuse_request') return '/(admin)/absence-requests'
    if (n.type === 'member_pending') return '/(admin)/(admin-tabs)/members'
    return '/(admin)/(admin-tabs)'
  }
  if (role === 'parent') {
    if (n.type === 'announcement') return '/(parent)/(parent-tabs)/announcements'
    if (n.type === 'points') return '/(parent)/(parent-tabs)/points'
    if (n.type === 'assignment' || n.type === 'excuse_decision') return '/(parent)/(parent-tabs)/schedule'
    return '/(parent)/(parent-tabs)'
  }
  if (n.type === 'announcement') return '/(tabs)/announcements'
  if (n.type === 'points') return '/(tabs)/points'
  if (n.type === 'assignment' || n.type === 'excuse_decision') return '/(tabs)/schedule'
  return '/(tabs)'
}

export const NOTIFICATION_ICON: Record<string, string> = {
  assignment: 'calendar-plus',
  announcement: 'bullhorn',
  points: 'star-circle',
  excuse_request: 'calendar-remove',
  excuse_decision: 'calendar-check',
  member_pending: 'account-clock',
  account_approved: 'account-check',
  swap_request: 'swap-horizontal',
  swap_response: 'swap-horizontal',
}
