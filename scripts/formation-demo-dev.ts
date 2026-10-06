// Demo na LSO-dev: przykładowe wymagania ścieżki formacji w parafii demo (nadpisuje). Uruchom: npx tsx scripts/formation-demo-dev.ts
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import { builtInKeys } from '../lib/wiedza'
const env = JSON.parse(fs.readFileSync('eas.json', 'utf8')).build.redesign.env
if (!env.EXPO_PUBLIC_SUPABASE_URL.includes('phwoxylvcazcnaifcqab')) throw new Error('Tylko LSO-dev')
const sb = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const main = async () => {
  const { data: a, error } = await sb.auth.signInWithPassword({ email: 'opiekun@lso-demo.test', password: 'DemoLSO123!' })
  if (error) throw error
  const parish = (await sb.from('profiles').select('parish_id').eq('id', a.user!.id).single()).data!.parish_id
  const ranks = (await sb.from('ranks').select('id, name').is('parish_id', null)).data ?? []
  const plan: Record<string, { s: number; m: number; r: number; cats: string[]; note: string | null }> = {
    'Ministrant': { s: 3, m: 0, r: 0, cats: [], note: null },
    'Lektor Młodszy': { s: 15, m: 3, r: 70, cats: ['msza'], note: 'Kurs lektorski u księdza' },
    'Lektor Starszy': { s: 30, m: 6, r: 80, cats: [], note: null },
    'Ceremoniarz': { s: 50, m: 12, r: 85, cats: ['stopnie'], note: 'Rozmowa z księdzem proboszczem' },
  }
  for (const rk of ranks) {
    const p = plan[rk.name]
    if (!p) continue
    const { error: e } = await sb.from('rank_requirements').upsert({
      parish_id: parish, rank_id: rk.id, min_services: p.s, min_months: p.m, min_rate: p.r,
      wiedza_categories: p.cats, wiedza_keys: p.cats.flatMap(c => builtInKeys(c)), note: p.note,
    })
    console.log(rk.name, e ? 'BŁĄD ' + e.message : 'OK')
  }
  const { data: ready } = await sb.rpc('formation_ready')
  console.log('Gotowi do awansu:', (ready as any[] ?? []).map(r => `${r.full_name} → ${r.next.name}`).join(', ') || 'nikt')
}
main()
