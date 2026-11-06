// Smoke: przegląd logiki 2026-11-06 (migracja 20261106010000_logic_fixes.sql). LSO-dev, parafia demo. Sprząta po sobie.
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import { warsawAt } from './_warsaw-time.mjs'
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
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const t18 = (await admin.sb.from('mass_templates').select('id, time, church_id').eq('parish_id', parish).eq('day_of_week', 3)).data?.find(t => t.time.startsWith('18:00'))
if (!t18) throw new Error('Demo: brak śr 18:00')
const d0 = new Date(); d0.setDate(d0.getDate() + 14 + ((3 - d0.getDay() + 7) % 7))
const wed = (n) => { const d = new Date(d0); d.setDate(d.getDate() + 7 * n); return iso(d) }
const W1 = wed(0)
const myAsg = async (who) => ((await admin.sb.from('schedule_assignments')
  .select('id, schedule_id, recurring_assignment_id, schedule:schedules!inner(date, time, parish_id)')
  .eq('profile_id', who).eq('schedule.parish_id', parish).gte('schedule.date', W1).eq('schedule.time', '18:00:00')).data ?? [])
  .filter(a => new Date(a.schedule.date + 'T12:00:00').getDay() === 3)
const cleanup = async (who) => {
  const rules = ((await admin.sb.from('recurring_assignments').select('id').eq('profile_id', who).gte('end_date', W1)).data ?? []).map(r => r.id)
  if (rules.length) await admin.sb.rpc('cancel_recurring_assignments', { p_ids: rules })
  const left = (await myAsg(who)).map(a => a.id)
  if (left.length) await admin.sb.from('schedule_assignments').delete().in('id', left)
}
let tmpSchedule = null

try {
  await cleanup(stas.uid)

  // 4. pojedynczy zapis za 2 tygodnie, potem „co tydzień” od W1 → dołącza do cyklu
  let r = await stas.sb.rpc('sign_up_for_slot', { p_date: wed(2), p_time_label: '18:00', p_mode: 'once', p_church_id: t18.church_id })
  ok(!r.error, 'pojedynczy zapis za 2 tygodnie ' + (r.error?.message ?? ''))
  r = await stas.sb.rpc('sign_up_for_slot', { p_date: W1, p_time_label: '18:00', p_mode: 'recurring', p_church_id: t18.church_id })
  ok(!r.error, 'zapis co tydzień od W1 ' + (r.error?.message ?? ''))
  const rule = r.data?.rule_id
  let asg = await myAsg(stas.uid)
  ok(asg.length >= 3 && asg.every(a => a.recurring_assignment_id === rule), `wcześniejszy pojedynczy zapis dołączył do cyklu (${asg.filter(a => a.recurring_assignment_id === rule).length}/${asg.length})`)

  // 2. prośba o zamianę zamyka się po wypisie z cyklu
  const target = asg.find(a => a.schedule.date === wed(1))
  r = await stas.sb.rpc('request_swap', { p_schedule_id: target.schedule_id, p_to_profile_id: kuba.uid })
  ok(!r.error, 'prośba o zamianę do Kuby ' + (r.error?.message ?? ''))
  const offerId = r.data
  r = await stas.sb.rpc('leave_recurring', { p_assignment_id: asg[0].id })
  ok(!r.error && r.data?.removed_assignments === asg.length, 'wypis z całego cyklu ' + (r.error?.message ?? JSON.stringify(r.data)))
  const offer = (await admin.sb.from('swap_offers').select('status').eq('id', offerId).maybeSingle()).data
  ok(offer?.status === 'cancelled', `prośba o zamianę zamknięta (${offer?.status})`)
  ok((await myAsg(stas.uid)).length === 0, 'nic nie zostało po wypisie')

  // 1. usunięta służba zabiera punkty za obecność
  const now = warsawAt(0)
  r = await admin.sb.from('schedules').insert({ title: 'TEST punkty', date: now.date, time: now.time, location: '', gps_radius: 100,
    parish_id: parish, category: 'msza', created_by: admin.uid, church_id: t18.church_id, manual: true }).select('id').single()
  ok(!r.error, 'służba testowa ' + (r.error?.message ?? ''))
  tmpSchedule = r.data?.id
  r = await admin.sb.rpc('check_in_and_award_points', { p_schedule_id: tmpSchedule, p_profile_id: kuba.uid, p_parish_id: parish })
  ok(!r.error && r.data?.points_awarded > 0, 'opiekun zaznacza obecność Kuby (+pkt) ' + (r.error?.message ?? ''))
  const ptsBefore = (await admin.sb.from('points').select('id').eq('schedule_id', tmpSchedule)).data ?? []
  r = await admin.sb.rpc('cancel_service', { p_schedule_id: tmpSchedule })
  ok(!r.error, 'opiekun usuwa służbę ' + (r.error?.message ?? ''))
  const left = (await admin.sb.from('points').select('id').in('id', ptsBefore.map(p => p.id))).data ?? []
  ok(ptsBefore.length === 1 && left.length === 0, `punkty za obecność zniknęły razem ze służbą (${ptsBefore.length} → ${left.length})`)
  if (!r.error) tmpSchedule = null
} finally {
  await cleanup(stas.uid)
  if (tmpSchedule) await admin.sb.rpc('cancel_service', { p_schedule_id: tmpSchedule })
}
