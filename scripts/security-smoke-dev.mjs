// Test bezpieczeństwa na LSO-dev (NIGDY na produkcji).
// Uruchom: node scripts/security-smoke-dev.mjs
// Zakłada świeże konta *@lso-dev.test i dwie parafie, potem sprawdza, że:
//  - normalne ścieżki apki działają (rejestracja, parafia, grafik, obecność, DM, awatar, usuwanie konta)
//  - próby wejścia w cudze dane są blokowane
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.development.local', import.meta.url), 'utf8')
    .split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
)
const URL_ = env.EXPO_PUBLIC_SUPABASE_URL
const KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY
if (!URL_ || URL_.includes('kvqjaoprxxiemynyihfs')) {
  console.error('STOP: to nie jest projekt dev'); process.exit(1)
}

const run = Date.now().toString(36)
const PASSWORD = 'TestLSO123!'
let passed = 0, failed = 0
const ok = (name, cond, extra = '') => {
  if (cond) { passed++; console.log('  ✅', name) }
  else { failed++; console.log('  ❌', name, extra) }
}
const client = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } })

async function signUp(label) {
  const c = client()
  const email = `${label}.${run}@lso-dev.test`
  const { data, error } = await c.auth.signUp({ email, password: PASSWORD, options: { data: { full_name: label } } })
  if (error) throw new Error(`signUp ${label}: ${error.message}`)
  if (!data.session) throw new Error(`signUp ${label}: brak sesji — wyłącz "Confirm email" w Auth na LSO-dev`)
  return { c, id: data.user.id, email }
}

// Rejestracja admina — dokładnie jak AdminForm w register.tsx
async function registerAdmin(label, parishName) {
  const u = await signUp(label)
  const { data: parish, error: pe } = await u.c.from('parishes')
    .insert({ name: parishName, city: 'Test', created_by: u.id }).select('id').single()
  if (pe) throw new Error(`parish insert ${label}: ${pe.message}`)
  const { error: prErr } = await u.c.from('profiles').upsert({
    id: u.id, full_name: label, role: 'admin', phone: '600000000', is_active: true, parish_id: parish.id,
  })
  if (prErr) throw new Error(`profile upsert ${label}: ${prErr.message}`)
  const { data: p } = await u.c.from('parishes').select('invite_code').eq('id', parish.id).single()
  return { ...u, parishId: parish.id, invite: p.invite_code }
}

// Rejestracja ministranta / rodzica — jak MemberForm
async function registerMember(label, role, invite, extra = {}, approver = null) {
  const u = await signUp(label)
  const { data: pid, error: rpcErr } = await u.c.rpc('get_parish_by_invite_code', { code: invite })
  if (rpcErr || !pid) throw new Error(`invite ${label}: ${rpcErr?.message}`)
  const { error } = await u.c.from('profiles').upsert({
    id: u.id, full_name: label, role, phone: '600000001', rocznik: role === 'member' ? 2013 : null,
    is_active: true, parish_id: pid, ...extra,
  })
  // dołączenie kodem → oczekuje na zatwierdzenie (migracja 20260928010000)
  if (!error && approver) await approver.c.rpc('approve_member', { p_profile_id: u.id })
  return { ...u, parishId: pid, upsertError: error }
}

console.log(`\nLSO-dev security smoke — run ${run}\n`)

console.log('1. Rejestracja')
const adminA = await registerAdmin('adminA', `Parafia A ${run}`)
const adminB = await registerAdmin('adminB', `Parafia B ${run}`)
ok('admin zakłada parafię i widzi kod zaproszenia', !!adminA.invite)
const member = await registerMember('ministrant', 'member', adminA.invite, {}, adminA)
ok('ministrant dołącza kodem', !member.upsertError, member.upsertError?.message)
const parent = await registerMember('rodzic', 'parent', adminA.invite, {}, adminA)
ok('rodzic dołącza kodem', !parent.upsertError, parent.upsertError?.message)
const { error: linkErr } = await parent.c.rpc('link_parent_to_children', { p_child_ids: [member.id] })
ok('rodzic łączy się z dzieckiem', !linkErr, linkErr?.message)

console.log('\n2. Eskalacja uprawnień (ma być zablokowane)')
const evil = await registerMember('intruz-admin', 'admin', adminA.invite)
ok('rejestracja jako admin cudzej parafii (kod zaproszenia)', !!evil.upsertError)
const { error: moveErr } = await adminB.c.from('profiles').update({ parish_id: adminA.parishId }).eq('id', adminB.id)
ok('admin B przenosi się do parafii A', !!moveErr)
const { error: selfPromote } = await member.c.from('profiles').update({ role: 'admin' }).eq('id', member.id)
ok('ministrant nadaje sobie admina', !!selfPromote)
const { data: bRead } = await member.c.from('profiles').select('id').eq('id', adminB.id)
ok('ministrant A nie widzi profilu z parafii B', (bRead ?? []).length === 0)
const { data: allProfiles } = await adminB.c.from('profiles').select('parish_id')
ok('admin B widzi tylko swoją parafię', (allProfiles ?? []).every(p => p.parish_id === adminB.parishId), JSON.stringify(allProfiles))
const { data: parishesSeen } = await adminB.c.from('parishes').select('id, invite_code')
ok('admin B nie widzi kodów zaproszeń innych parafii', (parishesSeen ?? []).every(p => p.id === adminB.parishId))

console.log('\n3. Normalna praca admina A')
const today = new Date().toISOString().slice(0, 10)
const { data: sched, error: schedErr } = await adminA.c.from('schedules').insert({
  title: 'Msza test', date: today, time: '18:00:00', category: 'msza', location: '', gps_radius: 100,
  created_by: adminA.id, parish_id: adminA.parishId,
}).select('id').single()
ok('admin tworzy służbę', !schedErr, schedErr?.message)
const { error: assignErr } = await adminA.c.from('schedule_assignments')
  .insert({ schedule_id: sched?.id, profile_id: member.id, role: 'ministrant', status: 'assigned' })
