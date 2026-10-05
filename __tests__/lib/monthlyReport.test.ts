import { MonthlyReport, delta, monthTitle, monthlyReportHtml, staffedPct } from '../../lib/monthlyReport'

const rep: MonthlyReport = {
  from: '2026-09-01', to: '2026-09-30', parish: 'Parafia <św.> Michała',
  stats: { services: 31, staffed: 28, attendance: 49, active_members: 9, points: 510, rate: 92, new_members: 1, members: 10 },
  prev: { services: 30, attendance: 40, active_members: 8, rate: 95 },
  by_category: { msza: 45, nabozenstwo: 4 },
  top: [{ name: 'Janek Wróbel', cnt: 7, pts: 63 }],
  fading: [{ id: 'x', name: 'Tomek Lis', before: 5, last: '2026-08-28' }],
  unstaffed: [{ date: '2026-09-07', time: '08:00', title: 'Msza Święta' }],
  promotions: [], challenges: [], absences: { accepted: 2, absent: 1, reports: 3 },
}

describe('monthlyReport', () => {
  it('month title', () => expect(monthTitle('2026-09-01')).toBe('wrzesień 2026'))
  it('delta', () => {
    expect(delta(49, 40)).toBe('+9 vs poprz. miesiąc')
    expect(delta(92, 95, ' pp')).toBe('−3 pp vs poprz. miesiąc')
    expect(delta(5, 5)).toBe('bez zmian')
    expect(delta(5, -1)).toBeNull()
    expect(delta(0, 0)).toBeNull()
  })
  it('staffed percent', () => expect(staffedPct(rep)).toBe(90))
  it('html: escapes, sections, fading member with last date', () => {
    const html = monthlyReportHtml(rep)
    expect(html).toContain('Parafia &lt;św.&gt; Michała')
    expect(html).toContain('Raport miesięczny — wrzesień 2026')
    expect(html).toContain('1. Janek Wróbel — 7 służb, 63 pkt')
    expect(html).toContain('Tomek Lis — ostatnio 28.08')
    expect(html).toContain('7.09 08:00 — Msza Święta')
    expect(html).toContain('Brak awansów.')
  })
})
