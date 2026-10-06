// Import listy ministrantów: tekst wklejony z Excela / Arkuszy Google (kolumny rozdzielone tabulatorem),
// albo CSV (średnik / przecinek). Testy: __tests__/lib/importMembers.test.ts

export type ImportRow = { full_name: string; rocznik: string | null; functions: string[]; rank: string | null }
export type ParsedImport = { rows: ImportRow[]; errors: string[]; hasHeader: boolean }

const norm = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l')

function splitLine(line: string): string[] {
  const sep = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ','
  return line.split(sep).map(c => c.trim().replace(/^"(.*)"$/, '$1').trim())
}

type Cols = { name?: number; first?: number; last?: number; year?: number; fn?: number; rank?: number }

function headerCols(cells: string[]): Cols | null {
  const c: Cols = {}
  cells.forEach((h, i) => {
    const x = norm(h)
    if (/imie i nazwisko|nazwisko i imie|ministrant|osoba/.test(x)) c.name = i
    else if (/^imie/.test(x)) c.first = i
    else if (/^nazwisko/.test(x)) c.last = i
    else if (/rocznik|rok urodzenia|urodz/.test(x)) c.year = i
    else if (/funkcj/.test(x)) c.fn = i
    else if (/rang|stopien/.test(x)) c.rank = i
  })
  return c.name !== undefined || c.first !== undefined ? c : null
}

const cap = (s: string) => s.split(/\s+/).filter(Boolean)
  .map(w => w.split('-').map(p => p.charAt(0).toLocaleUpperCase('pl') + p.slice(1).toLocaleLowerCase('pl')).join('-')).join(' ')

export function parseImport(text: string): ParsedImport {
  const lines = text.split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter(l => l.trim())
  const errors: string[] = []
  if (!lines.length) return { rows: [], errors, hasHeader: false }
  const first = splitLine(lines[0])
  const header = headerCols(first)
  // bez nagłówka: kolumna 1 = imię i nazwisko, potem rocznik (liczba), funkcje
  const cols: Cols = header ?? { name: 0, year: 1, fn: 2, rank: 3 }
  const body = header ? lines.slice(1) : lines
  const rows: ImportRow[] = []
  const seen = new Set<string>()
  body.forEach((line, i) => {
    const cells = splitLine(line)
    let name = cols.name !== undefined ? cells[cols.name] ?? '' : `${cells[cols.first!] ?? ''} ${cells[cols.last!] ?? ''}`
    name = cap(name.replace(/\s+/g, ' ').trim())
    // bez nagłówka, gdy w 2. kolumnie jest nazwisko zamiast rocznika: „Jan | Kowalski | 2014”
    if (!header && cells[1] && !/^\d{4}$/.test(cells[1]) && /^[\p{L}-]+$/u.test(cells[1]) && !name.includes(' ')) {
      name = cap(`${cells[0]} ${cells[1]}`)
      cells.splice(0, 2, name)
    }
    const year = cols.year !== undefined ? (cells[cols.year] ?? '').trim() : ''
    const fnRaw = cols.fn !== undefined ? cells[cols.fn] ?? '' : ''
    const lineNo = i + 1 + (header ? 1 : 0)
    if (!name.includes(' ')) { errors.push(`Wiersz ${lineNo}: podaj imię i nazwisko („${name || line.trim()}”)`); return }
    if (year && !/^(19|20)\d\d$/.test(year)) errors.push(`Wiersz ${lineNo}: rocznik „${year}” pominięty`)
    const key = norm(name)
    if (seen.has(key)) { errors.push(`Wiersz ${lineNo}: ${name} powtarza się na liście`); return }
    seen.add(key)
    rows.push({
      full_name: name,
      rocznik: /^(19|20)\d\d$/.test(year) ? year : null,
      functions: fnRaw.split(/[,/]+/).map(f => cap(f.trim())).filter(Boolean),
      rank: cols.rank !== undefined && cells[cols.rank] ? cap(cells[cols.rank]) : null,
    })
  })
  return { rows, errors, hasHeader: !!header }
}

/** Karteczki z kodami do rozdania (A4, 3 kolumny). */
export function claimCardsHtml(parish: string, people: { full_name: string; claim_code: string }[], webUrl: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const fmt = (c: string) => `${c.slice(0, 4)}-${c.slice(4)}`
  const cards = people.map(p => `<div class="card"><div class="n">${esc(p.full_name)}</div><div class="c">${fmt(p.claim_code)}</div>
<div class="h">Załóż konto w aplikacji LSO (${esc(webUrl)}) i wpisz ten kod osobisty — Twoje dyżury i punkty przejdą na konto.</div></div>`).join('')
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Kody osobiste — ${esc(parish)}</title><style>
@page{size:A4;margin:10mm}*{box-sizing:border-box;margin:0}body{font-family:Arial,sans-serif;color:#14213d}
h1{font-size:15px;margin-bottom:8px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6mm}
.card{border:1px dashed #999;border-radius:6px;padding:8px;page-break-inside:avoid}.n{font-weight:700;font-size:13px}
.c{font-family:'Courier New',monospace;font-size:20px;font-weight:700;letter-spacing:2px;margin:6px 0;color:#0B2E5C}.h{font-size:9px;color:#555}
</style></head><body><h1>Kody osobiste — ${esc(parish)}</h1><div class="grid">${cards}</div></body></html>`
}
