import { strFromU8, unzipSync } from 'fflate'
import { buildXlsx, colName, sheetName, toBase64 } from '../../lib/xlsx'
import { generateXLSX } from '../../lib/export'

jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }))

describe('xlsx', () => {
  it('column names', () => {
    expect([0, 25, 26, 27, 701, 702].map(colName)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA'])
  })

  it('sanitizes sheet names', () => {
    expect(sheetName('Raport [wrzesień]/2026')).toBe('Raport  wrzesień  2026')
    expect(sheetName('x'.repeat(40)).length).toBe(31)
  })

  it('builds a valid package with escaped strings and numbers', () => {
    const bytes = buildXlsx([{ name: 'Test', headerRow: 0, rows: [['Imię', 'Pkt'], ['Ala & <Ola> "Kowal"', 12]] }])
    const files = unzipSync(bytes)
    expect(Object.keys(files).sort()).toEqual([
      '[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml',
    ])
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml'])
    expect(sheet).toContain('Ala &amp; &lt;Ola&gt; &quot;Kowal&quot;')
    expect(sheet).toContain('<c r="B2"><v>12</v></c>')
    expect(sheet).toContain('<c r="A1" s="1" t="inlineStr">')
    expect(sheet).toContain('state="frozen"')
  })

  it('report has Ranking and Frekwencja sheets (percent as fraction)', () => {
    const bytes = generateXLSX({
      parishName: 'Parafia', from: '2026-09-01', to: '2026-09-30', generatedAt: '2026-09-30T10:00:00Z',
      members: [{ fullName: 'Jan Nowak', scheduled: 4, present: 3, attendanceRate: 75, points: 15 }],
    })
    const files = unzipSync(bytes)
    expect(strFromU8(files['xl/workbook.xml'])).toMatch(/name="Ranking".*name="Frekwencja"/)
    const att = strFromU8(files['xl/worksheets/sheet2.xml'])
    expect(att).toContain('<c r="E6" s="3"><v>0.75</v></c>')
    const pointsOnly = unzipSync(generateXLSX({ parishName: 'P', from: 'a', to: 'b', generatedAt: '2026-09-30T10:00:00Z', members: [] }, { pointsOnly: true }))
    expect(pointsOnly['xl/worksheets/sheet2.xml']).toBeUndefined()
  })

  it('base64 matches Buffer', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253])
    for (let n = 0; n <= bytes.length; n++) {
      expect(toBase64(bytes.slice(0, n))).toBe(Buffer.from(bytes.slice(0, n)).toString('base64'))
    }
  })
})
