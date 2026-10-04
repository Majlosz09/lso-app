// Dzień liturgiczny do UI. Liczony na bieżąco dla każdego roku (lib/liturgicalYear.ts), trzymany w pamięci
// i w AsyncStorage. getLiturgicalDay jest synchroniczne: rok, którego jeszcze nie ma, liczy się w tle,
// a komponenty odświeżają się przez useLiturgyVersion().
import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { computeLiturgicalYear, LITURGY_ENGINE_VERSION, LiturgicalEntry } from './liturgicalYear'

export type { LiturgicalEntry } from './liturgicalYear'

export const LITURGICAL_FERIA: LiturgicalEntry = {
  name: 'Dzień powszedni',
  type: 'FERIA',
  typeLabel: 'Feria',
  color: 'GREEN',
}

const MIN_YEAR = 1970
const MAX_YEAR = 2200
const years = new Map<number, Record<string, LiturgicalEntry>>()
const pending = new Map<number, Promise<void>>()

/** Licznik wczytanych lat — komponenty zależne od kalendarza subskrybują go, żeby się odświeżyć. */
const useLiturgyStore = create<{ version: number; bump: () => void }>(set => ({
  version: 0,
  bump: () => set(st => ({ version: st.version + 1 })),
}))
export const useLiturgyVersion = () => useLiturgyStore(st => st.version)

const storageKey = (y: number) => `liturgy:${LITURGY_ENGINE_VERSION}:${y}`

/** Wczytuje rok (z pamięci telefonu albo liczy). Bezpieczne do wielokrotnego wołania. */
export function ensureLiturgicalYear(year: number): Promise<void> {
  if (years.has(year) || year < MIN_YEAR || year > MAX_YEAR) return Promise.resolve()
  const running = pending.get(year)
  if (running) return running
  const p = (async () => {
    try {
      let data: Record<string, LiturgicalEntry> | null = null
      try {
        const cached = await AsyncStorage.getItem(storageKey(year))
        if (cached) data = JSON.parse(cached)
      } catch { /* brak cache — policzymy */ }
      if (!data) {
        data = await computeLiturgicalYear(year)
        try { Promise.resolve(AsyncStorage.setItem(storageKey(year), JSON.stringify(data))).catch(() => {}) } catch { /* cache opcjonalny */ }
      }
      years.set(year, data)
      useLiturgyStore.getState().bump()
    } catch (e) {
      console.warn('Kalendarz liturgiczny: nie udało się policzyć roku', year, e)
    } finally {
      pending.delete(year)
    }
  })()
  pending.set(year, p)
  return p
}

/** Przy starcie: bieżący rok (czekamy), poprzedni i następny w tle. */
export async function preloadLiturgy(now: Date = new Date()): Promise<void> {
  const y = now.getFullYear()
  await ensureLiturgicalYear(y)
  ensureLiturgicalYear(y + 1)
  ensureLiturgicalYear(y - 1)
}

export function getLiturgicalDay(dateStr: string): LiturgicalEntry {
  const y = Number(dateStr.slice(0, 4))
  const data = years.get(y)
  if (!data) {
    ensureLiturgicalYear(y)
    return LITURGICAL_FERIA
  }
  return data[dateStr] ?? LITURGICAL_FERIA
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
