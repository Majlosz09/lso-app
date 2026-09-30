// Smoke N14 na LSO-dev: rodzic zgłasza / wycofuje nieobecność dziecka; obcy rodzic i ministrant nie mogą.
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
const env = JSON.parse(fs.readFileSync(new URL('../eas.json', import.meta.url))).build.redesign.env
if (!env.EXPO_PUBLIC_SUPABASE_URL.includes('phwoxylvcazcnaifcqab')) throw new Error('Tylko LSO-dev')
const ok = (c, m) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); if (!c) process.exitCode = 1 }
const login = async (email) => {
  const sb = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { data, error } = await sb.auth.signInWithPassword({ email, password: 'DemoLSO123!' }); if (error) throw error
  return { sb, uid: data.user.id }
}
const parent = await login('rodzic@lso-demo.test')
const member = await login('tomek@lso-demo.test')
const admin = await login('opiekun@lso-demo.test')

const { data: kids } = await parent.sb.from('profiles').select('id, full_name').eq('parent_id', parent.uid)
ok(kids.length > 0, `rodzic ma dzieci (${kids.map(k => k.full_name).join(', ')})`)
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
const { data: asg } = await parent.sb.from('schedule_assignments')
  .select('id, status, absence_reason, schedules!inner(date, time)')
  .in('profile_id', kids.map(k => k.id)).eq('status', 'assigned').gte('schedules.date', tomorrow).limit(1).single()
ok(!!asg, 'przyszły dyżur dziecka ze statusem „Zapisany”')
const status = async () => (await admin.sb.from('schedule_assignments').select('status, absence_reason').eq('id', asg.id).single()).data

try {
  let r = await member.sb.rpc('report_child_absence', { p_assignment_id: asg.id, p_reason: 'Choroba' })
  ok(!!r.error, 'ministrant (nie rodzic) nie może zgłosić za dziecko')

  r = await parent.sb.rpc('report_child_absence', { p_assignment_id: asg.id, p_reason: '  ' })
  ok(!!r.error, 'pusty powód odrzucony')

  r = await parent.sb.rpc('report_child_absence', { p_assignment_id: asg.id, p_reason: 'Choroba — angina' })
  ok(!r.error, 'rodzic zgłasza nieobecność ' + (r.error?.message ?? ''))
  let s = await status()
  ok(s.status === 'excused' && s.absence_reason === 'Choroba — angina (zgłosił rodzic)', `status excused + powód (${s.status}, ${s.absence_reason})`)

  r = await parent.sb.rpc('report_child_absence', { p_assignment_id: asg.id, p_reason: 'Choroba' })
  ok(!!r.error, 'drugie zgłoszenie odrzucone')

  r = await parent.sb.rpc('withdraw_child_absence', { p_assignment_id: asg.id })
  s = await status()
  ok(!r.error && s.status === 'assigned' && s.absence_reason === null, 'rodzic wycofuje zgłoszenie')
} finally {
  await admin.sb.from('schedule_assignments').update({ status: asg.status, absence_reason: asg.absence_reason }).eq('id', asg.id)
  console.log('przywrócono stan początkowy')
}
