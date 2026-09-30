import { isCheckInWindowOpen, isPast } from './dates'
import type { Service } from '../hooks/useServices'

export type ServiceAvailability = {
  /** można potwierdzić obecność teraz (okno −30/+90 min) */
  canCheckIn: boolean
  /** okno otwarte, ale obecność zaznacza opiekun */
  adminMarks: boolean
  canSignUp: boolean
  canUnsign: boolean
  /** „Nie mogę być” — zgłoszenie nieobecności */
  canReportAbsence: boolean
}

/**
 * Jakie akcje ma ministrant przy służbie — te same reguły co dotychczasowy ekran Dyżur:
 * - niedziela: bez akcji (Msze niedzielne obsługuje grafik parafii),
 * - Msza: w oknie meldowania „Obecny” (także bez przydziału), poza oknem zapis/wypis,
 * - nabożeństwo/zbiórka: tylko meldowanie w oknie,
 * - nieobecność: własny przydział, przed oknem, jeszcze niezgłoszona.
 */
export function serviceAvailability(
  s: Pick<Service, 'date' | 'time' | 'category' | 'mine' | 'attended'>,
  attendanceMode: string,
  now: Date = new Date(),
): ServiceAvailability {
  const none: ServiceAvailability = { canCheckIn: false, adminMarks: false, canSignUp: false, canUnsign: false, canReportAbsence: false }
  if (s.attended) return none
  const isSunday = new Date(s.date + 'T12:00:00').getDay() === 0
  if (isSunday) return none

  const windowOpen = isCheckInWindowOpen(s.date, s.time, now)
  const past = isPast(s.date, s.time, now)
  const status = s.mine?.status
  const adminMode = attendanceMode === 'admin'

  const result = { ...none }
  if (windowOpen) {
    if (adminMode) result.adminMarks = s.category !== 'msza' || !!s.mine
    else result.canCheckIn = true
  } else if (!past && s.category === 'msza') {
    if (s.mine && (!status || status === 'assigned')) result.canUnsign = true
    if (!s.mine) result.canSignUp = true
  }
  result.canReportAbsence = !!s.mine && !windowOpen && !past && !['excused', 'absent', 'confirmed', 'present'].includes(status ?? '')
  return result
}

/** Frekwencja w %: obecny / (obecny + nieobecny + usprawiedliwiony) na minionych służbach. */
export function attendanceRate(statuses: string[]): number | null {
  const counted = statuses.filter(s => ['present', 'absent', 'excused', 'confirmed'].includes(s))
  if (counted.length === 0) return null
  return Math.round((counted.filter(s => s === 'present').length / counted.length) * 100)
}
