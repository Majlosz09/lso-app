// Daty w czasie lokalnym (toISOString przesuwa dzień po północy UTC) + polskie etykiety.

export function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function parseDate(dateStr: string): Date {
  return new Date(dateStr + 'T12:00:00')
}

export function addDays(dateStr: string, n: number): string {
  const d = parseDate(dateStr)
  d.setDate(d.getDate() + n)
  return localDateStr(d)
}

/** Poniedziałek–niedziela tygodnia przesuniętego o `offset` tygodni od bieżącego. */
export function weekDays(offset = 0, from: Date = new Date()): string[] {
  const dow = from.getDay()
  const monday = new Date(from)
  monday.setHours(12, 0, 0, 0)
  monday.setDate(from.getDate() + (dow === 0 ? -6 : 1 - dow) + offset * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return localDateStr(d)
  })
}

export const DAY_SHORT = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb']
export const DAY_LONG = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota']
const MONTH_GEN = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia']
const MONTH_NOM = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień']
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']

export const dayShort = (s: string) => DAY_SHORT[parseDate(s).getDay()]
export const dayNum = (s: string) => parseDate(s).getDate()
export const monthName = (s: string) => MONTH_NOM[parseDate(s).getMonth()]

/** „29 IX” */
export function shortDate(s: string): string {
  const d = parseDate(s)
  return `${d.getDate()} ${ROMAN[d.getMonth()]}`
}

/** „poniedziałek, 28 IX” */
export function weekdayShortDate(s: string): string {
  return `${DAY_LONG[parseDate(s).getDay()]}, ${shortDate(s)}`
}

/** „29 września” */
export function dayMonth(s: string): string {
  const d = parseDate(s)
  return `${d.getDate()} ${MONTH_GEN[d.getMonth()]}`
}

/** „wtorek, 29 września” */
export function longDate(s: string): string {
  return `${DAY_LONG[parseDate(s).getDay()]}, ${dayMonth(s)}`
}

/** „Wtorek, 29 września” */
export function longDateCap(s: string): string {
  const l = longDate(s)
  return l.charAt(0).toUpperCase() + l.slice(1)
}

/** „dziś” / „jutro” / „pojutrze” / „za 5 dni” / „wczoraj” */
export function relativeDay(s: string, today: string = localDateStr()): string {
  const diff = Math.round((parseDate(s).getTime() - parseDate(today).getTime()) / 86_400_000)
  if (diff === 0) return 'dziś'
  if (diff === 1) return 'jutro'
  if (diff === 2) return 'pojutrze'
  if (diff === -1) return 'wczoraj'
  if (diff > 0) return `za ${diff} dni`
  return `${-diff} dni temu`
}

/** Polska odmiana: pl(5, ['punkt','punkty','punktów']) */
export function pl(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n)
  if (a === 1) return forms[0]
  if (a % 10 >= 2 && a % 10 <= 4 && (a % 100 < 12 || a % 100 > 14)) return forms[1]
  return forms[2]
}

/** Okno meldowania: od 30 min przed do 90 min po rozpoczęciu. */
export function isCheckInWindowOpen(date: string, time: string | null | undefined, now = new Date()): boolean {
  if (!time) return false
  const start = new Date(`${date}T${time.slice(0, 5)}`)
  return now >= new Date(start.getTime() - 30 * 60_000) && now <= new Date(start.getTime() + 90 * 60_000)
}

/** Czy służba już się zaczęła/minęła (po oknie meldowania). */
export function isPast(date: string, time: string | null | undefined, now = new Date()): boolean {
  if (!time) return date < localDateStr(now)
  return new Date(`${date}T${time.slice(0, 5)}`).getTime() + 90 * 60_000 < now.getTime()
}
