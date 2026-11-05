jest.mock('@react-native-async-storage/async-storage', () => ({}))
import { servicesCacheKey, staleServicesCacheKeys } from '../../lib/servicesCache'

describe('staleServicesCacheKeys', () => {
  const me = 'p1'
  const today = '2026-11-05'
  it('zostawia bieżące zakresy tej osoby, usuwa minione, cudze i obce formaty', () => {
    const keep = [servicesCacheKey(me, '2026-11-03', '2026-11-12'), servicesCacheKey(me, '2026-11-05', '2026-11-05')]
    const drop = [
      servicesCacheKey(me, '2026-10-01', '2026-10-07'),
      servicesCacheKey('p2', '2026-11-03', '2026-11-12'),
      'services-cache:v0:p1:2026-11-03:2026-11-12',
    ]
    const other = ['supabase.auth.token', 'checkin-queue']
    expect(staleServicesCacheKeys([...keep, ...drop, ...other], me, today).sort()).toEqual([...drop].sort())
  })
})
