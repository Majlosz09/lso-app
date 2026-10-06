import { CHALLENGE_PRESETS, challengeStatus, nextPresetDates, presetDates } from '../../lib/challenges'

const anchors = {
  2026: { advent_start: '2026-11-29', dec23: '2026-12-23', ash_wednesday: '2026-02-18', good_friday: '2026-04-03' },
  2027: { advent_start: '2027-11-28', dec23: '2027-12-23', ash_wednesday: '2027-02-10', good_friday: '2027-03-26' },
}
const preset = (k: string) => CHALLENGE_PRESETS.find(p => p.key === k)!

describe('challenges', () => {
  it('liturgical preset dates from anchors', () => {
    expect(presetDates(preset('roraty'), 2026, anchors[2026])).toEqual({ from: '2026-11-29', to: '2026-12-23' })
  })
  it('fixed-date preset', () => {
    expect(presetDates(preset('rozaniec'), 2026, {})).toEqual({ from: '2026-10-01', to: '2026-10-31' })
  })
  it('next edition: this year if not over, else next year', () => {
    expect(nextPresetDates(preset('roraty'), '2026-10-05', anchors)).toMatchObject({ from: '2026-11-29', year: 2026 })
    expect(nextPresetDates(preset('droga'), '2026-10-05', anchors)).toMatchObject({ from: '2027-02-10', to: '2027-03-26', year: 2027 })
    expect(nextPresetDates(preset('rozaniec'), '2026-10-05', anchors)).toMatchObject({ from: '2026-10-01', year: 2026 })
  })
  it('status', () => {
    const c = { date_from: '2026-10-01', date_to: '2026-10-31' }
    expect(challengeStatus(c, '2026-09-30')).toBe('upcoming')
    expect(challengeStatus(c, '2026-10-05')).toBe('active')
    expect(challengeStatus(c, '2026-11-01')).toBe('ended')
  })
})
