import {
  computeAutoStatusBadges,
  computeAutoPermanentBadges,
} from '../../lib/badges'

// helper: tworzy assignment z datą N dni temu
function makeA(daysAgo: number, status: string) {
  const d = new Date('2026-05-27T00:00:00Z')
  d.setDate(d.getDate() - daysAgo)
  return { status, scheduleDate: d.toISOString().split('T')[0] }
}

const NOW = new Date('2026-05-27T00:00:00Z')

describe('computeAutoStatusBadges', () => {

  describe('regularny (≥80% w ostatnich 30 dniach)', () => {
    it('aktywna gdy ≥80% present', () => {
      const a = [
        ...Array(8).fill(0).map((_, i) => makeA(i + 1, 'present')),
        ...Array(2).fill(0).map((_, i) => makeA(i + 9, 'absent')),
      ]
      expect(computeAutoStatusBadges(a, NOW).has('regularny')).toBe(true)
    })

    it('nieaktywna gdy <80% present', () => {
      const a = [
        ...Array(7).fill(0).map((_, i) => makeA(i + 1, 'present')),
        ...Array(3).fill(0).map((_, i) => makeA(i + 8, 'absent')),
      ]
      expect(computeAutoStatusBadges(a, NOW).has('regularny')).toBe(false)
    })

    it('ignoruje assignments starsze niż 30 dni', () => {
      // 1 present + 1 absent w ostatnich 30 dniach = 50%, ale 10 present starszych
      const a = [
        makeA(5, 'present'),
        makeA(10, 'absent'),
        ...Array(10).fill(0).map((_, i) => makeA(35 + i, 'present')),
      ]
      expect(computeAutoStatusBadges(a, NOW).has('regularny')).toBe(false)
    })

    it('nieaktywna gdy brak assignments w oknie', () => {
      const a = [makeA(40, 'present'), makeA(50, 'present')]
      expect(computeAutoStatusBadges(a, NOW).has('regularny')).toBe(false)
    })
  })

  describe('seria (kolejne non-absent)', () => {
    it('seria_5 przy streak = 5', () => {
      const a = Array(5).fill(0).map((_, i) => makeA(i + 1, 'present'))
      const r = computeAutoStatusBadges(a, NOW)
      expect(r.has('seria_5')).toBe(true)
      expect(r.has('seria_10')).toBe(false)
    })

    it('wszystkie seria nieaktywne gdy 1 absent na początku', () => {
      const a = [
        makeA(1, 'absent'),
        ...Array(20).fill(0).map((_, i) => makeA(i + 2, 'present')),
      ]
      const r = computeAutoStatusBadges(a, NOW)
      expect(r.has('seria_5')).toBe(false)
      expect(r.has('seria_10')).toBe(false)
      expect(r.has('seria_15')).toBe(false)
      expect(r.has('seria_20')).toBe(false)
    })

    it('tylko seria_5 przy streak = 7', () => {
      const a = Array(7).fill(0).map((_, i) => makeA(i + 1, 'present'))
      const r = computeAutoStatusBadges(a, NOW)
      expect(r.has('seria_5')).toBe(true)
      expect(r.has('seria_10')).toBe(false)
    })

    it('seria_5 i seria_10 przy streak = 10', () => {
      const a = Array(10).fill(0).map((_, i) => makeA(i + 1, 'present'))
      const r = computeAutoStatusBadges(a, NOW)
      expect(r.has('seria_5')).toBe(true)
      expect(r.has('seria_10')).toBe(true)
      expect(r.has('seria_15')).toBe(false)
    })

    it('seria_5, seria_10, seria_15, seria_20 przy streak = 20', () => {
      const a = Array(20).fill(0).map((_, i) => makeA(i + 1, 'present'))
      const r = computeAutoStatusBadges(a, NOW)
      expect(r.has('seria_5')).toBe(true)
      expect(r.has('seria_10')).toBe(true)
      expect(r.has('seria_15')).toBe(true)
      expect(r.has('seria_20')).toBe(true)
    })

    it('liczy confirmed i assigned jako non-absent', () => {
      const a = [
        ...Array(3).fill(0).map((_, i) => makeA(i + 1, 'confirmed')),
        ...Array(2).fill(0).map((_, i) => makeA(i + 4, 'assigned')),
      ]
      expect(computeAutoStatusBadges(a, NOW).has('seria_5')).toBe(true)
    })
  })
})

describe('computeAutoPermanentBadges', () => {

  describe('weteran', () => {
    it('weteran_100 przy dokładnie 100 służbach', () => {
      const r = computeAutoPermanentBadges(100, 0, null)
      expect(r.has('weteran_100')).toBe(true)
      expect(r.has('weteran_250')).toBe(false)
    })

    it('brak weteran_100 przy 99 służbach', () => {
      expect(computeAutoPermanentBadges(99, 0, null).has('weteran_100')).toBe(false)
    })

    it('weteran_100 i weteran_250 przy 250 służbach', () => {
      const r = computeAutoPermanentBadges(250, 0, null)
      expect(r.has('weteran_100')).toBe(true)
      expect(r.has('weteran_250')).toBe(true)
      expect(r.has('weteran_500')).toBe(false)
    })

    it('wszystkie weteran przy 500 służbach', () => {
      const r = computeAutoPermanentBadges(500, 0, null)
      expect(r.has('weteran_100')).toBe(true)
      expect(r.has('weteran_250')).toBe(true)
      expect(r.has('weteran_500')).toBe(true)
    })
  })

  describe('rocznica', () => {
    it('rocznica_1 przy 13 miesiącach', () => {
      const r = computeAutoPermanentBadges(0, 13, null)
      expect(r.has('rocznica_1')).toBe(true)
      expect(r.has('rocznica_2')).toBe(false)
    })

    it('brak rocznica_1 przy 11 miesiącach', () => {
      expect(computeAutoPermanentBadges(0, 11, null).has('rocznica_1')).toBe(false)
    })

    it('rocznica_1 + rocznica_2 + rocznica_5 przy 60 miesiącach', () => {
      const r = computeAutoPermanentBadges(0, 60, null)
      expect(r.has('rocznica_1')).toBe(true)
      expect(r.has('rocznica_2')).toBe(true)
      expect(r.has('rocznica_5')).toBe(true)
    })
  })

  describe('top3', () => {
    it('top3 przy miejscu 1', () => {
      expect(computeAutoPermanentBadges(0, 0, 1).has('top3')).toBe(true)
    })

    it('top3 przy miejscu 3', () => {
      expect(computeAutoPermanentBadges(0, 0, 3).has('top3')).toBe(true)
    })

    it('brak top3 przy miejscu 4', () => {
      expect(computeAutoPermanentBadges(0, 0, 4).has('top3')).toBe(false)
    })

    it('brak top3 gdy nie w rankingu', () => {
      expect(computeAutoPermanentBadges(0, 0, null).has('top3')).toBe(false)
    })
  })
})
