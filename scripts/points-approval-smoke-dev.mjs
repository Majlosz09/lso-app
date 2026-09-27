// Test punktów, akceptacji członków i doszczelnień na LSO-dev (NIGDY na produkcji).
// Uruchom: node scripts/points-approval-smoke-dev.mjs
// Wymaga migracji 20260928010000_points_approval_hardening.sql na LSO-dev.
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
let passed = 0, failed = 0
const ok = (name, cond, extra = '') => {
  if (cond) { passed++; console.log('  ✅', name) } else { failed++; console.log('  ❌', name, extra) }
}
const client = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } })
async function signUp(label, meta = {}) {
  const c = client()
  const { data, error } = await c.auth.signUp({ email: `${label}.${run}@lso-dev.test`, password: 'TestLSO123!', options: { data: meta } })
  if (error || !data.session) throw new Error(`signUp ${label}: ${error?.message ?? 'brak sesji'}`)
  return { c, id: data.user.id }
}
const today = new Date().toISOString().slice(0, 10)

console.log(`\nLSO-dev punkty + akceptacja — run ${run}\n`)

const admin = await signUp('admin', { full_name: 'Ks. Test' })
const { data: parish } = await admin.c.from('parishes').insert({ name: `Parafia ${run}`, created_by: admin.id }).select('id').single()
await admin.c.from('profiles').update({ parish_id: parish.id, role: 'admin' }).eq('id', admin.id)
const { data: pinfo } = await admin.c.from('parishes').select('invite_code').eq('id', parish.id).single()
const code = pinfo.invite_code

console.log('1. Kody i lista dzieci')
ok('nowy kod ma 6 znaków bez mylących (0/O/1/I/L)', /^[A-HJKMNP-Z2-9]{6}$/.test(code), code)
const anon = client()
const { error: oldListErr, data: oldList } = await anon.rpc('get_parish_members', { p_parish_id: parish.id })
ok('pełna lista członków niedostępna bez logowania', !!oldListErr || (oldList ?? []).length === 0)

console.log('\n2. Akceptacja członków')
const kid = await signUp('dziecko', { full_name: 'Jan Kowalski', role: 'member', rocznik: '2014', invite_code: code })
const { data: kidSelf } = await kid.c.from('profiles').select('approved, parish_id').eq('id', kid.id).single()
ok('nowy ministrant czeka na zatwierdzenie', kidSelf?.approved === false && kidSelf?.parish_id === parish.id, JSON.stringify(kidSelf))
const { data: kidSees } = await kid.c.from('profiles').select('id').neq('id', kid.id)
ok('oczekujący nie widzi innych osób z parafii', (kidSees ?? []).length === 0)
const { data: kidParish } = await kid.c.from('parishes').select('invite_code').eq('id', parish.id)
ok('oczekujący nie widzi parafii', (kidParish ?? []).length === 0)
const { data: adminSeesKid } = await admin.c.from('profiles').select('id').eq('id', kid.id)
ok('oczekujący nie pojawia się na listach', (adminSeesKid ?? []).length === 0)
const { data: pending } = await admin.c.rpc('get_pending_members')
ok('admin widzi go w oczekujących', (pending ?? []).some(p => p.id === kid.id && p.full_name === 'Jan Kowalski'))
const { error: selfApprove } = await kid.c.from('profiles').update({ approved: true }).eq('id', kid.id)
const { data: kidStill } = await kid.c.from('profiles').select('approved').eq('id', kid.id).single()
ok('nie da się zatwierdzić samego siebie', !!selfApprove || kidStill?.approved === false)
const { error: kidApproveOther } = await kid.c.rpc('approve_member', { p_profile_id: kid.id })
ok('oczekujący nie zatwierdza przez RPC', !!kidApproveOther)

const { data: preview } = await anon.rpc('get_parish_children_by_code', { code })
ok('lista dzieci przed zatwierdzeniem nie zawiera oczekujących', !(preview ?? []).some(p => p.id === kid.id))
const { error: apprErr } = await admin.c.rpc('approve_member', { p_profile_id: kid.id })
ok('admin zatwierdza', !apprErr, apprErr?.message)
const { data: kidSees2 } = await kid.c.from('parishes').select('id').eq('id', parish.id)
ok('po zatwierdzeniu widzi parafię', (kidSees2 ?? []).length === 1)
const { data: kidChans } = await kid.c.from('chat_channels').select('slug')
ok('po zatwierdzeniu jest w kanale Ministranci', (kidChans ?? []).some(c => c.slug === 'ministranci'))
const { data: preview2 } = await anon.rpc('get_parish_children_by_code', { code })
const shown = (preview2 ?? []).find(p => p.id === kid.id)
ok('rodzic przed rejestracją widzi tylko „Jan K.” + rocznik', shown?.display_name === 'Jan K.' && shown?.rocznik === 2014, JSON.stringify(shown))

