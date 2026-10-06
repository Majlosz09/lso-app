// Smoke: dzieci bez telefonu — rodzic za dziecko + tryb zakrystii (LSO-dev, parafia demo). Sprząta po sobie.
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
const admin = await login('opiekun'), parent = await login('rodzic'), stas = await login('stas'), kuba = await login('kuba')
const parish = (await admin.sb.from('profiles').select('parish_id').eq('id', admin.uid).single()).data.parish_id

// wtorek za ~7 miesięcy, Msza 18:00 (zapisy)
const d = new Date(); d.setMonth(d.getMonth() + 7); while (d.getDay() !== 2) d.setDate(d.getDate() + 1)
const DAY = d.toISOString().slice(0, 10)
const warsaw = (h) => {
  const x = new Date(Date.now() - h * 3600_000)
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(x).map(y => [y.type, y.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:13` }
}
const cleanup = { asg: [], reports: [], schedules: [] }

try {
  let r = await parent.sb.rpc('sign_up_for_slot', { p_date: DAY, p_time_label: '18:00', p_mode: 'once', p_for_child: stas.uid })
  ok(!r.error && r.data?.schedule_id, 'rodzic zapisuje Stasia na Mszę ' + (r.error?.message ?? ''))
  const asg = (await admin.sb.from('schedule_assignments').select('id').eq('schedule_id', r.data?.schedule_id).eq('profile_id', stas.uid).maybeSingle()).data
  ok(!!asg, 'zapis jest na koncie Stasia')
  if (asg) cleanup.asg.push(asg.id)

  r = await parent.sb.rpc('sign_up_for_slot', { p_date: DAY, p_time_label: '18:00', p_mode: 'once', p_for_child: kuba.uid })
  ok(/połączone/.test(r.error?.message ?? ''), 'rodzic nie zapisze cudzego dziecka')
  r = await parent.sb.rpc('sign_up_for_slot', { p_date: DAY, p_time_label: '18:00', p_mode: 'once' })
  ok(!!r.error, 'rodzic nie zapisze sam siebie')

  r = await kuba.sb.rpc('unsign_child', { p_assignment_id: asg?.id })
  ok(!!r.error, 'ministrant nie wypisze cudzego zapisu przez unsign_child')
  r = await parent.sb.rpc('unsign_child', { p_assignment_id: asg?.id })
  const still = (await admin.sb.from('schedule_assignments').select('id').eq('id', asg?.id).maybeSingle()).data
  ok(!r.error && !still, 'rodzic wypisuje Stasia ' + (r.error?.message ?? ''))

  const ago = warsaw(2)
  r = await parent.sb.rpc('report_attendance', { p_date: ago.date, p_time: ago.time, p_title: 'TEST Nabożeństwo', p_category: 'nabozenstwo', p_for_child: stas.uid })
  ok(!r.error && r.data, 'rodzic zgłasza obecność Stasia ' + (r.error?.message ?? ''))
  if (r.data) cleanup.reports.push(r.data)
  const rep = (await parent.sb.from('attendance_reports').select('profile_id, status').eq('id', r.data).maybeSingle()).data
  ok(rep?.profile_id === stas.uid && rep.status === 'pending', 'zgłoszenie na koncie Stasia, widoczne dla rodzica')

  // Tryb zakrystii: opiekun melduje Kubę na dzisiejszej służbie (metoda kiosk)
  const now = warsaw(0)
  const { data: sch } = await admin.sb.from('schedules')
    .insert({ parish_id: parish, title: 'TEST Kiosk', date: now.date, time: now.time, category: 'msza', service_mode: 'signup', created_by: admin.uid }).select('id').single()
  cleanup.schedules.push(sch.id)
  r = await kuba.sb.rpc('check_in_and_award_points', { p_schedule_id: sch.id, p_profile_id: stas.uid, p_parish_id: parish, p_method: 'kiosk' })
  ok(!!r.error, 'ministrant nie zamelduje innej osoby')
  r = await admin.sb.rpc('check_in_and_award_points', { p_schedule_id: sch.id, p_profile_id: kuba.uid, p_parish_id: parish, p_method: 'kiosk' })
  const att = (await admin.sb.from('attendance').select('method').eq('schedule_id', sch.id).eq('profile_id', kuba.uid).maybeSingle()).data
  ok(!r.error && att?.method === 'kiosk' && r.data?.points_awarded > 0, `tablet w zakrystii: obecność Kuby (+${r.data?.points_awarded ?? 0} pkt) ` + (r.error?.message ?? ''))
} finally {
  for (const id of cleanup.asg) await admin.sb.from('schedule_assignments').delete().eq('id', id)
  for (const id of cleanup.schedules) {
    await admin.sb.from('attendance').delete().eq('schedule_id', id)
    await admin.sb.from('schedules').delete().eq('id', id)
  }
  for (const id of cleanup.reports) await stas.sb.from('attendance_reports').delete().eq('id', id)
  for (const u of [admin, stas, parent]) await u.sb.from('notifications').delete().in('type', ['attendance_report', 'attendance_report_decision'])
}
