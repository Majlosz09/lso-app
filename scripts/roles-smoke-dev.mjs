// Smoke N17 na LSO-dev: role na wybranej Mszy (tryb opiekuna i wolny wybór), bez wpływu na zwykłe msze.
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
const admin = await login('opiekun'), a = await login('kuba'), b = await login('filip')
const { data: prof } = await admin.sb.from('profiles').select('parish_id').eq('id', admin.uid).single()
const in3 = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
// osobna testowa Msza, żeby nie ruszać grafiku
const { data: sch, error: se } = await admin.sb.from('schedules')
  .insert({ parish_id: prof.parish_id, title: 'TEST N17 Uroczystość', date: in3, time: '11:00', category: 'msza', created_by: admin.uid })
  .select('id').single()
if (se) throw se
const slots = async () => (await admin.sb.from('schedule_role_slots').select('id, name, position').eq('schedule_id', sch.id).order('position')).data ?? []
const holder = async (slotId) => (await admin.sb.from('schedule_assignments').select('profile_id, role, status').eq('slot_id', slotId).maybeSingle()).data

try {
  let r = await a.sb.rpc('set_schedule_roles', { p_schedule_id: sch.id, p_roles: ['Lektor'], p_mode: 'self' })
  ok(!!r.error, 'ministrant nie włączy ról')

  r = await admin.sb.rpc('set_schedule_roles', { p_schedule_id: sch.id, p_roles: ['Ceremoniarz', 'Lektor', 'Akolita'], p_mode: 'admin' })
  ok(!r.error, 'opiekun włącza 3 role ' + (r.error?.message ?? ''))
  let s = await slots()
  ok(s.map(x => x.name).join() === 'Ceremoniarz,Lektor,Akolita', 'role w kolejności')

  r = await a.sb.rpc('claim_role_slot', { p_slot_id: s[1].id })
  ok(!!r.error, 'w trybie opiekuna ministrant nie zajmie roli')

  r = await admin.sb.rpc('assign_role_slot', { p_slot_id: s[0].id, p_profile_id: a.uid })
  let h = await holder(s[0].id)
  ok(!r.error && h?.profile_id === a.uid && h.role === 'Ceremoniarz' && h.status === 'assigned', 'opiekun przydziela Kubę jako Ceremoniarza (przydział utworzony)')

  r = await admin.sb.rpc('set_schedule_roles', { p_schedule_id: sch.id, p_roles: ['Ceremoniarz', 'Lektor', 'Akolita'], p_mode: 'self' })
  r = await b.sb.rpc('claim_role_slot', { p_slot_id: s[0].id })
  ok(!!r.error, 'zajętej roli nie da się przejąć')
  r = await b.sb.rpc('claim_role_slot', { p_slot_id: s[1].id })
  h = await holder(s[1].id)
  ok(!r.error && h?.profile_id === b.uid && h.role === 'Lektor', 'wolny wybór: Filip zajmuje Lektora ' + (r.error?.message ?? ''))
  r = await b.sb.rpc('claim_role_slot', { p_slot_id: s[2].id })
  ok(!r.error && !(await holder(s[1].id)) && (await holder(s[2].id))?.profile_id === b.uid, 'Filip zmienia na Akolitę (Lektor wolny)')

  r = await b.sb.from('schedule_assignments').update({ role: 'Ceremoniarz' }).eq('schedule_id', sch.id).eq('profile_id', b.uid)
  const roleNow = (await admin.sb.from('schedule_assignments').select('role').eq('schedule_id', sch.id).eq('profile_id', b.uid).single()).data?.role
  ok(roleNow === 'Akolita', 'ministrant nie zmieni sobie roli bezpośrednio')

  r = await b.sb.rpc('release_role_slot', { p_slot_id: s[2].id })
  const bAsg = (await admin.sb.from('schedule_assignments').select('role, slot_id').eq('schedule_id', sch.id).eq('profile_id', b.uid).single()).data
  ok(!r.error && bAsg?.slot_id === null && bAsg.role === 'ministrant', 'zwolnienie roli — zostaje w obsadzie jako ministrant')

  r = await admin.sb.rpc('set_schedule_roles', { p_schedule_id: sch.id, p_roles: [], p_mode: null })
  const all = (await admin.sb.from('schedule_assignments').select('role, slot_id').eq('schedule_id', sch.id)).data ?? []
  ok(!r.error && (await slots()).length === 0 && all.every(x => x.slot_id === null && x.role === 'ministrant') && all.length === 2, 'wyłączenie ról: obsada zostaje jako ministranci')
} finally {
  await admin.sb.from('schedules').delete().eq('id', sch.id)
  await a.sb.from('notifications').delete().eq('profile_id', a.uid).eq('type', 'assignment').like('body', 'TEST N17%')
  console.log('usunięto testową Mszę')
}
