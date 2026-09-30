// lib/theme.ts
// Redesign v2 — paleta „zakrystyjna”: granat, złoto, papier.
// Stare klucze zostają (używa ich ~80 ekranów), nowe dochodzą obok.

export const lightColors = {
  bg:               '#F6F4EF', // papier
  canvas:           '#E9E5DC', // tło poza ramą (web)
  surface:          '#FFFFFF',
  surfaceElevated:  '#FFFFFF',
  primary:          '#0B2E5C', // granat
  primaryDark:      '#071C3A', // granat głęboki — sidebar, auth
  primarySurface:   '#E6ECF4',
  primaryAlpha08:   '#0B2E5C14',
  primaryAlpha12:   '#0B2E5C1F',
  primaryAlpha20:   '#0B2E5C33',
  onPrimary:        '#FFFFFF',
  header:           '#0B2E5C',
  text:             '#14213A', // ink
  subtext:          '#5B6475', // muted
  textTertiary:     '#8A8F99',
  border:           '#E9E4D8', // line
  borderLight:      '#EFEBE2', // line-soft (dzielniki)
  inputBorder:      '#E3DED2',
  inputBg:          '#FFFFFF',
  highlight:        '#FBF6EA', // hover / wybrany wiersz
  gold:             '#C9A55A',
  goldInk:          '#8A6A1F',
  goldSurface:      '#F3EBD8',
  goldText:         '#6E5316',
  goldAlpha:        '#C9A55A26',
  danger:           '#8C2A22',
  dangerStrong:     '#B3261E',
  dangerSurface:    '#FBE9E7',
  success:          '#2F7D4F',
  successStrong:    '#2E6B45',
  successSurface:   '#E6F2EA',
  white:            '#FFFFFF',
  iconMuted:        '#C9C3B5',
  sidebar:          '#071C3A',
  sidebarText:      '#AEBBD0',
  sidebarMuted:     '#8497B5',
  overlay:          'rgba(7,28,58,0.42)',
  catMsza:          '#0B2E5C',
  catNabozenstwo:   '#0E7490',
  catZbiorka:       '#2F7D4F',
} as const

export const darkColors: Record<keyof typeof lightColors, string> = {
  bg:               '#0D1320',
  canvas:           '#080C15',
  surface:          '#161E2E',
  surfaceElevated:  '#1C2638',
  primary:          '#4E7CBE', // kompromis: biały tekst na przycisku ≈4.3:1, tekst na tle ≈3.9:1
  primaryDark:      '#071C3A',
  primarySurface:   '#1B2B45',
  primaryAlpha08:   '#4E7CBE14',
  primaryAlpha12:   '#4E7CBE1F',
  primaryAlpha20:   '#4E7CBE33',
  onPrimary:        '#FFFFFF',
  header:           '#071C3A',
  text:             '#EEF1F6',
  subtext:          '#A3ACBB',
  textTertiary:     '#737D8D',
  border:           '#263247',
  borderLight:      '#1F293B',
  inputBorder:      '#2D3A51',
  inputBg:          '#111827',
  highlight:        '#232B38',
  gold:             '#C9A55A',
  goldInk:          '#D8B96E',
  goldSurface:      '#2E2716',
  goldText:         '#E3C987',
  goldAlpha:        '#C9A55A26',
  danger:           '#E0776C',
  dangerStrong:     '#EF8A7F',
  dangerSurface:    '#3A1A18',
  success:          '#5FB283',
  successStrong:    '#6FC193',
  successSurface:   '#17301F',
  white:            '#FFFFFF',
  iconMuted:        '#4B5563',
  sidebar:          '#060D1A',
  sidebarText:      '#AEBBD0',
  sidebarMuted:     '#8497B5',
  overlay:          'rgba(0,0,0,0.55)',
  catMsza:          '#6A93CF',
  catNabozenstwo:   '#2BA3BF',
  catZbiorka:       '#5FB283',
}

export type Colors = Record<keyof typeof lightColors, string>

// ── Typografia ──────────────────────────────────────────────────────────────
// Na Androidzie własne fonty nie obsługują fontWeight — każda grubość to osobna rodzina.
export const fonts = {
  serif:       'InstrumentSerif_400Regular',
  serifItalic: 'InstrumentSerif_400Regular_Italic',
  regular:     'Manrope_400Regular',
  medium:      'Manrope_500Medium',
  semibold:    'Manrope_600SemiBold',
  bold:        'Manrope_700Bold',
  extrabold:   'Manrope_800ExtraBold',
} as const

