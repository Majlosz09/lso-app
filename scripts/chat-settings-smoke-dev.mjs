// Smoke N13 na LSO-dev: rodzice w kanale ogólnym (tylko odczyt) + ankiety tylko dla opiekuna.
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
const admin = await login('opiekun'), parent = await login('rodzic'), member = await login('michal')
const { data: prof } = await admin.sb.from('profiles').select('parish_id').eq('id', admin.uid).single()
const pid = prof.parish_id
const { data: before } = await admin.sb.from('parishes').select('parents_see_general, members_can_create_polls').eq('id', pid).single()
ok(before.parents_see_general === false && before.members_can_create_polls === true, 'domyślnie: rodzice bez kanału ogólnego, ankiety dla wszystkich')
const { data: ch } = await admin.sb.from('chat_channels').select('id').eq('parish_id', pid).eq('slug', 'ministranci').single()
const created = []

try {
  await admin.sb.from('parishes').update({ parents_see_general: true }).eq('id', pid)
  const { data: m } = await parent.sb.from('chat_members').select('can_post').eq('channel_id', ch.id).eq('user_id', parent.uid).maybeSingle()
  ok(m && m.can_post === false, 'rodzic w kanale „Ministranci” tylko do odczytu')
  const read = await parent.sb.from('chat_messages').select('id').eq('channel_id', ch.id).limit(1)
  ok(!read.error, 'rodzic czyta kanał')
  let r = await parent.sb.from('chat_messages').insert({ channel_id: ch.id, sender_id: parent.uid, content: 'test N13', type: 'text' }).select('id')
  ok(!!r.error, 'rodzic nie może pisać w kanale ogólnym')
  if (r.data?.[0]) created.push(r.data[0].id)

  await admin.sb.from('parishes').update({ parents_see_general: false }).eq('id', pid)
  const { data: m2 } = await admin.sb.from('chat_members').select('user_id').eq('channel_id', ch.id).eq('user_id', parent.uid)
  ok((m2 ?? []).length === 0, 'wyłączenie usuwa rodzica z kanału')

  await admin.sb.from('parishes').update({ members_can_create_polls: false }).eq('id', pid)
  r = await member.sb.from('chat_polls').insert({ channel_id: ch.id, creator_id: member.uid, question: 'test N13?' }).select('id')
  ok(!!r.error, 'ministrant nie tworzy ankiety, gdy wyłączone')
  r = await admin.sb.from('chat_polls').insert({ channel_id: ch.id, creator_id: admin.uid, question: 'test N13 admin?' }).select('id')
  ok(!r.error, 'opiekun tworzy ankietę ' + (r.error?.message ?? ''))
  if (r.data?.[0]) await admin.sb.from('chat_polls').delete().eq('id', r.data[0].id)

  await admin.sb.from('parishes').update({ members_can_create_polls: true }).eq('id', pid)
  r = await member.sb.from('chat_polls').insert({ channel_id: ch.id, creator_id: member.uid, question: 'test N13 member?' }).select('id')
  ok(!r.error, 'po włączeniu ministrant tworzy ankietę ' + (r.error?.message ?? ''))
  if (r.data?.[0]) await member.sb.from('chat_polls').delete().eq('id', r.data[0].id)
} finally {
  await admin.sb.from('parishes').update(before).eq('id', pid)
  for (const id of created) await admin.sb.from('chat_messages').delete().eq('id', id)
  console.log('przywrócono ustawienia')
}
