// Smoke N6/N8 na LSO-dev: content_reads — własne wpisy, prywatność, licznik nieprzeczytanych ogłoszeń.
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
const a = await login('kuba'), b = await login('filip')
const { data: before } = await a.sb.from('content_reads').select('kind, item_key').eq('profile_id', a.uid)
const { data: anns } = await a.sb.from('announcements').select('id').in('target_audience', ['all', 'members']).limit(1)
const annId = anns?.[0]?.id
const key = 'modlitwy/modlitwa-przed-msza'
try {
  let r = await a.sb.from('content_reads').upsert({ profile_id: a.uid, kind: 'wiedza', item_key: key }, { ignoreDuplicates: true })
  ok(!r.error, 'zapis przeczytanego hasła ' + (r.error?.message ?? ''))
  r = await a.sb.from('content_reads').upsert({ profile_id: a.uid, kind: 'wiedza', item_key: key }, { ignoreDuplicates: true })
  ok(!r.error, 'ponowny zapis bez błędu (idempotentny)')
  if (annId) {
    r = await a.sb.from('content_reads').upsert({ profile_id: a.uid, kind: 'announcement', item_key: annId }, { ignoreDuplicates: true })
    ok(!r.error, 'zapis przeczytanego ogłoszenia')
  }
  r = await a.sb.from('content_reads').insert({ profile_id: b.uid, kind: 'wiedza', item_key: key })
  ok(!!r.error, 'nie można zapisać za kogoś innego')
  const { data: seen } = await b.sb.from('content_reads').select('item_key').eq('profile_id', a.uid)
  ok((seen ?? []).length === 0, 'inni nie widzą moich przeczytanych')
  r = await a.sb.from('content_reads').insert({ profile_id: a.uid, kind: 'inne', item_key: 'x' })
  ok(!!r.error, 'nieznany rodzaj odrzucony')
} finally {
  const keep = new Set((before ?? []).map(x => x.kind + '|' + x.item_key))
  if (!keep.has('wiedza|' + key)) await a.sb.from('content_reads').delete().eq('profile_id', a.uid).eq('kind', 'wiedza').eq('item_key', key)
  if (annId && !keep.has('announcement|' + annId)) await a.sb.from('content_reads').delete().eq('profile_id', a.uid).eq('kind', 'announcement').eq('item_key', annId)
  console.log('przywrócono stan')
}
