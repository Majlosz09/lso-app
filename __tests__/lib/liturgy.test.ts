import {
  getLiturgicalAccentColor,
  getLiturgicalBgColor,
  getLiturgicalDay,
  LITURGICAL_FERIA,
  COLOR_HEX,
  LiturgicalEntry,
  ensureLiturgicalYear,
} from '../../lib/liturgy'
import { computeLiturgicalYear } from '../../lib/liturgicalYear'

const makeEntry = (type: string, color?: string): LiturgicalEntry => ({
  name: 'Test',
  type,
  typeLabel: 'Test Label',
  color,
})

describe('getLiturgicalAccentColor', () => {
  it('returns color for SOLEMNITY', () => {
    expect(getLiturgicalAccentColor(makeEntry('SOLEMNITY', 'RED'))).toBe(COLOR_HEX.RED)
  })

  it('returns color for FEAST', () => {
    expect(getLiturgicalAccentColor(makeEntry('FEAST', 'WHITE'))).toBe(COLOR_HEX.WHITE)
  })

  it('returns null for FERIA (not in show-dot list)', () => {
    expect(getLiturgicalAccentColor(makeEntry('FERIA', 'GREEN'))).toBeNull()
  })

  it('returns null for SUNDAY (not in show-dot list)', () => {
    expect(getLiturgicalAccentColor(makeEntry('SUNDAY', 'GREEN'))).toBeNull()
  })

  it('returns null when color is unknown', () => {
    expect(getLiturgicalAccentColor(makeEntry('SOLEMNITY', 'UNKNOWN'))).toBeNull()
  })
})

describe('getLiturgicalBgColor', () => {
  it('returns null when no color defined', () => {
    expect(getLiturgicalBgColor(makeEntry('FERIA', undefined))).toBeNull()
  })

  it('returns null for GREEN FERIA', () => {
    expect(getLiturgicalBgColor(makeEntry('FERIA', 'GREEN'))).toBeNull()
  })

  it('returns color for GREEN non-FERIA', () => {
    expect(getLiturgicalBgColor(makeEntry('MEMORIAL', 'GREEN'))).toBe(COLOR_HEX.GREEN)
  })

  it('returns null for WHITE MEMORIAL (not important enough)', () => {
    expect(getLiturgicalBgColor(makeEntry('MEMORIAL', 'WHITE'))).toBeNull()
  })

  it('returns color for WHITE SOLEMNITY', () => {
    expect(getLiturgicalBgColor(makeEntry('SOLEMNITY', 'WHITE'))).toBe(COLOR_HEX.WHITE)
  })

  it('returns RED for RED FEAST', () => {
    expect(getLiturgicalBgColor(makeEntry('FEAST', 'RED'))).toBe(COLOR_HEX.RED)
  })
})

describe('getLiturgicalDay', () => {
  it('returns LITURGICAL_FERIA for out-of-range date', () => {
    const result = getLiturgicalDay('1900-01-01')
    expect(result.type).toBe('FERIA')
    expect(result).toBe(LITURGICAL_FERIA)
  })

  it('computes the year on demand and returns Christmas', async () => {
    await ensureLiturgicalYear(2026)
    const result = getLiturgicalDay('2026-12-25')
    expect(result.type).toBe('SOLEMNITY')
    expect(result.name).toBe('Narodzenie Pańskie')
    expect(result.holyDay).toBe(true)
  })
})

describe('computeLiturgicalYear — polskie zasady, dowolny rok', () => {
  // Wielkanoc: 2026-04-05, 2027-03-28, 2035-03-25, 2040-04-01
  const cases: [number, string][] = [[2026, '04-05'], [2027, '03-28'], [2035, '03-25'], [2040, '04-01']]
  const add = (y: number, md: string, days: number) => {
    const d = new Date(`${y}-${md}T12:00:00`); d.setDate(d.getDate() + days)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  it.each(cases)('rok %i: ruchome święta wg Wielkanocy %s', async (y, easter) => {
    const cal = await computeLiturgicalYear(y)
    expect(cal[`${y}-${easter}`].type).toBe('SOLEMNITY')
    expect(cal[add(y, easter, -46)].id).toBe('ash_wednesday')                 // Popielec
    expect(cal[add(y, easter, -3)]).toMatchObject({ name: 'Wielki Czwartek', type: 'TRIDUUM', color: 'WHITE' })
    expect(cal[add(y, easter, -2)]).toMatchObject({ type: 'TRIDUUM', color: 'RED' })
    expect(cal[add(y, easter, 42)].name).toBe('Wniebowstąpienie Pańskie')     // PL: 7. niedziela Wielkanocy
    expect(cal[add(y, easter, 49)].name).toMatch(/Zesłania Ducha/)
    expect(cal[add(y, easter, 60)]).toMatchObject({ name: 'Najświętszego Ciała i Krwi Chrystusa', holyDay: true }) // czwartek
  })

  it.each([2026, 2027, 2040])('rok %i: 6 I Objawienie Pańskie, 15 VIII i 1 XI nakazane', async y => {
    const cal = await computeLiturgicalYear(y)
    expect(cal[`${y}-01-06`]).toMatchObject({ name: 'Objawienie Pańskie', type: 'SOLEMNITY', holyDay: true })
    expect(cal[`${y}-08-15`].holyDay).toBe(true)
    expect(cal[`${y}-11-01`]).toMatchObject({ name: 'Wszystkich Świętych', holyDay: true })
    expect(cal[`${y}-05-03`].name).toMatch(/Królowej Polski|Niedziela/)
  })

  it('nazwy po polsku: kropka po liczebniku, wspomnienie dowolne w dzień powszedni', async () => {
    const cal = await computeLiturgicalYear(2026)
    expect(cal['2026-10-04'].name).toBe('27. Niedziela zwykła')
    expect(cal['2026-01-14'].name).toBe('środa 1. tygodnia zwykłego')
    expect(cal['2026-01-13']).toMatchObject({ type: 'OPT_MEMORIAL', name: expect.stringMatching(/Hilarego/) })
    expect(cal['2026-12-13']).toMatchObject({ color: 'ROSE' })                  // Gaudete
    expect(Object.values(cal).every(e => e.color && !e.name.includes('$('))).toBe(true)
  })
})
