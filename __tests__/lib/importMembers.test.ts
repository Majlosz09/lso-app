import { claimCardsHtml, parseImport } from '../../lib/importMembers'

describe('parseImport', () => {
  it('Excel paste with header (tab separated, separate first/last name)', () => {
    const r = parseImport('Imię\tNazwisko\tRocznik\tFunkcje\nkuba\twiśniewski\t2013\tLektor, Ceremoniarz\nAntek\tZieliński\t2015\t')
    expect(r.hasHeader).toBe(true)
    expect(r.rows).toEqual([
      { full_name: 'Kuba Wiśniewski', rocznik: '2013', functions: ['Lektor', 'Ceremoniarz'], rank: null },
      { full_name: 'Antek Zieliński', rocznik: '2015', functions: [], rank: null },
    ])
  })

  it('CSV with semicolons and full name column + rank', () => {
    const r = parseImport('Imię i nazwisko;Rok urodzenia;Ranga\nJan Kowalski;2012;lektor starszy')
    expect(r.rows[0]).toEqual({ full_name: 'Jan Kowalski', rocznik: '2012', functions: [], rank: 'Lektor Starszy' })
  })

  it('no header: name, year, functions', () => {
    const r = parseImport('Michał Nowak\t2014\tAkolita\nSzymon Lis-Kowal\t\t')
    expect(r.hasHeader).toBe(false)
    expect(r.rows.map(x => x.full_name)).toEqual(['Michał Nowak', 'Szymon Lis-Kowal'])
    expect(r.rows[0].functions).toEqual(['Akolita'])
  })

  it('no header, first and last name in two columns', () => {
    const r = parseImport('Jan\tKowalski\t2014')
    expect(r.rows[0]).toMatchObject({ full_name: 'Jan Kowalski', rocznik: '2014' })
  })

  it('reports problems: single word, bad year, duplicates', () => {
    const r = parseImport('Kuba\nJan Kowalski\t20x4\njan kowalski\t2014')
    expect(r.rows.map(x => x.full_name)).toEqual(['Jan Kowalski'])
    expect(r.rows[0].rocznik).toBeNull()
    expect(r.errors).toHaveLength(3)
  })

  it('claim cards format codes', () => {
    const html = claimCardsHtml('Parafia', [{ full_name: 'Jan K', claim_code: 'ABCD2345' }], 'https://app.lsoapp.com')
    expect(html).toContain('ABCD-2345')
  })
})
