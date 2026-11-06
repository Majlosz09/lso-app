// Codzienny e-mail do opiekunów: co czeka na nich w aplikacji (osoby do zatwierdzenia, nieobecności, zgłoszenia
// obecności). Woła ją pg_cron (poke_admin_digest, migracja 20261105080000) z nagłówkiem x-digest-secret — sekret
// sprawdza baza (admin_digest_due), więc funkcja działa bez weryfikacji JWT (deploy z --no-verify-jwt).
// Sekrety funkcji: SMTP_USER, SMTP_PASS (hasło aplikacji Google), opcjonalnie SMTP_HOST / SMTP_PORT / SMTP_FROM.
// Body: {} = wysyłka; {"testTo": "adres"} = jeden przykładowy e-mail na wskazany adres (bez zapisu w dzienniku);
// {"dryRun": true} = tylko lista, bez wysyłki.
import { createClient } from 'npm:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6.9.16'

type Row = {
  profile_id: string; email: string; full_name: string | null; parish_name: string | null
  pending_members: number; pending_absences: number; pending_reports: number
}

const APP_URL = 'https://app.lsoapp.com'

function plural(n: number, one: string, few: string, many: string) {
  if (n === 1) return one
  const d = n % 10, t = n % 100
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many
}

function lines(r: Row): string[] {
  const out: string[] = []
  if (r.pending_members) out.push(`${r.pending_members} ${plural(r.pending_members, 'osoba czeka', 'osoby czekają', 'osób czeka')} na zatwierdzenie konta`)
  if (r.pending_absences) out.push(`${r.pending_absences} ${plural(r.pending_absences, 'zgłoszona nieobecność czeka', 'zgłoszone nieobecności czekają', 'zgłoszonych nieobecności czeka')} na decyzję`)
  if (r.pending_reports) out.push(`${r.pending_reports} ${plural(r.pending_reports, 'zgłoszenie obecności czeka', 'zgłoszenia obecności czekają', 'zgłoszeń obecności czeka')} na przyjęcie`)
  return out
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

function message(r: Row) {
  const items = lines(r)
  const first = (r.full_name ?? '').split(' ')[0] || 'Opiekunie'
  const parish = r.parish_name ? ` w parafii ${r.parish_name}` : ''
  const text = [
    `Szczęść Boże, ${first}!`, '',
    `W LSO App${parish} czeka na Ciebie:`,
    ...items.map(i => `• ${i}`), '',
    `Otwórz aplikację: ${APP_URL}`, '',
    '—',
    'Ten e-mail przychodzi raz dziennie, tylko gdy coś czeka. Wyłączysz go w aplikacji: Profil → „Codzienny e-mail o sprawach do załatwienia”.',
  ].join('\r\n')
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#0B1F3A;line-height:1.5">
<p>Szczęść Boże, ${esc(first)}!</p>
<p>W LSO App${esc(parish)} czeka na Ciebie:</p>
<ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
<p><a href="${APP_URL}" style="display:inline-block;background:#0B1F3A;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Otwórz aplikację</a></p>
<p style="font-size:12px;color:#6B7280">Ten e-mail przychodzi raz dziennie, tylko gdy coś czeka. Wyłączysz go w aplikacji: Profil → „Codzienny e-mail o sprawach do załatwienia”.</p>
</div>`
  const total = r.pending_members + r.pending_absences + r.pending_reports
  return { subject: `LSO App: ${total} ${plural(total, 'sprawa czeka', 'sprawy czekają', 'spraw czeka')} na Ciebie`, text, html }
}

Deno.serve(async (req) => {
  const secret = req.headers.get('x-digest-secret') ?? ''
  const body = await req.json().catch(() => ({})) as { testTo?: string; dryRun?: boolean }
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  const { data, error } = await db.rpc('admin_digest_due', { p_secret: secret })
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 403 })
  const rows = (data ?? []) as Row[]
  if (body.dryRun) return Response.json({ due: rows.map(r => ({ email: r.email, items: lines(r) })) })

  const user = Deno.env.get('SMTP_USER'), pass = Deno.env.get('SMTP_PASS')
  if (!user || !pass) return new Response(JSON.stringify({ error: 'Brak SMTP_USER / SMTP_PASS w sekretach funkcji' }), { status: 500 })
  const transport = nodemailer.createTransport({
    host: Deno.env.get('SMTP_HOST') ?? 'smtp.gmail.com',
    port: Number(Deno.env.get('SMTP_PORT') ?? 465),
    secure: true,
    auth: { user, pass },
  })
  const from = Deno.env.get('SMTP_FROM') ?? `LSO App <${user}>`

  if (body.testTo) {
    const sample: Row = rows[0] ?? { profile_id: '', email: body.testTo, full_name: 'Opiekun Testowy', parish_name: 'Testowa',
      pending_members: 2, pending_absences: 1, pending_reports: 3 }
    await transport.sendMail({ from, to: body.testTo, ...message(sample) })
    return Response.json({ test: true, sentTo: body.testTo, due: rows.length })
  }

  let sent = 0
  const failed: string[] = []
  for (const r of rows.slice(0, 100)) {
    try {
      await transport.sendMail({ from, to: r.email, ...message(r) })
      await db.rpc('admin_digest_mark_sent', { p_secret: secret, p_profile_id: r.profile_id,
        p_items: { members: r.pending_members, absences: r.pending_absences, reports: r.pending_reports } })
      sent++
    } catch (e) {
      failed.push(`${r.profile_id}: ${String(e).slice(0, 120)}`)
    }
  }
  return Response.json({ sent, failed, due: rows.length })
})
