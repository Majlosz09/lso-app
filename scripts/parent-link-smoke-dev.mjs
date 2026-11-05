// Smoke: rodzic łączy się z dzieckiem za zgodą opiekuna (migracja 20261105010000_parent_link_requests.sql).
// Nowe konto rodzica z kodem parafii → prośba (bez połączenia) → opiekun widzi dziecko w karcie → zatwierdza → połączone
// → rodzic odłącza dziecko (unlink_my_child). LSO-dev, parafia demo. Sprząta po sobie (konto testowe przez dev-sql.sh).
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

const admin = await login('opiekun'), rodzic = await login('rodzic')
const parish = (await admin.sb.from('parishes').select('id, invite_code').limit(1).single()).data
// dziecko bez rodzica w parafii demo
const child = (await admin.sb.from('profiles').select('id, full_name').eq('parish_id', parish.id).eq('role', 'member')
  .is('parent_id', null).eq('approved', true).limit(1).single()).data
const taken = (await admin.sb.from('profiles').select('id').eq('parent_id', rodzic.uid).limit(1).single()).data
ok(!!child && !!taken, `dziecko bez rodzica (${child?.full_name}) i dziecko z rodzicem w demo`)

const email = `parent-link-${Date.now()}@lso-dev.test`
const sb = client()
let parentId = null
try {
  const su = await sb.auth.signUp({ email, password: 'Parent#Test2026', options: { data: { full_name: 'TEST Rodzic Prośba', role: 'parent', invite_code: parish.invite_code } } })
  if (!su.data.session) await sb.auth.signInWithPassword({ email, password: 'Parent#Test2026' })
  parentId = (await sb.auth.getUser()).data.user?.id
  ok(!!parentId, 'konto rodzica założone z kodem parafii')

  // rodzic wskazuje wolne dziecko + dziecko, które ma już rodzica
  let r = await sb.rpc('link_parent_to_children', { p_child_ids: [child.id, taken.id] })
  ok(!r.error, 'rodzic wysyła prośbę ' + (r.error?.message ?? ''))
  let c1 = (await admin.sb.from('profiles').select('parent_id').eq('id', child.id).single()).data
  ok(c1.parent_id === null, 'przed zatwierdzeniem dziecko NIE jest połączone')
  const reqs = (await sb.from('parent_link_requests').select('child_id')).data ?? []
  ok(reqs.length === 1 && reqs[0].child_id === child.id, 'prośba tylko o dziecko bez rodzica')

  const pending = (await admin.sb.rpc('get_pending_members')).data ?? []
  const mine = pending.find(p => p.id === parentId)
  ok(mine?.children?.includes(child.full_name), `opiekun widzi wskazane dziecko w karcie (${mine?.children})`)

  r = await rodzic.sb.rpc('link_parent_to_children', { p_child_ids: [child.id] })
  ok(!!r.error, 'zatwierdzony rodzic nie łączy się sam z kolejnym dzieckiem')
  const kuba = await login('kuba')
  r = await kuba.sb.rpc('link_parent_to_children', { p_child_ids: [child.id] })
  ok(!!r.error, 'ministrant nie wysyła prośby o dziecko')

  r = await admin.sb.rpc('approve_member', { p_profile_id: parentId })
  ok(!r.error, 'opiekun zatwierdza rodzica ' + (r.error?.message ?? ''))
  c1 = (await admin.sb.from('profiles').select('parent_id').eq('id', child.id).single()).data
  ok(c1.parent_id === parentId, 'po zatwierdzeniu dziecko połączone z rodzicem')
  ok(((await sb.from('parent_link_requests').select('child_id')).data ?? []).length === 0, 'prośby wyczyszczone')

  r = await sb.rpc('unlink_my_child', { p_child_id: taken.id })
  ok(!!r.error, 'rodzic nie odłączy cudzego dziecka')
  r = await sb.rpc('unlink_my_child', { p_child_id: child.id })
  c1 = (await admin.sb.from('profiles').select('parent_id').eq('id', child.id).single()).data
  ok(!r.error && c1.parent_id === null, 'rodzic odłącza swoje dziecko ' + (r.error?.message ?? ''))
} finally {
  if (child) await admin.sb.from('profiles').update({ parent_id: null }).eq('id', child.id).eq('parent_id', parentId ?? '00000000-0000-0000-0000-000000000000')
  sql(`delete from auth.users where email = '${email}'`)
  console.log('sprzątanie: konto testowe rodzica usunięte')
}
