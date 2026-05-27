import data from '../assets/liturgy.json'

export type LiturgicalEntry = {
  name: string
  type: string
  typeLabel: string
  color?: string
}

export const LITURGICAL_FERIA: LiturgicalEntry = {
  name: 'Dzień powszedni',
  type: 'FERIA',
  typeLabel: 'Feria',
  color: 'GREEN',
}

export function getLiturgicalDay(dateStr: string): LiturgicalEntry {
  return (data as Record<string, LiturgicalEntry>)[dateStr] ?? LITURGICAL_FERIA
}

export const COLOR_HEX: Record<string, string> = {
  WHITE:  '#C8950A',
  RED:    '#C0392B',
  GREEN:  '#2E7D32',
  PURPLE: '#6A1B9A',
  ROSE:   '#C2185B',
  GOLD:   '#F57F17',
}

export const VESTMENT_LABELS: Record<string, string> = {
  WHITE:  'Biały',
  RED:    'Czerwony',
  GREEN:  'Zielony',
  PURPLE: 'Fioletowy',
  ROSE:   'Różowy',
  GOLD:   'Złoty',
}

// Kolor akcentu (kropka w kalendarzu, wskaźnik w banerze)
// Null dla FERIA i SUNDAY — nie zaśmiecać kalendarza
export function getLiturgicalAccentColor(entry: LiturgicalEntry): string | null {
  const SHOW_DOT = ['SOLEMNITY', 'TRIDUUM', 'HOLY_WEEK', 'FEAST', 'MEMORIAL', 'COMMEMORATION']
  if (!SHOW_DOT.includes(entry.type)) return null
  return COLOR_HEX[entry.color ?? ''] ?? null
}

// Kolor tła dnia w kalendarzu (używać z + 'XX' dla opacity)
// Pokazuje wszystkie kolory poza zielonym na zwykłych feriach (za głośno wizualnie)
export function getLiturgicalBgColor(entry: LiturgicalEntry): string | null {
  const c = entry.color
  if (!c) return null
  if (c === 'GREEN' && entry.type === 'FERIA') return null
  if (c === 'WHITE') {
    const IMPORTANT = ['SOLEMNITY', 'TRIDUUM', 'HOLY_WEEK', 'FEAST']
    if (!IMPORTANT.includes(entry.type)) return null
  }
  return COLOR_HEX[c] ?? null
}

// Zawsze zwraca kolor szaty — do ekranów szczegółowych (nigdy null)
export function getLiturgicalVestmentColor(entry: LiturgicalEntry): string {
  return COLOR_HEX[entry.color ?? ''] ?? '#888'
}
