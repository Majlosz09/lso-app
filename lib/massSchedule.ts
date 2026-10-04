// Obowiązujący rozkład Mszy i nabożeństw: stały tydzień (mass_templates) + zmiany okresowe
// (mass_periods / mass_period_entries). Ta sama logika jest w SQL (public.mass_slots) —
// zmiany wprowadzaj w obu miejscach.

import { addDays, parseDate } from './dates'

export type SlotCategory = 'msza' | 'nabozenstwo'

/**
 * Tryb służby:
 * - signup   — ministranci sami się zapisują; obecność i punkty,
 * - assigned — obsadę ustala opiekun (grafik); obecność i punkty,
 * - none     — bez obecności i punktów (pozycja tylko informacyjnie w grafiku).
 */
export type ServiceMode = 'signup' | 'assigned' | 'none'

export const SERVICE_MODE_INFO: Record<ServiceMode, { label: string; short: string; hint: string }> = {
  signup: { label: 'Zapisy ministrantów', short: 'Zapisy', hint: 'Ministranci sami się zapisują, obecność i punkty liczone.' },
  assigned: { label: 'Tylko grafik opiekuna', short: 'Grafik', hint: 'Obsadę ustala opiekun, obecność i punkty liczone.' },
  none: { label: 'Bez obecności i punktów', short: 'Bez punktów', hint: 'Bez zapisów, obecności i punktów — tylko informacja w grafiku.' },
}

export type RozkladEntry = {
  id: string
  day_of_week: number
  /** HH:MM lub HH:MM:SS */
  time: string
  label: string | null
  category: SlotCategory
  service_mode: ServiceMode
}

export type PeriodEntry = RozkladEntry & {
  period_id: string
  /** pozycja stałego rozkładu, którą ta godzina zastępuje (stałe zapisy idą za nią) */
  base_template_id: string | null
}

export type MassPeriod = {
  id: string
  name: string
  date_from: string
  date_to: string
  repeat_yearly: boolean
  days_of_week: number[]
  created_at: string
}

export type Slot = {
  date: string
  /** HH:MM */
  time: string
  label: string | null
  category: SlotCategory
  service_mode: ServiceMode
  /** id pozycji (stałej albo okresowej) */
  entry_id: string
  /** id pozycji stałego rozkładu, z której ta godzina się wywodzi (albo własne id) */
  origin_id: string
  period_id: string | null
}

const hhmm = (t: string) => t.slice(0, 5)
const md = (d: string) => d.slice(5, 10)

/** Czy okres obejmuje dany dzień (bez sprawdzania dni tygodnia). */
export function periodCoversDate(p: Pick<MassPeriod, 'date_from' | 'date_to' | 'repeat_yearly'>, date: string): boolean {
  if (!p.repeat_yearly) return date >= p.date_from && date <= p.date_to
  const from = md(p.date_from), to = md(p.date_to), x = md(date)
  // okres przechodzący przez Nowy Rok, np. 1 XII – 6 I
  return from <= to ? x >= from && x <= to : x >= from || x <= to
}

/** Długość okresu w dniach — krótszy okres (np. jednodniowa zmiana) ma pierwszeństwo. */
function periodSpan(p: MassPeriod): number {
  return Math.round((parseDate(p.date_to).getTime() - parseDate(p.date_from).getTime()) / 86400000)
}

/** Okres obowiązujący danego dnia albo null (stały rozkład). */
export function activePeriod(periods: MassPeriod[], date: string): MassPeriod | null {
  const dow = parseDate(date).getDay()
  let best: MassPeriod | null = null
  for (const p of periods) {
    if (!p.days_of_week.includes(dow) || !periodCoversDate(p, date)) continue
    if (!best) { best = p; continue }
    const a = periodSpan(p), b = periodSpan(best)
    if (a < b || (a === b && p.created_at > best.created_at)) best = p
  }
  return best
}

