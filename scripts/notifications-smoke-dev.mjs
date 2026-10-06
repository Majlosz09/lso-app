// Smoke N3 na LSO-dev: centrum powiadomień — ogłoszenie, punkty (+rodzic), prywatność, tylko read_at.
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
const admin = await login('opiekun'), child = await login('michal'), parent = await login('rodzic'), other = await login('kuba')
const { data: prof } = await admin.sb.from('profiles').select('parish_id').eq('id', admin.uid).single()
const pid = prof.parish_id
const started = new Date(Date.now() - 1000).toISOString()
const mine = async (u, type) => (await u.sb.from('notifications').select('id, title, body, read_at').eq('profile_id', u.uid).eq('type', type).gte('created_at', started)).data ?? []
let annId = null, pointsId = null

try {
  let r = await admin.sb.from('announcements').insert({ parish_id: pid, author_id: admin.uid, title: 'TEST N3 ogłoszenie', content: 'test', target_audience: 'parents', is_pinned: false }).select('id').single()
  ok(!r.error, 'opiekun dodaje ogłoszenie dla rodziców ' + (r.error?.message ?? ''))
  annId = r.data?.id
  ok((await mine(parent, 'announcement')).some(n => n.body === 'TEST N3 ogłoszenie'), 'rodzic dostaje powiadomienie o ogłoszeniu')
  ok((await mine(child, 'announcement')).length === 0, 'ministrant nie dostaje ogłoszenia dla rodziców')

  r = await admin.sb.from('points').insert({ profile_id: child.uid, amount: 3, reason: 'TEST N3 punkty', parish_id: pid, awarded_by: admin.uid }).select('id').single()
  ok(!r.error, 'opiekun przyznaje punkty ' + (r.error?.message ?? ''))
  pointsId = r.data?.id
  const cp = await mine(child, 'points'), pp = await mine(parent, 'points')
  ok(cp.some(n => n.title === '+3 pkt'), 'ministrant: „+3 pkt”')
  ok(pp.some(n => n.title.endsWith(': +3 pkt')), 'rodzic: „Michał: +3 pkt”')

  const seen = await other.sb.from('notifications').select('id').eq('profile_id', child.uid)
  ok((seen.data ?? []).length === 0, 'inni nie widzą cudzych powiadomień')
  r = await child.sb.from('notifications').insert({ profile_id: child.uid, type: 'x', title: 'x' })
  ok(!!r.error, 'nie można samemu dopisać powiadomienia')
  r = await child.sb.from('notifications').update({ title: 'zmienione' }).eq('id', cp[0].id)
  ok(!!r.error, 'nie można zmienić treści')
  r = await child.sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', cp[0].id)
  ok(!r.error, 'oznaczenie jako przeczytane')
} finally {
  if (annId) await admin.sb.from('announcements').delete().eq('id', annId)
  if (pointsId) await admin.sb.from('points').delete().eq('id', pointsId)
  for (const u of [child, parent, admin, other]) await u.sb.from('notifications').delete().eq('profile_id', u.uid).gte('created_at', started)
  console.log('posprzątano')
}
