// Smoke: własne kategorie punktowania + rangi systemowe do włączenia (LSO-dev). Sprząta po sobie.
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
const admin = await login('opiekun'), kuba = await login('kuba')
const parish = (await admin.sb.from('profiles').select('parish_id').eq('id', admin.uid).single()).data.parish_id
const iso = d => d.toISOString().slice(0, 10)
const cleanup = []

try {
  // ── kategorie ──
  let r = await kuba.sb.from('point_categories').insert({ parish_id: parish, name: 'TEST hack', points: 99 })
  ok(!!r.error, 'ministrant nie doda kategorii')
  r = await admin.sb.from('point_categories').insert({ parish_id: parish, name: 'TEST Roraty', points: 8, icon: 'candle' }).select('id').single()
  ok(!r.error, 'opiekun dodaje kategorię ' + (r.error?.message ?? ''))
  const cat = r.data.id
  cleanup.push(() => admin.sb.from('point_categories').delete().eq('id', cat))
  r = await admin.sb.from('point_categories').insert({ parish_id: parish, name: 'test roraty ', points: 1 })
  ok(r.error?.code === '23505', 'nazwa bez duplikatów (wielkość liter / spacje)')
  ok((await kuba.sb.from('point_categories').select('id').eq('id', cat)).data?.length === 1, 'ministrant widzi kategorie parafii')

  // służba z kategorią → +8 i powód = nazwa
  const day = iso(new Date(Date.now() - 86400_000))
  const sch = (await admin.sb.from('schedules').insert({ parish_id: parish, title: 'TEST roraty', date: day, time: '06:31', category: 'msza', created_by: admin.uid, point_category_id: cat }).select('id').single())
  ok(!sch.error, 'służba z kategorią ' + (sch.error?.message ?? ''))
  cleanup.push(() => admin.sb.from('schedules').delete().eq('id', sch.data.id))
  cleanup.push(() => admin.sb.from('attendance').delete().eq('schedule_id', sch.data.id))
  cleanup.push(() => admin.sb.from('points').delete().eq('schedule_id', sch.data.id))
  r = await admin.sb.rpc('check_in_and_award_points', { p_schedule_id: sch.data.id, p_profile_id: kuba.uid, p_parish_id: parish })
  ok(r.data?.points_awarded === 8 && r.data?.reason === 'TEST Roraty', 'obecność na służbie z kategorią: ' + JSON.stringify(r.data ?? r.error?.message))
  const pt = (await admin.sb.from('points').select('point_category_id').eq('schedule_id', sch.data.id).eq('profile_id', kuba.uid).single()).data
  ok(pt?.point_category_id === cat, 'punkty zapamiętują kategorię (statystyki)')

  // pozycja rozkładu z kategorią → służba bez własnej kategorii dostaje punkty pozycji
  const from = new Date(Date.now() + 200 * 86400_000), to = new Date(Date.now() + 214 * 86400_000)
  const slots = (await admin.sb.rpc('mass_slots', { p_parish: parish, p_from: iso(from), p_to: iso(to) })).data ?? []
  const slot = slots.find(s => !s.period_id && s.service_mode !== 'none')
  ok(!!slot && 'point_category_id' in slot, 'mass_slots zwraca kategorię pozycji')
  if (slot) {
    const tpl = slot.entry_id
    await admin.sb.from('mass_templates').update({ point_category_id: cat }).eq('id', tpl)
    cleanup.unshift(() => admin.sb.from('mass_templates').update({ point_category_id: null }).eq('id', tpl))
    const again = (await admin.sb.rpc('mass_slots', { p_parish: parish, p_from: slot.slot_date, p_to: slot.slot_date })).data.find(s => s.entry_id === tpl)
    ok(again?.point_category_id === cat, 'kategoria widoczna w rozkładzie')
    let s2 = (await admin.sb.from('schedules').select('id').eq('parish_id', parish).eq('date', slot.slot_date).eq('time', slot.slot_time).eq('category', slot.category).eq('church_id', slot.church_id).maybeSingle()).data
    if (!s2) {
      s2 = (await admin.sb.rpc('materialize_slot', { p_date: slot.slot_date, p_time_label: String(slot.slot_time).slice(0, 5), p_church_id: slot.church_id })).data
      s2 = { id: s2 }
    }
    cleanup.unshift(() => admin.sb.from('attendance').delete().eq('schedule_id', s2.id).eq('profile_id', kuba.uid))
    cleanup.unshift(() => admin.sb.from('points').delete().eq('schedule_id', s2.id).eq('profile_id', kuba.uid))
    cleanup.unshift(() => admin.sb.from('schedule_assignments').delete().eq('schedule_id', s2.id).eq('profile_id', kuba.uid))
    r = await admin.sb.rpc('check_in_and_award_points', { p_schedule_id: s2.id, p_profile_id: kuba.uid, p_parish_id: parish })
    ok(r.data?.points_awarded === 8 && r.data?.reason === 'TEST Roraty', 'obecność na pozycji rozkładu z kategorią: ' + JSON.stringify(r.data ?? r.error?.message))
  }

  // ── rangi systemowe ──
  const sysCount = async (c) => ((await c.sb.from('ranks').select('id').is('parish_id', null)).data ?? []).length
  ok(await sysCount(kuba) === 5, 'rangi systemowe włączone → widoczne (5)')
  r = await kuba.sb.from('parishes').update({ system_ranks_enabled: false }).eq('id', parish).select('id')
  ok(!(r.data?.length), 'ministrant nie przełączy rang systemowych')
  await admin.sb.from('parishes').update({ system_ranks_enabled: false }).eq('id', parish)
  cleanup.unshift(() => admin.sb.from('parishes').update({ system_ranks_enabled: true }).eq('id', parish))
  ok(await sysCount(kuba) === 0 && await sysCount(admin) === 0, 'wyłączone → nikt w parafii ich nie widzi')
  const fp = (await kuba.sb.rpc('formation_progress', { p_profile: kuba.uid })).data
  ok(!fp?.next || !['Kandydat', 'Ministrant', 'Lektor Młodszy', 'Lektor Starszy', 'Ceremoniarz'].includes(fp.next.name), 'ścieżka formacji pomija rangi systemowe: ' + JSON.stringify(fp?.next ?? null))
  await admin.sb.from('parishes').update({ system_ranks_enabled: true }).eq('id', parish)
  ok(await sysCount(kuba) === 5, 'ponownie włączone → wracają')
} finally {
  for (const f of cleanup) await f()
}
