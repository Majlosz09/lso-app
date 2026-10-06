jest.mock('../../lib/supabase', () => ({ supabase: {} }))
import { termOfDay } from '../../components/services/DailyWordCard'

describe('termOfDay', () => {
  it('is stable within a day and changes the next day', () => {
    expect(termOfDay('2026-10-01')).toEqual(termOfDay('2026-10-01'))
    expect(termOfDay('2026-10-01').title).not.toBe(termOfDay('2026-10-02').title)
    expect(termOfDay('2026-10-01').route).toMatch(/^\/wiedza\//)
  })
})
