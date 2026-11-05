// Smoke: grafik bez duplikatów (migracja 20261105030000_schedules_unique.sql).
// Równoległe materialize_slot tworzą jedną służbę; drugi wiersz z rozkładu odrzucony; ręczna służba o tej samej godzinie
// dozwolona; extend_schedule_coverage nie dubluje. LSO-dev, parafia demo. Sprząta po sobie.
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'child_process'
import fs from 'fs'
import { warsawAt } from './_warsaw-time.mjs'
const env = JSON.parse(fs.readFileSync(new URL('../eas.json', import.meta.url))).build.redesign.env
if (!env.EXPO_PUBLIC_SUPABASE_URL.includes('phwoxylvcazcnaifcqab')) throw new Error('Tylko LSO-dev')
const ok = (c, m) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); if (!c) process.exitCode = 1 }
const client = () => createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const login = async (key) => {
  const sb = client()
  const { data, error } = await sb.auth.signInWithPassword({ email: `${key}@lso-demo.test`, password: 'DemoLSO123!' }); if (error) throw error
  return { sb, uid: data.user.id }
}
const sql = (q) => execSync(`bash scripts/dev-sql.sh "${q.replace(/"/g, '\\"')}" --yes -o json`, { cwd: new URL('..', import.meta.url), stdio: 'pipe' }).toString()

const admin = await login('opiekun'), kuba = await login('kuba')
const parish = (await admin.sb.from('parishes').select('id').limit(1).single()).data
const tomorrow = warsawAt(24 * 60).date
const slots = (await admin.sb.rpc('mass_slots', { p_parish: parish.id, p_from: tomorrow, p_to: tomorrow })).data ?? []
const slot = slots.find(s => s.category === 'msza')
ok(!!slot, `jutro jest Msza w rozkładzie (${slot?.slot_time})`)

const rows = async () => (await admin.sb.from('schedules').select('id, manual').eq('parish_id', parish.id).eq('date', tomorrow)
  .eq('time', slot.slot_time).eq('category', 'msza').eq('church_id', slot.church_id)).data ?? []
const before = await rows()
const busy = before.length && (await admin.sb.from('schedule_assignments').select('id').in('schedule_id', before.map(r => r.id))).data?.length
let manualId = null
try {
  if (busy) { ok(true, 'służba jutro ma obsadę — pomijam test równoległego tworzenia'); }
  else {
    if (before.length) sql(`delete from schedules where id in (${before.map(r => `'${r.id}'`).join(',')})`)
    const calls = Array.from({ length: 8 }, (_, i) => (i % 2 ? kuba : admin).sb.rpc('materialize_slot', {
      p_date: tomorrow, p_time_label: String(slot.slot_time).slice(0, 5), p_church_id: slot.church_id,
    }))
    const res = await Promise.all(calls)
    const errs = res.filter(r => r.error)
    ok(!errs.length, '8 równoległych materialize_slot bez błędu ' + (errs[0]?.error.message ?? ''))
    ok(new Set(res.map(r => r.data)).size === 1, 'wszystkie dostały tę samą służbę')
    ok((await rows()).length === 1, 'w grafiku jest jedna służba')
  }

  const dup = await admin.sb.from('schedules').insert({ title: 'Msza Święta', date: tomorrow, time: slot.slot_time, category: 'msza',
    church_id: slot.church_id, location: '', gps_radius: 100, parish_id: parish.id, created_by: admin.uid })
  ok(!!dup.error, 'drugi wiersz z rozkładu na tę samą godzinę odrzucony')
  const man = await admin.sb.from('schedules').insert({ title: 'TEST ręczna', date: tomorrow, time: slot.slot_time, category: 'msza',
    church_id: slot.church_id, location: '', gps_radius: 100, parish_id: parish.id, created_by: admin.uid, manual: true }).select('id').single()
  manualId = man.data?.id
  ok(!man.error, 'ręczna służba o tej samej godzinie dozwolona ' + (man.error?.message ?? ''))

  const g = await admin.sb.rpc('generate_schedules_from_templates', { p_parish_id: parish.id, p_from_date: tomorrow, p_to_date: tomorrow })
  ok(!g.error && (await rows()).filter(r => !r.manual).length === 1, 'generowanie z rozkładu nie dubluje ' + (g.error?.message ?? ''))
  const ext = await kuba.sb.rpc('extend_schedule_coverage')
  ok(!!ext.error, 'ministrant nie wywoła extend_schedule_coverage')
  const out = sql('select public.extend_schedule_coverage() n')
  ok(/"n": \d+/.test(out), 'extend_schedule_coverage działa z crona (' + (out.match(/"n": \d+/)?.[0] ?? '?') + ')')
} finally {
  if (manualId) sql(`delete from schedules where id = '${manualId}'`)
}