const stranger = await signUp('obcy', { full_name: 'Obcy Ktoś', role: 'parent', invite_code: code })
const { error: rejErr } = await admin.c.rpc('remove_member_from_parish', { p_profile_id: stranger.id })
const { data: strSelf } = await stranger.c.from('profiles').select('parish_id').eq('id', stranger.id).single()
ok('admin odrzuca prośbę (osoba bez parafii)', !rejErr && strSelf?.parish_id === null, rejErr?.message)

console.log('\n3. Punkty')
await admin.c.from('point_rules').upsert([
  { parish_id: parish.id, service_type: 'msza_assigned', points: 10 },
  { parish_id: parish.id, service_type: 'msza_extra', points: 10 },
], { onConflict: 'parish_id,service_type' })
const { data: s1 } = await admin.c.from('schedules').insert({ title: 'Msza', date: today, time: '06:00:00', category: 'msza', location: '', gps_radius: 100, parish_id: parish.id, created_by: admin.id }).select('id').single()
const { data: r1 } = await kid.c.rpc('check_in_and_award_points', { p_schedule_id: s1.id, p_profile_id: kid.id, p_parish_id: parish.id })
const sum1 = (await admin.c.from('points_summary').select('total_points, services_count').eq('profile_id', kid.id).single()).data
ok('reguła 10 pkt → ranking +10 (nie 15)', r1?.points_awarded === 10 && sum1?.total_points === 10 && sum1?.services_count === 1, JSON.stringify({ r1, sum1 }))
await admin.c.from('attendance').delete().eq('schedule_id', s1.id).eq('profile_id', kid.id)
const sum2 = (await admin.c.from('points_summary').select('total_points, services_count').eq('profile_id', kid.id).single()).data
ok('odznaczenie obecności cofa punkty', sum2?.total_points === 0 && sum2?.services_count === 0, JSON.stringify(sum2))
await admin.c.from('point_rules').delete().eq('parish_id', parish.id)
const { data: s2 } = await admin.c.from('schedules').insert({ title: 'Nabożeństwo', date: today, time: '06:30:00', category: 'nabozenstwo', location: '', gps_radius: 100, parish_id: parish.id, created_by: admin.id }).select('id').single()
const { data: r2 } = await kid.c.rpc('check_in_and_award_points', { p_schedule_id: s2.id, p_profile_id: kid.id, p_parish_id: parish.id })
ok('bez reguł: domyślnie 5 pkt (jak dotąd w rankingu)', r2?.points_awarded === 5, JSON.stringify(r2))
const { error: manualErr } = await admin.c.from('points').insert({ profile_id: kid.id, amount: 3, reason: 'Pomoc', parish_id: parish.id, awarded_by: admin.id })
const sum3 = (await admin.c.from('points_summary').select('total_points').eq('profile_id', kid.id).single()).data
ok('punkty ręczne admina dodają się do rankingu', !manualErr && sum3?.total_points === 8, JSON.stringify(sum3))

console.log('\n4. Doszczelnienia profilu i przydziałów')
const { data: rank } = await admin.c.from('ranks').insert({ name: 'Lektor', order: 99, is_system: false, parish_id: parish.id }).select('id').single()
const { error: rankErr } = await kid.c.from('profiles').update({ rank_id: rank.id }).eq('id', kid.id)
ok('ministrant nie nadaje sobie rangi', !!rankErr)
const { error: nameOk } = await kid.c.from('profiles').update({ phone: '600999999' }).eq('id', kid.id)
ok('ministrant nadal edytuje swoje dane (telefon)', !nameOk, nameOk?.message)
const { error: adminRank } = await admin.c.from('profiles').update({ rank_id: rank.id }).eq('id', kid.id)
ok('admin nadaje rangę', !adminRank, adminRank?.message)
const { data: s3 } = await admin.c.from('schedules').insert({ title: 'Msza 3', date: today, time: '20:00:00', category: 'msza', location: '', gps_radius: 100, parish_id: parish.id, created_by: admin.id }).select('id').single()
const { data: asg } = await admin.c.from('schedule_assignments').insert({ schedule_id: s3.id, profile_id: kid.id, role: 'ministrant', status: 'assigned' }).select('id').single()
const { error: fakePresent } = await kid.c.from('schedule_assignments').update({ status: 'present' }).eq('id', asg.id)
ok('ministrant nie ustawi „obecny” bez zameldowania', !!fakePresent)
const { error: excuse } = await kid.c.from('schedule_assignments').update({ status: 'excused', absence_reason: 'Choroba' }).eq('id', asg.id)
ok('ministrant zgłasza nieobecność', !excuse, excuse?.message)
const { error: confirmSelf } = await kid.c.from('schedule_assignments').update({ status: 'confirmed' }).eq('id', asg.id)
ok('ministrant nie zatwierdza sobie usprawiedliwienia', !!confirmSelf)
const { error: adminConfirm } = await admin.c.from('schedule_assignments').update({ status: 'confirmed' }).eq('id', asg.id)
ok('admin zatwierdza usprawiedliwienie', !adminConfirm, adminConfirm?.message)

console.log(`\nWynik: ${passed} OK, ${failed} błędów\n`)
process.exit(failed ? 1 : 0)
