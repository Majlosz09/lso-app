// Smoke: doszczelnienia z audytu 2026-11-05 (migracja 20261105000000_audit_hardening.sql).
// Czat (can_post, przeniesienie członkostwa, przywracanie usuniętej wiadomości), rola i pola systemowe profilu,
// wypis i nieobecność po czasie, podwójne punkty przy równoległym meldowaniu. LSO-dev, parafia demo. Sprząta po sobie.
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
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d) }
const daysAhead = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d) }

const created = { assignments: [], attendance: [], message: null }

// służba bez przydziału Kuby w danym zakresie dat
const freeService = async (from, to) => {
  const mine = new Set(((await admin.sb.from('schedule_assignments').select('schedule_id').eq('profile_id', kuba.uid)).data ?? []).map(x => x.schedule_id))
  const rows = (await admin.sb.from('schedules').select('id, date, time, service_mode').eq('parish_id', parish)
    .gte('date', from).lte('date', to).eq('category', 'msza').order('date')).data ?? []
  return rows.find(r => !mine.has(r.id) && (r.service_mode ?? 'signup') === 'signup')
}

try {
  // ── 1. chat_members ─────────────────────────────────────────────
  const mem = (await kuba.sb.from('chat_members').select('channel_id, can_post').eq('user_id', kuba.uid).limit(1).single()).data
  ok(!!mem, 'Kuba jest w jakimś kanale')
  let r = await kuba.sb.from('chat_members').update({ last_read_at: new Date().toISOString() }).eq('channel_id', mem.channel_id).eq('user_id', kuba.uid)
  ok(!r.error, 'czat: oznaczenie jako przeczytane działa ' + (r.error?.message ?? ''))
  r = await kuba.sb.from('chat_members').update({ can_post: !mem.can_post }).eq('channel_id', mem.channel_id).eq('user_id', kuba.uid)
  ok(!!r.error, 'czat: ministrant nie zmienia sobie prawa pisania')
  const other = (await admin.sb.from('chat_channels').select('id').eq('parish_id', parish).neq('id', mem.channel_id).limit(1).maybeSingle()).data
  if (other) {
    r = await kuba.sb.from('chat_members').update({ channel_id: other.id }).eq('channel_id', mem.channel_id).eq('user_id', kuba.uid)
    ok(!!r.error, 'czat: ministrant nie przenosi członkostwa do innego kanału')
  }

  // ── 2. chat_messages ────────────────────────────────────────────
  const canPost = (await kuba.sb.from('chat_members').select('channel_id').eq('user_id', kuba.uid).eq('can_post', true).limit(1).maybeSingle()).data
  if (canPost) {
    r = await kuba.sb.from('chat_messages').insert({ channel_id: canPost.channel_id, sender_id: kuba.uid, content: 'TEST audyt — zaraz usunę' }).select('id').single()
    ok(!r.error, 'czat: wysłanie wiadomości ' + (r.error?.message ?? ''))
    created.message = r.data?.id
    r = await kuba.sb.from('chat_messages').update({ content: 'TEST audyt (edycja)', edited_at: new Date().toISOString() }).eq('id', created.message)
    ok(!r.error, 'czat: edycja własnej wiadomości działa ' + (r.error?.message ?? ''))
    r = await kuba.sb.from('chat_messages').update({ deleted_at: new Date().toISOString() }).eq('id', created.message)
    ok(!r.error, 'czat: usunięcie własnej wiadomości działa ' + (r.error?.message ?? ''))
    r = await kuba.sb.from('chat_messages').update({ deleted_at: null }).eq('id', created.message)
    ok(!!r.error, 'czat: usuniętej wiadomości nie da się przywrócić')
  } else ok(false, 'Kuba nie może pisać w żadnym kanale — brak testu wiadomości')

  // ── 3. profil ───────────────────────────────────────────────────
  const me = (await kuba.sb.from('profiles').select('full_name, role, rank_since').eq('id', kuba.uid).single()).data
  r = await kuba.sb.from('profiles').update({ full_name: me.full_name }).eq('id', kuba.uid)
  ok(!r.error, 'profil: edycja imienia działa ' + (r.error?.message ?? ''))
  r = await kuba.sb.from('profiles').update({ role: 'parent' }).eq('id', kuba.uid)
  ok(!!r.error, 'profil: ministrant nie zmienia sobie roli na rodzica')
  r = await kuba.sb.from('profiles').update({ rank_since: '2020-01-01T00:00:00Z' }).eq('id', kuba.uid)
  ok(!!r.error, 'profil: ministrant nie cofa sobie daty stopnia')

  // ── 4. wypis i nieobecność ─────────────────────────────────────
  const past = await freeService(daysAgo(20), daysAgo(1))
  const future = await freeService(daysAhead(2), daysAhead(30))
  ok(!!past && !!future, `są służby testowe (minione ${past?.date}, przyszłe ${future?.date})`)
  for (const s of [past, future]) {
    r = await admin.sb.from('schedule_assignments').insert({ schedule_id: s.id, profile_id: kuba.uid, role: 'ministrant', status: 'assigned' }).select('id').single()
    ok(!r.error, `opiekun zapisuje Kubę na ${s.date} ` + (r.error?.message ?? ''))
    created.assignments.push(r.data?.id)
  }
  const [pastA, futureA] = created.assignments
  r = await kuba.sb.from('schedule_assignments').update({ status: 'excused', absence_reason: 'test' }).eq('id', pastA)
  ok(!!r.error, 'nieobecność: po służbie nie da się zgłosić')
  r = await kuba.sb.from('schedule_assignments').update({ status: 'excused', absence_reason: 'test' }).eq('id', futureA)
  ok(!r.error, 'nieobecność: przed służbą działa ' + (r.error?.message ?? ''))
  await kuba.sb.from('schedule_assignments').update({ status: 'assigned', absence_reason: null }).eq('id', futureA)

  await kuba.sb.from('schedule_assignments').delete().eq('id', pastA)
  const stillPast = (await admin.sb.from('schedule_assignments').select('id').eq('id', pastA).maybeSingle()).data
  ok(!!stillPast, 'wypis: po służbie ministrant nie usunie przydziału')
  await kuba.sb.from('schedule_assignments').delete().eq('id', futureA)
  const stillFuture = (await admin.sb.from('schedule_assignments').select('id').eq('id', futureA).maybeSingle()).data
  ok(!stillFuture, 'wypis: przed służbą działa')
  if (!stillFuture) created.assignments = created.assignments.filter(id => id !== futureA)

  // ── 5. równoległe meldowanie → jedne punkty ────────────────────
  const call = () => admin.sb.rpc('check_in_and_award_points', { p_schedule_id: past.id, p_profile_id: kuba.uid, p_parish_id: parish, p_method: 'manual' })
  const res = await Promise.all([call(), call(), call()])
  ok(res.every(x => !x.error), 'meldowanie ×3 naraz bez błędu ' + (res.find(x => x.error)?.error?.message ?? ''))
  created.attendance.push(past.id)
  const pts = (await admin.sb.from('points').select('id').eq('profile_id', kuba.uid).eq('schedule_id', past.id).eq('source', 'checkin')).data ?? []
  ok(pts.length <= 1, `punkty za obecność: ${pts.length} wiersz (bez duplikatów)`)
  ok(res.filter(x => x.data && !x.data.already_checked_in).length === 1, 'tylko jedno meldowanie zwraca punkty')
} finally {
  for (const sid of created.attendance) await admin.sb.from('attendance').delete().eq('schedule_id', sid).eq('profile_id', kuba.uid)
  for (const id of created.assignments.filter(Boolean)) await admin.sb.from('schedule_assignments').delete().eq('id', id)
  console.log('sprzątanie: obecności i przydziały testowe usunięte' + (created.message ? '; wiadomość testowa zostaje jako „usunięta”' : ''))
}
