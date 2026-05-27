import * as Sharing from 'expo-sharing'
import type { SupabaseClient } from '@supabase/supabase-js'

export type MemberExportRow = {
  fullName: string
  scheduled: number
  present: number
  attendanceRate: number  // 0-100, 1 decimal place; 0 when scheduled=0
  points: number
}

export type ExportData = {
  parishName: string
  from: string        // YYYY-MM-DD
  to: string          // YYYY-MM-DD
  generatedAt: string // ISO timestamp
  members: MemberExportRow[]  // sorted by points descending
}

export async function buildExportData(
  supabase: SupabaseClient,
  parishId: string,
  parishName: string,
  from: string,
  to: string,
): Promise<ExportData> {
  const fromDate = new Date(from + 'T00:00:00.000Z')
  const toDate   = new Date(to + 'T23:59:59.999Z')

  const [profilesRes, assignmentsRes, pointsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('parish_id', parishId)
      .eq('role', 'member')
      .eq('is_active', true),
    supabase
      .from('schedule_assignments')
      .select('profile_id, status, schedule:schedules!inner(parish_id)')
      .eq('schedule.parish_id', parishId)
      .gte('schedule.date', from)
      .lte('schedule.date', to),
    supabase
      .from('points')
      .select('profile_id, amount')
      .eq('parish_id', parishId)
      .gte('created_at', fromDate.toISOString())
      .lte('created_at', toDate.toISOString()),
  ])

  if (profilesRes.error) throw new Error(profilesRes.error.message)
  const profiles:    { id: string; full_name: string }[]       = profilesRes.data    ?? []
  const assignments: { profile_id: string; status: string }[]  = assignmentsRes.data ?? []
  const pointRows:   { profile_id: string; amount: number }[]  = pointsRes.data      ?? []

  const map = new Map<string, { scheduled: number; present: number; points: number }>()
  for (const p of profiles) {
    map.set(p.id, { scheduled: 0, present: 0, points: 0 })
  }
  for (const a of assignments) {
    const m = map.get(a.profile_id)
    if (!m) continue
    // 'excused' does not count toward scheduled; 'swapped' and 'assigned' count as scheduled but not present
    if (a.status !== 'excused') m.scheduled++
    if (a.status === 'present' || a.status === 'confirmed') m.present++
  }
  for (const r of pointRows) {
    const m = map.get(r.profile_id)
    if (m) m.points += r.amount
  }

  const members: MemberExportRow[] = profiles
    .map(p => {
      const s = map.get(p.id)!
      return {
        fullName: p.full_name,
        scheduled: s.scheduled,
        present: s.present,
        attendanceRate: s.scheduled === 0
          ? 0
          : Math.round((s.present / s.scheduled) * 1000) / 10,
        points: s.points,
      }
    })
    .sort((a, b) => b.points - a.points || b.present - a.present)

  return { parishName, from, to, generatedAt: new Date().toISOString(), members }
}

export function generateCSV(data: ExportData): string {
  const BOM = '﻿'
  const noData = 'Brak danych w wybranym okresie'
  const lines: string[] = []

  lines.push(`Ranking punktowy — ${data.parishName} — ${data.from} do ${data.to}`)
  lines.push('')
  lines.push('Lp.,Imię i nazwisko,Punkty')
  if (data.members.length === 0) {
    lines.push(noData)
  } else {
    data.members.forEach((m, i) => lines.push(`${i + 1},"${m.fullName}",${m.points}`))
  }

  lines.push('')
  lines.push('Statystyki obecności')
  lines.push('')
  lines.push('Imię i nazwisko,Liczba służb,Obecny,Frekwencja')
  if (data.members.length === 0) {
    lines.push(noData)
  } else {
    data.members.forEach(m =>
      lines.push(`"${m.fullName}",${m.scheduled},${m.present},${m.attendanceRate.toFixed(1)}%`)
    )
  }

  return BOM + lines.join('\n')
}

export function generateHTML(data: ExportData): string {
  const noData3 = '<tr><td colspan="3" style="text-align:center;color:#666">Brak danych w wybranym okresie</td></tr>'
  const noData4 = '<tr><td colspan="4" style="text-align:center;color:#666">Brak danych w wybranym okresie</td></tr>'

  const rankingRows = data.members.length === 0 ? noData3 : data.members
    .map((m, i) =>
      `<tr><td>${i + 1}</td><td>${m.fullName}</td><td style="text-align:right">${m.points}</td></tr>`
    ).join('\n')

  const attendanceRows = data.members.length === 0 ? noData4 : data.members
    .map(m =>
      `<tr><td>${m.fullName}</td><td style="text-align:right">${m.scheduled}</td><td style="text-align:right">${m.present}</td><td style="text-align:right">${m.attendanceRate.toFixed(1)}%</td></tr>`
    ).join('\n')

  const generatedDate = new Date(data.generatedAt).toLocaleDateString('pl-PL')

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body { font-family: serif; margin: 24px; color: #111; }
  h1 { font-size: 18px; margin-bottom: 4px; }
  .sub { font-size: 13px; color: #555; margin-bottom: 24px; }
  h2 { font-size: 15px; margin: 20px 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { background: #f0f0f0; padding: 6px 8px; text-align: left; border: 1px solid #ccc; }
  td { padding: 5px 8px; border: 1px solid #ddd; }
  tr:nth-child(even) { background: #f9f9f9; }
  .footer { margin-top: 32px; font-size: 11px; color: #888; }
</style>
</head><body>
<h1>${data.parishName}</h1>
<div class="sub">Raport: ${data.from} — ${data.to} &nbsp;|&nbsp; Wygenerowano: ${generatedDate}</div>

<h2>Ranking punktowy</h2>
<table>
  <tr><th>Lp.</th><th>Imię i nazwisko</th><th style="text-align:right">Punkty</th></tr>
  ${rankingRows}
</table>

<h2>Statystyki obecności</h2>
<table>
  <tr><th>Imię i nazwisko</th><th style="text-align:right">Liczba służb</th><th style="text-align:right">Obecny</th><th style="text-align:right">Frekwencja</th></tr>
  ${attendanceRows}
</table>

<div class="footer">Raport wygenerowany przez aplikację LSO</div>
</body></html>`
}

export async function shareFile(uri: string): Promise<void> {
  await Sharing.shareAsync(uri)
}
