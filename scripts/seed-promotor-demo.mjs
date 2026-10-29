// Parafia demo dla promotora — wypełnia przykładowymi danymi ŚWIEŻĄ parafię testową.
//
// Krok 1 (w aplikacji, app.lsoapp.com): „Nowa parafia” → konto opiekuna z osobnym adresem e-mail,
//          potwierdzenie maila, przejście kreatora (rozkład Mszy, punktacja, metoda obecności).
// Krok 2 (tu): uruchom skrypt z danymi tego konta:
//   LSO_DEMO_EMAIL=... LSO_DEMO_PASSWORD=... node scripts/seed-promotor-demo.mjs            (produkcja, .env)
//   LSO_DEMO_EMAIL=... LSO_DEMO_PASSWORD=... node scripts/seed-promotor-demo.mjs --env=.env.development.local
//
// Skrypt działa jak zwykły opiekun (klucz anon + logowanie, RLS jak w aplikacji) — bez klucza service_role.
// Dodaje: 10 ministrantów bez konta (import_members), grafik 3 tygodnie wstecz + 2 w przód z obsadą,
// obecności z punktami z reguł parafii (check_in_and_award_points), kilka punktów ręcznych i ogłoszenia.
// Odmawia, jeśli w parafii są już inne konta niż opiekun (ochrona przed zaśmieceniem prawdziwej parafii).
// Można uruchomić ponownie: nie dubluje ministrantów, służb ani ogłoszeń.
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const envArg = process.argv.find(a => a.startsWith('--env='))
const envFile = envArg ? envArg.slice(6) : '.env'
const env = Object.fromEntries(
  fs.readFileSync(new URL(`../${envFile}`, import.meta.url), 'utf8')
    .split(/\r?\n/).filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const URL_ = env.EXPO_PUBLIC_SUPABASE_URL
const KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY
const EMAIL = process.env.LSO_DEMO_EMAIL
const PASSWORD = process.env.LSO_DEMO_PASSWORD
if (!URL_ || !KEY) { console.error(`STOP: brak EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY w ${envFile}`); process.exit(1) }
if (!EMAIL || !PASSWORD) { console.error('STOP: ustaw LSO_DEMO_EMAIL i LSO_DEMO_PASSWORD (konto opiekuna parafii demo)'); process.exit(1) }

const must = (label, { data, error }) => {
  if (error) throw new Error(`${label}: ${error.message}`)
  return data
}
const d = (offset) => {
  const t = new Date(); t.setHours(12, 0, 0, 0); t.setDate(t.getDate() + offset)
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}
const dow = (offset) => { const t = new Date(); t.setDate(t.getDate() + offset); return t.getDay() } // 0 = Nd

const s = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } })

// ── 1. Opiekun i parafia ─────────────────────────────────────────────────────
const auth = must('logowanie', await s.auth.signInWithPassword({ email: EMAIL, password: PASSWORD }))
const adminId = auth.user.id
const me = must('profil', await s.from('profiles').select('role, parish_id, full_name').eq('id', adminId).single())
if (me.role !== 'admin' || !me.parish_id) { console.error('STOP: to konto nie jest opiekunem żadnej parafii'); process.exit(1) }
const parishId = me.parish_id
const parish = must('parafia', await s.from('parishes').select('name, city, invite_code, setup_done').eq('id', parishId).single())
console.log(`Parafia: ${parish.name}${parish.city ? ', ' + parish.city : ''} (opiekun: ${me.full_name})`)

const others = must('członkowie', await s.from('profiles').select('id')
  .eq('parish_id', parishId).eq('managed', false).neq('id', adminId))
if (others.length > 0) {
  console.error(`STOP: w parafii są już inne konta (${others.length}). Skrypt jest tylko dla świeżej parafii testowej.`)
  process.exit(1)
}
if (!parish.setup_done) {
  console.warn('Uwaga: kreator parafii nie został zakończony — przejdź go w aplikacji (rozkład Mszy, punktacja).')
}

