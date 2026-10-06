// Smoke Z1 na LSO-dev: kilka metod + metoda główna, synchronizacja attendance_mode (trigger).
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
const eas = JSON.parse(fs.readFileSync(new URL('../eas.json', import.meta.url)))
const env = eas.build.redesign.env
if (!env.EXPO_PUBLIC_SUPABASE_URL.includes('phwoxylvcazcnaifcqab')) throw new Error('Tylko LSO-dev')
const sb = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY)
const ok = (c, m) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); if (!c) process.exitCode = 1 }

const { data: auth, error: le } = await sb.auth.signInWithPassword({ email: 'opiekun@lso-demo.test', password: 'DemoLSO123!' })
if (le) throw le
const { data: prof } = await sb.from('profiles').select('parish_id').eq('id', auth.user.id).single()
const pid = prof.parish_id
const read = async () => (await sb.from('parishes').select('attendance_mode, attendance_methods, attendance_primary').eq('id', pid).single()).data
const before = await read()
console.log('przed:', before)

let r = await sb.from('parishes').update({ attendance_methods: ['qr', 'button', 'admin'], attendance_primary: 'admin' }).eq('id', pid)
ok(!r.error, 'zapis kilku metod ' + (r.error?.message ?? ''))
let now = await read()
ok(now.attendance_mode === 'qr', `główna admin + własne → attendance_mode=qr (${now.attendance_mode})`)

r = await sb.from('parishes').update({ attendance_mode: 'gps' }).eq('id', pid)
now = await read()
ok(now.attendance_methods.join() === 'gps' && now.attendance_primary === 'gps', 'stara aplikacja (tylko attendance_mode) → methods=[gps]')

r = await sb.from('parishes').update({ attendance_methods: ['admin'], attendance_primary: 'admin' }).eq('id', pid)
now = await read()
ok(now.attendance_mode === 'admin', 'tylko admin → attendance_mode=admin')

r = await sb.from('parishes').update({ attendance_methods: [], attendance_primary: 'qr' }).eq('id', pid)
ok(!!r.error, 'pusta lista metod odrzucona')

r = await sb.from('parishes').update({ attendance_methods: before.attendance_methods, attendance_primary: before.attendance_primary }).eq('id', pid)
now = await read()
ok(JSON.stringify(now) === JSON.stringify(before), 'przywrócono stan początkowy')
