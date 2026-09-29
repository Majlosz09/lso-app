// Parafia demo do testowania redesignu — TYLKO LSO-dev (na produkcji odmawia).
// Uruchom: node scripts/seed-redesign-dev.mjs
//
// Zakłada (albo odświeża) „Parafię św. Michała Archanioła” z postaciami z prototypu.
// Konta (hasło dla wszystkich: DemoLSO123!):
//   opiekun@lso-demo.test   — ks. Paweł Nowak (opiekun / admin)
//   michal@lso-demo.test    — Michał Kowalski (ministrant)
//   rodzic@lso-demo.test    — Anna Kowalska (rodzic Michała i Stasia)
//   + 8 ministrantów i 2 osoby czekające na zatwierdzenie
// Dane idą przez te same ścieżki co apka (RLS jak dla zwykłych użytkowników).
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.development.local', import.meta.url), 'utf8')
    .split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
)
const URL_ = env.EXPO_PUBLIC_SUPABASE_URL
const KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY
if (!URL_ || URL_.includes('kvqjaoprxxiemynyihfs')) {
  console.error('STOP: to nie jest projekt dev'); process.exit(1)
}

const PASSWORD = 'DemoLSO123!'
const PARISH = { name: 'Parafia św. Michała Archanioła', city: 'Kraków' }
const client = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const must = (label, { data, error }) => {
  if (error) throw new Error(`${label}: ${error.message}`)
  return data
}

async function account(email, meta) {
  const c = client()
  const { data: si } = await c.auth.signInWithPassword({ email, password: PASSWORD })
  if (si?.user) return { c, id: si.user.id, email, fresh: false }
  const { data, error } = await c.auth.signUp({ email, password: PASSWORD, options: { data: meta } })
  if (error) throw new Error(`signUp ${email}: ${error.message}`)
  if (!data.session) throw new Error(`signUp ${email}: brak sesji — wyłącz „Confirm email” w Auth na LSO-dev`)
  return { c, id: data.user.id, email, fresh: true }
}

const d = (offset) => {
  const t = new Date(); t.setHours(12, 0, 0, 0); t.setDate(t.getDate() + offset)
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}
const dow = (offset) => { const t = new Date(); t.setDate(t.getDate() + offset); return t.getDay() } // 0 = Nd

// ── 1. Opiekun + parafia ─────────────────────────────────────────────────────
console.log('1. Opiekun i parafia')
const admin = await account('opiekun@lso-demo.test', { full_name: 'ks. Paweł Nowak' })
let { data: adminProfile } = await admin.c.from('profiles').select('parish_id').eq('id', admin.id).single()
let parishId = adminProfile?.parish_id
const firstRun = !parishId
if (!parishId) {
  const parish = must('parish insert', await admin.c.from('parishes')
    .insert({ ...PARISH, created_by: admin.id }).select('id').single())
  parishId = parish.id
  must('admin profile', await admin.c.from('profiles').upsert({
    id: admin.id, full_name: 'ks. Paweł Nowak', role: 'admin', phone: '600100100',
    is_active: true, parish_id: parishId,
  }))
}
must('parish settings', await admin.c.from('parishes').update({
  ...PARISH, setup_done: true, attendance_mode: 'button', allow_member_dm: true,
  lat: 50.0614, lng: 19.9366, gps_radius: 100,
}).eq('id', parishId))
await admin.c.from('profiles').update({ onboarding_completed: true }).eq('id', admin.id)
const { data: parishRow } = await admin.c.from('parishes').select('invite_code').eq('id', parishId).single()
const invite = parishRow.invite_code
console.log('   parafia', parishId, 'kod', invite)

// ── 2. Ministranci, rodzic, oczekujący ───────────────────────────────────────
console.log('2. Członkowie')
const MINISTERS = [
  ['michal', 'Michał Kowalski', 2012],
  ['tomek', 'Tomek Lis', 2009],
  ['kuba', 'Kuba Wiśniewski', 2010],
  ['filip', 'Filip Kowal', 2011],
  ['olek', 'Olek Mazur', 2012],
  ['szymon', 'Szymon Nowak', 2013],
  ['antek', 'Antek Zieliński', 2011],
  ['janek', 'Janek Wróbel', 2014],
  ['stas', 'Staś Kowalski', 2015],
]
const people = {}
for (const [key, name, rocznik] of MINISTERS) {
  const u = await account(`${key}@lso-demo.test`, {
    full_name: name, role: 'member', phone: '600200' + String(rocznik).slice(2) + '0', rocznik: String(rocznik), invite_code: invite,
  })
  people[key] = { ...u, name }
  await admin.c.rpc('approve_member', { p_profile_id: u.id })
  await u.c.from('profiles').update({ onboarding_completed: true }).eq('id', u.id)
}
const parent = await account('rodzic@lso-demo.test', {
  full_name: 'Anna Kowalska', role: 'parent', phone: '600300300', invite_code: invite,
})
await admin.c.rpc('approve_member', { p_profile_id: parent.id })
await parent.c.from('profiles').update({ onboarding_completed: true }).eq('id', parent.id)
await parent.c.rpc('link_parent_to_children', { p_child_ids: [people.michal.id, people.stas.id] })

