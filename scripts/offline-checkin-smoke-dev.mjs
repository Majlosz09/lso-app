// Smoke: meldowanie bez zasięgu — obecność wysłana później z godziną meldowania (LSO-dev). Sprząta po sobie.
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
// służba sprzed 3 godzin (czas warszawski)
const start = new Date(Date.now() - 3 * 3600_000)
const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(start).map(x => [x.type, x.value]))
const DATE = `${p.year}-${p.month}-${p.day}`, TIME = `${p.hour}:${p.minute}`
const sch = (await admin.sb.from('schedules').insert({ parish_id: parish, title: 'TEST offline', date: DATE, time: TIME, category: 'msza', created_by: admin.uid }).select('id').single()).data.id
const at = (min) => new Date(start.getTime() + min * 60_000).toISOString()

try {
  let r = await kuba.sb.rpc('check_in_offline', { p_date: DATE, p_time: TIME, p_client_time: at(-120), p_method: 'qr', p_schedule_id: sch })
  ok(/poza czasem/.test(r.error?.message ?? ''), 'meldowanie 2 h przed służbą — odrzucone')
  r = await kuba.sb.rpc('check_in_offline', { p_date: DATE, p_time: TIME, p_client_time: new Date(Date.now() + 3600_000).toISOString(), p_method: 'qr', p_schedule_id: sch })
  ok(/przyszłości/.test(r.error?.message ?? ''), 'godzina z przyszłości — odrzucona')
  r = await kuba.sb.rpc('check_in_offline', { p_date: DATE, p_time: TIME, p_client_time: new Date(Date.now() - 50 * 3600_000).toISOString(), p_method: 'qr', p_schedule_id: sch })
  ok(/48 godzin/.test(r.error?.message ?? ''), 'wysłane po ponad 48 h — odrzucone')

  // meldowanie 5 min przed rozpoczęciem (bez zasięgu), wysłane teraz — 3 h później
  r = await kuba.sb.rpc('check_in_offline', { p_date: DATE, p_time: TIME, p_client_time: at(-5), p_method: 'qr', p_schedule_id: sch })
  ok(!r.error && r.data?.offline && r.data?.points_awarded >= 0, 'obecność z kolejki przyjęta ' + (r.error?.message ?? `(+${r.data?.points_awarded} pkt)`))
  const a = (await admin.sb.from('attendance').select('checked_at, method').eq('schedule_id', sch).eq('profile_id', kuba.uid).single()).data
  ok(a?.method === 'qr' && Math.abs(new Date(a.checked_at).getTime() - new Date(at(-5)).getTime()) < 2000, 'zapisana godzina meldowania i metoda QR')
  r = await kuba.sb.rpc('check_in_offline', { p_date: DATE, p_time: TIME, p_client_time: at(-5), p_method: 'qr', p_schedule_id: sch })
  ok(!r.error && r.data?.already_checked_in, 'ponowne wysłanie (np. podwójna synchronizacja) — bez dubla')
} finally {
  await admin.sb.from('attendance').delete().eq('schedule_id', sch)
  await admin.sb.from('schedules').delete().eq('id', sch)
}
