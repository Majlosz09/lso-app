// Smoke: pomocnik opiekuna (LSO-dev, parafia demo). Sprząta po sobie.
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
const admin = await login('opiekun'), filip = await login('filip'), kuba = await login('kuba')
const parish = (await admin.sb.from('profiles').select('parish_id').eq('id', admin.uid).single()).data.parish_id
const d = new Date(); d.setMonth(d.getMonth() + 9); const DAY = d.toISOString().slice(0, 10)
let sch = null
// stan wyjściowy (demo: Filip jest pomocnikiem) — test zaczyna od zwykłych ministrantów i na końcu przywraca stan
const initial = (await admin.sb.from('profiles').select('id, is_helper').in('id', [filip.uid, kuba.uid])).data ?? []
await admin.sb.from('profiles').update({ is_helper: false }).in('id', [filip.uid, kuba.uid])

try {
  let r = await kuba.sb.from('profiles').update({ is_helper: true }).eq('id', kuba.uid)
  const kubaHelper = (await admin.sb.from('profiles').select('is_helper').eq('id', kuba.uid).single()).data?.is_helper
  ok(!!r.error && !kubaHelper, 'ministrant nie zrobi się sam pomocnikiem')

  r = await filip.sb.from('schedules').insert({ parish_id: parish, title: 'TEST pomocnik', date: DAY, time: '19:00', category: 'msza', created_by: filip.uid }).select('id').single()
  ok(!!r.error, 'zwykły ministrant nie doda służby')

  r = await admin.sb.from('profiles').update({ is_helper: true }).eq('id', filip.uid)
  ok(!r.error, 'opiekun wyznacza Filipa pomocnikiem ' + (r.error?.message ?? ''))

  r = await filip.sb.from('schedules').insert({ parish_id: parish, title: 'TEST pomocnik', date: DAY, time: '19:00', category: 'msza', created_by: filip.uid }).select('id').single()
  sch = r.data?.id
  ok(!!sch, 'pomocnik dodaje służbę ' + (r.error?.message ?? ''))
  r = await filip.sb.from('schedule_assignments').insert({ schedule_id: sch, profile_id: kuba.uid, role: 'ministrant', status: 'assigned' })
  ok(!r.error, 'pomocnik przydziela Kubę ' + (r.error?.message ?? ''))
  r = await filip.sb.rpc('check_in_and_award_points', { p_schedule_id: sch, p_profile_id: kuba.uid, p_parish_id: parish, p_method: 'manual' })
  ok(!r.error, 'pomocnik zaznacza obecność Kuby ' + (r.error?.message ?? ''))
  r = await filip.sb.rpc('apply_auto_schedule', { p_items: [] })
  ok(!r.error, 'pomocnik może zatwierdzić grafik (Ułóż grafik)')

  // czego pomocnik NIE może
  r = await filip.sb.from('parishes').update({ name: 'X' }).eq('id', parish).select('id')
  ok(!!r.error || !r.data?.length, 'pomocnik nie zmieni ustawień parafii')
  r = await filip.sb.from('mass_templates').insert({ parish_id: parish, day_of_week: 1, time: '06:00' })
  ok(!!r.error, 'pomocnik nie zmieni rozkładu Mszy')
  r = await filip.sb.rpc('save_rozklad', { p_target: 'base', p_entries: [], p_policy: 'keep', p_dry_run: true })
  ok(!!r.error, 'pomocnik nie zapisze rozkładu')
  r = await filip.sb.from('points').insert({ profile_id: kuba.uid, amount: 50, reason: 'TEST', parish_id: parish, awarded_by: filip.uid })
  ok(!!r.error, 'pomocnik nie przyzna punktów ręcznie')
  r = await filip.sb.from('profiles').update({ is_helper: true }).eq('id', kuba.uid).select('id')
  ok(!!r.error || !r.data?.length, 'pomocnik nie wyznaczy kolejnego pomocnika')
  r = await filip.sb.rpc('get_pending_members')
  ok(!!r.error || (Array.isArray(r.data) && r.data.length === 0), 'pomocnik nie widzi kont do zatwierdzenia')
} finally {
  if (sch) {
    await admin.sb.from('attendance').delete().eq('schedule_id', sch)
    await admin.sb.from('schedules').delete().eq('id', sch)
  }
  for (const p of initial) await admin.sb.from('profiles').update({ is_helper: !!p.is_helper }).eq('id', p.id)
}
