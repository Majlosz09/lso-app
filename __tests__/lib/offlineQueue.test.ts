import { QueuedCheckIn, addToQueue, dropExpired, isNetworkError, queueKey } from '../../lib/offlineQueue'

const item = (over: Partial<QueuedCheckIn> = {}): QueuedCheckIn => ({
  key: queueKey('u1', '2026-10-05', '18:00', null), profileId: 'u1', date: '2026-10-05', time: '18:00', title: 'Msza',
  scheduleId: null, churchId: null, method: 'qr', clientTime: '2026-10-05T15:55:00.000Z', attempts: 0, ...over,
})

describe('offlineQueue', () => {
  it('recognises network errors, not server refusals', () => {
    expect(isNetworkError({ message: 'TypeError: Failed to fetch' })).toBe(true)
    expect(isNetworkError(new TypeError('Network request failed'))).toBe(true)
    expect(isNetworkError({ message: 'Load failed' })).toBe(true)
    expect(isNetworkError({ message: 'W tej parafii obecność zaznacza administrator' })).toBe(false)
    expect(isNetworkError({ message: 'Meldowanie poza czasem tej służby' })).toBe(false)
  })
  it('no duplicates of the same service', () => {
    const q = addToQueue(addToQueue([], item()), item({ clientTime: '2026-10-05T16:00:00.000Z' }))
    expect(q).toHaveLength(1)
    expect(addToQueue(q, item({ key: queueKey('u1', '2026-10-05', '18:00', 'k2'), churchId: 'k2' }))).toHaveLength(2)
  })
  it('drops items older than 48 h', () => {
    const { keep, expired } = dropExpired([item(), item({ key: 'old', clientTime: '2026-10-01T10:00:00.000Z' })], new Date('2026-10-06T10:00:00Z'))
    expect(keep.map(x => x.key)).toEqual([item().key])
    expect(expired.map(x => x.key)).toEqual(['old'])
  })
})
