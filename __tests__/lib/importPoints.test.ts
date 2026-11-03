import { matchMembers, parseDateInput, parsePointsImport } from '../../lib/importPoints'

describe('parsePointsImport', () => {
  it('czyta kolumny z Excela z nagłówkiem', () => {
    const r = parsePointsImport('Imię i nazwisko\tPunkty\nJan Kowalski\t120\nAntek Nowak\t85')
    expect(r.errors).toEqual([])
    expect(r.rows.map(x => [x.name, x.amount])).toEqual([['Jan Kowalski', 120], ['Antek Nowak', 85]])
  })
  it('imię i nazwisko w osobnych kolumnach + powód', () => {
    const r = parsePointsImport('Jan\tKowalski\t120\tRoraty 2025')
    expect(r.rows[0]).toMatchObject({ name: 'Jan Kowalski', amount: 120, reason: 'Roraty 2025' })
  })
  it('zwykły tekst: „Jan Kowalski 120”, „Jan Kowalski - 40”, ujemne', () => {
    const r = parsePointsImport('Jan Kowalski 120\nAntek Nowak - 40\nOla Wiśniewska: -5')
    expect(r.rows.map(x => x.amount)).toEqual([120, 40, -5])
    expect(r.rows[2].name).toBe('Ola Wiśniewska')
  })
  it('liczba z Excela „120,00” i średniki', () => {
    expect(parsePointsImport('Jan Kowalski;120,00').rows[0].amount).toBe(120)
  })
  it('zgłasza wiersze bez punktów i zero', () => {
    const r = parsePointsImport('Jan Kowalski\nAntek Nowak\t0')
    expect(r.rows).toEqual([])
    expect(r.errors).toHaveLength(2)
  })
})

describe('matchMembers', () => {
  const members = [
    { id: '1', full_name: 'Jan Kowalski' },
    { id: '2', full_name: 'Łukasz Żółć' },
    { id: '3', full_name: 'Piotr Nowak' },
    { id: '4', full_name: 'Piotr Nowak' },
  ]
  it('dopasowuje bez polskich znaków, wielkości liter i w odwrotnej kolejności', () => {
    const rows = parsePointsImport('jan kowalski 1\nZolc Lukasz 2\nKowalski Jan 3').rows
    expect(matchMembers(rows, members).map(r => r.member?.id)).toEqual(['1', '2', '1'])
  })
  it('nie zgaduje przy dwóch osobach o tym samym nazwisku i imieniu', () => {
    expect(matchMembers(parsePointsImport('Piotr Nowak 5').rows, members)[0].member).toBeNull()
  })
  it('nieznana osoba → null', () => {
    expect(matchMembers(parsePointsImport('Ktoś Inny 5').rows, members)[0].member).toBeNull()
  })
})

describe('parseDateInput', () => {
  it('polski i ISO format', () => {
    expect(parseDateInput('30.09.2026')).toBe('2026-09-30')
    expect(parseDateInput('2026-9-1')).toBe('2026-09-01')
  })
  it('odrzuca nieistniejące daty', () => {
    expect(parseDateInput('31.02.2026')).toBeNull()
    expect(parseDateInput('wczoraj')).toBeNull()
  })
})
