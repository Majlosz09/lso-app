// Demo na LSO-dev: zmiana okresowa „Październik — różaniec” w parafii demo (idempotentne).
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
const env = JSON.parse(fs.readFileSync(new URL('../eas.json', import.meta.url))).build.redesign.env
if (!env.EXPO_PUBLIC_SUPABASE_URL.includes('phwoxylvcazcnaifcqab')) throw new Error('Tylko LSO-dev')
const sb = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const { data: auth, error } = await sb.auth.signInWithPassword({ email: 'opiekun@lso-demo.test', password: 'DemoLSO123!' })
if (error) throw error
const parish = (await sb.from('profiles').select('parish_id').eq('id', auth.user.id).single()).data.parish_id

const NAME = 'Październik — różaniec'
const existing = (await sb.from('mass_periods').select('id').eq('parish_id', parish).eq('name', NAME).maybeSingle()).data
const tpl = (await sb.from('mass_templates').select('id, day_of_week, time').eq('parish_id', parish)).data ?? []
const entries = [1, 2, 3, 4, 5, 6].flatMap(d => {
  const base = tpl.filter(t => t.day_of_week === d)
  return [
    { id: null, day_of_week: d, time: '17:30', label: 'Różaniec', category: 'nabozenstwo', service_mode: 'assigned', base_template_id: null },
    ...base.map(t => ({ id: null, day_of_week: d, time: t.time.slice(0, 5), label: null, category: 'msza', service_mode: 'signup', base_template_id: t.id })),
  ]
})
if (existing) {
  console.log('Okres już jest:', existing.id)
} else {
  const r = await sb.rpc('save_rozklad', {
    p_target: 'period', p_period: { name: NAME, date_from: '2026-10-01', date_to: '2026-10-31', repeat_yearly: true, days_of_week: [1, 2, 3, 4, 5, 6] },
    p_entries: entries, p_policy: 'move', p_dry_run: false,
  })
  if (r.error) throw r.error
  console.log('Dodano okres', r.data.period_id, 'przeniesiono', r.data.moved)
}
// Rok liturgiczny: uroczystości nakazane jak w niedzielę + Adwent z Roratami (daty liczą się same)
const ensure = async (name, period, entries = []) => {
  const has = (await sb.from('mass_periods').select('id').eq('parish_id', parish).eq('name', name).maybeSingle()).data
  if (has) { console.log('Już jest:', name); return }
  const r = await sb.rpc('save_rozklad', { p_target: 'period', p_period: { name, ...period }, p_entries: entries, p_policy: 'move', p_dry_run: false })
  if (r.error) throw r.error
  console.log('Dodano', name)
}
await ensure('Uroczystości nakazane (porządek niedzielny)', { rule: 'feasts', feasts: ['jan1', 'jan6', 'corpus_christi', 'aug15', 'nov1', 'christmas'], copy_dow: 0 })
await ensure('Adwent — Roraty', { rule: 'season', season_from: 'advent_start', season_to: 'dec23', days_of_week: [1, 2, 3, 4, 5, 6] },
  [1, 2, 3, 4, 5, 6].flatMap(d => [
    { id: null, day_of_week: d, time: '06:30', label: 'Roraty', category: 'msza', service_mode: 'signup', base_template_id: null },
    ...tpl.filter(t => t.day_of_week === d).map(t => ({ id: null, day_of_week: d, time: t.time.slice(0, 5), label: null, category: 'msza', service_mode: 'signup', base_template_id: t.id })),
  ]))

const today = new Date().toISOString().slice(0, 10)
const { data: slots } = await sb.rpc('mass_slots', { p_parish: parish, p_from: today, p_to: today })
console.log('Dziś:', (slots ?? []).map(s => `${s.slot_time.slice(0, 5)} ${s.category} ${s.service_mode}`).join(' | '))
