// Smoke: ścieżka formacji — wymagania, postęp, gotowi do awansu, awans (LSO-dev, parafia demo). Przywraca stan.
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
const admin = await login('opiekun'), kuba = await login('kuba'), filip = await login('filip'), parent = await login('rodzic'), stas = await login('stas')
const parish = (await admin.sb.from('profiles').select('parish_id').eq('id', admin.uid).single()).data.parish_id
const before = (await admin.sb.from('profiles').select('rank_id, rank_since').eq('id', kuba.uid).single()).data
let nextRankId = null
await kuba.sb.from('notifications').delete().eq('type', 'promotion')

try {
  let r = await kuba.sb.rpc('formation_progress', { p_profile: kuba.uid })
  ok(!r.error && r.data?.next?.name, `Kuba widzi swój postęp (następny stopień: ${r.data?.next?.name})`)
  nextRankId = r.data?.next?.id
  ok(r.data?.configured === false, 'bez wymagań: ścieżka nieustawiona')

  r = await filip.sb.rpc('formation_progress', { p_profile: kuba.uid })
  ok(!r.error && r.data?.next, 'pomocnik opiekuna widzi postęp Kuby')
  r = await stas.sb.rpc('formation_progress', { p_profile: kuba.uid })
  ok(!!r.error, 'inny ministrant nie widzi postępu Kuby')
  r = await parent.sb.rpc('formation_progress', { p_profile: stas.uid })
  ok(!r.error, 'rodzic widzi postęp swojego dziecka')

  // wymagania nie do spełnienia
  r = await kuba.sb.from('rank_requirements').insert({ parish_id: parish, rank_id: nextRankId, min_services: 1 })
  ok(!!r.error, 'ministrant nie ustawi wymagań')
  r = await admin.sb.from('rank_requirements').upsert({ parish_id: parish, rank_id: nextRankId, min_services: 999, min_months: 0, min_rate: 0,
    note: 'Rozmowa z księdzem' })
  ok(!r.error, 'opiekun ustawia wymagania ' + (r.error?.message ?? ''))
  r = await kuba.sb.rpc('formation_progress', { p_profile: kuba.uid })
  const items = r.data?.items ?? []
  ok(r.data?.configured && !r.data.ready && items.map(i => i.key).join() === 'services' && r.data.note === 'Rozmowa z księdzem', 'postęp: służby (bez Wiedzy), jeszcze nie gotowy')
  r = await admin.sb.rpc('formation_ready')
  ok(!r.error && !(r.data ?? []).some(x => x.id === kuba.uid), 'Kuby nie ma na liście gotowych')

  // wymagania spełnione
  await admin.sb.from('rank_requirements').update({ min_services: 0, min_rate: 0, min_months: 0, wiedza_keys: [], wiedza_categories: [], note: null })
    .eq('parish_id', parish).eq('rank_id', nextRankId)
  await admin.sb.from('rank_requirements').update({ min_months: 0, min_services: 1 }).eq('parish_id', parish).eq('rank_id', nextRankId)
  r = await kuba.sb.rpc('formation_progress', { p_profile: kuba.uid })
  ok(r.data?.ready === true, `Kuba gotowy (służby ${r.data?.items?.[0]?.have}/${r.data?.items?.[0]?.need})`)
  r = await filip.sb.rpc('formation_ready')
  ok(!r.error && (r.data ?? []).some(x => x.id === kuba.uid), 'pomocnik widzi Kubę wśród gotowych do awansu')

  // awans
  const since = new Date().toISOString()
  r = await admin.sb.from('profiles').update({ rank_id: nextRankId }).eq('id', kuba.uid)
  const after = (await admin.sb.from('profiles').select('rank_id, rank_since').eq('id', kuba.uid).single()).data
  ok(!r.error && after.rank_id === nextRankId && after.rank_since !== before.rank_since, 'awans zapisany, staż liczony od nowa')
  const n = (await kuba.sb.from('notifications').select('title').eq('type', 'promotion')).data ?? []
  ok(n.length === 1 && n[0].title.startsWith('Awans:'), 'Kuba dostał powiadomienie o awansie')
} finally {
  await admin.sb.from('rank_requirements').delete().eq('parish_id', parish).eq('rank_id', nextRankId)
  await admin.sb.from('profiles').update({ rank_id: before.rank_id }).eq('id', kuba.uid)
  // zmiana stopnia resetuje staż — przywracamy datę sprzed testu
  await admin.sb.from('profiles').update({ rank_since: before.rank_since }).eq('id', kuba.uid)
  await kuba.sb.from('notifications').delete().eq('type', 'promotion')
}
