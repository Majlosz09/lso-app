// Smoke: token powiadomień przypięty tylko do zalogowanego konta (LSO-dev). Sprząta po sobie.
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
const admin = await login('opiekun'), kuba = await login('kuba'), filip = await login('filip')
const T = 'ExponentPushToken[TEST-smoke-123]'
const tokenOf = async (u) => (await admin.sb.from('profiles').select('push_token').eq('id', u.uid).single()).data?.push_token ?? null

try {
  let r = await kuba.sb.rpc('claim_push_token', { p_token: 'cokolwiek' })
  ok(!!r.error, 'nieprawidłowy token odrzucony')
  r = await kuba.sb.rpc('send_test_push')
  ok(!r.error && r.data === false, 'test bez tokenu → false (telefon niezarejestrowany)')

  r = await kuba.sb.rpc('claim_push_token', { p_token: T })
  ok(!r.error && await tokenOf(kuba) === T, 'Kuba przypina telefon ' + (r.error?.message ?? ''))

  // ten sam telefon, inne konto (np. brat na tym samym telefonie)
  r = await filip.sb.rpc('claim_push_token', { p_token: T })
  ok(!r.error && await tokenOf(filip) === T && await tokenOf(kuba) === null, 'Filip na tym samym telefonie → telefon odpięty od Kuby')

  r = await filip.sb.rpc('release_push_token')
  ok(!r.error && await tokenOf(filip) === null, 'wylogowanie / wyłączenie odpina telefon')

  r = await kuba.sb.from('profiles').update({ push_token: T }).eq('id', filip.uid).select('id')
  ok(!!r.error || !r.data?.length, 'ministrant nie ustawi tokenu cudzemu kontu')
} finally {
  await admin.sb.rpc('release_push_token')
  for (const u of [kuba, filip]) await u.sb.rpc('release_push_token')
}
