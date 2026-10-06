import { cardPlacement, tourRoleFor, tourSteps, usableRect } from '../../lib/tour'

describe('tour', () => {
  it('role', () => {
    expect(tourRoleFor({ role: 'admin' })).toBe('admin')
    expect(tourRoleFor({ role: 'member', is_admin: true })).toBe('admin')
    expect(tourRoleFor({ role: 'member', is_helper: true })).toBe('helper')
    expect(tourRoleFor({ role: 'member' })).toBe('member')
    expect(tourRoleFor({ role: 'parent', is_helper: true })).toBe('parent')
  })
  it('every role starts with a welcome, ends with done, and shows the profile (restart place)', () => {
    for (const r of ['admin', 'helper', 'member', 'parent'] as const) {
      const s = tourSteps(r)
      expect(s[0].target).toBeUndefined()
      expect(s[s.length - 1].title).toBe('Gotowe!')
      expect(s.some(x => x.target === 'profile')).toBe(true)
      for (const x of s) expect(x.route).toMatch(/^\//)
    }
    expect(tourSteps('helper').some(x => x.target === 'helper:card')).toBe(true)
    expect(tourSteps('member').some(x => x.target === 'helper:card')).toBe(false)
  })
  it('routes stay inside the role area', () => {
    expect(tourSteps('admin').every(x => x.route!.startsWith('/(admin)'))).toBe(true)
    expect(tourSteps('member').every(x => x.route!.startsWith('/(tabs)'))).toBe(true)
    expect(tourSteps('parent').every(x => x.route!.startsWith('/(parent)'))).toBe(true)
  })
  it('usableRect rejects hidden / off-screen elements', () => {
    const win = { width: 400, height: 800 }
    expect(usableRect({ x: 10, y: 10, width: 100, height: 40 }, win)).toBe(true)
    expect(usableRect({ x: 0, y: 0, width: 0, height: 0 }, win)).toBe(false)
    expect(usableRect({ x: 10, y: 900, width: 100, height: 40 }, win)).toBe(false)
    expect(usableRect(null, win)).toBe(false)
  })
  it('card goes below a top element and above a bottom one, inside the window', () => {
    const win = { width: 400, height: 800 }, card = { width: 380, height: 200 }
    const top = cardPlacement({ x: 300, y: 20, width: 60, height: 40 }, win, card)
    expect(top.side).toBe('below')
    expect(top.top).toBeGreaterThanOrEqual(74)
    expect(top.left + top.width).toBeLessThanOrEqual(384)
    const bottom = cardPlacement({ x: 170, y: 740, width: 60, height: 50 }, win, card)
    expect(bottom.side).toBe('above')
    expect(bottom.top + 200).toBeLessThanOrEqual(740)
    // wysoka karta ustawień na desktopie → karta przewodnika obok
    const tall = cardPlacement({ x: 260, y: 90, width: 490, height: 750 }, { width: 1280, height: 860 }, card)
    expect(tall.side).toBe('right')
    expect(tall.left).toBeGreaterThanOrEqual(750)
    const center = cardPlacement(null, win, card)
    expect(center.left).toBeCloseTo((400 - 368) / 2)
  })
})