for (const [key, name] of [['kacper', 'Kacper Nowicki'], ['bartek', 'Bartek Sowa']]) {
  await account(`${key}@lso-demo.test`, { full_name: name, role: 'member', phone: '600400400', rocznik: '2014', invite_code: invite })
}

// Rangi: pierwsze z parafii po kolei (jeśli są)
const { data: ranks } = await admin.c.from('ranks').select('id, name, "order"').eq('parish_id', parishId).order('order')
if (ranks?.length) {
  const pick = (i) => ranks[Math.min(i, ranks.length - 1)].id
  const rankOf = { tomek: 4, kuba: 3, filip: 3, michal: 2, antek: 2, olek: 1, szymon: 1, janek: 0, stas: 0 }
  for (const [k, i] of Object.entries(rankOf)) {
    await admin.c.from('profiles').update({ rank_id: pick(i) }).eq('id', people[k].id)
  }
}

// ── 3. Rozkład Mszy ──────────────────────────────────────────────────────────
console.log('3. Rozkład Mszy')
await admin.c.from('mass_templates').delete().eq('parish_id', parishId)
const templates = []
for (const day of [1, 2, 3, 4, 5, 6]) templates.push({ day_of_week: day, time: '18:00', label: 'Msza Święta' })
templates.push(
  { day_of_week: 0, time: '08:00', label: 'Msza Święta' },
  { day_of_week: 0, time: '10:00', label: 'Msza dziecięca' },
  { day_of_week: 0, time: '12:00', label: 'Suma' },
  { day_of_week: 0, time: '18:00', label: 'Msza Święta' },
)
must('mass templates', await admin.c.from('mass_templates').insert(
  templates.map((t, i) => ({ ...t, parish_id: parishId, sort_order: i })),
))

// ── 4. Grafik: 3 tygodnie wstecz + 2 w przód ─────────────────────────────────
console.log('4. Grafik')
await admin.c.from('schedules').delete().eq('parish_id', parishId).gte('date', d(-28)).lte('date', d(21))
const roster = ['michal', 'tomek', 'kuba', 'filip', 'olek', 'szymon', 'antek', 'janek', 'stas']
const services = []
for (let off = -21; off <= 13; off++) {
  const wd = dow(off)
  const date = d(off)
  if (wd === 0) {
    services.push({ date, time: '08:00', title: 'Msza Święta', category: 'msza' })
    services.push({ date, time: '10:00', title: 'Msza dziecięca', category: 'msza' })
    services.push({ date, time: '12:00', title: 'Suma', category: 'msza' })
  } else {
    services.push({ date, time: '18:00', title: 'Msza Święta', category: 'msza' })
  }
  // październik — nabożeństwa różańcowe, piątek adoracja, sobota zbiórka
  if (wd >= 3 && wd <= 6 && date >= `${date.slice(0, 4)}-10-01`) {
    services.push({ date, time: '17:30', title: 'Nabożeństwo różańcowe', category: 'nabozenstwo' })
  }
  if (wd === 6) services.push({ date, time: '10:00', title: 'Zbiórka ministrantów', category: 'zbiorka' })
}
const inserted = must('schedules', await admin.c.from('schedules').insert(services.map(s => ({
  ...s, time: s.time + ':00', location: '', gps_radius: 100, created_by: admin.id, parish_id: parishId,
  notes: s.title === 'Suma' ? 'Zbiórka w zakrystii 15 min przed Mszą.' : null,
}))).select('id, date, time, title, category'))

// Obsada: 1–3 osoby, kilka służb celowo bez obsady (w przyszłości)
const assignments = []
inserted.forEach((s, i) => {
  const future = s.date >= d(0)
  if (s.category === 'zbiorka') return // zbiórka bez przydziału
  if (future && i % 7 === 3) return    // „Bez obsady”
  const n = s.title === 'Suma' ? 3 : s.category === 'nabozenstwo' ? 1 : 2
  for (let k = 0; k < n; k++) {
    const who = roster[(i * 2 + k) % roster.length]
    assignments.push({ schedule_id: s.id, profile_id: people[who].id, role: 'ministrant', status: 'assigned' })
  }
})
// Michał: najbliższa służba jutro (Suma/Msza) — żeby Dom miał „Twoją najbliższą służbę”
const tomorrow = inserted.find(s => s.date === d(1) && s.category === 'msza')
if (tomorrow && !assignments.some(a => a.schedule_id === tomorrow.id && a.profile_id === people.michal.id)) {
  assignments.push({ schedule_id: tomorrow.id, profile_id: people.michal.id, role: 'ministrant', status: 'assigned' })
}
must('assignments', await admin.c.from('schedule_assignments').insert(assignments))