type Weight = 400 | 500 | 600 | 700 | 800

/** Styl fontu UI (Manrope) dla danej grubości — zamiast fontWeight. */
export function sans(weight: Weight = 400) {
  const family = {
    400: fonts.regular,
    500: fonts.medium,
    600: fonts.semibold,
    700: fonts.bold,
    800: fonts.extrabold,
  }[weight]
  return { fontFamily: family }
}

/** Styl fontu display (Instrument Serif). */
export function serif(italic = false) {
  return { fontFamily: italic ? fonts.serifItalic : fonts.serif, fontWeight: '400' as const }
}

export const radius = {
  pill: 999,
  hero: 22,
  modal: 20,
  card: 16,
  button: 14,
  input: 12,
  small: 10,
  bar: 8,
} as const

export const space = [0, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 28, 32] as const

// ── Nagłówki w kolorze szat dnia ────────────────────────────────────────────
export type VestmentColor = 'RED' | 'WHITE' | 'GREEN' | 'PURPLE' | 'ROSE' | 'GOLD' | 'BLACK'

export type HeaderPalette = {
  bg: string
  fg: string
  accent: string
  chip: string
  /** styl paska statusu nad nagłówkiem */
  statusBar: 'light' | 'dark'
}

const HEADER_LIGHT: Record<VestmentColor, HeaderPalette> = {
  RED:    { bg: '#6E1C17', fg: '#FFF6F3', accent: '#F2B8A8', chip: 'rgba(255,255,255,0.14)', statusBar: 'light' },
  WHITE:  { bg: '#F3EBD8', fg: '#2B2210', accent: '#8A6A1F', chip: 'rgba(138,106,31,0.14)', statusBar: 'dark' },
  GREEN:  { bg: '#1F4D33', fg: '#F2F7F3', accent: '#A9D3B6', chip: 'rgba(255,255,255,0.14)', statusBar: 'light' },
  PURPLE: { bg: '#4A1D5E', fg: '#F7F2FA', accent: '#D9B8E8', chip: 'rgba(255,255,255,0.14)', statusBar: 'light' },
  ROSE:   { bg: '#F6DCE4', fg: '#4A1426', accent: '#A3355B', chip: 'rgba(163,53,91,0.12)', statusBar: 'dark' },
  GOLD:   { bg: '#F3E3B5', fg: '#2B2210', accent: '#8A6A1F', chip: 'rgba(138,106,31,0.14)', statusBar: 'dark' },
  BLACK:  { bg: '#1E1E24', fg: '#F2F2F4', accent: '#B9B9C4', chip: 'rgba(255,255,255,0.12)', statusBar: 'light' },
}

// W trybie ciemnym jasne szaty (biel, róż, złoto) nie mogą świecić jak latarka —
// zostaje ich odcień, ale w ciemnej wersji.
const HEADER_DARK: Record<VestmentColor, HeaderPalette> = {
  ...HEADER_LIGHT,
  WHITE: { bg: '#3A3120', fg: '#F6EEDB', accent: '#D8B96E', chip: 'rgba(255,255,255,0.10)', statusBar: 'light' },
  ROSE:  { bg: '#4E2232', fg: '#FBE8EE', accent: '#E79AB5', chip: 'rgba(255,255,255,0.10)', statusBar: 'light' },
  GOLD:  { bg: '#3D3218', fg: '#F7ECCB', accent: '#D8B96E', chip: 'rgba(255,255,255,0.10)', statusBar: 'light' },
}

export function headerPalette(color: string | undefined, isDark = false): HeaderPalette {
  const key = (color ?? 'GREEN') as VestmentColor
  const map = isDark ? HEADER_DARK : HEADER_LIGHT
  return map[key] ?? map.GREEN
}

/** Kropki dni w pasku tygodnia. WHITE rysujemy z ringiem złotym. */
export const VESTMENT_DOT: Record<VestmentColor, string> = {
  RED:    '#B3261E',
  WHITE:  '#FFFFFF',
  GREEN:  '#2E6B45',
  PURPLE: '#6A2C85',
  ROSE:   '#C2185B',
  GOLD:   '#C9A55A',
  BLACK:  '#1E1E24',
}

export const VESTMENT_NAMES: Record<VestmentColor, string> = {
  RED:    'szaty czerwone',
  WHITE:  'szaty białe',
  GREEN:  'szaty zielone',
  PURPLE: 'szaty fioletowe',
  ROSE:   'szaty różowe',
  GOLD:   'szaty złote',
  BLACK:  'szaty czarne',
}
