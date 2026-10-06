// Smoke: rozkład w rytmie roku liturgicznego (LSO-dev, parafia demo). Sprząta po sobie.
// 1) kotwice z bazy (liturgical_anchor) = silnik kalendarza aplikacji (romcal, polskie zasady) na 35 lat
// 2) okresy: święta „jak w niedzielę”, Adwent (Roraty), Wielki Czwartek z własnymi godzinami
import { createClient } from '@supabase/supabase-js'
import { Romcal } from 'romcal'
import { Poland_Pl } from '@romcal/calendar.poland'
import fs from 'fs'
const env = JSON.parse(fs.readFileSync(new URL('../eas.json', import.meta.url))).build.redesign.env
if (!env.EXPO_PUBLIC_SUPABASE_URL.includes('phwoxylvcazcnaifcqab')) throw new Error('Tylko LSO-dev')
const ok = (c, m) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); if (!c) process.exitCode = 1 }
const sb = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const { data: auth, error } = await sb.auth.signInWithPassword({ email: 'opiekun@lso-demo.test', password: 'DemoLSO123!' })
if (error) throw error
const parish = (await sb.from('profiles').select('parish_id').eq('id', auth.user.id).single()).data.parish_id

// ── 1. kotwice vs romcal ──
const romcal = new Romcal({ localizedCalendar: Poland_Pl, ascensionOnSunday: true })
const MAP = { easter: 'easter_sunday', ash_wednesday: 'ash_wednesday', palm_sunday: 'palm_sunday_of_the_passion_of_the_lord', ascension: 'ascension_of_the_lord',
  pentecost: 'pentecost_sunday', corpus_christi: 'most_holy_body_and_blood_of_christ', advent_start: 'advent_1_sunday',
  divine_mercy: 'divine_mercy_sunday', jan6: 'epiphany_of_the_lord', christ_king: 'our_lord_jesus_christ_king_of_the_universe' }
let mismatches = [], compared = 0
for (let y = 2026; y <= 2060; y++) {
  const cal = await romcal.generateCalendar(y)
  const byId = {}
  for (const [d, list] of Object.entries(cal)) for (const x of list) byId[x.id] ??= d
  const { data } = await sb.rpc('liturgical_anchors', { p_year: y })
  const db = Object.fromEntries((data ?? []).map(r => [r.key, r.day]))
  for (const [k, id] of Object.entries(MAP)) { if (!byId[id]) { mismatches.push(`${y} brak ${id}`); continue }; compared++; if (byId[id] !== db[k]) mismatches.push(`${y} ${k}: baza ${db[k]} / romcal ${byId[id]}`) }
}
ok(mismatches.length === 0 && compared === 350, `kotwice z bazy = kalendarz aplikacji (2026–2060, ${compared} porównań) ` + mismatches.slice(0, 5).join('; '))

// ── 2. okresy ──
const created = []
const save = async (period, entries = []) => {
  const r = await sb.rpc('save_rozklad', { p_target: 'period', p_period: period, p_entries: entries, p_policy: 'keep', p_dry_run: false })
  if (r.data?.period_id) created.push(r.data.period_id)
  return r
}
const slots = async (d) => ((await sb.rpc('mass_slots', { p_parish: parish, p_from: d, p_to: d })).data ?? [])
  .map(s => `${s.slot_time.slice(0, 5)}${s.category === 'nabozenstwo' ? 'n' : ''}`).join(',')
const anchor = async (y, k) => (await sb.rpc('liturgical_anchor', { p_year: y, p_key: k })).data

try {
  const sunday = (await sb.from('mass_templates').select('time').eq('parish_id', parish).eq('day_of_week', 0).order('time')).data
    .map(t => t.time.slice(0, 5)).join(',')

  let r = await save({ name: 'TEST Uroczystości nakazane', rule: 'feasts', feasts: ['jan1', 'jan6', 'corpus_christi', 'aug15', 'nov1', 'christmas'], copy_dow: 0 })
  ok(!r.error, 'okres świąt „jak w niedzielę” ' + (r.error?.message ?? ''))
  ok(await slots('2027-01-06') === sunday, `6 I 2027 (środa) = niedzielny rozkład (${sunday})`)
  const cc = await anchor(2027, 'corpus_christi')
  ok(await slots(cc) === sunday, `Boże Ciało 2027 (${cc}) = niedzielny rozkład`)
  ok(await slots('2027-01-05') !== sunday, '5 I 2027 — zwykły dzień')

  r = await save({ name: 'TEST Bad', rule: 'feasts', feasts: ['nov1'], copy_dow: 0 },
    [{ id: null, day_of_week: 0, time: '09:00', label: null, category: 'msza', service_mode: 'signup', base_template_id: null }])
  ok(/niedzielę/.test(r.error?.message ?? ''), 'okres „jak w niedzielę” nie przyjmuje własnych godzin')

  r = await save({ name: 'TEST Adwent', rule: 'season', season_from: 'advent_start', season_to: 'dec23', days_of_week: [1, 2, 3, 4, 5, 6] },
    [1, 2, 3, 4, 5, 6].flatMap(d => [
      { id: null, day_of_week: d, time: '06:30', label: 'Roraty', category: 'msza', service_mode: 'signup', base_template_id: null },
      { id: null, day_of_week: d, time: '18:00', label: null, category: 'msza', service_mode: 'signup', base_template_id: null },
    ]))
  ok(!r.error, 'Adwent od 1. niedzieli do 23 XII (pn–sb) ' + (r.error?.message ?? ''))
  const adv = await anchor(2026, 'advent_start') // niedziela
  const advTue = new Date(adv + 'T12:00:00'); advTue.setDate(advTue.getDate() + 2)
  const tue = advTue.toISOString().slice(0, 10)
  ok(await slots(tue) === '06:30,18:00', `wtorek Adwentu ${tue}: Roraty 6:30 + 18:00`)
  ok(await slots('2026-12-08') === '06:30,18:00', '8 XII (wtorek, poza listą świąt) — Adwent')
  ok(await slots('2026-12-24') !== '06:30,18:00', 'Wigilia — już po Adwencie z Roratami')
  ok(await slots('2026-12-25') === sunday, 'Boże Narodzenie (piątek) — święto wygrywa z Adwentem → niedzielny rozkład')

  const ht = await anchor(2027, 'holy_thursday')
  r = await save({ name: 'TEST Wielki Czwartek', rule: 'feasts', feasts: ['holy_thursday'] },
    [{ id: null, day_of_week: 4, time: '18:00', label: 'Msza Wieczerzy Pańskiej', category: 'msza', service_mode: 'assigned', base_template_id: null }])
  ok(!r.error && await slots(ht) === '18:00', `Wielki Czwartek 2027 (${ht}): tylko 18:00 Wieczerzy Pańskiej`)
} finally {
  for (const id of created) await sb.rpc('save_rozklad', { p_target: 'delete_period', p_period_id: id, p_policy: 'keep', p_dry_run: false })
}