ok('admin przypisuje ministranta', !assignErr, assignErr?.message)
const { error: annErr } = await adminA.c.from('announcements')
  .insert({ title: 'Test', content: 'Treść', target_audience: 'all', parish_id: adminA.parishId, author_id: adminA.id })
ok('admin dodaje ogłoszenie', !annErr, annErr?.message)
const { error: bAssign } = await adminB.c.from('schedule_assignments').update({ status: 'absent' }).eq('schedule_id', sched?.id).select()
const { data: stillAssigned } = await adminA.c.from('schedule_assignments').select('status').eq('schedule_id', sched?.id).single()
ok('admin B nie zmienia przydziałów parafii A', stillAssigned?.status === 'assigned', bAssign?.message)

console.log('\n4. Obecność i punkty')
const { error: fakeCheckin } = await adminB.c.rpc('check_in_and_award_points', {
  p_schedule_id: sched?.id, p_profile_id: member.id, p_parish_id: adminA.parishId, p_method: 'manual',
})
ok('admin B nie potwierdza obecności w parafii A', !!fakeCheckin)
const { error: ownCheckin } = await member.c.rpc('check_in_and_award_points', {
  p_schedule_id: sched?.id, p_profile_id: member.id, p_parish_id: adminA.parishId, p_method: 'gps', p_lat: 52.1, p_lng: 21.0,
})
ok('ministrant potwierdza swoją obecność', !ownCheckin, ownCheckin?.message)
const { data: att } = await adminA.c.from('attendance').select('lat, lng').eq('schedule_id', sched?.id).eq('profile_id', member.id).single()
ok('lokalizacja nie jest zapisywana', att && att.lat === null && att.lng === null, JSON.stringify(att))
const { error: extraErr } = await member.c.rpc('record_extra_attendance', { p_event_type: 'x', p_event_date: today, p_event_time: '10:00' })
ok('ministrant nie dopisze sobie punktów (record_extra_attendance)', !!extraErr)
const { error: pushErr } = await member.c.rpc('notify_push', { tokens: ['x'], title: 't', body: 'b' })
ok('notify_push niedostępne z apki', !!pushErr)

console.log('\n5. Czat')
const { data: chB } = await adminB.c.from('chat_channels').select('id').limit(1)
const { error: joinErr } = await member.c.from('chat_members').insert({ channel_id: chB?.[0]?.id ?? '00000000-0000-0000-0000-000000000000', user_id: member.id })
ok('ministrant A nie dopisze się do kanału parafii B', !!joinErr)
const { data: chansA } = await adminA.c.from('chat_channels').select('id, parish_id')
ok('admin A widzi tylko kanały swojej parafii', (chansA ?? []).every(c => c.parish_id === adminA.parishId) && (chansA ?? []).length >= 2)
// DM między członkami tylko gdy parafia pozwala (migracja 20260928020000)
await adminA.c.from('parishes').update({ allow_member_dm: true }).eq('id', adminA.parishId)
const { data: dm, error: dmErr } = await member.c.from('chat_channels')
  .insert({ parish_id: adminA.parishId, type: 'dm', name: null }).select().single()
ok('ministrant zakłada DM', !dmErr, dmErr?.message)
const { error: dmMembersErr } = await member.c.from('chat_members')
  .insert([{ channel_id: dm?.id, user_id: member.id }, { channel_id: dm?.id, user_id: adminA.id }])
ok('ministrant dodaje siebie i admina do DM', !dmMembersErr, dmMembersErr?.message)
const { error: msgErr } = await member.c.from('chat_messages').insert({ channel_id: dm?.id, sender_id: member.id, content: 'Szczęść Boże' })
ok('ministrant wysyła wiadomość', !msgErr, msgErr?.message)
const { data: bSeesMsg } = await adminB.c.from('chat_messages').select('id').eq('channel_id', dm?.id)
ok('admin B nie czyta cudzego DM', (bSeesMsg ?? []).length === 0)
const { error: intruderDm } = await adminB.c.from('chat_members').insert({ channel_id: dm?.id, user_id: adminB.id })
ok('admin B nie dopisze się do DM', !!intruderDm)

console.log('\n6. Awatary')
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
const { error: ownAv } = await member.c.storage.from('avatars').upload(`${member.id}.jpg`, png, { contentType: 'image/jpeg', upsert: true })
ok('ministrant wgrywa swój awatar', !ownAv, ownAv?.message)
const { error: otherAv } = await adminB.c.storage.from('avatars').upload(`${member.id}.jpg`, png, { contentType: 'image/jpeg', upsert: true })
ok('admin B nie nadpisze cudzego awatara', !!otherAv)

console.log('\n7. Zakładanie parafii')
const { error: secondParish } = await member.c.from('parishes').insert({ name: 'Spam', created_by: member.id })
ok('członek parafii nie założy kolejnej parafii', !!secondParish)

console.log('\n8. Usuwanie konta')
const { error: soleAdminDel } = await adminA.c.rpc('delete_my_account')
ok('jedyny admin z członkami nie usunie konta', !!soleAdminDel)
const { error: delErr } = await parent.c.rpc('delete_my_account')
ok('rodzic usuwa konto', !delErr, delErr?.message)
const { data: gone } = await adminA.c.from('profiles').select('id').eq('id', parent.id)
ok('profil rodzica zniknął', (gone ?? []).length === 0)

console.log(`\nWynik: ${passed} OK, ${failed} błędów\n`)
process.exit(failed ? 1 : 0)
