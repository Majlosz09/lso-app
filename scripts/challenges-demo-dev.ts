// Demo na LSO-dev: wyzwania w parafii demo (idempotentne). Uruchom: npx tsx scripts/challenges-demo-dev.ts
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import { CHALLENGE_PRESETS, nextPresetDates } from '../lib/challenges'
const env = JSON.parse(fs.readFileSync('eas.json', 'utf8')).build.redesign.env
if (!env.EXPO_PUBLIC_SUPABASE_URL.includes('phwoxylvcazcnaifcqab')) throw new Error('Tylko LSO-dev')
const sb = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const main = async () => {
  const { data: a, error } = await sb.auth.signInWithPassword({ email: 'opiekun@lso-demo.test', password: 'DemoLSO123!' })
  if (error) throw error
  const parish = (await sb.from('profiles').select('parish_id').eq('id', a.user!.id).single()).data!.parish_id
  const today = new Date().toISOString().slice(0, 10), y = Number(today.slice(0, 4))
  const anchors: Record<number, Record<string, string>> = {}
  for (const yy of [y, y + 1]) anchors[yy] = Object.fromEntries(((await sb.rpc('liturgical_anchors', { p_year: yy })).data ?? []).map((x: any) => [x.key, x.day]))
  for (const key of ['rozaniec', 'roraty']) {
    const p = CHALLENGE_PRESETS.find(x => x.key === key)!
    const d = nextPresetDates(p, today, anchors)!
    const name = `${p.name} ${d.year}`
    const has = (await sb.from('challenges').select('id').eq('parish_id', parish).eq('name', name).maybeSingle()).data
    if (has) { console.log('Już jest:', name); continue }
    const r = await sb.from('challenges').insert({ parish_id: parish, name, description: p.description, date_from: d.from, date_to: d.to,
      goal: p.goal, bonus_points: p.bonus, title_filter: p.filter, icon: p.icon, created_by: a.user!.id }).select('id').single()
    if (r.error) throw r.error
    await sb.rpc('recount_challenge', { p_challenge: r.data.id })
    const board = (await sb.rpc('challenge_board', { p_challenge: r.data.id })).data as any[]
    console.log('Dodano:', name, `${d.from}–${d.to}`, 'wyniki:', (board ?? []).map(b => `${b.name.split(' ')[0]} ${b.count}`).join(', ') || 'brak')
  }
}
main()
