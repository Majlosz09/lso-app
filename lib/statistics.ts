import type { ScheduleCategory } from '../types/database'
import { addDays, shortDate } from './dates'
import { rateStatus } from './serviceRules'

export type StatSchedule = { id: string; category: ScheduleCategory; date: string }
export type StatAssignment = { profile_id: string; status: string; schedule: { id?: string; date: string; time?: string | null; category: ScheduleCategory; service_mode?: string | null } | null }
export type StatPoint = { profile_id: string; amount: number }

export type ParishStats = {
  services: number
  points: number
  rate: number | null
  present: number
  counted: number
  weeks: { label: string; rate: number | null }[]
  categories: { category: ScheduleCategory; services: number; share: number; rate: number | null }[]
  months: { month: string; services: number; present: number }[]
  members: { profile_id: string; full_name: string; services: number; points: number; rate: number | null }[]
}

// Frekwencja wg wspólnej reguły (lib/serviceRules → rateStatus, w bazie rate_status)
const rowOf = (a: StatAssignment, now: Date) =>
  a.schedule ? rateStatus({ status: a.status, date: a.schedule.date, time: a.schedule.time, serviceMode: a.schedule.service_mode }, now) : null

function rateOf(list: StatAssignment[], now: Date): number | null {
  const counted = list.map(a => rowOf(a, now)).filter(Boolean)
  if (!counted.length) return null
  return Math.round((counted.filter(s => s === 'present').length / counted.length) * 100)
}

/**
 * Statystyki parafii za okres [from, to]: frekwencja wg wspólnej reguły (obecny ÷ obecny + nieobecny
 * + nieodhaczony po służbie), tydzień po tygodniu i frekwencja każdego ministranta.
 */
export function computeParishStats(
  from: string,
  to: string,
  schedules: StatSchedule[],
  assignments: StatAssignment[],
  points: StatPoint[],
  names: Record<string, string>,
  now: Date = new Date(),
): ParishStats {
  const statuses = assignments.map(a => rowOf(a, now))
  const present = statuses.filter(s => s === 'present').length
  const counted = statuses.filter(Boolean).length

  // tydzień po tygodniu (maks. 8 ostatnich tygodni okresu)
  const weeks: ParishStats['weeks'] = []
  for (let end = to; end >= from && weeks.length < 8; end = addDays(end, -7)) {
    const start = addDays(end, -6) < from ? from : addDays(end, -6)
    const inWeek = assignments.filter(a => a.schedule && a.schedule.date >= start && a.schedule.date <= end)
    weeks.unshift({ label: `${shortDate(start)}–${shortDate(end)}`, rate: rateOf(inWeek, now) })
  }

  const catIds = Array.from(new Set(schedules.map(s => s.category)))
  const categories = catIds.map(category => {
    const n = schedules.filter(s => s.category === category).length
    return {
      category,
      services: n,
      share: schedules.length ? Math.round((n / schedules.length) * 100) : 0,
      rate: rateOf(assignments.filter(a => a.schedule?.category === category), now),
    }
  }).sort((a, b) => b.services - a.services)

  const monthMap: Record<string, { services: number; present: number }> = {}
  for (const s of schedules) {
    const m = s.date.slice(0, 7)
    monthMap[m] = monthMap[m] ?? { services: 0, present: 0 }
    monthMap[m].services++
  }
  for (const a of assignments) {
    const m = a.schedule?.date.slice(0, 7)
    if (m && monthMap[m] && a.status === 'present') monthMap[m].present++
  }
  const months = Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v }))

  const byMember = new Map<string, StatAssignment[]>()
  for (const a of assignments) {
    const l = byMember.get(a.profile_id) ?? []
    l.push(a)
    byMember.set(a.profile_id, l)
  }
  const pts = new Map<string, number>()
  for (const p of points) if (p.amount > 0) pts.set(p.profile_id, (pts.get(p.profile_id) ?? 0) + p.amount)
  const members = Object.keys(names).map(id => ({
    profile_id: id,
    full_name: names[id],
    services: (byMember.get(id) ?? []).length,
    points: pts.get(id) ?? 0,
    rate: rateOf(byMember.get(id) ?? [], now),
  })).sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || b.services - a.services)

  return {
    services: schedules.length,
    points: points.reduce((s, p) => s + (p.amount > 0 ? p.amount : 0), 0),
    rate: counted ? Math.round((present / counted) * 100) : null,
    present,
    counted,
    weeks,
    categories,
    months,
    members,
  }
}
