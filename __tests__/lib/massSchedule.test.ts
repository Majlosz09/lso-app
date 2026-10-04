import {
  MassPeriod, PeriodEntry, RozkladEntry, activePeriod, clearDays, copyDay, draftErrors, draftFromTemplates,
  massSlots, periodCoversDate, setModeForDays, shiftDays, shiftTime,
} from '../../lib/massSchedule'

// Stały rozkład: pn–sb 17:30 i 18:00, niedziela 10:00 (grafik opiekuna)
const T = (id: string, day: number, time: string, extra: Partial<RozkladEntry> = {}): RozkladEntry =>
  ({ id, day_of_week: day, time: time + ':00', label: null, category: 'msza', service_mode: 'signup', ...extra })
const templates: RozkladEntry[] = [
  ...[1, 2, 3, 4, 5, 6].flatMap(d => [T(`a${d}`, d, '17:30'), T(`b${d}`, d, '18:00')]),
  T('n10', 0, '10:00', { service_mode: 'assigned' }),
]

// Październik (co roku, pn–sb): 17:00 Msza (zastępuje 17:30), 17:30 różaniec, 18:00 Msza
const october: MassPeriod = {
  id: 'p-oct', name: 'Październik', date_from: '2026-10-01', date_to: '2026-10-31',
  repeat_yearly: true, days_of_week: [1, 2, 3, 4, 5, 6], created_at: '2026-09-01T00:00:00Z',
}
const octEntries: PeriodEntry[] = [1, 2, 3, 4, 5, 6].flatMap(d => [
  { ...T(`o17-${d}`, d, '17:00'), period_id: 'p-oct', base_template_id: `a${d}` },
  { ...T(`or-${d}`, d, '17:30', { category: 'nabozenstwo', label: 'Różaniec' }), period_id: 'p-oct', base_template_id: null },
  { ...T(`o18-${d}`, d, '18:00'), period_id: 'p-oct', base_template_id: `b${d}` },
])

describe('periodCoversDate', () => {
  it('fixed range', () => {
    const p = { date_from: '2026-10-01', date_to: '2026-10-31', repeat_yearly: false }
    expect(periodCoversDate(p, '2026-10-15')).toBe(true)
    expect(periodCoversDate(p, '2027-10-15')).toBe(false)
  })
  it('yearly range repeats in later years', () => {
    expect(periodCoversDate(october, '2028-10-02')).toBe(true)
    expect(periodCoversDate(october, '2028-11-01')).toBe(false)
  })
  it('yearly range across New Year', () => {
    const p = { date_from: '2026-12-01', date_to: '2027-01-06', repeat_yearly: true }
    expect(periodCoversDate(p, '2030-12-24')).toBe(true)
    expect(periodCoversDate(p, '2031-01-03')).toBe(true)
    expect(periodCoversDate(p, '2031-01-07')).toBe(false)
  })
})

describe('massSlots', () => {
  it('outside a period → base schedule', () => {
    const s = massSlots(templates, [october], octEntries, '2026-09-29', '2026-09-29') // wtorek
    expect(s.map(x => x.time)).toEqual(['17:30', '18:00'])
    expect(s.every(x => x.period_id === null && x.origin_id === x.entry_id)).toBe(true)
  })

  it('inside October → period replaces base, rosary is a nabożeństwo', () => {
    const s = massSlots(templates, [october], octEntries, '2026-10-06', '2026-10-06') // wtorek
    expect(s.map(x => `${x.time} ${x.category}`)).toEqual(['17:00 msza', '17:30 nabozenstwo', '18:00 msza'])
    // 17:00 wywodzi się ze stałej 17:30 → stałe zapisy pójdą za nią
    expect(s[0].origin_id).toBe('a2')
    expect(s[1].origin_id).toBe('or-2')
  })

  it('period does not touch days outside its days_of_week (Sunday stays)', () => {
    const s = massSlots(templates, [october], octEntries, '2026-10-04', '2026-10-04') // niedziela
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ time: '10:00', service_mode: 'assigned', period_id: null })
  })

  it('empty period = mass cancelled on those days', () => {
    const retreat: MassPeriod = { ...october, id: 'p-r', date_from: '2026-10-07', date_to: '2026-10-07', repeat_yearly: false, created_at: '2026-09-02T00:00:00Z' }
    const s = massSlots(templates, [october, retreat], octEntries, '2026-10-06', '2026-10-08')
    expect(s.filter(x => x.date === '2026-10-07')).toHaveLength(0)
    expect(s.filter(x => x.date === '2026-10-06')).toHaveLength(3)
  })
})

describe('activePeriod', () => {
  it('shorter period wins over longer one', () => {
    const day: MassPeriod = { ...october, id: 'p-day', date_from: '2026-10-10', date_to: '2026-10-10', repeat_yearly: false, created_at: '2026-01-01T00:00:00Z' }
    expect(activePeriod([october, day], '2026-10-10')?.id).toBe('p-day')
  })
  it('equal length → newest wins', () => {
    const other: MassPeriod = { ...october, id: 'p-new', created_at: '2026-09-20T00:00:00Z' }
    expect(activePeriod([october, other], '2026-10-10')?.id).toBe('p-new')
  })
})

describe('draft tools', () => {
  const draft = draftFromTemplates(templates, [1, 2])
  it('draft from base keeps link to replaced entry', () => {
    expect(draft.map(d => `${d.day_of_week} ${d.time} ${d.base_template_id}`)).toEqual(['1 17:30 a1', '1 18:00 b1', '2 17:30 a2', '2 18:00 b2'])
  })
  it('shift all hours on chosen days', () => {
    const s = shiftDays(draft, [1], -30)
    expect(s.filter(d => d.day_of_week === 1).map(d => d.time)).toEqual(['17:00', '17:30'])
    expect(s.filter(d => d.day_of_week === 2).map(d => d.time)).toEqual(['17:30', '18:00'])
    expect(shiftTime('00:10', -30)).toBe('00:00')
  })
  it('clear days, set mode, copy day', () => {
    expect(clearDays(draft, [1]).every(d => d.day_of_week === 2)).toBe(true)
    expect(setModeForDays(draft, [2], 'none').filter(d => d.day_of_week === 2).every(d => d.service_mode === 'none')).toBe(true)
    const c = copyDay(clearDays(draft, [2]), 1, [2, 3])
    expect(c.filter(d => d.day_of_week === 3).map(d => d.time)).toEqual(['17:30', '18:00'])
    expect(c.filter(d => d.day_of_week === 3).every(d => d.id === null)).toBe(true)
  })
  it('detects duplicate times and bad format', () => {
    const dup = shiftDays(draft, [1], 30) // 17:30→18:00 koliduje z 18:00→18:30? nie — obie się przesuwają
    expect(draftErrors(dup)).toEqual([])
    expect(draftErrors([...draft, { ...draft[0], key: 'x' }])).toEqual(['Dwie pozycje o 17:30 tego samego dnia'])
    expect(draftErrors([{ ...draft[0], time: '25:00' }])).toEqual(['Niepoprawna godzina: 25:00'])
  })
})
