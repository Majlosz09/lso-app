// Smoke: kilka kościołów w parafii (LSO-dev, parafia demo). Sprząta po sobie.
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
const parish = (await admin.sb.from('profiles').select('parish_id').eq('id', admin.uid).single()).data.parish_id
const main = (await admin.sb.from('churches').select('id, lat, lng').eq('parish_id', parish).eq('is_main', true).single()).data

// wtorek za ~6 miesięcy
const d = new Date(); d.setMonth(d.getMonth() + 6); while (d.getDay() !== 2) d.setDate(d.getDate() + 1)
const DAY = d.toISOString().slice(0, 10)
let chapel = null, tplId = null

try {
  let r = await kuba.sb.from('churches').insert({ parish_id: parish, name: 'TEST Kaplica' })
  ok(!!r.error, 'ministrant nie doda kościoła')
  r = await admin.sb.from('churches').insert({ parish_id: parish, name: 'TEST Kaplica w Zalesiu', short_name: 'Zalesie', lat: 50.1, lng: 19.1, gps_radius: 150 }).select('id').single()
  chapel = r.data?.id
  ok(!!chapel, 'opiekun dodaje kaplicę ' + (r.error?.message ?? ''))
  r = await admin.sb.from('churches').update({ is_main: true }).eq('id', chapel)
  ok(!!r.error, 'kaplica nie stanie się kościołem głównym')

  // stały rozkład: wtorek 18:00 w kościele (jest) + 18:00 w kaplicy
  const base = (await admin.sb.from('mass_templates').select('*').eq('parish_id', parish)).data
  const entries = [...base.map(t => ({ id: t.id, day_of_week: t.day_of_week, time: t.time.slice(0, 5), label: t.label, category: t.category, service_mode: t.service_mode, church_id: t.church_id })),
    { id: null, day_of_week: 2, time: '18:00', label: 'Msza w kaplicy', category: 'msza', service_mode: 'signup', church_id: chapel }]
  r = await admin.sb.rpc('save_rozklad', { p_target: 'base', p_entries: entries, p_policy: 'keep', p_dry_run: false })
  ok(!r.error, 'rozkład z Mszą w kaplicy o tej samej godzinie ' + (r.error?.message ?? ''))
  tplId = (await admin.sb.from('mass_templates').select('id').eq('church_id', chapel).single()).data?.id
  const slots = (await kuba.sb.rpc('mass_slots', { p_parish: parish, p_from: DAY, p_to: DAY })).data ?? []
  ok(slots.filter(s => s.slot_time === '18:00:00').length === 2 && slots.some(s => s.church_id === chapel), 'wtorek: dwie Msze o 18:00 (kościół + kaplica)')

  r = await kuba.sb.rpc('sign_up_for_slot', { p_date: DAY, p_time_label: '18:00', p_mode: 'once', p_church_id: chapel })
  ok(!r.error, 'zapis na Mszę w kaplicy ' + (r.error?.message ?? ''))
  const sch = (await admin.sb.from('schedules').select('id, church_id, title').eq('id', r.data?.schedule_id).single()).data
  ok(sch?.church_id === chapel && sch.title === 'Msza w kaplicy', 'służba utworzona w kaplicy')
  r = await kuba.sb.rpc('sign_up_for_slot', { p_date: DAY, p_time_label: '18:00', p_mode: 'once' })
  const sch2 = (await admin.sb.from('schedules').select('church_id').eq('id', r.data?.schedule_id).maybeSingle()).data
  ok(!r.error && sch2?.church_id === main.id, 'zapis bez kościoła (aplikacja 1.1) = kościół główny')

  r = await admin.sb.rpc('delete_church', { p_id: chapel })
  ok(/rozkładzie/.test(r.error?.message ?? ''), 'kaplicy z rozkładu nie da się usunąć')

  // Zmiany okresowe a kościoły
  const at = async () => ((await admin.sb.rpc('mass_slots', { p_parish: parish, p_from: DAY, p_to: DAY })).data ?? [])
    .map(s => `${s.slot_time.slice(0, 5)}${s.church_id === chapel ? 'K' : ''}`).sort().join(',')
  const periodIds = []
  const savePeriod = async (period, entries) => {
    const x = await admin.sb.rpc('save_rozklad', { p_target: 'period', p_period: { name: 'TEST ' + period.name, rule: 'dates', date_from: DAY, date_to: DAY, repeat_yearly: false, days_of_week: [2], ...period }, p_entries: entries, p_policy: 'keep', p_dry_run: false })
    if (x.data?.period_id) periodIds.push(x.data.period_id)
    return x
  }
  r = await savePeriod({ name: 'tylko kościół' }, [{ id: null, day_of_week: 2, time: '19:00', label: null, category: 'msza', service_mode: 'signup', church_id: main.id }])
  ok(!r.error && await at() === '18:00K,19:00', 'zmiana z godzinami tylko w kościele nie rusza kaplicy ' + (r.error?.message ?? await at()))
  await admin.sb.rpc('save_rozklad', { p_target: 'delete_period', p_period_id: periodIds.pop(), p_policy: 'keep', p_dry_run: false })

  r = await savePeriod({ name: 'odwołanie' }, [])
  ok(!r.error && await at() === '', 'pusta zmiana odwołuje Msze we wszystkich kościołach')
  await admin.sb.rpc('save_rozklad', { p_target: 'delete_period', p_period_id: periodIds.pop(), p_policy: 'keep', p_dry_run: false })

  r = await savePeriod({ name: 'odwołanie w kaplicy', church_ids: [chapel] }, [])
  ok(!r.error && await at() === '18:00', 'odwołanie tylko w kaplicy (wskazany kościół) ' + (r.error?.message ?? await at()))
  await admin.sb.rpc('save_rozklad', { p_target: 'delete_period', p_period_id: periodIds.pop(), p_policy: 'keep', p_dry_run: false })

  // GPS kościoła głównego = GPS parafii (aplikacja 1.1)
  await admin.sb.from('churches').update({ lat: 50.5, lng: 19.5 }).eq('id', main.id)
  const p = (await admin.sb.from('parishes').select('lat, lng').eq('id', parish).single()).data
  ok(p.lat === 50.5 && p.lng === 19.5, 'GPS kościoła głównego trafia do ustawień parafii')
} finally {
  await admin.sb.from('churches').update({ lat: main.lat, lng: main.lng }).eq('id', main.id)
  const asg = (await admin.sb.from('schedule_assignments').select('id, schedule:schedules!inner(date)').eq('profile_id', kuba.uid).eq('schedule.date', DAY)).data ?? []
  for (const a of asg) await admin.sb.from('schedule_assignments').delete().eq('id', a.id)
  if (tplId) {
    const base = (await admin.sb.from('mass_templates').select('*').eq('parish_id', parish).neq('id', tplId)).data
    await admin.sb.rpc('save_rozklad', { p_target: 'base', p_entries: base.map(t => ({ id: t.id, day_of_week: t.day_of_week, time: t.time.slice(0, 5), label: t.label, category: t.category, service_mode: t.service_mode, church_id: t.church_id })), p_policy: 'cancel', p_dry_run: false })
  }
  if (chapel) {
    const r = await admin.sb.rpc('delete_church', { p_id: chapel })
    ok(!r.error, 'usunięcie kaplicy po wyjęciu z rozkładu ' + (r.error?.message ?? ''))
  }
}
