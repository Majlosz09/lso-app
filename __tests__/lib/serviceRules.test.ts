import { serviceAvailability } from '../../lib/serviceRules'
import { absenceReasonText } from '../../components/services/useServiceActions'
import { pl, relativeDay, shortDate, weekDays } from '../../lib/dates'

// Wtorek 29.09.2026, 12:00
const NOW = new Date(2026, 8, 29, 12, 0)
const base = { category: 'msza' as const, mine: null, attended: false }
const mine = (status: any = 'assigned') => ({ id: 'a1', status, absence_reason: null, admin_note: null })

describe('serviceAvailability', () => {
  it('future mass without assignment → sign up only', () => {
    const r = serviceAvailability({ ...base, date: '2026-09-30', time: '18:00' }, 'button', NOW)
    expect(r).toEqual({ canCheckIn: false, adminMarks: false, canSignUp: true, canUnsign: false, canReportAbsence: false, canSwap: false })
  })

  it('future own mass → unsign + report absence', () => {
    const r = serviceAvailability({ ...base, mine: mine(), date: '2026-09-30', time: '18:00' }, 'button', NOW)
    expect(r.canUnsign).toBe(true)
    expect(r.canReportAbsence).toBe(true)
    expect(r.canSignUp).toBe(false)
  })

  it('swap: own assigned future service, not in window, not after excuse', () => {
    expect(serviceAvailability({ ...base, mine: mine(), date: '2026-09-30', time: '18:00' }, 'button', NOW).canSwap).toBe(true)
    expect(serviceAvailability({ ...base, mine: mine('excused'), date: '2026-09-30', time: '18:00' }, 'button', NOW).canSwap).toBe(false)
    expect(serviceAvailability({ ...base, mine: mine(), date: '2026-09-29', time: '12:25' }, 'button', NOW).canSwap).toBe(false)
    expect(serviceAvailability({ ...base, date: '2026-09-30', time: '18:00' }, 'button', NOW).canSwap).toBe(false)
  })

  it('check-in window opens 30 min before', () => {
    const r = serviceAvailability({ ...base, date: '2026-09-29', time: '12:25' }, 'button', NOW)
    expect(r.canCheckIn).toBe(true)
    expect(r.canReportAbsence).toBe(false)
    const early = serviceAvailability({ ...base, date: '2026-09-29', time: '12:45' }, 'button', NOW)
    expect(early.canCheckIn).toBe(false)
  })

  it('admin attendance mode → no self check-in', () => {
    const r = serviceAvailability({ ...base, mine: mine(), date: '2026-09-29', time: '12:10' }, 'admin', NOW)
    expect(r.canCheckIn).toBe(false)
    expect(r.adminMarks).toBe(true)
  })

  it('service mode: assigned → check-in but no sign up; none → nothing; attended → nothing', () => {
    expect(serviceAvailability({ ...base, serviceMode: 'assigned', date: '2026-10-04', time: '10:00' }, 'button', NOW).canSignUp).toBe(false)
    expect(serviceAvailability({ ...base, serviceMode: 'assigned', date: '2026-09-29', time: '12:10' }, 'button', NOW).canCheckIn).toBe(true)
    expect(serviceAvailability({ ...base, serviceMode: 'none', date: '2026-09-29', time: '12:10' }, 'button', NOW).canCheckIn).toBe(false)
    expect(serviceAvailability({ ...base, serviceMode: 'signup', date: '2026-10-04', time: '10:00' }, 'button', NOW).canSignUp).toBe(true)
    const att = serviceAvailability({ ...base, attended: true, date: '2026-09-29', time: '12:10' }, 'button', NOW)
    expect(att.canCheckIn).toBe(false)
  })

  it('past service → nothing to sign up for', () => {
    const r = serviceAvailability({ ...base, date: '2026-09-28', time: '18:00' }, 'button', NOW)
    expect(r.canSignUp).toBe(false)
  })

  it('devotion (nabożeństwo) → check-in only in window, no sign up', () => {
    const r = serviceAvailability({ ...base, category: 'nabozenstwo', serviceMode: 'assigned', date: '2026-09-30', time: '17:30' }, 'button', NOW)
    expect(r.canSignUp).toBe(false)
  })

  it('already excused → no second absence report', () => {
    const r = serviceAvailability({ ...base, mine: mine('excused'), date: '2026-09-30', time: '18:00' }, 'button', NOW)
    expect(r.canReportAbsence).toBe(false)
    expect(r.canUnsign).toBe(false)
  })
})

describe('absenceReasonText', () => {
  it('joins reason and details', () => {
    expect(absenceReasonText('Choroba', '')).toBe('Choroba')
    expect(absenceReasonText('Choroba', ' angina ')).toBe('Choroba — angina')
    expect(absenceReasonText('Inne', 'pogrzeb dziadka')).toBe('pogrzeb dziadka')
    expect(absenceReasonText('Inne', '')).toBe('')
  })
})

describe('dates', () => {
  it('weekDays starts on Monday (local time)', () => {
    expect(weekDays(0, NOW)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
    expect(weekDays(0, new Date(2026, 9, 4, 23, 30))[0]).toBe('2026-09-28') // niedziela wieczorem
  })
  it('labels', () => {
    expect(shortDate('2026-09-29')).toBe('29 IX')
    expect(relativeDay('2026-09-30', '2026-09-29')).toBe('jutro')
    expect(pl(5, ['punkt', 'punkty', 'punktów'])).toBe('punktów')
    expect(pl(22, ['punkt', 'punkty', 'punktów'])).toBe('punkty')
  })
})

describe('attendanceRate', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { attendanceRate } = require('../../app/(tabs)/member-profile')
  it('present / counted past services', () => {
    expect(attendanceRate(['present', 'present', 'absent', 'assigned'])).toBe(67)
    expect(attendanceRate(['assigned'])).toBeNull()
    expect(attendanceRate(['present', 'excused'])).toBe(50)
  })
})
