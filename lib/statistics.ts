import type { ScheduleCategory } from '../types/database'
import { addDays, shortDate } from './dates'

export type StatSchedule = { id: string; category: ScheduleCategory; date: string }
export type StatAssignment = { profile_id: string; status: string; schedule: { id?: string; date: string; category: ScheduleCategory } | null }
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

const PRESENT = ['present', 'confirmed']
// Frekwencja: obecny (lub usprawiedliwiony-przyjęty) / wszystkie przydziały poza czekającym zgłoszeniem
const counts = (s: string) => s !== 'excused' && s !== 'swapped'

function rateOf(list: StatAssignment[]): number | null {
  const counted = list.filter(a => counts(a.status))
  if (!counted.length) return null
  return Math.round((counted.filter(a => PRESENT.includes(a.status)).length / counted.length) * 100)
}

/**
 * Statystyki parafii za okres [from, to] — te same zasady co dotychczasowy ekran
 * (obecny = present/confirmed, bez czekających usprawiedliwień), plus tydzień po tygodniu
 * i frekwencja każdego ministranta.
 */
export function computeParishStats(
  from: string,
  to: string,
  schedules: StatSchedule[],
  assignments: StatAssignment[],
  points: StatPoint[],
  names: Record<string, string>,
): ParishStats {
  const present = assignments.filter(a => PRESENT.includes(a.status)).length
  const counted = assignments.filter(a => counts(a.status)).length

  // tydzień po tygodniu (maks. 8 ostatnich tygodni okresu)
  const weeks: ParishStats['weeks'] = []
  for (let end = to; end >= from && weeks.length < 8; end = addDays(end, -7)) {
    const start = addDays(end, -6) < from ? from : addDays(end, -6)
    const inWeek = assignments.filter(a => a.schedule && a.schedule.date >= start && a.schedule.date <= end)
    weeks.unshift({ label: `${shortDate(start)}–${shortDate(end)}`, rate: rateOf(inWeek) })
  }

  const catIds = Array.from(new Set(schedules.map(s => s.category)))
  const categories = catIds.map(category => {
    const n = schedules.filter(s => s.category === category).length
    return {
      category,
      services: n,
      share: schedules.length ? Math.round((n / schedules.length) * 100) : 0,
      rate: rateOf(assignments.filter(a => a.schedule?.category === category)),
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
    if (m && monthMap[m] && PRESENT.includes(a.status)) monthMap[m].present++
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
    rate: rateOf(byMember.get(id) ?? []),
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
