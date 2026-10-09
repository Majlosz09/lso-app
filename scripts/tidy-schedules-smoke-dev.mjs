// Smoke: porządkowanie grafiku wg rozkładu — stare 17:00 spoza rozkładu z zapisem, zdublowana 18:00,
// ręczna Msza (manual) zostaje. LSO-dev, parafia demo. Sprząta po sobie.
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
const admin = await login('opiekun'), kuba = await login('kuba'), stas = await login('stas')
const parish = (await admin.sb.from('profiles').select('parish_id').eq('id', admin.uid).single()).data.parish_id
const church = (await admin.sb.from('mass_templates').select('church_id').eq('parish_id', parish).eq('day_of_week', 1).eq('time', '18:00:00').single()).data.church_id

// poniedziałek za ~4 miesiące; w rozkładzie demo: pn 18:00
const d = new Date(); d.setMonth(d.getMonth() + 4); while (d.getDay() !== 1) d.setDate(d.getDate() + 1)
const DAY = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const ins = async (time, title, extra = {}) => (await admin.sb.from('schedules').insert({
  parish_id: parish, title, date: DAY, time, category: 'msza', service_mode: 'signup', created_by: admin.uid, church_id: church, ...extra,
}).select('id').single()).data.id
const before = new Set(((await admin.sb.from('schedules').select('id').eq('parish_id', parish).eq('date', DAY)).data ?? []).map(x => x.id))
const made = []

try {
  // służba 18:00 z rozkładu (mogła już istnieć) + duplikat 18:00 ze Stasiem + stara 17:00 z Kubą + ręczna 19:00
  const { data: base } = await admin.sb.rpc('materialize_slot', { p_date: DAY, p_time_label: '18:00', p_church_id: church })
  const dup = await ins('18:00', 'Msza Niedzielna'); made.push(dup)
  const old = await ins('17:00', 'Msza Święta'); made.push(old)
  const manual = await ins('19:00', 'Msza Święta', { manual: true }); made.push(manual)
  await admin.sb.from('schedule_assignments').insert([
    { schedule_id: old, profile_id: kuba.uid, role: 'ministrant', status: 'assigned' },
    { schedule_id: dup, profile_id: stas.uid, role: 'ministrant', status: 'assigned' },
  ])

  let r = await kuba.sb.rpc('tidy_schedules', { p_policy: 'move', p_dry_run: true })
  ok(!!r.error, 'ministrant nie porządkuje grafiku')
  r = await admin.sb.rpc('tidy_schedules', { p_policy: 'move', p_dry_run: true })
  const ch = (r.data?.changes ?? []).filter(x => x.date === DAY)
  ok(!r.error && ch.some(x => x.time === '17:00' && x.action === 'move' && x.to_time === '18:00'), 'podgląd: 17:00 → 18:00 ' + (r.error?.message ?? JSON.stringify(ch)))
  ok(!ch.some(x => x.time === '19:00'), 'podgląd: ręczna Msza 19:00 nietknięta')
  ok(r.data?.merged >= 1, `podgląd: duplikaty do scalenia (${r.data?.merged})`)
  const still = (await admin.sb.from('schedules').select('id').in('id', [old, dup])).data
  ok(still.length === 2, 'podgląd niczego nie zmienia')

  r = await admin.sb.rpc('tidy_schedules', { p_policy: 'move', p_dry_run: false })
  ok(!r.error, 'porządkowanie wykonane ' + (r.error?.message ?? ''))
  const day = (await admin.sb.from('schedules').select('id, time, title, assignments:schedule_assignments(profile_id)').eq('parish_id', parish).eq('date', DAY).order('time')).data
  const at18 = day.filter(s => s.time.startsWith('18:00'))
  ok(!day.some(s => s.time.startsWith('17:00')), 'stara 17:00 usunięta')
  ok(at18.length === 1, `jedna służba 18:00 (było ${at18.length})`)
  const ppl = at18[0]?.assignments.map(a => a.profile_id) ?? []
  ok(ppl.includes(kuba.uid) && ppl.includes(stas.uid), 'Kuba (z 17:00) i Staś (z duplikatu) zapisani na 18:00')
  ok(day.some(s => s.id === manual), 'ręczna Msza 19:00 została')
  const notif = (await kuba.sb.from('notifications').select('id').eq('type', 'schedule_change').eq('title', 'Zmiana godziny służby')).data
  ok(notif.length > 0, 'Kuba dostał powiadomienie o zmianie godziny')
} finally {
  const day = ((await admin.sb.from('schedules').select('id').eq('parish_id', parish).eq('date', DAY)).data ?? []).map(x => x.id)
  await admin.sb.from('schedule_assignments').delete().in('schedule_id', day).in('profile_id', [kuba.uid, stas.uid])
  const fresh = day.filter(id => !before.has(id))
  if (fresh.length) await admin.sb.from('schedules').delete().in('id', fresh)
  for (const u of [kuba, stas]) await u.sb.from('notifications').delete().eq('type', 'schedule_change')
}
