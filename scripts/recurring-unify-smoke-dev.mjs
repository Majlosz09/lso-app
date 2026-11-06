// Smoke: zapis „co tydzień” = stały dyżur (recurring_assignments) + wypis z całego cyklu (2026-11-06).
// LSO-dev, parafia demo. Sprząta po sobie.
//   node scripts/recurring-unify-smoke-dev.mjs            — testy na żywo
//   node scripts/recurring-unify-smoke-dev.mjs legacy-1   — przygotuj stary zapis (recurring_commitments)
//     → potem: bash scripts/dev-sql.sh --yes -f supabase/migrations/20261106000000_recurring_unify.sql
//   node scripts/recurring-unify-smoke-dev.mjs legacy-2   — sprawdź przeniesienie i posprzątaj
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
const admin = await login('opiekun'), kuba = await login('kuba'), stas = await login('stas'), rodzic = await login('rodzic'), filip = await login('filip')
const parish = (await admin.sb.from('profiles').select('parish_id').eq('id', admin.uid).single()).data.parish_id
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// środy 18:00 od za 2 tygodni do końca roku
const t18 = (await admin.sb.from('mass_templates').select('id, time, church_id').eq('parish_id', parish).eq('day_of_week', 3)).data?.find(t => t.time.startsWith('18:00'))
if (!t18) throw new Error('Demo: brak śr 18:00')
const d0 = new Date(); d0.setDate(d0.getDate() + 14 + ((3 - d0.getDay() + 7) % 7))
const W1 = iso(d0)
const wed = (n) => { const d = new Date(d0); d.setDate(d.getDate() + 7 * n); return iso(d) }

const myAsg = async (who, from = W1) => ((await admin.sb.from('schedule_assignments')
  .select('id, recurring_assignment_id, schedule:schedules!inner(date, time, parish_id)')
  .eq('profile_id', who).eq('schedule.parish_id', parish).gte('schedule.date', from).eq('schedule.time', '18:00:00')).data ?? [])
  .filter(a => new Date(a.schedule.date + 'T12:00:00').getDay() === 3)
const cleanup = async (who) => {
  const rules = ((await admin.sb.from('recurring_assignments').select('id').eq('profile_id', who).gte('end_date', W1)).data ?? []).map(r => r.id)
  if (rules.length) await admin.sb.rpc('cancel_recurring_assignments', { p_ids: rules })
  const left = (await myAsg(who)).map(a => a.id)
  if (left.length) await admin.sb.from('schedule_assignments').delete().in('id', left)
}

const mode = process.argv[2]
if (mode === 'legacy-1') {
  await cleanup(stas.uid)
  for (const d of [wed(0), wed(1), wed(2)]) {
    const r = await stas.sb.rpc('sign_up_for_slot', { p_date: d, p_time_label: '18:00', p_mode: 'once', p_church_id: t18.church_id })
    ok(!r.error, `stary styl: zapis jednorazowy ${d} ` + (r.error?.message ?? ''))
  }
  const r = await stas.sb.from('recurring_commitments').insert({ profile_id: stas.uid, day_of_week: 3, time_slot: '18:00', parish_id: parish, template_id: t18.id })
  ok(!r.error, 'stary styl: wiersz recurring_commitments ' + (r.error?.message ?? ''))
  console.log('Teraz: bash scripts/dev-sql.sh --yes -f supabase/migrations/20261106000000_recurring_unify.sql, potem legacy-2')
  process.exit()
}
if (mode === 'legacy-2') {
  const left = (await stas.sb.from('recurring_commitments').select('id').eq('profile_id', stas.uid)).data ?? []
  ok(left.length === 0, 'recurring_commitments opróżnione')
  const rule = (await admin.sb.from('recurring_assignments').select('id, created_by, day_of_week, time').eq('profile_id', stas.uid).gte('end_date', W1)).data ?? []
  ok(rule.length === 1 && rule[0].created_by === stas.uid && rule[0].day_of_week === 3, 'przeniesiony do Stałych dyżurów (zapis własny)')
  const asg = await myAsg(stas.uid)
  ok(asg.length === 3 && asg.every(a => a.recurring_assignment_id === rule[0]?.id), `3 stare zapisy powiązane z cyklem (${asg.length})`)
  const r = await stas.sb.rpc('leave_recurring', { p_assignment_id: asg[0].id })
  ok(!r.error && r.data?.removed_assignments === 3, 'wypis z całego cyklu usuwa wszystkie 3 ' + (r.error?.message ?? JSON.stringify(r.data)))
  await cleanup(stas.uid)
  process.exit()
}