// ── 2. Ministranci bez konta ─────────────────────────────────────────────────
const MINISTERS = [
  ['Michał Kowalski', 2012], ['Tomasz Lis', 2009], ['Jakub Wiśniewski', 2010], ['Filip Kowal', 2011],
  ['Aleksander Mazur', 2012], ['Szymon Nowak', 2013], ['Antoni Zieliński', 2011], ['Jan Wróbel', 2014],
  ['Stanisław Kowalski', 2015], ['Kacper Nowicki', 2014],
]
const imported = must('import_members', await s.rpc('import_members', {
  p_rows: MINISTERS.map(([full_name, rocznik]) => ({ full_name, rocznik: String(rocznik) })),
}))
const created = imported.filter(r => r.status === 'created').length
const members = must('lista ministrantów', await s.from('profiles').select('id, full_name')
  .eq('parish_id', parishId).eq('managed', true).in('full_name', MINISTERS.map(m => m[0])))
const byName = Object.fromEntries(members.map(m => [m.full_name, m.id]))
const roster = MINISTERS.map(m => byName[m[0]]).filter(Boolean)
console.log(`Ministranci: ${roster.length} (nowych ${created})`)

// Stopnie: kolejne z listy parafii (jeśli są). Rangi systemowe (Kandydat…Ceremoniarz) są widoczne tylko
// przy włączonym przełączniku parafii — świeża parafia bez własnych rang dostaje go włączonego (jak w „Stopniach”).
let ranks = must('stopnie', await s.from('ranks').select('id, "order"')
  .or(`parish_id.is.null,parish_id.eq.${parishId}`).order('order'))
if (!ranks.length) {
  must('rangi systemowe', await s.from('parishes').update({ system_ranks_enabled: true }).eq('id', parishId))
  ranks = must('stopnie', await s.from('ranks').select('id, "order"')
    .or(`parish_id.is.null,parish_id.eq.${parishId}`).order('order'))
  console.log(`Włączono rangi systemowe parafii (${ranks.length})`)
}
if (ranks.length) {
  const rankIdx = [2, 4, 3, 3, 1, 1, 2, 0, 0, 0]
  for (const [i, [name]] of MINISTERS.entries()) {
    if (!byName[name]) continue
    const { error } = await s.from('profiles').update({ rank_id: ranks[Math.min(rankIdx[i], ranks.length - 1)].id }).eq('id', byName[name])
    if (error) console.warn('  stopień:', error.message)
  }
}

// ── 3. Grafik: 3 tygodnie wstecz + 2 w przód ─────────────────────────────────
const existing = must('służby', await s.from('schedules').select('id, date, time, title, category')
  .eq('parish_id', parishId).gte('date', d(-21)).lte('date', d(13)))
const have = new Set(existing.map(x => `${x.date} ${x.time.slice(0, 5)}`))
const plan = []
for (let off = -21; off <= 13; off++) {
  const date = d(off), wd = dow(off)
  if (wd === 0) {
    plan.push({ date, time: '08:00', title: 'Msza Święta', category: 'msza' })
    plan.push({ date, time: '10:00', title: 'Msza dla dzieci', category: 'msza' })
    plan.push({ date, time: '12:00', title: 'Suma', category: 'msza' })
  } else {
    plan.push({ date, time: '18:00', title: 'Msza Święta', category: 'msza' })
  }
  if (wd === 6) plan.push({ date, time: '10:00', title: 'Zbiórka ministrantów', category: 'zbiorka' })
}
// Służby z kreatora (rozkład Mszy) zostają; dokładamy tylko brakujące terminy
const toInsert = plan.filter(p => !have.has(`${p.date} ${p.time}`))
if (toInsert.length) {
  must('nowe służby', await s.from('schedules').insert(toInsert.map(p => ({
    ...p, time: p.time + ':00', location: '', gps_radius: 100, created_by: adminId, parish_id: parishId,
  }))))
}
const services = must('grafik', await s.from('schedules').select('id, date, time, title, category')
  .eq('parish_id', parishId).gte('date', d(-21)).lte('date', d(13)).order('date').order('time'))
