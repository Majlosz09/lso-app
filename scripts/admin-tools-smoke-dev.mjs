// Test narzędzi admina na LSO-dev (NIGDY na produkcji).
// Uruchom: node scripts/admin-tools-smoke-dev.mjs
// Wymaga migracji 20260928000000_admin_tools.sql na LSO-dev.
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.development.local', import.meta.url), 'utf8')
    .split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
)
const URL_ = env.EXPO_PUBLIC_SUPABASE_URL
const KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY
if (!URL_ || URL_.includes('kvqjaoprxxiemynyihfs')) { console.error('STOP: to nie jest projekt dev'); process.exit(1) }

const run = Date.now().toString(36)
const PASSWORD = 'TestLSO123!'
let passed = 0, failed = 0
const ok = (name, cond, extra = '') => {
  if (cond) { passed++; console.log('  ✅', name) } else { failed++; console.log('  ❌', name, extra) }
}
const client = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } })

async function signUp(label, meta = {}) {
  const c = client()
  const email = `${label}.${run}@lso-dev.test`
  const { data, error } = await c.auth.signUp({ email, password: PASSWORD, options: { data: meta } })
  if (error || !data.session) throw new Error(`signUp ${label}: ${error?.message ?? 'brak sesji'}`)
  return { c, id: data.user.id }
}

const today = new Date()
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

console.log(`\nLSO-dev admin tools smoke — run ${run}\n`)

// Admin + parafia (jak parish-setup „Utwórz parafię”: profil z triggera, potem update parish_id + role)
const admin = await signUp('admin', { full_name: 'Ks. Test', phone: '600000000', parish_name: `Parafia ${run}` })
const { data: parish } = await admin.c.from('parishes').insert({ name: `Parafia ${run}`, created_by: admin.id }).select('id, invite_code').single()
const { error: becomeAdmin } = await admin.c.from('profiles').update({ parish_id: parish.id, role: 'admin' }).eq('id', admin.id)
const { data: invite } = await admin.c.from('parishes').select('invite_code').eq('id', parish.id).single()
console.log('1. Rejestracja z metadanymi (bez upsertu z apki)')
ok('założyciel parafii zostaje adminem (parish-setup)', !becomeAdmin, becomeAdmin?.message)

const parent = await signUp('rodzic', { full_name: 'Anna Rodzic', role: 'parent', phone: '600000001', invite_code: invite.invite_code })
await admin.c.rpc('approve_member', { p_profile_id: parent.id })
const { data: pp } = await admin.c.from('profiles').select('full_name, role, parish_id, phone').eq('id', parent.id).single()
ok('rodzic ma rolę parent, imię i parafię od razu po rejestracji', pp?.role === 'parent' && pp?.full_name === 'Anna Rodzic' && pp?.parish_id === parish.id, JSON.stringify(pp))

const m1 = await signUp('min1', { full_name: 'Jan Ministrant', role: 'member', rocznik: '2013', invite_code: invite.invite_code })
const m2 = await signUp('min2', { full_name: 'Piotr Ministrant', role: 'member', rocznik: '2014', invite_code: invite.invite_code })
for (const u of [m1, m2]) await admin.c.rpc('approve_member', { p_profile_id: u.id })
const { data: mp } = await admin.c.from('profiles').select('role, rocznik, parish_id').eq('id', m1.id).single()
ok('ministrant ma rolę member, rocznik i parafię', mp?.role === 'member' && mp?.rocznik === 2013 && mp?.parish_id === parish.id, JSON.stringify(mp))
const evil = await signUp('evil', { full_name: 'X', role: 'admin', invite_code: invite.invite_code })
await admin.c.rpc('approve_member', { p_profile_id: evil.id })
const { data: ep } = await admin.c.from('profiles').select('role').eq('id', evil.id).single()
ok('metadane role=admin są ignorowane', ep?.role === 'member')

console.log('\n2. Zmiana roli')
const { error: toParent } = await admin.c.rpc('set_member_role', { p_profile_id: evil.id, p_role: 'parent' })
const { data: ev2 } = await admin.c.from('profiles').select('role').eq('id', evil.id).single()
ok('admin zmienia ministranta na rodzica', !toParent && ev2?.role === 'parent', toParent?.message)
const { error: memberTries } = await m1.c.rpc('set_member_role', { p_profile_id: m2.id, p_role: 'parent' })
ok('ministrant nie zmienia ról', !!memberTries)
const { data: chans } = await evil.c.from('chat_channels').select('slug')
ok('po zmianie rodzic jest w kanale Rodzice, nie Ministranci', (chans ?? []).some(c => c.slug === 'rodzice') && !(chans ?? []).some(c => c.slug === 'ministranci'), JSON.stringify(chans))