try {
  await cleanup(stas.uid); await cleanup(kuba.uid)

  // 1. Staś zapisuje się co tydzień
  let r = await stas.sb.rpc('sign_up_for_slot', { p_date: W1, p_time_label: '18:00', p_mode: 'recurring', p_church_id: t18.church_id })
  ok(!r.error && r.data?.rule_id, 'zapis „co tydzień” zwraca stały dyżur ' + (r.error?.message ?? ''))
  const ruleId = r.data?.rule_id, n = r.data?.count
  const rules = (await admin.sb.from('recurring_assignments').select('id, created_by').eq('id', ruleId)).data ?? []
  ok(rules.length === 1 && rules[0].created_by === stas.uid, 'opiekun widzi zapis w Stałych dyżurach (created_by = ministrant)')
  const helperSees = (await filip.sb.from('recurring_assignments').select('id').eq('id', ruleId)).data ?? []
  ok(helperSees.length === 1, 'pomocnik też go widzi (auto-grafik)')
  let asg = await myAsg(stas.uid)
  ok(asg.length === n && n >= 2 && asg.every(a => a.recurring_assignment_id === ruleId), `wszystkie ${n} zapisy powiązane z cyklem`)

  // drugi zapis co tydzień na tę samą godzinę → błąd „już zapisany”, bez nowego cyklu
  r = await stas.sb.rpc('sign_up_for_slot', { p_date: W1, p_time_label: '18:00', p_mode: 'recurring', p_church_id: t18.church_id })
  ok(!!r.error, 'ponowny zapis co tydzień odrzucony')
  ok(((await admin.sb.from('recurring_assignments').select('id').eq('profile_id', stas.uid).gte('end_date', W1)).data ?? []).length === 1, 'nadal jeden cykl')

  // 2. informacja w oknie wypisu
  r = await stas.sb.rpc('assignment_cycle', { p_assignment_id: asg[1].id })
  ok(!r.error && r.data?.can_leave === true && r.data?.future === n && r.data?.time === '18:00', 'assignment_cycle: można zakończyć, liczba przyszłych ' + JSON.stringify(r.data ?? r.error))
  r = await kuba.sb.rpc('assignment_cycle', { p_assignment_id: asg[1].id })
  ok(!!r.error, 'inny ministrant nie podejrzy cudzego cyklu')
  r = await kuba.sb.rpc('leave_recurring', { p_assignment_id: asg[1].id })
  ok(!!r.error, 'inny ministrant nie zakończy cudzego cyklu')

  // 3. tylko jedna służba, potem cały cykl (z dowolnej służby cyklu)
  r = await stas.sb.from('schedule_assignments').delete().eq('id', asg[0].id)
  ok(!r.error, 'wypis tylko z jednej służby')
  r = await stas.sb.rpc('leave_recurring', { p_assignment_id: asg[2].id })
  ok(!r.error && r.data?.removed_assignments === n - 1, `wypis z całego cyklu usuwa pozostałe ${n - 1} ` + (r.error?.message ?? JSON.stringify(r.data)))
  ok((await myAsg(stas.uid)).length === 0, 'Staś nie ma już żadnej środy 18:00')
  ok(((await admin.sb.from('recurring_assignments').select('id').eq('id', ruleId)).data ?? []).length === 0, 'cykl zniknął ze Stałych dyżurów')

  // 4. dyżur od opiekuna: ministrant nie kończy całego, opiekun tak
  r = await admin.sb.rpc('create_recurring_assignments', { p_profile_ids: [kuba.uid], p_day_of_week: 3, p_time: '18:00:00', p_start: W1, p_end: wed(3) })
  ok(!r.error, 'opiekun ustawia stały dyżur Kubie ' + (r.error?.message ?? ''))
  asg = await myAsg(kuba.uid)
  r = await kuba.sb.rpc('assignment_cycle', { p_assignment_id: asg[0].id })
  ok(!r.error && r.data?.can_leave === false, 'dyżur od opiekuna: ministrant nie może zakończyć cyklu')
  r = await kuba.sb.rpc('leave_recurring', { p_assignment_id: asg[0].id })
  ok(!!r.error, 'leave_recurring odrzucony dla dyżuru od opiekuna')
  r = await admin.sb.rpc('leave_recurring', { p_assignment_id: asg[0].id })
  ok(!r.error && r.data?.removed_assignments === asg.length, 'opiekun kończy cykl z poziomu służby ' + (r.error?.message ?? ''))

  // 5. rodzic zapisuje dziecko co tydzień i kończy cykl
  r = await rodzic.sb.rpc('sign_up_for_slot', { p_date: W1, p_time_label: '18:00', p_mode: 'recurring', p_church_id: t18.church_id, p_for_child: stas.uid })
  ok(!r.error, 'rodzic zapisuje dziecko co tydzień ' + (r.error?.message ?? ''))
  asg = await myAsg(stas.uid)
  ok(asg.length === r.data?.count && asg.every(a => a.recurring_assignment_id === r.data?.rule_id), 'zapisy dziecka powiązane z cyklem')
  const notif = (await stas.sb.from('notifications').select('id').eq('profile_id', stas.uid).gte('created_at', new Date(Date.now() - 60_000).toISOString())).data ?? []
  ok(notif.length <= 1, `bez lawiny powiadomień przy zapisie rodzica (${notif.length})`)
  r = await rodzic.sb.rpc('assignment_cycle', { p_assignment_id: asg[1].id })
  ok(!r.error && r.data?.can_leave === true, 'rodzic może zakończyć cykl dziecka')
  r = await rodzic.sb.rpc('leave_recurring', { p_assignment_id: asg[1].id })
  ok(!r.error && r.data?.removed_assignments === asg.length, 'rodzic kończy cały cykl ' + (r.error?.message ?? ''))

  // 6. zwykła służba — brak cyklu
  r = await stas.sb.rpc('sign_up_for_slot', { p_date: W1, p_time_label: '18:00', p_mode: 'once', p_church_id: t18.church_id })
  asg = await myAsg(stas.uid)
  r = await stas.sb.rpc('assignment_cycle', { p_assignment_id: asg[0].id })
  ok(!r.error && r.data === null, 'zwykła służba: brak cyklu')
} finally {
  await cleanup(stas.uid); await cleanup(kuba.uid)
}
