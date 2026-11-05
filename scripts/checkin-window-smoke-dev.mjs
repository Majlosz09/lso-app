// Smoke: serwer pilnuje okna meldowania (migracja 20261105020000_checkin_window.sql).
// Ministrant melduje się tylko −30/+90 min od godziny służby; opiekun bez okna; offline liczy się godzina z telefonu;
// bezpośredni insert do attendance zablokowany. LSO-dev, parafia demo. Sprząta po sobie (dev-sql.sh).
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'child_process'
import fs from 'fs'
const env = JSON.parse(fs.readFileSync(new URL('../eas.json', import.meta.url))).build.redesign.env
if (!env.EXPO_PUBLIC_SUPABASE_URL.includes('phwoxylvcazcnaifcqab')) throw new Error('Tylko LSO-dev')
const ok = (c, m) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); if (!c) process.exitCode = 1 }
const client = () => createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const login = async (key) => {
  const sb = client()
  const { data, error } = await sb.auth.signInWithPassword({ email: `${key}@lso-demo.test`, password: 'DemoLSO123!' }); if (error) throw error
  return { sb, uid: data.user.id }
}
const sql = (q) => execSync(`bash scripts/dev-sql.sh "${q.replace(/"/g, '\\"')}" --yes`, { cwd: new URL('..', import.meta.url), stdio: 'pipe' }).toString()

// data i godzina w Polsce dla chwili now + offset minut
const warsaw = (offsetMin) => {
  const d = new Date(Date.now() + offsetMin * 60_000)
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).map(x => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}:00`, at: new Date(Math.floor(d.getTime() / 60_000) * 60_000) }
}

const admin = await login('opiekun'), kuba = await login('kuba')
const parish = (await admin.sb.from('parishes').select('id, attendance_methods').limit(1).single()).data
ok((parish.attendance_methods ?? []).some(m => ['qr', 'gps', 'button'].includes(m)), `parafia demo pozwala meldować się samemu (${parish.attendance_methods})`)

const made = []
const mk = async (offsetMin, label) => {
  const w = warsaw(offsetMin)
  const { data, error } = await admin.sb.from('schedules').insert({
    title: `TEST okno ${label}`, date: w.date, time: w.time, category: 'msza', location: '', gps_radius: 100,
    created_by: admin.uid, parish_id: parish.id,
  }).select('id').single()
  if (error) throw error
  made.push(data.id)
  return { id: data.id, ...w }
}
const checkIn = (who, sid, profileId = who.uid) => who.sb.rpc('check_in_and_award_points', {
  p_schedule_id: sid, p_profile_id: profileId, p_parish_id: parish.id, p_method: 'manual',
})

try {
  const soon = await mk(10, 'za 10 min')
  const later = await mk(180, 'za 3 h')
  const past = await mk(-180, '3 h temu')
  const past2 = await mk(-240, '4 h temu')
  const past3 = await mk(-300, '5 h temu')

  let r = await checkIn(kuba, later.id)
  ok(!!r.error && /30 minut/.test(r.error.message), 'ministrant NIE melduje się 3 h przed służbą ' + (r.error?.message ?? ''))
  r = await checkIn(kuba, past.id)
  ok(!!r.error, 'ministrant NIE melduje się 3 h po służbie')
  r = await checkIn(kuba, soon.id)
  ok(!r.error && r.data?.points_awarded > 0, `ministrant melduje się 10 min przed służbą (+${r.data?.points_awarded}) ${r.error?.message ?? ''}`)

  r = await checkIn(admin, past.id, kuba.uid)
  ok(!r.error, 'opiekun zaznacza obecność po służbie ' + (r.error?.message ?? ''))

  const ins = await kuba.sb.from('attendance').insert({ schedule_id: past2.id, profile_id: kuba.uid, parish_id: parish.id, method: 'manual', marked_by: kuba.uid })
  ok(!!ins.error, 'ministrant NIE wstawia obecności bezpośrednio')

  // offline: meldunek z telefonu w czasie służby, wysłany dopiero teraz (4 h później)
  r = await kuba.sb.rpc('check_in_offline', {
    p_date: past2.date, p_time: past2.time.slice(0, 5), p_client_time: new Date(past2.at.getTime() + 10 * 60_000).toISOString(),
    p_method: 'manual', p_schedule_id: past2.id, p_church_id: null,
  })
  ok(!r.error && r.data?.offline, 'meldunek offline z czasu służby przyjęty później ' + (r.error?.message ?? ''))
  const att = (await admin.sb.from('attendance').select('checked_at').eq('schedule_id', past2.id).eq('profile_id', kuba.uid).single()).data
  ok(att && Math.abs(new Date(att.checked_at) - (past2.at.getTime() + 10 * 60_000)) < 1000, 'obecność offline ma godzinę z telefonu')

  r = await kuba.sb.rpc('check_in_offline', {
    p_date: past3.date, p_time: past3.time.slice(0, 5), p_client_time: new Date(past3.at.getTime() + 150 * 60_000).toISOString(),
    p_method: 'manual', p_schedule_id: past3.id, p_church_id: null,
  })
  ok(!!r.error, 'meldunek offline spoza czasu służby odrzucony')
} finally {
  if (made.length) {
    const ids = made.map(i => `'${i}'`).join(',')
    sql(`delete from points where schedule_id in (${ids}); delete from attendance where schedule_id in (${ids}); delete from schedule_assignments where schedule_id in (${ids}); delete from schedules where id in (${ids})`)
    console.log(`sprzątanie: ${made.length} służb testowych usunięte`)
  }
}