console.log('\n3. Stałe dyżury')
const end = new Date(today); end.setMonth(end.getMonth() + 3)
const dow = (today.getDay() + 2) % 7
const { data: created, error: recErr } = await admin.c.rpc('create_recurring_assignments', {
  p_profile_ids: [m1.id, m2.id], p_day_of_week: dow, p_time: '18:00:00', p_start: iso(today), p_end: iso(end),
})
ok('admin tworzy stały dyżur dla 2 ministrantów na 3 miesiące', !recErr && created?.rules === 2 && created?.assignments >= 24, recErr?.message ?? JSON.stringify(created))
const { data: m1Assign } = await m1.c.from('schedule_assignments').select('id, recurring_assignment_id, schedule:schedules(date, time)').eq('profile_id', m1.id)
ok('ministrant widzi swoje przydziały w grafiku', (m1Assign ?? []).length >= 12 && (m1Assign ?? []).every(a => a.schedule.time === '18:00:00'))
const { error: parentRec } = await admin.c.rpc('create_recurring_assignments', {
  p_profile_ids: [parent.id], p_day_of_week: dow, p_time: '18:00:00', p_start: iso(today), p_end: iso(end),
})
ok('nie da się przypisać rodzica', !!parentRec)
const { error: memberRec } = await m1.c.rpc('create_recurring_assignments', {
  p_profile_ids: [m1.id], p_day_of_week: dow, p_time: '19:00:00', p_start: iso(today), p_end: iso(end),
})
ok('ministrant nie tworzy stałych dyżurów', !!memberRec)
const tooLong = new Date(today); tooLong.setMonth(tooLong.getMonth() + 15)
const { error: longErr } = await admin.c.rpc('create_recurring_assignments', {
  p_profile_ids: [m1.id], p_day_of_week: dow, p_time: '07:00:00', p_start: iso(today), p_end: iso(tooLong),
})
ok('okres dłuższy niż ~rok jest odrzucany', !!longErr)

const { data: rules } = await admin.c.from('recurring_assignments').select('id, profile_id').eq('parish_id', parish.id)
const r1 = rules.find(r => r.profile_id === m1.id)
const { data: cancelled, error: cancelErr } = await admin.c.rpc('cancel_recurring_assignments', { p_ids: [r1.id] })
const { data: m1After } = await m1.c.from('schedule_assignments').select('id').eq('profile_id', m1.id)
const { data: m2After } = await m2.c.from('schedule_assignments').select('id').eq('profile_id', m2.id)
ok('cofnięcie jednym przyciskiem usuwa przyszłe przydziały ministranta', !cancelErr && (m1After ?? []).length === 0 && cancelled?.removed_assignments >= 12, cancelErr?.message)
ok('przydziały drugiego ministranta zostają', (m2After ?? []).length >= 12)

console.log('\n4. Tryb obecności „Tylko admin”')
await admin.c.from('parishes').update({ attendance_mode: 'admin' }).eq('id', parish.id)
const { data: sched } = await admin.c.from('schedules').insert({
  title: 'Msza', date: iso(today), time: '06:30:00', category: 'msza', location: '', gps_radius: 100, parish_id: parish.id, created_by: admin.id,
}).select('id').single()
const { error: selfCheck } = await m2.c.rpc('check_in_and_award_points', { p_schedule_id: sched.id, p_profile_id: m2.id, p_parish_id: parish.id })
ok('ministrant nie melduje się sam', !!selfCheck)
const { error: directAtt } = await m2.c.from('attendance').insert({ schedule_id: sched.id, profile_id: m2.id, method: 'manual', checked_at: new Date().toISOString(), parish_id: parish.id })
ok('bezpośredni zapis obecności też zablokowany', !!directAtt)
const { error: adminCheck } = await admin.c.rpc('check_in_and_award_points', { p_schedule_id: sched.id, p_profile_id: m2.id, p_parish_id: parish.id })
ok('admin zaznacza obecność ministranta', !adminCheck, adminCheck?.message)
await admin.c.from('parishes').update({ attendance_mode: 'button' }).eq('id', parish.id)
const { data: sched2 } = await admin.c.from('schedules').insert({
  title: 'Msza 2', date: iso(today), time: '07:30:00', category: 'msza', location: '', gps_radius: 100, parish_id: parish.id, created_by: admin.id,
}).select('id').single()
const { error: selfOk } = await m2.c.rpc('check_in_and_award_points', { p_schedule_id: sched2.id, p_profile_id: m2.id, p_parish_id: parish.id })
ok('w trybie „Przycisk” ministrant melduje się sam', !selfOk, selfOk?.message)

console.log('\n5. Usuwanie z parafii')
const { error: memberRemoves } = await m1.c.rpc('remove_member_from_parish', { p_profile_id: m2.id })
ok('ministrant nie usuwa innych', !!memberRemoves)
const { error: selfRemove } = await admin.c.rpc('remove_member_from_parish', { p_profile_id: admin.id })
ok('admin nie usuwa sam siebie', !!selfRemove)
const { error: removeErr } = await admin.c.rpc('remove_member_from_parish', { p_profile_id: m2.id })
ok('admin usuwa ministranta z parafii', !removeErr, removeErr?.message)
const { data: m2Profile } = await m2.c.from('profiles').select('parish_id').eq('id', m2.id).single()
ok('usunięty nie ma parafii', m2Profile?.parish_id === null)
const { data: m2Sees } = await m2.c.from('schedules').select('id').eq('parish_id', parish.id)
ok('usunięty nie widzi już grafiku parafii', (m2Sees ?? []).length === 0)
const { data: history } = await admin.c.from('attendance').select('id').eq('profile_id', m2.id)
ok('historia obecności zostaje w parafii', (history ?? []).length >= 1)
const { data: futureM2 } = await admin.c.from('schedule_assignments').select('id, schedule:schedules!inner(date)').eq('profile_id', m2.id).gt('schedule.date', iso(today))
ok('przyszłe dyżury usuniętego zniknęły', (futureM2 ?? []).length === 0, JSON.stringify(futureM2?.length))
const { data: leftList } = await admin.c.from('profiles').select('id').eq('parish_id', parish.id).eq('role', 'member')
ok('lista ministrantów bez usuniętego', !(leftList ?? []).some(p => p.id === m2.id))

console.log(`\nWynik: ${passed} OK, ${failed} błędów\n`)
process.exit(failed ? 1 : 0)
