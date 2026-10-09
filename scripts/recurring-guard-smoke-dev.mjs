// Smoke: stały dyżur / zapis „co tydzień” w okresie, w którym Msza zmieniła się w nabożeństwo
// (październik: 17:30 Msza → 17:30 Różaniec) + korekta punktów za obecność. LSO-dev, parafia demo. Sprząta po sobie.
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
const admin = await login('opiekun'), kuba = await login('kuba'), stas = await login('stas')
const parish = (await admin.sb.from('profiles').select('parish_id').eq('id', admin.uid).single()).data.parish_id
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// okres testowy: środy w miesiącu za 8 miesięcy; zakres dyżuru 3 tygodnie przed i po
const m = new Date(); m.setDate(1); m.setMonth(m.getMonth() + 8)
const P_FROM = iso(m), P_TO = iso(new Date(m.getFullYear(), m.getMonth() + 1, 0))
const START = iso(new Date(m.getFullYear(), m.getMonth(), -20)), END = iso(new Date(m.getFullYear(), m.getMonth() + 1, 21))
const inPeriod = (d) => d >= P_FROM && d <= P_TO

const tpl = (await admin.sb.from('mass_templates').select('id, time, category, church_id').eq('parish_id', parish).eq('day_of_week', 3)).data
const t17 = tpl.find(t => t.time.startsWith('17:00')), t18 = tpl.find(t => t.time.startsWith('18:00'))
if (!t17 || !t18) throw new Error('Demo: brak śr 17:00 / 18:00 w rozkładzie')

const before = new Set(((await admin.sb.from('schedules').select('id').eq('parish_id', parish).gte('date', START).lte('date', END)).data ?? []).map(s => s.id))
const stasBefore = new Set(((await admin.sb.from('schedule_assignments').select('id').eq('profile_id', stas.uid)).data ?? []).map(x => x.id))
const commitBefore = new Set(((await stas.sb.from('recurring_commitments').select('id').eq('profile_id', stas.uid)).data ?? []).map(x => x.id))
let periodId = null, ruleIds = [], schedPoints = null

