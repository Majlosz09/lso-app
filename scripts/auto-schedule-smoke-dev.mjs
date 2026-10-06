// Smoke: zatwierdzenie propozycji grafiku + powiadomienia (LSO-dev, parafia demo). Sprząta po sobie.
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
const admin = await login('opiekun'), kuba = await login('kuba'), filip = await login('filip')
const parish = (await admin.sb.from('profiles').select('parish_id').eq('id', admin.uid).single()).data.parish_id
const main = (await admin.sb.from('churches').select('id').eq('parish_id', parish).eq('is_main', true).single()).data.id

// dwa wtorki za ~8 miesięcy
const d = new Date(); d.setMonth(d.getMonth() + 8); while (d.getDay() !== 2) d.setDate(d.getDate() + 1)
const D1 = d.toISOString().slice(0, 10); d.setDate(d.getDate() + 7); const D2 = d.toISOString().slice(0, 10)
const since = new Date().toISOString()
const items = [
  { schedule_id: null, date: D1, time: '18:00', church_id: main, category: 'msza', title: 'Msza Święta', service_mode: 'signup', profile_ids: [kuba.uid, filip.uid] },
  { schedule_id: null, date: D2, time: '18:00', church_id: main, category: 'msza', title: 'Msza Święta', service_mode: 'signup', profile_ids: [kuba.uid] },
]
const myAsg = async () => (await admin.sb.from('schedule_assignments').select('id, profile_id, schedule:schedules!inner(date)')
  .in('schedule.date', [D1, D2]).in('profile_id', [kuba.uid, filip.uid])).data ?? []

try {
  let r = await kuba.sb.rpc('apply_auto_schedule', { p_items: items })
  ok(!!r.error, 'ministrant nie zatwierdzi grafiku')

  r = await admin.sb.rpc('apply_auto_schedule', { p_items: items })
  ok(!r.error && r.data?.assignments === 3 && r.data?.members === 2, 'zatwierdzenie: 3 przydziały dla 2 osób ' + JSON.stringify(r.error?.message ?? r.data))
  ok((await myAsg()).length === 3, 'przydziały są w bazie')

  const kn = (await kuba.sb.from('notifications').select('type, title, body').gte('created_at', since)).data ?? []
  ok(kn.filter(n => n.type === 'assignment_batch').length === 1 && kn.find(n => n.type === 'assignment_batch')?.title === '2 nowe dyżury',
    'Kuba dostał jedno zbiorcze powiadomienie „2 nowe dyżury”')
  ok(kn.filter(n => n.type === 'assignment').length === 0, 'bez pojedynczych powiadomień o każdym dyżurze')

  r = await admin.sb.rpc('apply_auto_schedule', { p_items: items })
  ok(!r.error && r.data?.assignments === 0, 'ponowne zatwierdzenie niczego nie dubluje')
} finally {
  for (const a of await myAsg()) await admin.sb.from('schedule_assignments').delete().eq('id', a.id)
  for (const u of [kuba, filip]) await u.sb.from('notifications').delete().eq('type', 'assignment_batch')
}
