import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { attendanceRate } from '../lib/serviceRules'
import { addDays, localDateStr } from '../lib/dates'

export type ChildDuty = { assignmentId: string; scheduleId: string; date: string; time: string; title: string; category: string; status: string }

export type ChildSummary = {
  id: string
  full_name: string
  avatar_url: string | null
  rankName: string | null
  points: number
  services: number
  position: number
  attendance: number | null
  badges: string[]
  duties: ChildDuty[]
}

/** Dzieci rodzica (parent_id) z punktami, miejscem, frekwencją i dyżurami od dziś na `daysAhead` dni. */
export function useChildren(daysAhead = 14) {
  const profile = useAuthStore(s => s.profile)
  const [children, setChildren] = useState<ChildSummary[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!profile?.id) return
    const today = localDateStr()
    const { data: kids } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, rank_id, ranks(name)')
      .eq('parent_id', profile.id)
    const list = (kids ?? []) as any[]
    if (!list.length) { setChildren([]); setLoading(false); return }
    const ids = list.map(k => k.id)

    const [ranking, assigns, badges] = await Promise.all([
      profile.parish_id
        ? supabase.from('points_summary').select('profile_id, total_points, services_count').eq('parish_id', profile.parish_id).order('total_points', { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
      supabase.from('schedule_assignments')
        .select('id, profile_id, status, schedule:schedules!inner(id, date, time, title, category)')
        .in('profile_id', ids)
        .gte('schedule.date', addDays(today, -60))
        .lte('schedule.date', addDays(today, daysAhead)),
      supabase.from('member_badges').select('profile_id, badge_definition:badge_definitions(icon)').in('profile_id', ids).eq('is_active', true),
    ])
    const rows = (ranking.data ?? []) as any[]
    const allAssigns = (assigns.data ?? []) as any[]
    setChildren(list.map(k => {
      const idx = rows.findIndex(r => r.profile_id === k.id)
      const mine = allAssigns.filter(a => a.profile_id === k.id)
      return {
        id: k.id,
        full_name: k.full_name,
        avatar_url: k.avatar_url ?? null,
        rankName: k.ranks?.name ?? null,
        points: idx >= 0 ? rows[idx].total_points : 0,
        services: idx >= 0 ? rows[idx].services_count : 0,
        position: idx + 1,
        attendance: attendanceRate(mine.filter(a => a.schedule.date < today).map(a => a.status)),
        badges: ((badges.data ?? []) as any[]).filter(b => b.profile_id === k.id).map(b => b.badge_definition?.icon).filter(Boolean),
        duties: mine
          .filter(a => a.schedule.date >= today)
          .map(a => ({ assignmentId: a.id, scheduleId: a.schedule.id, date: a.schedule.date, time: (a.schedule.time ?? '').slice(0, 5), title: a.schedule.title, category: a.schedule.category, status: a.status }))
          .sort((x, y) => x.date.localeCompare(y.date) || x.time.localeCompare(y.time)),
      }
    }))
    setLoading(false)
  }, [profile?.id, profile?.parish_id, daysAhead])

  useEffect(() => { load() }, [load])
  return { children, loading, reload: load, setChildren }
}
