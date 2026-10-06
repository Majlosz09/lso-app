// Smoke: wyzwania sezonowe (LSO-dev, parafia demo). Sprząta po sobie.
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
const d = new Date(); d.setMonth(d.getMonth() + 10)
const D1 = d.toISOString().slice(0, 10); d.setDate(d.getDate() + 1); const D2 = d.toISOString().slice(0, 10); d.setDate(d.getDate() + 1); const D3 = d.toISOString().slice(0, 10)
let ch = null; const sch = []
const bonus = async () => ((await admin.sb.from('points').select('amount').eq('profile_id', kuba.uid).eq('source', 'challenge')).data ?? []).reduce((s, x) => s + x.amount, 0)

try {
  let r = await kuba.sb.from('challenges').insert({ parish_id: parish, name: 'X', date_from: D1, date_to: D3, goal: 1 })
  ok(!!r.error, 'ministrant nie utworzy wyzwania')
  r = await admin.sb.from('challenges').insert({ parish_id: parish, name: 'TEST Roraty', date_from: D1, date_to: D3, goal: 2, bonus_points: 10, title_filter: 'rorat', created_by: admin.uid }).select('id').single()
  ch = r.data?.id
  ok(!!ch, 'opiekun tworzy wyzwanie (cel 2 Roraty, +10 pkt) ' + (r.error?.message ?? ''))

  for (const [date, title] of [[D1, 'TEST Roraty'], [D2, 'TEST Roraty'], [D3, 'TEST Msza Święta']]) {
    const s = (await admin.sb.from('schedules').insert({ parish_id: parish, title, date, time: '06:30', category: 'msza', created_by: admin.uid }).select('id').single()).data
    sch.push(s.id)
  }
  const before = await bonus()
  await admin.sb.rpc('check_in_and_award_points', { p_schedule_id: sch[2], p_profile_id: kuba.uid, p_parish_id: parish })
  await admin.sb.rpc('check_in_and_award_points', { p_schedule_id: sch[0], p_profile_id: kuba.uid, p_parish_id: parish })
  let board = (await kuba.sb.rpc('challenge_board', { p_challenge: ch })).data ?? []
  ok(board.find(x => x.me)?.count === 1 && !board.find(x => x.me)?.done, 'Msza bez „rorat” w nazwie się nie liczy: 1/2')
  ok(await bonus() === before, 'przed celem — bez premii')

  await admin.sb.rpc('check_in_and_award_points', { p_schedule_id: sch[1], p_profile_id: kuba.uid, p_parish_id: parish })
  board = (await kuba.sb.rpc('challenge_board', { p_challenge: ch })).data ?? []
  ok(board.find(x => x.me)?.count === 2 && board.find(x => x.me)?.done, 'cel osiągnięty: 2/2, ukończone')
  ok(await bonus() === before + 10, 'premia +10 pkt przyznana raz')
  const n = (await kuba.sb.from('notifications').select('title').eq('type', 'challenge_done')).data ?? []
  ok(n.some(x => x.title === 'Wyzwanie ukończone: TEST Roraty'), 'Kuba dostał gratulacje')

  await admin.sb.from('attendance').delete().eq('schedule_id', sch[1]).eq('profile_id', kuba.uid)
  board = (await kuba.sb.rpc('challenge_board', { p_challenge: ch })).data ?? []
  ok(!board.find(x => x.me)?.done && await bonus() === before, 'cofnięta obecność → premia cofnięta')

  r = await admin.sb.rpc('recount_challenge', { p_challenge: ch })
  ok(!r.error, 'przeliczenie wyzwania przez opiekuna')
} finally {
  for (const id of sch) { await admin.sb.from('attendance').delete().eq('schedule_id', id); await admin.sb.from('schedules').delete().eq('id', id) }
  if (ch) await admin.sb.from('challenges').delete().eq('id', ch)
  await kuba.sb.from('notifications').delete().in('type', ['challenge_done', 'points'])
}
