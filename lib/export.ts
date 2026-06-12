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

export function generateCSV(data: ExportData, opts?: { pointsOnly?: boolean }): string {
  const pointsOnly = opts?.pointsOnly ?? false
  const BOM = '﻿'
  const noData = 'Brak danych w wybranym okresie'
  const generatedDate = new Date(data.generatedAt).toLocaleDateString('pl-PL')
  const lines: string[] = []

  lines.push(`Raport LSO — ${data.parishName}`)
  lines.push(`Okres:,${data.from} — ${data.to}`)
  lines.push(`Wygenerowano:,${generatedDate}`)
  lines.push('')

  lines.push('Ranking punktowy')
  lines.push('')
  lines.push('Lp.,Imię i nazwisko,Punkty')
  if (data.members.length === 0) {
    lines.push(noData)
  } else {
    data.members.forEach((m, i) => lines.push(`${i + 1},"${m.fullName}",${m.points}`))
  }

  if (!pointsOnly) {
    lines.push('')
    lines.push('Statystyki obecności')
    lines.push('')
    lines.push('Lp.,Imię i nazwisko,Liczba służb,Obecny,Frekwencja')
    if (data.members.length === 0) {
      lines.push(noData)
    } else {
      data.members.forEach((m, i) =>
        lines.push(`${i + 1},"${m.fullName}",${m.scheduled},${m.present},${m.attendanceRate.toFixed(1)}%`)
      )
    }
  }

  return BOM + lines.join('\n')
}

