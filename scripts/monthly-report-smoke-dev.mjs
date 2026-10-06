// Smoke: miesięczny raport + powiadomienie 1. dnia miesiąca (LSO-dev). Sprząta po sobie.
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'child_process'
import fs from 'fs'
const env = JSON.parse(fs.readFileSync(new URL('../eas.json', import.meta.url))).build.redesign.env
if (!env.EXPO_PUBLIC_SUPABASE_URL.includes('phwoxylvcazcnaifcqab')) throw new Error('Tylko LSO-dev')
const ok = (c, m) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); if (!c) process.exitCode = 1 }
const login = async (key) => {
  const sb = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { data, error } = await sb.auth.signInWithPassword({ email: `${key}@lso-demo.test`, password: 'DemoLSO123!' }); if (error) throw error
  return { sb, uid: data.user.id }
}
const sql = (q) => execSync(`bash scripts/dev-sql.sh "${q.replace(/"/g, '\\"')}"`, { cwd: new URL('..', import.meta.url), stdio: 'pipe' }).toString()
const admin = await login('opiekun'), kuba = await login('kuba'), filip = await login('filip')

try {
  let r = await kuba.sb.rpc('monthly_report', { p_month: '2026-09-01' })
  ok(!!r.error, 'ministrant nie zobaczy raportu')
  r = await filip.sb.rpc('monthly_report', { p_month: '2026-09-01' })
  ok(!!r.error, 'pomocnik nie zobaczy raportu (tylko opiekun)')
  r = await admin.sb.rpc('monthly_report', { p_month: '2026-09-15' })
  const rep = r.data
  ok(!r.error && rep?.from === '2026-09-01' && rep?.to === '2026-09-30', 'raport za wrzesień (dowolny dzień miesiąca → cały miesiąc)')
  ok(rep.stats.services >= rep.stats.staffed && rep.stats.attendance >= 0 && Array.isArray(rep.top) && Array.isArray(rep.fading), 'liczby, najlepsi, „kto znika”')
  ok(rep.top.every((t, i, a) => i === 0 || a[i - 1].cnt >= t.cnt), 'najlepsi posortowani po liczbie służb')

  const out = sql('select public.notify_monthly_reports() n')
  ok(/"n": [1-9]/.test(out), 'powiadomienia 1. dnia miesiąca wysłane do parafii z raportem')
  const n = (await admin.sb.from('notifications').select('title, body').eq('type', 'monthly_report')).data ?? []
  ok(n.length >= 1 && /^Raport za \S+ jest gotowy$/.test(n[0].title), `opiekun: „${n[0]?.title}” — ${n[0]?.body}`)
} finally {
  sql(`delete from notifications where type = 'monthly_report'`)
}
