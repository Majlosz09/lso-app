import { isCheckInWindowOpen, isPast, localDateStr } from './dates'
import type { Service } from '../hooks/useServices'
import type { ServiceMode } from './massSchedule'

export type ServiceAvailability = {
  /** można potwierdzić obecność teraz (okno −30/+90 min) */
  canCheckIn: boolean
  /** okno otwarte, ale obecność zaznacza opiekun */
  adminMarks: boolean
  canSignUp: boolean
  canUnsign: boolean
  /** „Nie mogę być” — zgłoszenie nieobecności */
  canReportAbsence: boolean
  /** prośba o zamianę z konkretną osobą (N4) */
  canSwap: boolean
}

/**
 * Jakie akcje ma ministrant przy służbie — według trybu służby (opiekun ustawia w rozkładzie / grafiku):
 * - none: bez akcji (bez zapisów, obecności i punktów),
 * - w oknie meldowania „Obecny” (także bez przydziału — punkty jak za Mszę dodatkową / nabożeństwo),
 * - signup: poza oknem zapis / wypis; assigned: obsadę ustala opiekun,
 * - nieobecność / zamiana: własny przydział, przed oknem, jeszcze niezgłoszona.
 */
export function serviceAvailability(
  s: Pick<Service, 'date' | 'time' | 'category' | 'mine' | 'attended'> & { serviceMode?: ServiceMode },
  attendanceMode: string,
  now: Date = new Date(),
): ServiceAvailability {
  const none: ServiceAvailability = { canCheckIn: false, adminMarks: false, canSignUp: false, canUnsign: false, canReportAbsence: false, canSwap: false }
  const serviceMode = s.serviceMode ?? 'signup'
  if (s.attended || serviceMode === 'none') return none

  const windowOpen = isCheckInWindowOpen(s.date, s.time, now)
  const past = isPast(s.date, s.time, now)
  const status = s.mine?.status
  const adminMode = attendanceMode === 'admin'

  const result = { ...none }
  if (windowOpen) {
    if (adminMode) result.adminMarks = s.category !== 'msza' || !!s.mine
    else result.canCheckIn = true
  } else if (!past && serviceMode === 'signup') {
    if (s.mine && (!status || status === 'assigned')) result.canUnsign = true
    if (!s.mine) result.canSignUp = true
  }
  result.canReportAbsence = !!s.mine && !windowOpen && !past && !['excused', 'absent', 'confirmed', 'present'].includes(status ?? '')
  result.canSwap = !!s.mine && !windowOpen && !past && (!status || status === 'assigned')
  return result
}

/** Zapis do frekwencji (jak w bazie: rate_status). */
export type RateRow = { status: string; date: string; time?: string | null; serviceMode?: string | null }

/**
 * Jak zapis liczy się do frekwencji — ta sama reguła co funkcja `rate_status` w bazie (raport miesięczny,
 * ścieżka formacji): obecny = obecność; nieobecny albo zapisany, którego po zamknięciu meldowania
 * (90 min po rozpoczęciu) nikt nie odhaczył = nieobecność; przyjęte usprawiedliwienie, czekające zgłoszenie,
 * zamiana i służby bez obecności — nie liczą się wcale.
 */
export function rateStatus(r: RateRow, now: Date = new Date()): 'present' | 'absent' | null {
  if (r.serviceMode === 'none') return null
  if (r.status === 'present') return 'present'
  if (r.status === 'absent') return 'absent'
  if (r.status !== 'assigned') return null
  const ended = r.time
    ? new Date(`${r.date}T${r.time.slice(0, 5)}:00`).getTime() + 95 * 60_000 < now.getTime()
    : r.date < localDateStr(now)
  return ended ? 'absent' : null
}

/** Frekwencja w %: obecny ÷ (obecny + nieobecny + nieodhaczony po służbie). null = brak danych. */
export function attendanceRate(rows: RateRow[], now: Date = new Date()): number | null {
  const counted = rows.map(r => rateStatus(r, now)).filter(Boolean)
  if (counted.length === 0) return null
  return Math.round((counted.filter(s => s === 'present').length / counted.length) * 100)
}
