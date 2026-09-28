// Test czatu, zgłoszeń, eksportu danych i historii usuniętych na LSO-dev (NIGDY na produkcji).
// Uruchom: node scripts/chat-rodo-smoke-dev.mjs
// Wymaga migracji 20260928020000_chat_perf_rodo.sql na LSO-dev.
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

console.log(`\nLSO-dev czat + RODO — run ${run}\n`)
const admin = await signUp('admin', { full_name: 'Ks. Test' })
const { data: parish } = await admin.c.from('parishes').insert({ name: `Parafia ${run}`, created_by: admin.id }).select('id').single()
await admin.c.from('profiles').update({ parish_id: parish.id, role: 'admin' }).eq('id', admin.id)
const { data: pinfo } = await admin.c.from('parishes').select('invite_code, allow_member_dm').eq('id', parish.id).single()
const join = async (label, role) => {
  const u = await signUp(label, { full_name: `${label} Test`, role, rocznik: role === 'member' ? '2013' : undefined, invite_code: pinfo.invite_code })
  await admin.c.rpc('approve_member', { p_profile_id: u.id })
  return u
}
const a = await join('ministrantA', 'member')
const b = await join('ministrantB', 'member')
const dad = await join('rodzic', 'parent')

console.log('1. Wiadomości prywatne wg ustawień parafii')
await admin.c.from('parishes').update({ allow_member_dm: false }).eq('id', parish.id)
const { error: dmOff } = await a.c.from('chat_channels').insert({ parish_id: parish.id, type: 'dm', name: null }).select().single()
ok('DM ministrant→ministrant zablokowany, gdy parafia nie pozwala', !!dmOff)
const { data: adminDm, error: adminDmErr } = await admin.c.from('chat_channels').insert({ parish_id: parish.id, type: 'dm', name: null }).select().single()
const { error: adminDmMembers } = await admin.c.from('chat_members').insert([{ channel_id: adminDm?.id, user_id: admin.id }, { channel_id: adminDm?.id, user_id: a.id }])
ok('admin zawsze może napisać prywatnie', !adminDmErr && !adminDmMembers, (adminDmErr ?? adminDmMembers)?.message)
await admin.c.from('parishes').update({ allow_member_dm: true }).eq('id', parish.id)
const { data: dm, error: dmOn } = await a.c.from('chat_channels').insert({ parish_id: parish.id, type: 'dm', name: null }).select().single()
const { error: dmMem } = await a.c.from('chat_members').insert([{ channel_id: dm?.id, user_id: a.id }, { channel_id: dm?.id, user_id: b.id }])
ok('DM działa, gdy parafia pozwala', !dmOn && !dmMem, (dmOn ?? dmMem)?.message)

console.log('\n2. Limit długości i zgłoszenia')
const { error: longErr } = await a.c.from('chat_messages').insert({ channel_id: dm.id, sender_id: a.id, content: 'x'.repeat(4001) })
ok('wiadomość > 4000 znaków odrzucona', !!longErr)
const { data: msg } = await a.c.from('chat_messages').insert({ channel_id: dm.id, sender_id: a.id, content: 'Niemiła wiadomość' }).select('id').single()
const { data: adminBefore } = await admin.c.from('chat_messages').select('id').eq('id', msg.id)
ok('admin nie czyta cudzego DM, dopóki nie jest zgłoszony', (adminBefore ?? []).length === 0)
const { error: repErr } = await b.c.from('chat_reports').insert({ message_id: msg.id, reporter_id: b.id, reason: 'Nękanie' })
ok('odbiorca zgłasza wiadomość', !repErr, repErr?.message)
const { error: repDup } = await b.c.from('chat_reports').insert({ message_id: msg.id, reporter_id: b.id, reason: 'Nękanie' })
ok('drugie zgłoszenie tej samej wiadomości odrzucone', !!repDup)
const { error: outsiderRep } = await dad.c.from('chat_reports').insert({ message_id: msg.id, reporter_id: dad.id, reason: 'x' })
ok('osoba spoza rozmowy nie zgłosi wiadomości', !!outsiderRep)
const { data: reports } = await admin.c.from('chat_reports').select('id, reason, message:chat_messages(content)')
ok('admin widzi zgłoszenie z treścią wiadomości', (reports ?? []).some(r => r.message?.content === 'Niemiła wiadomość'), JSON.stringify(reports))
const { error: modErr } = await admin.c.from('chat_messages').update({ deleted_at: new Date().toISOString() }).eq('id', msg.id)
const { data: gone } = await b.c.from('chat_messages').select('deleted_at').eq('id', msg.id).single()
ok('admin usuwa zgłoszoną wiadomość', !modErr && !!gone?.deleted_at, modErr?.message)
const { data: bReports } = await b.c.from('chat_reports').select('id')
const { data: aReports } = await a.c.from('chat_reports').select('id')
ok('zgłoszenie widzi zgłaszający, nie autor wiadomości', (bReports ?? []).length === 1 && (aReports ?? []).length === 0)

console.log('\n3. Eksport danych (RODO)')
const { data: exp, error: expErr } = await a.c.rpc('export_my_data')
ok('ministrant pobiera swoje dane', !expErr && exp?.profil?.id === a.id && exp?.konto?.email?.includes('ministranta'), expErr?.message)
ok('eksport nie zawiera tokenu push', exp && !('push_token' in (exp.profil ?? {})))
ok('eksport zawiera wysłane wiadomości', Array.isArray(exp?.wiadomosci))
const { error: anonExp } = await client().rpc('export_my_data')
ok('bez logowania eksport niedostępny', !!anonExp)

console.log('\n4. Historia usuniętych')
await admin.c.rpc('remove_member_from_parish', { p_profile_id: b.id })
const { data: former } = await admin.c.from('profiles').select('full_name').eq('id', b.id)
ok('admin nadal widzi imię usuniętego (historia)', (former ?? []).length === 1)
const { data: formerByA } = await a.c.from('profiles').select('id').eq('id', b.id)
ok('ministrant nie widzi usuniętego', (formerByA ?? []).length === 0)
const { data: listed } = await admin.c.from('profiles').select('id').eq('parish_id', parish.id).eq('role', 'member')
ok('usunięty nie jest na liście członków', !(listed ?? []).some(p => p.id === b.id))

console.log(`\nWynik: ${passed} OK, ${failed} błędów\n`)
process.exit(failed ? 1 : 0)
