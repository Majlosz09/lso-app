import { computeParishStats } from '../../lib/statistics'
import { quickReason, QUICK_AMOUNTS } from '../../app/(admin)/(admin-tabs)/points'

const sch = (id: string, date: string, category: any = 'msza') => ({ id, date, category })
const asg = (profile_id: string, status: string, date: string, category: any = 'msza') =>
  ({ profile_id, status, schedule: { date, category } })

describe('computeParishStats', () => {
  const schedules = [sch('a', '2026-09-01'), sch('b', '2026-09-10'), sch('c', '2026-09-20', 'zbiorka')]
  const assignments = [
    asg('m1', 'present', '2026-09-01'),
    asg('m1', 'absent', '2026-09-10'),
    asg('m2', 'confirmed', '2026-09-10'),
    asg('m2', 'excused', '2026-09-20', 'zbiorka'), // czeka na decyzję — nie liczymy
  ]
  const points = [{ profile_id: 'm1', amount: 5 }, { profile_id: 'm1', amount: -2 }, { profile_id: 'm2', amount: 3 }]
  const s = computeParishStats('2026-09-01', '2026-09-30', schedules as any, assignments as any, points, { m1: 'Adam', m2: 'Bartek', m3: 'Cezary' })

  it('overall rate ignores pending excuses', () => {
    expect(s.present).toBe(2)
    expect(s.counted).toBe(3)
    expect(s.rate).toBe(67)
    expect(s.points).toBe(8) // tylko dodatnie
    expect(s.services).toBe(3)
  })

  it('per-member rate, members without services listed with null', () => {
    const byId = Object.fromEntries(s.members.map(m => [m.profile_id, m]))
    expect(byId.m1.rate).toBe(50)
    expect(byId.m2.rate).toBe(100)
    expect(byId.m3.rate).toBeNull()
    expect(s.members[0].profile_id).toBe('m2')
  })

  it('category share and weekly buckets', () => {
    expect(s.categories.find(k => k.category === 'msza')?.share).toBe(67)
    expect(s.weeks.length).toBeGreaterThan(0)
    expect(s.weeks.length).toBeLessThanOrEqual(8)
  })
})

describe('quick points', () => {
  it('amounts and reasons', () => {
    expect(QUICK_AMOUNTS).toEqual([1, 2, 5, -2])
    expect(quickReason(2)).toBe('Punkty od opiekuna')
    expect(quickReason(-2)).toBe('Kara od opiekuna')
  })
})
