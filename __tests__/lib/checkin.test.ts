import { validateParishQr, buildParishQrValue, validateGps } from '../../lib/checkin'

describe('validateParishQr', () => {
  it('returns true for matching parishId', () => {
    expect(validateParishQr('lso-checkin:abc123', 'abc123')).toBe(true)
  })

  it('returns false for different parishId', () => {
    expect(validateParishQr('lso-checkin:abc123', 'xyz999')).toBe(false)
  })

  it('returns false for malformed QR value', () => {
    expect(validateParishQr('random-string', 'abc123')).toBe(false)
  })

  it('returns false for empty strings', () => {
    expect(validateParishQr('', '')).toBe(false)
  })
})

describe('buildParishQrValue', () => {
  it('builds correct QR string with parishId', () => {
    expect(buildParishQrValue('abc123')).toBe('lso-checkin:abc123')
  })

  it('round-trips correctly with validateParishQr', () => {
    const parishId = 'test-parish-99'
    const qr = buildParishQrValue(parishId)
    expect(validateParishQr(qr, parishId)).toBe(true)
  })
})

import * as Location from 'expo-location'

describe('validateGps', () => {
  it('returns error when GPS times out after 15s', async () => {
    jest.useFakeTimers()
    try {
      ;(Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' })
      ;(Location.getCurrentPositionAsync as jest.Mock).mockReturnValue(new Promise(() => {}))

      const resultPromise = validateGps({ parishLat: 0, parishLng: 0, parishRadius: 100 })
      await jest.advanceTimersByTimeAsync(15_000)
      const result = await resultPromise

      expect(result.success).toBe(false)
      expect((result as any).message).toContain('15s')
    } finally {
      jest.useRealTimers()
    }
  }, 30000)
})
