import { builtInKeys, countRead, WIEDZA_DATA, wiedzaKey } from '../../lib/wiedza'

describe('wiedza read keys', () => {
  it('builds keys per category and in total', () => {
    const cat = WIEDZA_DATA[0]
    const keys = builtInKeys(cat.id)
    expect(keys.length).toBe(cat.sections.reduce((n, s) => n + s.items.length, 0))
    expect(keys[0]).toBe(wiedzaKey(cat.id, cat.sections[0].items[0].id))
    expect(builtInKeys().length).toBeGreaterThan(keys.length)
  })

  it('counts only listed keys', () => {
    const keys = builtInKeys(WIEDZA_DATA[0].id)
    const reads = new Set([keys[0], keys[1], 'inna/xyz'])
    expect(countRead(keys, reads)).toBe(2)
  })
})
