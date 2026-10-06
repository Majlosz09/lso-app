// Grafik do wydruku (A4, tablica w zakrystii) — czysta funkcja: dane → HTML. Testy: __tests__/lib/printSchedule.test.ts

export type PrintService = {
  date: string
  time: string
  title: string
  church: string | null
  people: { name: string; role?: string | null }[]
  /** none = bez obsady (informacyjnie) */
  mode?: string
}

export type PrintDay = { date: string; liturgy: string; color: string }

const DAYS = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota']
const MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia']
const VEST: Record<string, string> = { WHITE: '#C8950A', RED: '#C0392B', GREEN: '#2E7D32', PURPLE: '#6A1B9A', ROSE: '#C2185B' }

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** „Kuba Wiśniewski” → „Kuba W.” (wydruk wisi publicznie) */
export function shortPerson(full: string): string {
  const [first, last] = full.trim().split(/\s+/)
  return last ? `${first} ${last[0]}.` : first ?? ''
}

function dayLabel(date: string) {
  const d = new Date(date + 'T12:00:00')
  return { dow: DAYS[d.getDay()], dm: `${d.getDate()} ${MONTHS[d.getMonth()]}`, sunday: d.getDay() === 0 }
}

export function buildPrintHtml(opts: {
  parish: string
  title: string
  days: PrintDay[]
  services: PrintService[]
  qrSvg?: string | null
  publicUrl?: string | null
  generatedAt?: Date
}): string {
  const gen = (opts.generatedAt ?? new Date()).toLocaleDateString('pl-PL')
  const rows = opts.days.map(day => {
    const list = opts.services.filter(s => s.date === day.date).sort((a, b) => a.time.localeCompare(b.time))
    const { dow, dm, sunday } = dayLabel(day.date)
    const color = VEST[day.color] ?? '#888'
    const body = list.length === 0
      ? '<div class="none">—</div>'
      : list.map(s => {
          const crew = s.mode === 'none'
            ? '<span class="muted">bez obsady</span>'
            : s.people.length
              ? s.people.map(p => `<span class="p">${esc(p.name)}${p.role ? ` <em>${esc(p.role)}</em>` : ''}</span>`).join('')
              : '<span class="gap">brak obsady</span>'
          return `<div class="svc"><b>${esc(s.time)}</b><span class="t">${esc(s.title)}${s.church ? ` · <i>${esc(s.church)}</i>` : ''}</span><div class="crew">${crew}</div></div>`
        }).join('')
    return `<tr class="${sunday ? 'sun' : ''}"><td class="day" style="border-left:5px solid ${color}"><div class="dow">${dow}</div><div class="dm">${dm}</div><div class="lit">${esc(day.liturgy)}</div></td><td>${body}</td></tr>`
  }).join('\n')

  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>${esc(opts.title)}</title>
<style>
  @page{size:A4;margin:12mm}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;color:#14213d;font-size:11.5px}
  .hdr{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #0B2E5C;padding-bottom:8px;margin-bottom:10px}
  h1{font-size:20px;color:#0B2E5C}
  .sub{font-size:12px;color:#555;margin-top:2px}
  .qr{text-align:center;font-size:9px;color:#555;width:96px}
  .qr svg{width:84px;height:84px}
  table{width:100%;border-collapse:collapse}
  td{border-bottom:1px solid #ddd;padding:6px 8px;vertical-align:top}
  tr{page-break-inside:avoid}
  tr.sun td{background:#f6f1e4}
  .day{width:128px}
  .dow{font-weight:700;font-size:12.5px}
  .dm{color:#333}
  .lit{font-size:9.5px;color:#666;margin-top:2px}
  .svc{display:flex;flex-wrap:wrap;gap:6px;align-items:baseline;padding:2px 0}
  .svc b{width:40px}
  .t{min-width:170px}
  .crew{display:flex;flex-wrap:wrap;gap:4px}
  .p{background:#eef2f8;border-radius:10px;padding:1px 7px}
  .p em{color:#8a6d1d;font-style:normal;font-size:10px}
  .gap{color:#c0392b;font-weight:700}
  .muted,.none{color:#999}
  .foot{margin-top:8px;font-size:9px;color:#888;display:flex;justify-content:space-between}
</style></head><body>
<div class="hdr"><div><h1>${esc(opts.title)}</h1><div class="sub">${esc(opts.parish)}</div></div>${opts.qrSvg ? `<div class="qr">${opts.qrSvg}<div>Grafik w telefonie</div></div>` : ''}</div>
<table>${rows}</table>
<div class="foot"><span>Zmiany zgłaszaj w aplikacji LSO${opts.publicUrl ? ` · ${esc(opts.publicUrl)}` : ''}</span><span>Wydrukowano ${gen}</span></div>
</body></html>`
}
