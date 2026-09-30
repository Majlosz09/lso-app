import {
  effectiveMode, legacyMode, parishMethods, parishPrimary, selfMethods, selfPrimary, toggleMethod,
} from '../../lib/attendance'

describe('attendance methods', () => {
  it('falls back to legacy attendance_mode before migration', () => {
    const p = { attendance_mode: 'gps' as const }
    expect(parishMethods(p)).toEqual(['gps'])
    expect(parishPrimary(p)).toBe('gps')
    expect(selfPrimary(p)).toBe('gps')
  })

  it('reads new columns, ordered, ignoring unknown values', () => {
    const p = { attendance_mode: 'qr' as const, attendance_methods: ['admin', 'button', 'qr', 'x'], attendance_primary: 'button' }
    expect(parishMethods(p)).toEqual(['qr', 'button', 'admin'])
    expect(parishPrimary(p)).toBe('button')
    expect(selfMethods(p)).toEqual(['qr', 'button'])
  })

  it('primary "admin" with self methods → first self method is used for check-in', () => {
    const p = { attendance_methods: ['admin', 'gps'], attendance_primary: 'admin' }
    expect(selfPrimary(p)).toBe('gps')
    expect(effectiveMode(p)).toBe('self')
  })

  it('only admin → no self check-in', () => {
    const p = { attendance_methods: ['admin'], attendance_primary: 'admin' }
    expect(selfPrimary(p)).toBeNull()
    expect(effectiveMode(p)).toBe('admin')
  })

  it('toggle keeps at least one method and a valid primary', () => {
    expect(toggleMethod(['qr'], 'qr', 'qr').error).toBe('Zostaw włączoną co najmniej jedną metodę')
    expect(toggleMethod(['qr', 'gps'], 'qr', 'qr')).toEqual({ methods: ['gps'], primary: 'gps' })
    expect(toggleMethod(['gps'], 'gps', 'qr')).toEqual({ methods: ['qr', 'gps'], primary: 'gps' })
  })

  it('legacyMode mirrors the DB trigger', () => {
    expect(legacyMode(['admin'], 'admin')).toBe('admin')
    expect(legacyMode(['qr', 'admin'], 'admin')).toBe('qr')
    expect(legacyMode(['qr', 'button'], 'button')).toBe('button')
  })
})