// Przeszłe służby: obecności (z punktami z reguł) — ok. 85% frekwencji
const past = inserted.filter(s => s.date < d(0))
const pastIds = new Set(past.map(s => s.id))
let checkins = 0
for (const [idx, a] of assignments.filter(a => pastIds.has(a.schedule_id)).entries()) {
  if (idx % 7 === 5) continue // nieobecny
  const { error } = await admin.c.rpc('check_in_and_award_points', {
    p_schedule_id: a.schedule_id, p_profile_id: a.profile_id, p_parish_id: parishId, p_method: 'manual',
  })
  if (!error) checkins++
}
console.log('   służb', inserted.length, 'przydziałów', assignments.length, 'obecności', checkins)

// Prośby o usprawiedliwienie (status excused = czeka na decyzję opiekuna)
const futureMine = (key) => assignments.find(a => a.profile_id === people[key].id && !pastIds.has(a.schedule_id)
  && inserted.find(s => s.id === a.schedule_id).date > d(1))
for (const [key, reason] of [['kuba', 'Choroba — angina'], ['olek', 'Wyjazd rodzinny'], ['filip', 'Szkoła — wycieczka klasowa']]) {
  const a = futureMine(key)
  if (a) await people[key].c.from('schedule_assignments').update({ status: 'excused', absence_reason: reason })
    .eq('schedule_id', a.schedule_id).eq('profile_id', people[key].id)
}

// ── 5. Ogłoszenia, punkty ręczne, czat (tylko przy pierwszym uruchomieniu) ────
if (firstRun) {
  console.log('5. Ogłoszenia, punkty, czat')
  must('announcements', await admin.c.from('announcements').insert([
    { title: 'Różaniec w październiku', content: 'Od 1 października codziennie o 17:30 nabożeństwo różańcowe. Potrzebujemy po dwóch ministrantów na każdy dzień — zapiszcie się w grafiku.', target_audience: 'all', is_pinned: true },
    { title: 'Wycieczka ministrancka 17 X', content: 'Jedziemy do Częstochowy. Zapisy do piątku u ks. Pawła, koszt 60 zł. Zgoda rodzica obowiązkowa.', target_audience: 'all', is_pinned: false },
    { title: 'Próba przed odpustem', content: 'W sobotę o 10:00 próba ceremonii przed Sumą odpustową. Obecność obowiązkowa dla ceremoniarzy i lektorów.', target_audience: 'members', is_pinned: false },
    { title: 'Zebranie rodziców', content: 'Zapraszam rodziców ministrantów na krótkie spotkanie po Mszy o 12:00 w niedzielę.', target_audience: 'parents', is_pinned: false },
  ].map(a => ({ ...a, parish_id: parishId, author_id: admin.id }))))

  for (const [key, amount, reason] of [
    ['tomek', 10, 'Pomoc przy przygotowaniu odpustu'],
    ['michal', 5, 'Służba na pogrzebie'],
    ['kuba', 5, 'Dodatkowa służba — ślub'],
    ['janek', -2, 'Spóźnienie na zbiórkę'],
  ]) {
    await admin.c.from('points').insert({ profile_id: people[key].id, amount, reason, awarded_by: admin.id, parish_id: parishId })
  }

  const { data: channels } = await admin.c.from('chat_channels').select('id, type, name, slug').eq('parish_id', parishId)
  const general = channels?.find(ch => ch.slug === 'general' || ch.type === 'general') ?? channels?.[0]
  if (general) {
    const msgs = [
      [admin, 'Szczęść Boże! Przypominam o próbie w sobotę o 10:00.'],
      [people.tomek, 'Będę. Kadzidło przygotować wcześniej?'],
      [admin, 'Tak, Antek pomoże — kadzielnica w zakrystii.'],
      [people.michal, 'Ja też będę 👍'],
      [people.antek, 'Ok, będę 15 min wcześniej.'],
    ]
    for (const [u, content] of msgs) {
      await u.c.from('chat_messages').insert({ channel_id: general.id, sender_id: u.id, content })
    }
  }
}

console.log('\nGotowe. Kod parafii:', invite)
console.log('Loginy (hasło DemoLSO123!): opiekun@ / michal@ / rodzic@ / kacper@ (oczekuje) — @lso-demo.test')
