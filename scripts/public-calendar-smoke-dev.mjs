// Smoke: grafik bez logowania + kalendarz ICS (LSO-dev, parafia demo). Przywraca stan po sobie.
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
const env = JSON.parse(fs.readFileSync(new URL('../eas.json', import.meta.url))).build.redesign.env
const URL_ = env.EXPO_PUBLIC_SUPABASE_URL, KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY
if (!URL_.includes('phwoxylvcazcnaifcqab')) throw new Error('Tylko LSO-dev')
const ok = (c, m) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); if (!c) process.exitCode = 1 }
const login = async (key) => {
  const sb = createClient(URL_, KEY, { auth: { persistSession: false } })
  const { data, error } = await sb.auth.signInWithPassword({ email: `${key}@lso-demo.test`, password: 'DemoLSO123!' }); if (error) throw error
  return { sb, uid: data.user.id }
}
const anon = createClient(URL_, KEY, { auth: { persistSession: false } })
const admin = await login('opiekun'), kuba = await login('kuba'), parent = await login('rodzic')
const parish = (await admin.sb.from('profiles').select('parish_id').eq('id', admin.uid).single()).data.parish_id
const before = (await admin.sb.from('parishes').select('public_token').eq('id', parish).single()).data.public_token
const today = new Date().toISOString().slice(0, 10)
const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
// jak aplikacja kalendarza: zwykły GET, Accept */*
const feed = async (token) => (await fetch(`${URL_}/rest/v1/rpc/calendar_feed?token=${token}&apikey=${KEY}`, { headers: { Accept: '*/*' } }))

try {
  let r = await anon.rpc('set_public_schedule', { p_enabled: true })
  ok(!!r.error, 'niezalogowany nie włączy linku')
  r = await kuba.sb.rpc('set_public_schedule', { p_enabled: true })
  ok(!!r.error, 'ministrant nie włączy linku')
  r = await admin.sb.rpc('set_public_schedule', { p_enabled: true })
  const token = r.data
  ok(!r.error && typeof token === 'string' && token.length === 24, 'opiekun włącza link do grafiku')

  r = await anon.rpc('public_schedule', { p_token: token, p_from: today, p_to: in7 })
  const people = (r.data?.services ?? []).flatMap(s => s.people.map(p => p.name))
  ok(!r.error && r.data?.parish && r.data.services.length > 0, `grafik bez logowania: ${r.data?.services?.length ?? 0} służb`)
  ok(people.length > 0 && people.every(n => /^\S+ \S\.$/.test(n)), 'tylko imię i inicjał nazwiska (np. ' + people[0] + ')')
  r = await anon.rpc('public_schedule', { p_token: 'zly-token-zly-token', p_from: today, p_to: in7 })
  ok(!r.error && r.data === null, 'zły token → nic')

  r = await admin.sb.rpc('set_public_schedule', { p_enabled: false })
  r = await anon.rpc('public_schedule', { p_token: token, p_from: today, p_to: in7 })
  ok(r.data === null, 'po wyłączeniu stary link nie działa')

  // ICS
  const kt = (await kuba.sb.rpc('my_calendar_token')).data
  let res = await feed(kt)
  let txt = await res.text()
  ok(res.status === 200 && /text\/calendar/.test(res.headers.get('content-type') ?? ''), 'kalendarz: text/calendar przy Accept */*')
  ok(txt.startsWith('BEGIN:VCALENDAR') && /BEGIN:VEVENT/.test(txt) && txt.includes('TZID=Europe/Warsaw'), `kalendarz Kuby: ${(txt.match(/BEGIN:VEVENT/g) ?? []).length} dyżurów`)
  const pt = (await parent.sb.rpc('my_calendar_token')).data
  txt = await (await feed(pt)).text()
  ok(/SUMMARY:(Michał|Staś):/.test(txt), 'kalendarz rodzica: dyżury dzieci z imieniem')
  const at = (await admin.sb.rpc('my_calendar_token')).data
  txt = await (await feed(at)).text()
  ok(/Obsada: /.test(txt), 'kalendarz opiekuna: wszystkie służby z obsadą')
  txt = await (await feed('zly-token-zly-token-zly-token')).text()
  ok(txt.startsWith('BEGIN:VCALENDAR') && !/VEVENT/.test(txt), 'zły token → pusty kalendarz')
  const all = await (await feed(at)).text()
  ok(all.split('\r\n').every(l => Buffer.byteLength(l) <= 75) && all.includes('\r\n '), 'linie kalendarza zawinięte (max 75 bajtów)')
} finally {
  if (before) await admin.sb.rpc('set_public_schedule', { p_enabled: true })
}
