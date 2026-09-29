import { darkColors, headerPalette, lightColors, sans, VESTMENT_NAMES } from '../../lib/theme'
import { resolveIconName } from '../../components/ui/Icon'
import { initials } from '../../components/ui/Avatar'
import { localDateStr } from '../../hooks/useLiturgyHeader'

describe('palette', () => {
  it('dark palette defines every light key', () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort())
  })

  it('uses redesign base tokens', () => {
    expect(lightColors.primary).toBe('#0B2E5C')
    expect(lightColors.bg).toBe('#F6F4EF')
    expect(lightColors.gold).toBe('#C9A55A')
  })
})

describe('headerPalette', () => {
  it('maps vestment colors from the handoff', () => {
    expect(headerPalette('RED').bg).toBe('#6E1C17')
    expect(headerPalette('WHITE').fg).toBe('#2B2210')
    expect(headerPalette('GREEN').accent).toBe('#A9D3B6')
    expect(headerPalette('PURPLE').bg).toBe('#4A1D5E')
    expect(headerPalette('ROSE').bg).toBe('#F6DCE4')
    expect(headerPalette('GOLD').bg).toBe('#F3E3B5')
  })

  it('falls back to green for unknown / missing color', () => {
    expect(headerPalette(undefined)).toEqual(headerPalette('GREEN'))
    expect(headerPalette('BLUE')).toEqual(headerPalette('GREEN'))
  })

  it('light vestments use dark status bar, dark ones light', () => {
    expect(headerPalette('WHITE').statusBar).toBe('dark')
    expect(headerPalette('RED').statusBar).toBe('light')
  })

  it('darkens bright vestments in dark mode', () => {
    expect(headerPalette('WHITE', true).bg).not.toBe(headerPalette('WHITE').bg)
    expect(headerPalette('WHITE', true).statusBar).toBe('light')
    expect(headerPalette('RED', true)).toEqual(headerPalette('RED'))
  })

  it('has a vestment name for every palette entry', () => {
    expect(VESTMENT_NAMES.RED).toBe('szaty czerwone')
  })
})

describe('helpers', () => {
  it('sans() maps weight to Manrope family', () => {
    expect(sans(800)).toEqual({ fontFamily: 'Manrope_800ExtraBold' })
    expect(sans()).toEqual({ fontFamily: 'Manrope_400Regular' })
  })

  it('resolveIconName uses -outline variant when not filled', () => {
    expect(resolveIconName('home', false)).toBe('home-outline')
    expect(resolveIconName('home', true)).toBe('home')
    expect(resolveIconName('chevron-left', false)).toBe('chevron-left')
  })

  it('initials skips the "ks." prefix', () => {
    expect(initials('ks. Paweł Nowak')).toBe('PN')
    expect(initials('Michał Kowalski')).toBe('MK')
    expect(initials('Anna')).toBe('A')
    expect(initials('')).toBe('?')
  })

  it('localDateStr formats local date', () => {
    expect(localDateStr(new Date(2026, 8, 5, 23, 30))).toBe('2026-09-05')
  })
})
