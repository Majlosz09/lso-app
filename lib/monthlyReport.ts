// Miesięczny raport dla proboszcza: typy + wydruk (HTML). Dane: monthly_report(miesiąc) w bazie.

export type MonthlyReport = {
  from: string
  to: string
  parish: string
  stats: { services: number; staffed: number; attendance: number; active_members: number; points: number; rate: number; new_members: number; members: number }
  prev: { services: number; attendance: number; active_members: number; rate: number }
  by_category: Record<string, number>
  top: { name: string; cnt: number; pts: number }[]
  fading: { id: string; name: string; before: number; last: string | null }[]
  unstaffed: { date: string; time: string; title: string }[]
  promotions: { name: string; rank: string }[]
  challenges: { name: string; done: number }[]
  absences: { accepted: number; absent: number; reports: number }
}

export const MONTHS_NOM = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień']
export const monthTitle = (from: string) => `${MONTHS_NOM[Number(from.slice(5, 7)) - 1]} ${from.slice(0, 4)}`

/** Zmiana względem poprzedniego miesiąca: „+12” / „−3” / „bez zmian”; null gdy brak danych do porównania. */
export function delta(now: number, prev: number | undefined, unit = ''): string | null {
  if (prev === undefined || prev < 0 || now < 0) return null
  if (prev === 0 && now === 0) return null
  const d = now - prev
  if (d === 0) return 'bez zmian'
  return `${d > 0 ? '+' : '−'}${Math.abs(d)}${unit} vs poprz. miesiąc`
}

export const staffedPct = (r: MonthlyReport) => (r.stats.services ? Math.round((r.stats.staffed / r.stats.services) * 100) : 0)

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const dm = (d: string) => `${Number(d.slice(8, 10))}.${d.slice(5, 7)}`
const CAT: Record<string, string> = { msza: 'Msze', nabozenstwo: 'Nabożeństwa', zbiorka: 'Zbiórki' }

export function monthlyReportHtml(r: MonthlyReport): string {
  const s = r.stats
  const tile = (v: string, l: string, d?: string | null) => `<div class="tile"><b>${v}</b><span>${l}</span>${d ? `<i>${esc(d)}</i>` : ''}</div>`
  const list = (title: string, items: string[], empty: string) =>
    `<h2>${title}</h2>${items.length ? `<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>` : `<p class="muted">${empty}</p>`}`
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Raport — ${esc(monthTitle(r.from))}</title><style>
@page{size:A4;margin:14mm}*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;color:#14213d;font-size:12px}
h1{font-size:20px;color:#0B2E5C}.sub{color:#555;margin:2px 0 12px}h2{font-size:13px;color:#0B2E5C;margin:14px 0 6px;border-bottom:1px solid #ddd;padding-bottom:3px}
.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.tile{border:1px solid #ddd;border-radius:8px;padding:8px}
.tile b{display:block;font-size:20px}.tile span{color:#555;font-size:11px}.tile i{display:block;color:#8a6d1d;font-size:10px;font-style:normal;margin-top:2px}
ul{padding-left:18px}li{margin:2px 0}.muted{color:#888}.cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.foot{margin-top:16px;color:#888;font-size:10px}
</style></head><body>
<h1>Raport miesięczny — ${esc(monthTitle(r.from))}</h1><div class="sub">${esc(r.parish)} · Liturgiczna Służba Ołtarza</div>
<div class="tiles">
${tile(String(s.attendance), 'obecności', delta(s.attendance, r.prev.attendance))}
${tile(s.rate >= 0 ? `${s.rate}%` : '—', 'frekwencja', delta(s.rate, r.prev.rate, ' pp'))}
${tile(`${staffedPct(r)}%`, `obsadzonych służb (${s.staffed}/${s.services})`)}
${tile(`${s.active_members}/${s.members}`, 'ministrantów służyło', delta(s.active_members, r.prev.active_members))}
</div>
<div class="cols"><div>
${list('Najwierniejsi', r.top.map((t, i) => `${i + 1}. ${esc(t.name)} — ${t.cnt} służb, ${t.pts} pkt`), 'Brak obecności w tym miesiącu.')}
${list('Do zauważenia (służyli wcześniej, w tym miesiącu ani razu)', r.fading.map(f => `${esc(f.name)}${f.last ? ` — ostatnio ${dm(f.last)}` : ''}`), 'Nikt nie zniknął — świetnie!')}
</div><div>
${list('Rodzaje służb', Object.entries(r.by_category).map(([k, v]) => `${CAT[k] ?? k}: ${v}`), '—')}
${list('Służby bez obsady', r.unstaffed.map(u => `${dm(u.date)} ${u.time} — ${esc(u.title)}`), 'Wszystkie służby miały obsadę.')}
${list('Awanse', r.promotions.map(p => `${esc(p.name)} → ${esc(p.rank)}`), 'Brak awansów.')}
${list('Wyzwania', r.challenges.map(c => `${esc(c.name)} — ukończyło ${c.done}`), 'Brak wyzwań w tym miesiącu.')}
<h2>Nieobecności i zgłoszenia</h2><p>Usprawiedliwione: ${r.absences.accepted} · nieusprawiedliwione: ${r.absences.absent} · obecności ze zgłoszeń: ${r.absences.reports}</p>
<p>Nowi ministranci: ${s.new_members} · przyznane punkty: ${s.points}</p>
</div></div>
<div class="foot">Wygenerowano w aplikacji LSO · ${new Date().toLocaleDateString('pl-PL')}</div>
</body></html>`
}
