// Smoke: set_service_attendance (obecność jednym wywołaniem) i open_dm (znajdź / załóż rozmowę) —
// migracje 20261105050000 i 20261105060000. LSO-dev, parafia demo. Sprząta po sobie (dev-sql.sh).
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'child_process'
import fs from 'fs'
import { warsawAt } from './_warsaw-time.mjs'
const env = JSON.parse(fs.readFileSync(new URL('../eas.json', import.meta.url))).build.redesign.env
if (!env.EXPO_PUBLIC_SUPABASE_URL.includes('phwoxylvcazcnaifcqab')) throw new Error('Tylko LSO-dev')
const ok = (c, m) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); if (!c) process.exitCode = 1 }
const client = () => createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const login = async (key) => {
  const sb = client()
  const { data, error } = await sb.auth.signInWithPassword({ email: `${key}@lso-demo.test`, password: 'DemoLSO123!' }); if (error) throw error
  return { sb, uid: data.user.id }
}
const sql = (q) => execSync(`bash scripts/dev-sql.sh "${q.replace(/"/g, '\\"')}" --yes -o json`, { cwd: new URL('..', import.meta.url), stdio: 'pipe' }).toString()

const admin = await login('opiekun'), kuba = await login('kuba')
const parish = (await admin.sb.from('parishes').select('id, allow_member_dm').limit(1).single()).data
const kids = (await admin.sb.from('profiles').select('id').eq('parish_id', parish.id).eq('role', 'member').eq('approved', true).neq('id', kuba.uid).limit(2)).data
let sid = null, newDm = null
try {
  // ── obecność ──
  const { data: s } = await admin.sb.from('schedules').insert({ ...warsawAt(-60), title: 'TEST obecność', category: 'msza', location: '', gps_radius: 100,
    created_by: admin.uid, parish_id: parish.id, manual: true }).select('id').single()
  sid = s.id
  await admin.sb.from('schedule_assignments').insert({ schedule_id: sid, profile_id: kids[0].id, role: 'ministrant', status: 'assigned' })
  let r = await admin.sb.rpc('set_service_attendance', { p_schedule_id: sid, p_present: [kuba.uid, kids[0].id] })
  ok(!r.error && r.data?.added === 2, 'opiekun zaznacza 2 obecnych jednym wywołaniem ' + (r.error?.message ?? JSON.stringify(r.data)))
  const pts = async (pid) => ((await admin.sb.from('points').select('amount').eq('schedule_id', sid).eq('profile_id', pid)).data ?? []).length
  ok(await pts(kuba.uid) === 1 && await pts(kids[0].id) === 1, 'obaj dostali punkty (po jednym wpisie)')
  const st = async (pid) => (await admin.sb.from('schedule_assignments').select('status').eq('schedule_id', sid).eq('profile_id', pid).maybeSingle()).data?.status
  ok(await st(kids[0].id) === 'present', 'przydział → obecny')

  r = await admin.sb.rpc('set_service_attendance', { p_schedule_id: sid, p_present: [kuba.uid] })
  ok(!r.error && r.data?.added === 0 && r.data?.removed === 1, 'odznaczenie jednej osoby ' + JSON.stringify(r.data))
  ok(await pts(kids[0].id) === 0 && await st(kids[0].id) === 'absent', 'odznaczony: punkty cofnięte, przydział → nieobecny')
  ok(await pts(kuba.uid) === 1, 'ponowny zapis nie dubluje punktów')

  r = await kuba.sb.rpc('set_service_attendance', { p_schedule_id: sid, p_present: [kuba.uid, kids[1].id] })
  ok(!!r.error, 'ministrant nie zapisze obecności innym')

  // ── rozmowy prywatne ──
  const a1 = await kuba.sb.rpc('open_dm', { p_target: admin.uid })
  const a2 = await kuba.sb.rpc('open_dm', { p_target: admin.uid })
  const a3 = await admin.sb.rpc('open_dm', { p_target: kuba.uid })
  ok(!a1.error && a1.data && a1.data === a2.data && a2.data === a3.data, 'ta sama rozmowa przy kolejnych otwarciach (też z drugiej strony) ' + (a1.error?.message ?? ''))

  const target = kids[1].id
  const before = sql(`select count(*) n from chat_channels c where c.type='dm' and exists (select 1 from chat_members m where m.channel_id=c.id and m.user_id='${admin.uid}') and exists (select 1 from chat_members m where m.channel_id=c.id and m.user_id='${target}')`).match(/"n": (\d+)/)[1]
  const par = await Promise.all(Array.from({ length: 5 }, () => admin.sb.rpc('open_dm', { p_target: target })))
  ok(par.every(x => !x.error) && new Set(par.map(x => x.data)).size === 1, '5 równoczesnych otwarć → jedna rozmowa')
  if (before === '0') newDm = par[0].data
  const members = sql(`select count(*) n from chat_members where channel_id='${par[0].data}'`).match(/"n": (\d+)/)[1]
  ok(members === '2', 'rozmowa ma dwie osoby')

  r = await kuba.sb.rpc('open_dm', { p_target: kuba.uid })
  ok(!!r.error, 'rozmowa sama ze sobą odrzucona')
  r = await kuba.sb.rpc('open_dm', { p_target: '00000000-0000-0000-0000-000000000000' })
  ok(!!r.error, 'osoba spoza parafii odrzucona')
  if (!parish.allow_member_dm) {
    r = await kuba.sb.rpc('open_dm', { p_target: target })
    ok(!!r.error, 'parafia bez DM członków: ministrant nie założy nowej rozmowy')
  }
} finally {
  if (sid) sql(`delete from points where schedule_id='${sid}'; delete from attendance where schedule_id='${sid}'; delete from schedule_assignments where schedule_id='${sid}'; delete from schedules where id='${sid}'`)
  if (newDm) sql(`delete from chat_channels where id='${newDm}'`)
  console.log('sprzątanie: służba testowa' + (newDm ? ' i nowa rozmowa' : '') + ' usunięte')
}