export function generateHTML(data: ExportData, opts?: { pointsOnly?: boolean }): string {
  const pointsOnly = opts?.pointsOnly ?? false
  const MEDAL = ['🥇', '🥈', '🥉']
  const noData3 = '<tr><td colspan="3" style="text-align:center;padding:16px;color:#888">Brak danych w wybranym okresie</td></tr>'
  const noData4 = '<tr><td colspan="4" style="text-align:center;padding:16px;color:#888">Brak danych w wybranym okresie</td></tr>'

  const rankingRows = data.members.length === 0 ? noData3 : data.members
    .map((m, i) => {
      const medal = i < 3 ? `${MEDAL[i]} ` : ''
      const bold = i < 3 ? ' style="font-weight:700"' : ''
      return `<tr><td style="text-align:center;color:#888">${i + 1}</td><td${bold}>${medal}${m.fullName}</td><td style="text-align:right;font-weight:600">${m.points}</td></tr>`
    }).join('\n')

  const attendanceRows = data.members.length === 0 ? noData4 : data.members
    .map((m, i) => {
      const rateColor = m.attendanceRate >= 80 ? '#16a34a' : m.attendanceRate >= 50 ? '#d97706' : '#dc2626'
      return `<tr><td style="text-align:center;color:#888">${i + 1}</td><td>${m.fullName}</td><td style="text-align:right">${m.scheduled}</td><td style="text-align:right">${m.present}</td><td style="text-align:right;font-weight:600;color:${rateColor}">${m.attendanceRate.toFixed(1)}%</td></tr>`
    }).join('\n')

  const generatedDate = new Date(data.generatedAt).toLocaleDateString('pl-PL')

  const attendanceSection = pointsOnly ? '' : `
<h2>Statystyki obecności</h2>
<table>
  <thead><tr><th style="width:40px;text-align:center">Lp.</th><th>Imię i nazwisko</th><th style="text-align:right">Służby</th><th style="text-align:right">Obecny</th><th style="text-align:right">Frekwencja</th></tr></thead>
  <tbody>${attendanceRows}</tbody>
</table>`

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;color:#1a1a2e;background:#fff}
  .hdr{background:#1A237E;color:#fff;padding:20px 28px}
  .hdr h1{font-size:20px;font-weight:700;margin-bottom:4px}
  .hdr .meta{font-size:12px;opacity:.75}
  .body{padding:24px 28px}
  h2{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;
     color:#1A237E;margin:28px 0 10px;padding-bottom:6px;border-bottom:2px solid #1A237E}
  h2:first-child{margin-top:0}
  table{width:100%;border-collapse:collapse;font-size:12px}
  thead tr{background:#E8EAF6}
  th{padding:8px 10px;text-align:left;font-weight:700;color:#1A237E;border-bottom:2px solid #1A237E}
  td{padding:7px 10px;border-bottom:1px solid #e8e8e8}
  tbody tr:hover{background:#f5f7ff}
  .footer{margin-top:32px;padding-top:12px;border-top:1px solid #e0e0e0;font-size:10px;color:#aaa;text-align:center}
  @media print{
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .hdr{background:#1A237E!important;-webkit-print-color-adjust:exact}
  }
</style>
</head><body>
<div class="hdr">
  <h1>${data.parishName}</h1>
  <div class="meta">Raport LSO &nbsp;·&nbsp; ${data.from} — ${data.to} &nbsp;·&nbsp; Wygenerowano: ${generatedDate}</div>
</div>
<div class="body">
<h2>Ranking punktowy</h2>
<table>
  <thead><tr><th style="width:40px;text-align:center">Lp.</th><th>Imię i nazwisko</th><th style="text-align:right">Punkty</th></tr></thead>
  <tbody>${rankingRows}</tbody>
</table>
${attendanceSection}
<div class="footer">Wygenerowano ${generatedDate} &nbsp;·&nbsp; Aplikacja LSO</div>
</div>
</body></html>`
}

export function generateXLS(data: ExportData, opts?: { pointsOnly?: boolean }): string {
  const pointsOnly = opts?.pointsOnly ?? false
  const generatedDate = new Date(data.generatedAt).toLocaleDateString('pl-PL')

  const C = 'border:1px solid #C5CAE9;padding:6px 10px;font-family:Calibri,Arial,sans-serif;font-size:10pt'
  const TH = `${C};background:#1A237E;color:#fff;font-weight:700`
  const E = 'border:none;padding:0'
  const SEC = 'background:#E8EAF6;color:#1A237E;font-weight:700;font-size:11pt;padding:8px 12px;font-family:Calibri,Arial,sans-serif;border-bottom:2px solid #1A237E'
  const META = 'color:#666;padding:3px 12px;font-family:Calibri,Arial,sans-serif;font-size:10pt;border:none'

  const rankingRows = data.members.length === 0
    ? `<tr><td colspan="3" style="${C};text-align:center;color:#888">Brak danych w wybranym okresie</td><td colspan="2" style="${E}"></td></tr>`
    : data.members.map((m, i) => {
        const bold = i < 3 ? ';font-weight:700' : ''
        const evenBg = i % 2 === 1 ? ';background:#F5F7FF' : ''
        return `<tr>
          <td style="${C};text-align:center${evenBg}">${i + 1}</td>
          <td style="${C}${bold}${evenBg}">${m.fullName}</td>
          <td style="${C};text-align:right${bold}${evenBg}">${m.points}</td>
          <td colspan="2" style="${E}"></td>
        </tr>`
      }).join('')

  const attendanceSection = pointsOnly ? '' : (() => {
    const attendanceRows = data.members.length === 0
      ? `<tr><td colspan="5" style="${C};text-align:center;color:#888">Brak danych w wybranym okresie</td></tr>`
      : data.members.map((m, i) => {
          const rateColor = m.attendanceRate >= 80 ? '#16a34a' : m.attendanceRate >= 50 ? '#d97706' : '#dc2626'
          const evenBg = i % 2 === 1 ? ';background:#F5F7FF' : ''
          return `<tr>
            <td style="${C};text-align:center${evenBg}">${i + 1}</td>
            <td style="${C}${evenBg}">${m.fullName}</td>
            <td style="${C};text-align:right${evenBg}">${m.scheduled}</td>
            <td style="${C};text-align:right${evenBg}">${m.present}</td>
            <td style="${C};text-align:right;font-weight:600;color:${rateColor}${evenBg}">${m.attendanceRate.toFixed(1)}%</td>
          </tr>`
        }).join('')
    return `<tr><td colspan="5" style="padding:6px;border:none"></td></tr>
<tr><td colspan="5" style="${SEC}">Statystyki obecności</td></tr>
<tr>
  <th style="${TH};text-align:center;width:50px">Lp.</th>
  <th style="${TH}">Imię i nazwisko</th>
  <th style="${TH};text-align:right">Liczba służb</th>
  <th style="${TH};text-align:right">Obecny</th>
  <th style="${TH};text-align:right">Frekwencja</th>
</tr>
${attendanceRows}`
  })()

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<!--[if gte mso 9]><xml>
<x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>Raport LSO</x:Name>
<x:WorksheetOptions><x:Selected/></x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
</head><body>
<table cellspacing="0">
<tr><td colspan="5" style="background:#1A237E;color:#fff;font-weight:700;font-size:14pt;padding:14px 12px;font-family:Calibri,Arial,sans-serif">${data.parishName}</td></tr>
<tr><td colspan="5" style="${META}">Raport LSO &nbsp;&nbsp; ${data.from} — ${data.to}</td></tr>
<tr><td colspan="5" style="${META};padding-bottom:10px">Wygenerowano: ${generatedDate}</td></tr>
<tr><td colspan="5" style="padding:4px;border:none"></td></tr>
<tr><td colspan="3" style="${SEC}">Ranking punktowy</td><td colspan="2" style="border:none"></td></tr>
<tr>
  <th style="${TH};text-align:center;width:50px">Lp.</th>
  <th style="${TH}">Imię i nazwisko</th>
  <th style="${TH};text-align:right">Punkty</th>
  <td colspan="2" style="${E}"></td>
</tr>
${rankingRows}
${attendanceSection}
</table>
</body></html>`
}

export async function shareFile(uri: string): Promise<void> {
  await Sharing.shareAsync(uri)
}
