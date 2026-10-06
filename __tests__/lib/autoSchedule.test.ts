import { AutoMember, AutoService, proposalLoad, proposeSchedule } from '../../lib/autoSchedule'

const svc = (key: string, date: string, time: string, extra: Partial<AutoService> = {}): AutoService =>
  ({ key, date, time, title: 'Msza', category: 'msza', people: [], sunday: new Date(date + 'T12:00:00').getDay() === 0, ...extra })
const mem = (id: string, recent = 0, regular?: string[]): AutoMember => ({ id, name: id, recent, regular })
const opts = { targets: { weekday: 1, sunday: 2, devotion: 1 }, maxPerWeek: 2 }

// tydzień 2026-10-05 (pn) – 2026-10-11 (nd)
const week = [
  svc('pn', '2026-10-05', '18:00'), svc('wt', '2026-10-06', '18:00'), svc('sr', '2026-10-07', '18:00'),
  svc('cz', '2026-10-08', '18:00'), svc('pt', '2026-10-09', '18:00'), svc('sb', '2026-10-10', '18:00'),
  svc('nd10', '2026-10-11', '10:00'), svc('nd12', '2026-10-11', '12:00'),
]

describe('proposeSchedule', () => {
  it('fills every gap up to target and spreads evenly', () => {
    const members = ['a', 'b', 'c', 'd', 'e'].map(id => mem(id))
    const p = proposeSchedule(week, members, opts)
    const bySvc = Object.fromEntries(p.map(x => [x.serviceKey, x.memberIds]))
    expect(bySvc.pn).toHaveLength(1)
    expect(bySvc.nd10).toHaveLength(2)
    const load = [...proposalLoad(p).values()]
    expect(load.reduce((s, n) => s + n, 0)).toBe(10) // 6×1 + 2×2
    expect(Math.max(...load) - Math.min(...load)).toBeLessThanOrEqual(1)
  })

  it('prefers members with fewer recent services', () => {
    const p = proposeSchedule([svc('x', '2026-10-06', '18:00')], [mem('busy', 8), mem('fresh', 1)], opts)
    expect(p[0].memberIds).toEqual(['fresh'])
  })

  it('keeps existing people and only fills the rest', () => {
    const p = proposeSchedule([svc('nd', '2026-10-11', '10:00', { people: ['a'] })], [mem('a'), mem('b')], opts)
    expect(p[0].memberIds).toEqual(['b'])
  })

  it('never puts the same person twice at the same time (two churches)', () => {
    const p = proposeSchedule(
      [svc('k1', '2026-10-11', '10:00'), svc('k2', '2026-10-11', '10:00')],
      [mem('a'), mem('b'), mem('c'), mem('d')], opts)
    const all = p.flatMap(x => x.memberIds)
    expect(new Set(all).size).toBe(all.length)
  })

  it('respects weekly cap including existing assignments', () => {
    const existing = svc('wt', '2026-10-06', '18:00', { people: ['a'] })
    const p = proposeSchedule([existing, svc('cz', '2026-10-08', '18:00'), svc('sb', '2026-10-10', '18:00')], [mem('a')], { ...opts, maxPerWeek: 2 })
    expect(proposalLoad(p).get('a')).toBe(1) // 1 istniejąca + 1 nowa = limit 2
  })

  it('regular weekday/time gets a small preference', () => {
    const p = proposeSchedule([svc('wt', '2026-10-06', '18:00')], [mem('a', 1), mem('b', 1, ['2_18:00'])], opts)
    expect(p[0].memberIds).toEqual(['b'])
  })

  it('devotions use their own target', () => {
    const p = proposeSchedule([svc('r', '2026-10-06', '17:30', { category: 'nabozenstwo' })], [mem('a'), mem('b')], { ...opts, targets: { ...opts.targets, devotion: 0 } })
    expect(p).toEqual([])
  })

  it('is deterministic', () => {
    const members = ['e', 'd', 'c', 'b', 'a'].map(id => mem(id))
    expect(proposeSchedule(week, members, opts)).toEqual(proposeSchedule(week, [...members].reverse(), opts))
  })
})
