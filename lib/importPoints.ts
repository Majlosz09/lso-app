// Import punktów z poprzednich okresów: tekst wklejony z Excela / Arkuszy Google
// (imię i nazwisko + liczba punktów, opcjonalnie powód). Testy: __tests__/lib/importPoints.test.ts

export type PointsRow = { line: number; name: string; amount: number; reason: string | null }
export type ParsedPoints = { rows: PointsRow[]; errors: string[] }
export type Member = { id: string; full_name: string }
export type MatchedRow = PointsRow & { member: Member | null }

export const normName = (s: string) => s.trim().toLowerCase()
  .replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ')

const isAmount = (s: string) => /^[+-]?\d+([.,]0+)?$/.test(s.replace(/\s/g, ''))
const toAmount = (s: string) => parseInt(s.replace(/\s/g, '').replace(/[.,]0+$/, ''), 10)
const isHeader = (cells: string[]) => cells.some(c => /punkt|pkt|suma|imi|nazwisk|ministrant/i.test(c)) && !cells.some(isAmount)

function splitLine(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map(c => c.trim())
  if (line.includes(';')) return line.split(';').map(c => c.trim())
  // „Jan Kowalski 120” / „Jan Kowalski - 120” / „Jan Kowalski: 120 Roraty”
  const m = line.match(/^(.+?)(?:\s*[:–]\s*|\s+-\s+|\s+)([+-]?\d+)(?:(?:\s*[:–]\s*|\s+-\s+|\s+)(.+))?$/)
  return m ? [m[1], m[2], m[3] ?? ''].map(c => c.trim()) : [line.trim()]
}

export function parsePointsImport(text: string): ParsedPoints {
  const rows: PointsRow[] = []
  const errors: string[] = []
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim()
    if (!line) return
    let cells = splitLine(line).map(c => c.replace(/^"(.*)"$/, '$1').trim())
    if (i === 0 && isHeader(cells)) return
    // „Jan | Kowalski | 120” — imię i nazwisko w osobnych kolumnach
    const idx = cells.findIndex(isAmount)
    if (idx === -1) { errors.push(`Wiersz ${i + 1}: brak liczby punktów („${line}”)`); return }
    const name = cells.slice(0, idx).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
    const reason = cells.slice(idx + 1).filter(Boolean).join(' ').trim() || null
    const amount = toAmount(cells[idx])
    if (!name) { errors.push(`Wiersz ${i + 1}: brak imienia i nazwiska`); return }
    if (!amount) { errors.push(`Wiersz ${i + 1}: ${name} — 0 pkt, pominięto`); return }
    rows.push({ line: i + 1, name, amount, reason })
  })
  return { rows, errors }
}

/** Dopasowanie do ministrantów parafii: „Jan Kowalski” albo „Kowalski Jan”, bez polskich znaków i wielkości liter. */
export function matchMembers(rows: PointsRow[], members: Member[]): MatchedRow[] {
  const byName = new Map<string, Member | null>()
  for (const m of members) {
    const parts = normName(m.full_name).split(' ')
    const keys = new Set([parts.join(' '), [...parts.slice(1), parts[0]].join(' ')])
    // dwie osoby o tym samym imieniu i nazwisku → nie zgadujemy (null)
    keys.forEach(k => byName.set(k, byName.has(k) && byName.get(k)?.id !== m.id ? null : m))
  }
  return rows.map(r => ({ ...r, member: byName.get(normName(r.name)) ?? null }))
}

/** „30.09.2026” / „2026-09-30” → „2026-09-30”, inaczej null. */
export function parseDateInput(s: string): string | null {
  const t = s.trim()
  let y: number, m: number, d: number
  const pl = t.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/)
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (pl) { d = +pl[1]; m = +pl[2]; y = +pl[3] } else if (iso) { y = +iso[1]; m = +iso[2]; d = +iso[3] } else return null
  const dt = new Date(y, m - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
