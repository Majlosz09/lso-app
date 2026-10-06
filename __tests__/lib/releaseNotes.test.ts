import { RELEASE_ID, releaseItems, shouldShowRelease } from '../../lib/releaseNotes'

const user = { id: 'u1', parish_id: 'p1', approved: true, onboarding_completed: true }

describe('releaseNotes', () => {
  it('shows once to existing users only', () => {
    expect(shouldShowRelease(user, null)).toBe(true)
    expect(shouldShowRelease(user, 'old-release')).toBe(true)
    expect(shouldShowRelease(user, RELEASE_ID)).toBe(false)
    // nowy użytkownik dostaje przewodnik, nie „Co nowego”
    expect(shouldShowRelease({ ...user, onboarding_completed: false }, null)).toBe(false)
    expect(shouldShowRelease({ ...user, approved: false }, null)).toBe(false)
    expect(shouldShowRelease({ ...user, parish_id: null }, null)).toBe(false)
    expect(shouldShowRelease(null, null)).toBe(false)
  })
  it('content per role', () => {
    expect(releaseItems('admin').some(i => i.title.startsWith('Rozkład Mszy'))).toBe(true)
    expect(releaseItems('member').some(i => i.title.startsWith('Rozkład Mszy'))).toBe(false)
    expect(releaseItems('helper').some(i => i.title === 'Pomocnik opiekuna')).toBe(true)
    expect(releaseItems('member').some(i => i.title === 'Pomocnik opiekuna')).toBe(false)
    expect(releaseItems('parent').some(i => i.title === 'Dyżury dzieci')).toBe(true)
    for (const r of ['admin', 'helper', 'member', 'parent'] as const) {
      expect(releaseItems(r)[0].title).toBe('Nowy wygląd')
      expect(new Set(releaseItems(r).map(i => i.title)).size).toBe(releaseItems(r).length)
    }
  })
})
