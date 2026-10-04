// Smoke: zmiany okresowe rozkładu + tryb służby na LSO-dev (parafia demo). Sprząta po sobie.
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
const env = JSON.parse(fs.readFileSync(new URL('../eas.json', import.meta.url))).build.redesign.env
if (!env.EXPO_PUBLIC_SUPABASE_URL.includes('phwoxylvcazcnaifcqab')) throw new Error('Tylko LSO-dev')
const ok = (c, m) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); if (!c) process.exitCode = 1 }
const login = async (key) => {
  const sb = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { data, error } = await sb.auth.signInWithPassword({ email: `${key}@lso-demo.test`, password: 'DemoLSO123!' }); if (error) throw error
  return { sb, uid: data.user.id }
}
const admin = await login('opiekun'), kuba = await login('kuba')
const { data: prof } = await admin.sb.from('profiles').select('parish_id').eq('id', admin.uid).single()
const parish = prof.parish_id

// Wtorek za ~5 miesięcy (poza grafikiem demo), okres jednodniowy
const d = new Date(); d.setMonth(d.getMonth() + 5); while (d.getDay() !== 2) d.setDate(d.getDate() + 1)
const DAY = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const slotsOn = async (sb) => (await sb.rpc('mass_slots', { p_parish: parish, p_from: DAY, p_to: DAY })).data ?? []
const myAsg = async () => (await kuba.sb.from('schedule_assignments')
  .select('id, status, schedule:schedules!inner(date, time, category, service_mode)').eq('profile_id', kuba.uid).eq('schedule.date', DAY)).data ?? []
const tue = (await admin.sb.from('mass_templates').select('id, time').eq('parish_id', parish).eq('day_of_week', 2).single()).data
let periodId = null