/** Obowiązujące pozycje rozkładu w zakresie dat (włącznie), posortowane po dacie i godzinie. */
export function massSlots(
  templates: RozkladEntry[],
  periods: MassPeriod[],
  periodEntries: PeriodEntry[],
  from: string,
  to: string,
): Slot[] {
  const out: Slot[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const dow = parseDate(d).getDay()
    const period = activePeriod(periods, d)
    if (period) {
      for (const e of periodEntries) {
        if (e.period_id !== period.id || e.day_of_week !== dow) continue
        out.push({
          date: d, time: hhmm(e.time), label: e.label, category: e.category, service_mode: e.service_mode,
          entry_id: e.id, origin_id: e.base_template_id ?? e.id, period_id: period.id,
        })
      }
    } else {
      for (const t of templates) {
        if (t.day_of_week !== dow) continue
        out.push({
          date: d, time: hhmm(t.time), label: t.label, category: t.category, service_mode: t.service_mode,
          entry_id: t.id, origin_id: t.id, period_id: null,
        })
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
}

export function slotTitle(s: Pick<Slot, 'label' | 'category'>): string {
  return s.label?.trim() || (s.category === 'nabozenstwo' ? 'Nabożeństwo' : 'Msza Święta')
}

// ── Narzędzia edytora rozkładu (szkic w pamięci, zapis jednym RPC) ─────────────

export type DraftEntry = Omit<RozkladEntry, 'id'> & {
  /** id istniejącej pozycji albo null dla nowej */
  id: string | null
  base_template_id?: string | null
  /** klucz w UI */
  key: string
}

let draftSeq = 0
export const draftKey = () => `d${++draftSeq}`

/** Przesuwa godzinę o `minutes` (−/+), w obrębie doby. */
export function shiftTime(time: string, minutes: number): string {
  const [h, m] = hhmm(time).split(':').map(Number)
  const total = Math.min(23 * 60 + 59, Math.max(0, h * 60 + m + minutes))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** Zbiorcze przesunięcie godzin na wybranych dniach. */
export function shiftDays(entries: DraftEntry[], days: number[], minutes: number): DraftEntry[] {
  return entries.map(e => (days.includes(e.day_of_week) ? { ...e, time: shiftTime(e.time, minutes) } : e))
}

/** Zbiorcze usunięcie wszystkich pozycji z wybranych dni. */
export function clearDays(entries: DraftEntry[], days: number[]): DraftEntry[] {
  return entries.filter(e => !days.includes(e.day_of_week))
}

/** Zbiorcza zmiana trybu (np. „cała niedziela bez punktów”). */
export function setModeForDays(entries: DraftEntry[], days: number[], mode: ServiceMode): DraftEntry[] {
  return entries.map(e => (days.includes(e.day_of_week) ? { ...e, service_mode: mode } : e))
}

/** Kopiuje pozycje jednego dnia na inne dni (zastępując ich zawartość). */
export function copyDay(entries: DraftEntry[], source: number, targets: number[]): DraftEntry[] {
  const src = entries.filter(e => e.day_of_week === source)
  const kept = entries.filter(e => !targets.includes(e.day_of_week) || e.day_of_week === source)
  const copies = targets
    .filter(t => t !== source)
    .flatMap(t => src.map(e => ({ ...e, id: null, key: draftKey(), day_of_week: t, base_template_id: null })))
  return sortDraft([...kept, ...copies])
}

/** Szkic okresu wypełniony stałym rozkładem dla wybranych dni (pozycje pamiętają, co zastępują). */
export function draftFromTemplates(templates: RozkladEntry[], days: number[]): DraftEntry[] {
  return sortDraft(
    templates
      .filter(t => days.includes(t.day_of_week))
      .map(t => ({
        id: null, key: draftKey(), day_of_week: t.day_of_week, time: hhmm(t.time), label: t.label,
        category: t.category, service_mode: t.service_mode, base_template_id: t.id,
      })),
  )
}

export function sortDraft(entries: DraftEntry[]): DraftEntry[] {
  const order = (d: number) => (d === 0 ? 7 : d) // poniedziałek pierwszy
  return [...entries].sort((a, b) => order(a.day_of_week) - order(b.day_of_week) || hhmm(a.time).localeCompare(hhmm(b.time)))
}

/** Błędy szkicu: zła godzina, dwie pozycje o tej samej porze danego dnia. */
export function draftErrors(entries: DraftEntry[]): string[] {
  const errs: string[] = []
  const seen = new Set<string>()
  for (const e of entries) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm(e.time))) errs.push(`Niepoprawna godzina: ${e.time}`)
    const k = `${e.day_of_week}_${hhmm(e.time)}`
    if (seen.has(k)) errs.push(`Dwie pozycje o ${hhmm(e.time)} tego samego dnia`)
    seen.add(k)
  }
  return [...new Set(errs)]
}