console.log(`Służby w grafiku: ${services.length} (dodanych ${toInsert.length})`)

// Obsada: 1–3 osoby; zbiórka bez przydziału; kilka przyszłych służb celowo „bez obsady”
const assignments = []
services.forEach((sv, i) => {
  if (sv.category === 'zbiorka') return
  if (sv.date >= d(0) && i % 7 === 3) return
  const n = sv.title === 'Suma' ? 3 : 2
  for (let k = 0; k < n; k++) {
    assignments.push({ schedule_id: sv.id, profile_id: roster[(i * 2 + k) % roster.length], role: 'ministrant', status: 'assigned' })
  }
})
must('obsada', await s.from('schedule_assignments')
  .upsert(assignments, { onConflict: 'schedule_id,profile_id', ignoreDuplicates: true }))

// Obecności na minionych służbach (~85%), punkty liczone z reguł parafii
const pastIds = new Set(services.filter(sv => sv.date < d(0)).map(sv => sv.id))
let checkins = 0
for (const [idx, a] of assignments.filter(a => pastIds.has(a.schedule_id)).entries()) {
  if (idx % 7 === 5) continue // nieobecność
  const { data, error } = await s.rpc('check_in_and_award_points', {
    p_schedule_id: a.schedule_id, p_profile_id: a.profile_id, p_parish_id: parishId, p_method: 'manual',
  })
  if (error) console.warn('  obecność:', error.message)
  else if (!data?.already_checked_in) checkins++
}
// Zbiórki: obecni prawie wszyscy
for (const sv of services.filter(sv => sv.category === 'zbiorka' && pastIds.has(sv.id))) {
  for (const [k, pid] of roster.entries()) {
    if (k % 5 === 4) continue
    const { data, error } = await s.rpc('check_in_and_award_points', {
      p_schedule_id: sv.id, p_profile_id: pid, p_parish_id: parishId, p_method: 'manual',
    })
    if (!error && !data?.already_checked_in) checkins++
  }
}
console.log(`Przydziałów: ${assignments.length}, nowych obecności: ${checkins}`)

// ── 4. Punkty ręczne i ogłoszenia (tylko za pierwszym razem) ─────────────────
const anns = must('ogłoszenia', await s.from('announcements').select('id').eq('parish_id', parishId).limit(1))
if (anns.length === 0) {
  must('ogłoszenia', await s.from('announcements').insert([
    { title: 'Zbiórka w sobotę', content: 'W sobotę o 10:00 zbiórka ministrantów w salce. Omówimy grafik na listopad.', target_audience: 'all', is_pinned: true },
    { title: 'Uroczystość Wszystkich Świętych', content: '1 listopada potrzebujemy pełnej obsady na wszystkich Mszach — sprawdźcie swoje przydziały w grafiku.', target_audience: 'all', is_pinned: false },
  ].map(a => ({ ...a, parish_id: parishId, author_id: adminId }))))
  for (const [name, amount, reason] of [
    ['Tomasz Lis', 10, 'Pomoc przy przygotowaniu uroczystości'],
    ['Michał Kowalski', 5, 'Dodatkowa służba — pogrzeb'],
    ['Jan Wróbel', -2, 'Spóźnienie na zbiórkę'],
  ]) {
    if (!byName[name]) continue
    const { error } = await s.from('points').insert({ profile_id: byName[name], amount, reason, awarded_by: adminId, parish_id: parishId })
    if (error) console.warn('  punkty:', error.message)
  }
  console.log('Ogłoszenia i punkty ręczne dodane')
}

console.log(`\nGotowe. Zaloguj się na app.lsoapp.com jako ${EMAIL}. Kod parafii: ${parish.invite_code}`)
