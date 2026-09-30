// N7: CSV „Słowa dnia” → SQL do wklejenia w Supabase SQL Editor (LSO-dev, później produkcja).
//
// Użycie:  node scripts/import-daily-word.mjs ścieżka/do/slowo-dnia.csv [wynik.sql]
//
// CSV (UTF-8, średnik jako separator, pierwszy wiersz = nagłówek):
//   data;sigla;tekst;zrodlo
//   2026-10-01;J 15, 12;„To jest moje przykazanie…”;Biblia Tysiąclecia
// Pola z średnikiem / nowym wierszem / cudzysłowem ujmij w "…" (cudzysłów w środku podwój: "").
// Ten sam dzień wgrany ponownie nadpisuje poprzedni wpis.
import fs from 'fs'

const [input, output] = process.argv.slice(2)
if (!input) {
  console.error('Podaj plik CSV: node scripts/import-daily-word.mjs slowo-dnia.csv [wynik.sql]')
  process.exit(1)
}

/** Prosty parser CSV (separator ;, pola w cudzysłowach, "" = cudzysłów). */
export function parseCsv(src, sep = ';') {
  const rows = []
  let row = [], field = '', quoted = false
  const s = src.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"' && field === '') quoted = true
    else if (ch === sep) { row.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some(f => f.trim() !== '')) rows.push(row)
      row = []
    } else field += ch
  }
  row.push(field)
  if (row.some(f => f.trim() !== '')) rows.push(row)
  return rows
}

const q = (v) => (v == null || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`)

const rows = parseCsv(fs.readFileSync(input, 'utf8'))
const header = rows.shift()?.map(h => h.trim().toLowerCase()) ?? []
const col = (names) => header.findIndex(h => names.includes(h))
const iDate = col(['data', 'date']), iSigla = col(['sigla', 'siglum']), iText = col(['tekst', 'text']), iSrc = col(['zrodlo', 'źródło', 'source'])
if (iDate < 0 || iSigla < 0 || iText < 0) {
  console.error('Nagłówek musi mieć kolumny: data;sigla;tekst[;zrodlo]')
  process.exit(1)
}

const errors = []
const values = []
const seen = new Set()
rows.forEach((r, n) => {
  const line = n + 2
  const date = (r[iDate] ?? '').trim()
  const sigla = (r[iSigla] ?? '').trim()
  const text = (r[iText] ?? '').trim()
  const src = iSrc >= 0 ? (r[iSrc] ?? '').trim() : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date + 'T12:00:00').getTime())) return errors.push(`wiersz ${line}: zła data „${date}” (RRRR-MM-DD)`)
  if (!sigla || sigla.length > 60) return errors.push(`wiersz ${line}: sigla pusta lub dłuższa niż 60 znaków`)
  if (!text || text.length > 2000) return errors.push(`wiersz ${line}: tekst pusty lub dłuższy niż 2000 znaków`)
  if (src.length > 120) return errors.push(`wiersz ${line}: źródło dłuższe niż 120 znaków`)
  if (seen.has(date)) return errors.push(`wiersz ${line}: data ${date} powtórzona`)
  seen.add(date)
  values.push(`  (${q(date)}, ${q(sigla)}, ${q(text)}, ${q(src)})`)
})

if (errors.length) {
  console.error(`Błędy (${errors.length}):\n` + errors.join('\n'))
  process.exit(1)
}

const sql = `-- Słowo dnia: ${values.length} wpisów z ${input} (${new Date().toISOString().slice(0, 10)})
INSERT INTO daily_word (date, sigla, text, source) VALUES
${values.join(',\n')}
ON CONFLICT (date) DO UPDATE SET sigla = EXCLUDED.sigla, text = EXCLUDED.text, source = EXCLUDED.source;
`
const out = output ?? input.replace(/\.csv$/i, '') + '.sql'
fs.writeFileSync(out, sql)
console.log(`Gotowe: ${values.length} wpisów → ${out}\nWklej zawartość pliku w Supabase → SQL Editor i kliknij Run.`)
