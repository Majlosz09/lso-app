// Smoke: import listy (ministranci bez konta) + przejęcie profilu kodem osobistym (LSO-dev). Sprząta po sobie
// przez scripts/dev-sql.sh na końcu (konto testowe i profile TEST).
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'child_process'
import fs from 'fs'
const env = JSON.parse(fs.readFileSync(new URL('../eas.json', import.meta.url))).build.redesign.env
const URL_ = env.EXPO_PUBLIC_SUPABASE_URL, KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY
if (!URL_.includes('phwoxylvcazcnaifcqab')) throw new Error('Tylko LSO-dev')
const ok = (c, m) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); if (!c) process.exitCode = 1 }
const client = () => createClient(URL_, KEY, { auth: { persistSession: false } })
const login = async (key) => {
  const sb = client()
  const { data, error } = await sb.auth.signInWithPassword({ email: `${key}@lso-demo.test`, password: 'DemoLSO123!' }); if (error) throw error
  return { sb, uid: data.user.id }
}
const sql = (q) => execSync(`bash scripts/dev-sql.sh "${q.replace(/"/g, '\\"')}"`, { cwd: new URL('..', import.meta.url), stdio: 'pipe' }).toString()
const admin = await login('opiekun'), kuba = await login('kuba')
const parish = (await admin.sb.from('profiles').select('parish_id').eq('id', admin.uid).single()).data.parish_id
const email = `claim-test-${Date.now()}@lso-dev.test`
let sch = null

try {
  let r = await kuba.sb.rpc('import_members', { p_rows: [{ full_name: 'TEST Nowak' }] })
  ok(!!r.error, 'ministrant nie importuje listy')

  r = await admin.sb.rpc('import_members', { p_rows: [
    { full_name: 'Kuba Wiśniewski' },
    { full_name: 'X' },
    { full_name: 'TEST Antoni   Nowak', rocznik: '2016', functions: ['Lektor', 'Nieznana'], rank: 'Kandydat' },
    { full_name: 'TEST Bartek Kowalczyk', rocznik: 'abc' },
  ] })
  const res = r.data ?? []
  ok(!r.error && res.map(x => x.status).join() === 'exists,invalid,created,created', 'import: istniejący pominięty, błędny odrzucony, 2 nowe ' + (r.error?.message ?? JSON.stringify(res.map(x => x.status))))
  const antek = res[2], bartek = res[3]
  ok(/^[A-HJ-NP-Z2-9]{8}$/.test(antek?.claim_code ?? ''), 'kod osobisty 8 znaków bez mylących liter')

  const p = (await admin.sb.from('profiles').select('full_name, rocznik, managed, approved, rank_id').eq('id', antek.id).single()).data
  ok(p?.full_name === 'TEST Antoni Nowak' && p.rocznik === 2016 && p.managed && p.approved && p.rank_id, 'profil bez konta: imię, rocznik, ranga, zatwierdzony')
  const fns = (await admin.sb.from('member_functions').select('function_id').eq('profile_id', antek.id)).data ?? []
  ok(fns.length === 1, 'funkcja Lektor nadana (nieznana pominięta)')
  const chat = sql(`select count(*) n from chat_members where user_id = '${antek.id}'`)
  ok(/"n": 0/.test(chat), 'bez konta = bez czatu')

  // obecność dla profilu bez konta (opiekun / tablet)
  const d = new Date(); const day = d.toISOString().slice(0, 10)
  sch = (await admin.sb.from('schedules').insert({ parish_id: parish, title: 'TEST bez konta', date: day, time: '06:01', category: 'msza', created_by: admin.uid }).select('id').single()).data?.id
  r = await admin.sb.rpc('check_in_and_award_points', { p_schedule_id: sch, p_profile_id: antek.id, p_parish_id: parish, p_method: 'kiosk' })
  ok(!r.error && r.data?.points_awarded > 0, 'obecność i punkty dla ministranta bez konta ' + (r.error?.message ?? ''))

  // rejestracja z kodem
  const anon = client()
  r = await anon.rpc('claim_code_info', { p_code: antek.claim_code })
  ok(r.data?.full_name === 'TEST Antoni Nowak' && r.data?.invite_code, 'kod osobisty podpowiada parafię i nazwisko')
  const kid = client()
  const su = await kid.auth.signUp({ email, password: 'Claim#Test2026', options: { data: { full_name: 'Antek Nowak', role: 'member', invite_code: r.data.invite_code } } })
  if (!su.data.session) await kid.auth.signInWithPassword({ email, password: 'Claim#Test2026' })
  const kidId = (await kid.auth.getUser()).data.user?.id
  r = await kid.rpc('claim_member_profile', { p_code: antek.claim_code })
  ok(!r.error, 'nowe konto przejmuje profil ' + (r.error?.message ?? ''))
  const me = (await kid.from('profiles').select('approved, parish_id, rocznik, rank_id').eq('id', kidId).single()).data
  ok(me?.approved && me.parish_id === parish && me.rocznik === 2016 && me.rank_id, 'konto zatwierdzone, z rocznikiem i rangą')
  const att = (await admin.sb.from('attendance').select('profile_id').eq('schedule_id', sch)).data ?? []
  const pts = (await admin.sb.from('points').select('profile_id').eq('schedule_id', sch)).data ?? []
  ok(att[0]?.profile_id === kidId && pts[0]?.profile_id === kidId, 'obecność i punkty przeszły na konto')
  const gone = (await admin.sb.from('profiles').select('id').eq('id', antek.id).maybeSingle()).data
  ok(!gone, 'profil bez konta zniknął')
  r = await kid.rpc('claim_member_profile', { p_code: bartek.claim_code })
  ok(/historię/.test(r.error?.message ?? ''), 'konto z historią nie przejmie drugiego profilu')
  const inChat = sql(`select count(*) n from chat_members where user_id = '${kidId}'`)
  ok(!/"n": 0/.test(inChat), 'po przejęciu — dołączony do czatu parafii')
} finally {
  if (sch) { await admin.sb.from('attendance').delete().eq('schedule_id', sch); await admin.sb.from('schedules').delete().eq('id', sch) }
  sql(`delete from auth.users where email = '${email}'`)
  sql(`delete from profiles where full_name like 'TEST %' and managed`)
}
