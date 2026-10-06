// Smoke Z2 na LSO-dev: kara za odrzucone usprawiedliwienie (reguły punktów, 0 = bez kary).
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
const env = JSON.parse(fs.readFileSync(new URL('../eas.json', import.meta.url))).build.redesign.env
if (!env.EXPO_PUBLIC_SUPABASE_URL.includes('phwoxylvcazcnaifcqab')) throw new Error('Tylko LSO-dev')
const client = () => createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const ok = (c, m) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); if (!c) process.exitCode = 1 }
const login = async (email) => { const sb = client(); const { data, error } = await sb.auth.signInWithPassword({ email, password: 'DemoLSO123!' }); if (error) throw error; return { sb, uid: data.user.id } }

const admin = await login('opiekun@lso-demo.test')
const member = await login('tomek@lso-demo.test')
const { data: prof } = await admin.sb.from('profiles').select('parish_id').eq('id', admin.uid).single()
const pid = prof.parish_id
const { data: par } = await admin.sb.from('parishes').select('rejected_excuse_penalty').eq('id', pid).single()
const origPenalty = par.rejected_excuse_penalty
ok(origPenalty === 2, `domyślna kara 2 (${origPenalty})`)

const { data: asg } = await admin.sb.from('schedule_assignments')
  .select('id, status, admin_note, absence_reason, schedule_id, schedules!inner(parish_id)')
  .eq('profile_id', member.uid).eq('schedules.parish_id', pid).limit(1).single()
const restore = { status: asg.status, admin_note: asg.admin_note, absence_reason: asg.absence_reason }
const penalties = async () => (await admin.sb.from('points').select('amount').eq('source', 'penalty').eq('profile_id', member.uid).eq('schedule_id', asg.schedule_id)).data
const excuse = () => admin.sb.from('schedule_assignments').update({ status: 'excused', absence_reason: 'test Z2' }).eq('id', asg.id)

try {
  await excuse()
  let r = await member.sb.rpc('reject_absence_request', { p_assignment_id: asg.id })
  ok(!!r.error, 'ministrant nie może odrzucić')

  r = await admin.sb.rpc('reject_absence_request', { p_assignment_id: asg.id })
  ok(!r.error && r.data === 2, 'odrzucenie zwraca karę 2 ' + (r.error?.message ?? ''))
  let p = await penalties()
  ok(p.length === 1 && p[0].amount === -2, 'wpis −2 pkt w księdze')

  r = await admin.sb.rpc('reject_absence_request', { p_assignment_id: asg.id })
  ok(!!r.error, 'drugie odrzucenie tego samego zgłoszenia odrzucone')

  await admin.sb.from('schedule_assignments').update({ status: 'confirmed' }).eq('id', asg.id)
  ok((await penalties()).length === 0, 'przyjęcie po odrzuceniu kasuje karę')

  await admin.sb.from('parishes').update({ rejected_excuse_penalty: 0 }).eq('id', pid)
  await excuse()
  r = await admin.sb.rpc('reject_absence_request', { p_assignment_id: asg.id })
  ok(!r.error && r.data === 0 && (await penalties()).length === 0, 'kara 0 → brak wpisu')

  r = await admin.sb.from('parishes').update({ rejected_excuse_penalty: -1 }).eq('id', pid)
  ok(!!r.error, 'ujemna kara odrzucona')
} finally {
  await admin.sb.from('parishes').update({ rejected_excuse_penalty: origPenalty }).eq('id', pid)
  await admin.sb.from('schedule_assignments').update(restore).eq('id', asg.id)
  await admin.sb.from('points').delete().eq('source', 'penalty').eq('profile_id', member.uid).eq('schedule_id', asg.schedule_id)
  console.log('przywrócono stan początkowy')
}
