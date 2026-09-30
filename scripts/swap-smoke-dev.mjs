// Smoke N4 na LSO-dev: prośba o zamianę z konkretną osobą (request / reject / cancel / accept).
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
const env = JSON.parse(fs.readFileSync(new URL('../eas.json', import.meta.url))).build.redesign.env
if (!env.EXPO_PUBLIC_SUPABASE_URL.includes('phwoxylvcazcnaifcqab')) throw new Error('Tylko LSO-dev')
const ok = (c, m) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); if (!c) process.exitCode = 1 }
const login = async (key) => {
  const sb = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { data, error } = await sb.auth.signInWithPassword({ email: `${key}@lso-demo.test`, password: 'DemoLSO123!' }); if (error) throw error
  return { sb, uid: data.user.id, key }
}
const admin = await login('opiekun')
const from = await login('michal')
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
const { data: asgs } = await from.sb.from('schedule_assignments')
  .select('id, schedule_id, schedules!inner(date, time, title)')
  .eq('profile_id', from.uid).eq('status', 'assigned').gte('schedules.date', tomorrow).limit(1)
const asg = asgs?.[0]
ok(!!asg, 'Michał ma przyszły przydział')
const { data: taken } = await admin.sb.from('schedule_assignments').select('profile_id').eq('schedule_id', asg.schedule_id)
let to = null, other = null
for (const key of ['tomek', 'kuba', 'filip', 'olek', 'szymon', 'antek', 'janek']) {
  const u = await login(key)
  if (taken.some(t => t.profile_id === u.uid)) continue
  if (!to) to = u; else if (!other) { other = u; break }
}
console.log(`służba: ${asg.schedules.title} ${asg.schedules.date}, do: ${to.key}, osoba trzecia: ${other.key}`)
const st = async (uid) => (await admin.sb.from('schedule_assignments').select('status').eq('schedule_id', asg.schedule_id).eq('profile_id', uid).maybeSingle()).data?.status ?? null

try {
  let r = await from.sb.rpc('request_swap', { p_schedule_id: asg.schedule_id, p_to_profile_id: from.uid })
  ok(!!r.error, 'nie można poprosić samego siebie')

  r = await from.sb.rpc('request_swap', { p_schedule_id: asg.schedule_id, p_to_profile_id: to.uid })
  ok(!r.error, 'prośba wysłana ' + (r.error?.message ?? ''))
  let offer = r.data

  const seen = await other.sb.from('swap_offers').select('id').eq('id', offer)
  ok((seen.data ?? []).length === 0, 'osoba trzecia nie widzi prośby')
  r = await other.sb.rpc('respond_swap', { p_offer_id: offer, p_accept: true })
  ok(!!r.error, 'osoba trzecia nie może przyjąć')

  r = await to.sb.rpc('respond_swap', { p_offer_id: offer, p_accept: false })
  ok(!r.error && (await st(from.uid)) === 'assigned', 'adresat odrzuca → przydział bez zmian')

  r = await from.sb.rpc('request_swap', { p_schedule_id: asg.schedule_id, p_to_profile_id: to.uid })
  offer = r.data
  r = await from.sb.rpc('cancel_swap', { p_offer_id: offer })
  ok(!r.error, 'proszący wycofuje prośbę')
  r = await to.sb.rpc('respond_swap', { p_offer_id: offer, p_accept: true })
  ok(!!r.error, 'wycofanej prośby nie da się przyjąć')

  r = await from.sb.rpc('request_swap', { p_schedule_id: asg.schedule_id, p_to_profile_id: to.uid })
  offer = r.data
  r = await to.sb.rpc('respond_swap', { p_offer_id: offer, p_accept: true })
  ok(!r.error, 'adresat przyjmuje ' + (r.error?.message ?? ''))
  ok((await st(from.uid)) === 'swapped' && (await st(to.uid)) === 'assigned', 'Michał → Zamieniony, adresat → Zapisany')

  r = await from.sb.rpc('request_swap', { p_schedule_id: asg.schedule_id, p_to_profile_id: other.uid })
  ok(!!r.error, 'po zamianie Michał nie może już prosić o tę służbę')
} finally {
  await admin.sb.from('schedule_assignments').update({ status: 'assigned' }).eq('id', asg.id)
  await admin.sb.from('schedule_assignments').delete().eq('schedule_id', asg.schedule_id).eq('profile_id', to.uid)
  console.log('przywrócono przydziały')
}
