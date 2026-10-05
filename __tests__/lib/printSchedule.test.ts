import { buildPrintHtml, esc, shortPerson } from '../../lib/printSchedule'

describe('printSchedule', () => {
  it('shortens names for public printouts', () => {
    expect(shortPerson('Kuba Wiśniewski')).toBe('Kuba W.')
    expect(shortPerson('Tomek')).toBe('Tomek')
  })

  it('escapes HTML', () => {
    expect(esc('<b>"a"&</b>')).toBe('&lt;b&gt;&quot;a&quot;&amp;&lt;/b&gt;')
  })

  const html = buildPrintHtml({
    parish: 'Parafia św. Michała',
    title: 'Grafik służby 12–18 X',
    days: [
      { date: '2026-10-11', liturgy: '28. Niedziela zwykła', color: 'GREEN' },
      { date: '2026-10-12', liturgy: 'poniedziałek', color: 'GREEN' },
      { date: '2026-10-13', liturgy: 'wtorek', color: 'GREEN' },
    ],
    services: [
      { date: '2026-10-11', time: '10:00', title: 'Suma', church: null, people: [{ name: 'Kuba W.', role: 'Lektor' }, { name: 'Filip K.' }] },
      { date: '2026-10-11', time: '09:00', title: 'Msza w kaplicy', church: 'Zalesie', people: [] },
      { date: '2026-10-12', time: '18:00', title: 'Różaniec', church: null, people: [], mode: 'none' },
    ],
    qrSvg: '<svg id="qr"></svg>',
    publicUrl: 'https://app.lsoapp.com/g/abc',
    generatedAt: new Date(2026, 9, 5),
  })

  it('renders days, services in time order, roles, churches and gaps', () => {
    expect(html).toContain('Niedziela')
    expect(html.indexOf('09:00')).toBeLessThan(html.indexOf('10:00'))
    expect(html).toContain('Kuba W. <em>Lektor</em>')
    expect(html).toContain('<i>Zalesie</i>')
    expect(html).toContain('brak obsady')
    expect(html).toContain('bez obsady')
    expect(html).toContain('<svg id="qr"></svg>')
    expect(html).toContain('<tr class="sun">')
    expect(html).toMatch(/<td>\s*<div class="none">—<\/div><\/td>/)
  })
})
