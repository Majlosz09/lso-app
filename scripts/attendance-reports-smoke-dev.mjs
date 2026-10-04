// Smoke: zgłoszenie obecności po fakcie (LSO-dev, parafia demo). Sprząta po sobie.
// Uwaga: rozpatrzonych zgłoszeń ministrant nie usunie — po teście: bash scripts/dev-sql.sh "delete from attendance_reports where title like 'TEST%'"
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
const admin = await login('opiekun'), kuba = await login('kuba')
const parish = (await admin.sb.from('profiles').select('parish_id').eq('id', admin.uid).single()).data.parish_id

// czas warszawski: „x godzin temu”, pełna godzina z minutami 07 (żeby nie trafić w rozkład)
const warsaw = (h) => {
  const d = new Date(Date.now() - h * 3600_000)
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).map(x => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:07` }
}
const a = warsaw(2), b = warsaw(3), old = warsaw(50)
const ids = []
const points = async () => (await admin.sb.from('points').select('amount').eq('profile_id', kuba.uid)).data?.reduce((s, x) => s + x.amount, 0) ?? 0

try {
  let r = await kuba.sb.rpc('report_attendance', { p_date: a.date, p_time: a.time })
  ok(/Napisz/.test(r.error?.message ?? ''), 'spoza grafiku bez opisu — odrzucone')
  r = await kuba.sb.rpc('report_attendance', { p_date: old.date, p_time: old.time, p_title: 'TEST', p_category: 'nabozenstwo' })
  ok(/48/.test(r.error?.message ?? ''), 'po 48 h — odrzucone')
  r = await kuba.sb.rpc('report_attendance', { p_date: a.date, p_time: a.time, p_title: 'TEST Różaniec', p_category: 'nabozenstwo', p_note: 'zapomniałem' })
  ok(!r.error && r.data, 'zgłoszenie nabożeństwa spoza grafiku ' + (r.error?.message ?? ''))
  ids.push(r.data)
  r = await kuba.sb.rpc('report_attendance', { p_date: a.date, p_time: a.time, p_title: 'TEST Różaniec', p_category: 'nabozenstwo' })
  ok(!!r.error, 'drugie takie samo zgłoszenie — odrzucone')
  const r2 = await kuba.sb.rpc('report_attendance', { p_date: b.date, p_time: b.time, p_title: 'TEST Msza', p_category: 'msza' })
  ids.push(r2.data)

  const { data: queue } = await admin.sb.from('attendance_reports').select('id, status').in('id', ids)
  ok(queue?.length === 2 && queue.every(x => x.status === 'pending'), 'opiekun widzi 2 zgłoszenia')
  const notif = (await admin.sb.from('notifications').select('id').eq('type', 'attendance_report').eq('profile_id', admin.uid)).data ?? []
  ok(notif.length >= 2, 'opiekun dostał powiadomienia')

  r = await kuba.sb.rpc('decide_attendance_report', { p_id: ids[0], p_approve: true })
  ok(!!r.error, 'ministrant nie rozpatrzy zgłoszenia')

  const before = await points()
  r = await admin.sb.rpc('decide_attendance_report', { p_id: ids[0], p_approve: true })
  ok(!r.error && r.data?.approved, 'przyjęcie ' + (r.error?.message ?? ''))
  const after = await points()
  ok(after - before === r.data?.points_awarded && r.data?.reason === 'Nabożeństwo', `punkty jak za nabożeństwo (+${after - before})`)
  const rep = (await kuba.sb.from('attendance_reports').select('status, schedule_id').eq('id', ids[0]).single()).data
  const att = (await admin.sb.from('attendance').select('method').eq('schedule_id', rep.schedule_id).eq('profile_id', kuba.uid).maybeSingle()).data
  ok(rep.status === 'approved' && att?.method === 'report', 'obecność zapisana (metoda: zgłoszenie)')

  r = await admin.sb.rpc('decide_attendance_report', { p_id: ids[1], p_approve: false, p_note: 'Nie było Cię' })
  const rej = (await kuba.sb.from('attendance_reports').select('status, admin_note').eq('id', ids[1]).single()).data
  ok(!r.error && rej.status === 'rejected' && rej.admin_note === 'Nie było Cię', 'odrzucenie z notatką')
  const kn = (await kuba.sb.from('notifications').select('title').eq('type', 'attendance_report_decision')).data ?? []
  ok(kn.length >= 2, 'Kuba dostał decyzje')
} finally {
  const reps = (await admin.sb.from('attendance_reports').select('id, schedule_id').in('id', ids.filter(Boolean))).data ?? []
  for (const x of reps) {
    if (x.schedule_id) {
      await admin.sb.from('attendance').delete().eq('schedule_id', x.schedule_id).eq('profile_id', kuba.uid)
      await admin.sb.from('schedules').delete().eq('id', x.schedule_id)
    }
  }
  await kuba.sb.from('attendance_reports').delete().in('id', ids.filter(Boolean))
  for (const u of [admin, kuba]) await u.sb.from('notifications').delete().in('type', ['attendance_report', 'attendance_report_decision'])
}
