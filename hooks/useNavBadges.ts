import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import type { BadgeKey, NavRole } from '../lib/navigation'

export type NavBadges = Partial<Record<BadgeKey, number>>

/** Liczniki w sidebarze: nieprzeczytany czat, oczekujące konta, prośby o usprawiedliwienie. */
export function useNavBadges(role: NavRole, enabled = true): NavBadges {
  const parishId = useAuthStore(s => s.profile?.parish_id)

  const { data } = useQuery({
    queryKey: ['nav-badges', role, parishId],
    enabled: enabled && !!parishId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<NavBadges> => {
      const chatReq = supabase.rpc('get_chat_channels_with_meta')
      if (role !== 'admin') {
        const { data: ch } = await chatReq
        return { chat: sumUnread(ch) }
      }
      const [{ data: ch }, { data: pending }, { count }] = await Promise.all([
        chatReq,
        supabase.rpc('get_pending_members'),
        supabase
          .from('schedule_assignments')
          .select('id, schedule:schedules!inner(parish_id)', { count: 'exact', head: true })
          .eq('status', 'excused')
          .eq('schedule.parish_id', parishId!),
      ])
      return {
        chat: sumUnread(ch),
        pending: Array.isArray(pending) ? pending.length : 0,
        excuses: count ?? 0,
      }
    },
  })
  return data ?? {}
}

function sumUnread(rows: unknown): number {
  if (!Array.isArray(rows)) return 0
  return rows.reduce((sum, r: any) => sum + Number(r?.unread_count ?? 0), 0)
}