try {
  let s = await slotsOn(kuba.sb)
  ok(s.length === 1 && s[0].slot_time === '18:00:00' && s[0].service_mode === 'signup', 'stały rozkład: wtorek 18:00, zapisy')

  let r = await kuba.sb.rpc('sign_up_for_slot', { p_date: DAY, p_time_label: '17:00', p_mode: 'once' })
  ok(!!r.error, 'zapis na godzinę spoza rozkładu odrzucony')
  r = await kuba.sb.rpc('sign_up_for_slot', { p_date: DAY, p_time_label: '18:00', p_mode: 'once' })
  ok(!r.error, 'Kuba zapisuje się na 18:00 ' + (r.error?.message ?? ''))

  r = await kuba.sb.rpc('save_rozklad', { p_target: 'period', p_period: {}, p_entries: [] })
  ok(!!r.error, 'ministrant nie zmieni rozkładu')

  // Okres: 17:00 Msza (zastępuje 18:00 → zapis idzie za nią), 17:30 różaniec bez punktów, 18:30 Msza
  const period = { name: 'TEST okres', date_from: DAY, date_to: DAY, repeat_yearly: false, days_of_week: [2] }
  const entries = [
    { id: null, day_of_week: 2, time: '17:00', label: null, category: 'msza', service_mode: 'signup', base_template_id: tue.id },
    { id: null, day_of_week: 2, time: '17:30', label: 'Różaniec', category: 'nabozenstwo', service_mode: 'none', base_template_id: null },
    { id: null, day_of_week: 2, time: '18:30', label: null, category: 'msza', service_mode: 'assigned', base_template_id: null },
  ]
  r = await admin.sb.rpc('save_rozklad', { p_target: 'period', p_period: period, p_entries: entries, p_policy: 'move', p_dry_run: true })
  const ch = r.data?.changes ?? []
  ok(!r.error && ch.length === 1 && ch[0].action === 'move' && ch[0].to_time === '17:00' && ch[0].people.length >= 1,
    'podgląd: zapis z 18:00 → 17:00 ' + JSON.stringify(r.error?.message ?? ch))
  ok((await slotsOn(admin.sb)).length === 1 && (await myAsg())[0]?.schedule.time === '18:00:00', 'podgląd niczego nie zapisał')

  r = await admin.sb.rpc('save_rozklad', { p_target: 'period', p_period: period, p_entries: entries, p_policy: 'move', p_dry_run: false })
  periodId = r.data?.period_id
  ok(!r.error && periodId && r.data.moved >= 1, 'zapis okresu ' + (r.error?.message ?? ''))
  s = await slotsOn(kuba.sb)
  ok(s.map(x => `${x.slot_time.slice(0, 5)} ${x.category} ${x.service_mode}`).join() ===
    '17:00:00 msza signup,17:30:00 nabozenstwo none,18:30:00 msza assigned'.replace(/:00 /g, ' '),
    'w okresie obowiązuje nowy układ ' + JSON.stringify(s.map(x => x.slot_time)))
  let mine = await myAsg()
  ok(mine.length === 1 && mine[0].schedule.time === '17:00:00', 'zapis Kuby przeniesiony na 17:00')
  const { data: notes } = await kuba.sb.from('notifications').select('title').eq('type', 'schedule_change').order('created_at', { ascending: false }).limit(1)
  ok(notes?.[0]?.title === 'Zmiana godziny służby', 'Kuba dostał powiadomienie o zmianie godziny')

  r = await kuba.sb.rpc('sign_up_for_slot', { p_date: DAY, p_time_label: '18:30', p_mode: 'once' })
  ok(/opiekun/.test(r.error?.message ?? ''), 'tryb „grafik opiekuna”: brak zapisów')
  r = await kuba.sb.rpc('sign_up_for_slot', { p_date: DAY, p_time_label: '17:30', p_mode: 'once' })
  ok(!!r.error, 'tryb „bez punktów”: brak zapisów')
  const { data: none } = await admin.sb.from('schedules').select('id, service_mode').eq('parish_id', parish).eq('date', DAY).eq('time', '17:30').maybeSingle()
  if (none) {
    r = await admin.sb.rpc('check_in_and_award_points', { p_schedule_id: none.id, p_profile_id: kuba.uid, p_parish_id: parish })
    ok(/nie sprawdzamy/.test(r.error?.message ?? ''), 'tryb „bez punktów”: obecności nie da się zaznaczyć')
  } else ok(true, '(różaniec bez służby w bazie — brak sprawdzenia obecności)')

  r = await kuba.sb.rpc('materialize_slot', { p_date: DAY, p_time_label: '18:30' })
  ok(/data/i.test(r.error?.message ?? ''), 'materialize_slot tylko blisko dzisiaj')

  // Usunięcie okresu: zapis wraca na 18:00 (ta sama pozycja stała)
  r = await admin.sb.rpc('save_rozklad', { p_target: 'delete_period', p_period_id: periodId, p_policy: 'move', p_dry_run: false })
  ok(!r.error, 'usunięcie okresu ' + (r.error?.message ?? ''))
  periodId = r.error ? periodId : null
  mine = await myAsg()
  ok(mine.length === 1 && mine[0].schedule.time === '18:00:00', 'po usunięciu okresu zapis wrócił na 18:00')
  const left = (await admin.sb.from('schedules').select('time').eq('parish_id', parish).eq('date', DAY)).data ?? []
  ok(!left.some(x => ['17:00:00', '17:30:00', '18:30:00'].includes(x.time)), 'puste służby z okresu usunięte')
} finally {
  if (periodId) await admin.sb.rpc('save_rozklad', { p_target: 'delete_period', p_period_id: periodId, p_policy: 'cancel', p_dry_run: false })
  for (const a of await myAsg()) await admin.sb.from('schedule_assignments').delete().eq('id', a.id)
  await admin.sb.from('notifications').delete().eq('type', 'schedule_change')
  await kuba.sb.from('notifications').delete().eq('type', 'schedule_change')
}