try {
  // 17:00 Msza → 17:00 Różaniec (powiązany z Mszą), nowa Msza 16:30; 18:00 → 18:30 (ta sama Msza)
  const r0 = await admin.sb.rpc('save_rozklad', {
    p_target: 'period', p_period_id: null, p_policy: 'keep', p_dry_run: false,
    p_period: { name: 'TEST okres różaniec', date_from: P_FROM, date_to: P_TO, repeat_yearly: false, days_of_week: [3], rule: 'dates' },
    p_entries: [
      { id: null, day_of_week: 3, time: '16:30', label: null, category: 'msza', service_mode: 'signup', base_template_id: null, church_id: t17.church_id },
      { id: null, day_of_week: 3, time: '17:00', label: 'Różaniec', category: 'nabozenstwo', service_mode: 'signup', base_template_id: t17.id, church_id: t17.church_id },
      { id: null, day_of_week: 3, time: '18:30', label: null, category: 'msza', service_mode: 'signup', base_template_id: t18.id, church_id: t18.church_id },
    ],
  })
  periodId = r0.data?.period_id
  ok(!r0.error && periodId, 'okres testowy zapisany ' + (r0.error?.message ?? ''))

  // podgląd
  let r = await admin.sb.rpc('preview_recurring_assignments', { p_day_of_week: 3, p_time: '17:00:00', p_start: START, p_end: END })
  ok(!r.error && r.data?.length > 0, 'podgląd 17:00 ' + (r.error?.message ?? ''))
  const p17 = r.data ?? []
  ok(p17.filter(x => inPeriod(x.day)).every(x => x.kind === 'skipped' && x.period_name === 'TEST okres różaniec'), 'podgląd: w okresie 17:00 pominięte (różaniec, nie Msza)')
  ok(p17.filter(x => !inPeriod(x.day)).every(x => x.kind === 'ok' && x.slot_time === '17:00'), 'podgląd: poza okresem 17:00 Msza')
  r = await admin.sb.rpc('preview_recurring_assignments', { p_day_of_week: 3, p_time: '18:00:00', p_start: START, p_end: END })
  ok((r.data ?? []).filter(x => inPeriod(x.day)).every(x => x.kind === 'moved' && x.slot_time === '18:30'), 'podgląd: 18:00 w okresie → 18:30 (ta sama Msza)')
  r = await kuba.sb.rpc('preview_recurring_assignments', { p_day_of_week: 3, p_time: '17:00:00', p_start: START, p_end: END })
  ok(!!r.error, 'ministrant nie ma podglądu stałych dyżurów')

  // stały dyżur Kuby: śr 17:00 i 18:00
  for (const time of ['17:00:00', '18:00:00']) {
    r = await admin.sb.rpc('create_recurring_assignments', { p_profile_ids: [kuba.uid], p_day_of_week: 3, p_time: time, p_start: START, p_end: END })
    ok(!r.error, `stały dyżur ${time} ` + (r.error?.message ?? ''))
    if (time === '17:00:00') ok(r.data?.skipped_days === p17.filter(x => x.kind === 'skipped').length, `pominięte dni zwrócone (${r.data?.skipped_days})`)
  }
  ruleIds = ((await admin.sb.from('recurring_assignments').select('id').eq('profile_id', kuba.uid).eq('start_date', START).eq('end_date', END)).data ?? []).map(x => x.id)
  const asg = (await admin.sb.from('schedule_assignments')
    .select('schedule:schedules!inner(date, time, category)').eq('profile_id', kuba.uid).in('recurring_assignment_id', ruleIds)).data ?? []
  const inP = asg.filter(a => inPeriod(a.schedule.date)), outP = asg.filter(a => !inPeriod(a.schedule.date))
  ok(inP.length > 0 && inP.every(a => a.schedule.category === 'msza' && a.schedule.time.startsWith('18:30')), `w okresie tylko Msza 18:30 (${inP.map(a => a.schedule.time.slice(0, 5)).join(',')})`)
  ok(!inP.some(a => a.schedule.time.startsWith('17:00')), 'w okresie NIE ma dyżuru na 17:00 (różaniec)')
  ok(outP.length > 0 && outP.every(a => a.schedule.category === 'msza' && ['17:00', '18:00'].includes(a.schedule.time.slice(0, 5))), 'poza okresem 17:00 i 18:00')

  // zapis „co tydzień” Stasia na śr 17:00 (przed okresem) — w okresie nie wchodzi na różaniec
  r = await stas.sb.rpc('sign_up_for_slot', { p_date: p17[0].day, p_time_label: '17:00', p_mode: 'recurring', p_church_id: t17.church_id })
  ok(!r.error, 'Staś zapisuje się co tydzień na 17:00 ' + (r.error?.message ?? ''))
  const st = (await admin.sb.from('schedule_assignments')
    .select('id, schedule:schedules!inner(date, time, category)').eq('profile_id', stas.uid).gte('schedule.date', P_FROM).lte('schedule.date', P_TO)).data ?? []
  ok(!st.some(a => a.schedule.category !== 'msza'), `zapis cykliczny Stasia nie trafia na różaniec (${st.length} w okresie)`)

  // korekta punktów za obecność
  const today = iso(new Date())
  const { data: sch } = await admin.sb.from('schedules')
    .insert({ parish_id: parish, title: 'TEST punkty', date: today, time: '06:13', category: 'msza', service_mode: 'signup', created_by: admin.uid }).select('id').single()
  schedPoints = sch.id
  r = await admin.sb.rpc('set_attendance_points', { p_schedule_id: sch.id, p_profile_id: kuba.uid, p_amount: 3 })
  ok(/obecność/.test(r.error?.message ?? ''), 'bez obecności nie ma korekty')
  await admin.sb.rpc('check_in_and_award_points', { p_schedule_id: sch.id, p_profile_id: kuba.uid, p_parish_id: parish, p_method: 'manual' })
  const sum = async () => ((await admin.sb.from('points').select('amount').eq('schedule_id', sch.id).eq('profile_id', kuba.uid).eq('source', 'checkin')).data ?? []).map(x => x.amount)
  r = await admin.sb.rpc('set_attendance_points', { p_schedule_id: sch.id, p_profile_id: kuba.uid, p_amount: 3 })
  ok(!r.error && JSON.stringify(await sum()) === '[3]', 'opiekun zmienia punkty na 3 ' + (r.error?.message ?? ''))
  r = await admin.sb.rpc('set_attendance_points', { p_schedule_id: sch.id, p_profile_id: kuba.uid, p_amount: 0 })
  const att = (await admin.sb.from('attendance').select('id').eq('schedule_id', sch.id).eq('profile_id', kuba.uid).maybeSingle()).data
  ok(!r.error && (await sum()).length === 0 && !!att, '0 pkt: punkty znikają, obecność zostaje')
  r = await admin.sb.rpc('set_attendance_points', { p_schedule_id: sch.id, p_profile_id: kuba.uid, p_amount: 8 })
  ok(!r.error && JSON.stringify(await sum()) === '[8]', 'z 0 z powrotem na 8')
  r = await kuba.sb.rpc('set_attendance_points', { p_schedule_id: sch.id, p_profile_id: kuba.uid, p_amount: 50 })
  ok(!!r.error && JSON.stringify(await sum()) === '[8]', 'ministrant nie zmieni sobie punktów')
  r = await admin.sb.rpc('set_attendance_points', { p_schedule_id: sch.id, p_profile_id: kuba.uid, p_amount: 9999 })
  ok(!!r.error, 'limit wartości')
  await admin.sb.from('attendance').delete().eq('schedule_id', sch.id).eq('profile_id', kuba.uid)
  ok((await sum()).length === 0, 'odznaczenie obecności dalej cofa (poprawione) punkty')
} finally {
  if (ruleIds.length) await admin.sb.rpc('cancel_recurring_assignments', { p_ids: ruleIds })
  const stasAsg = (await admin.sb.from('schedule_assignments').select('id, schedule:schedules!inner(date)').eq('profile_id', stas.uid).gte('schedule.date', iso(new Date()))).data ?? []
  for (const a of stasAsg.filter(x => !stasBefore.has(x.id))) await admin.sb.from('schedule_assignments').delete().eq('id', a.id)
  for (const c of ((await stas.sb.from('recurring_commitments').select('id').eq('profile_id', stas.uid)).data ?? []).filter(x => !commitBefore.has(x.id))) await stas.sb.from('recurring_commitments').delete().eq('id', c.id)
  if (periodId) await admin.sb.rpc('save_rozklad', { p_target: 'delete_period', p_period_id: periodId, p_policy: 'keep', p_dry_run: false })
  if (schedPoints) { await admin.sb.from('attendance').delete().eq('schedule_id', schedPoints); await admin.sb.from('schedules').delete().eq('id', schedPoints) }
  const after = ((await admin.sb.from('schedules').select('id').eq('parish_id', parish).gte('date', START).lte('date', END)).data ?? []).map(s => s.id)
  const fresh = after.filter(id => !before.has(id))
  if (fresh.length) await admin.sb.from('schedules').delete().in('id', fresh)
  for (const u of [admin, kuba, stas]) await u.sb.from('notifications').delete().in('type', ['schedule_change', 'points'])
}
