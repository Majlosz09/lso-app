import {
  getLiturgicalAccentColor,
  getLiturgicalBgColor,
  getLiturgicalDay,
  LITURGICAL_FERIA,
  COLOR_HEX,
  LiturgicalEntry,
} from '../../lib/liturgy'

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
  it('returns LITURGICAL_FERIA for unknown date', () => {
    const result = getLiturgicalDay('1900-01-01')
    expect(result.type).toBe('FERIA')
    expect(result).toBe(LITURGICAL_FERIA)
  })

  it('returns LiturgicalEntry (not FERIA) for Christmas 2026', () => {
    const result = getLiturgicalDay('2026-12-25')
    expect(result.type).not.toBe('FERIA')
    expect(result.name).toBeTruthy()
  })
})
