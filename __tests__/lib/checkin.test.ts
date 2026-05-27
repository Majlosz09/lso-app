import { validateParishQr, buildParishQrValue } from '../../lib/checkin'

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
