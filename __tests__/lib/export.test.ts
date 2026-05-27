import { buildExportData, generateCSV, generateHTML, ExportData } from '../../lib/export'

// Thenable chain — pozwala na `await supabase.from(...).select(...).eq(...)`
function makeChain(data: any) {
  const resolved = Promise.resolve({ data, error: null })
  const chain: any = {
    select: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    gte: jest.fn(() => chain),
    lte: jest.fn(() => chain),
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
  }
  return chain
}

const SAMPLE: ExportData = {
  parishName: 'Parafia Testowa',
  from: '2026-01-01',
  to: '2026-05-27',
  generatedAt: '2026-05-27T10:00:00.000Z',
  members: [
    { fullName: 'Jan Kowalski',    scheduled: 10, present: 9, attendanceRate: 90.0, points: 50 },
    { fullName: 'Piotr Nowak',     scheduled: 8,  present: 4, attendanceRate: 50.0, points: 30 },
    { fullName: 'Adam Wiśniewski', scheduled: 0,  present: 0, attendanceRate: 0,    points: 0  },
  ],
}

describe('generateCSV', () => {
  it('starts with UTF-8 BOM', () => {
    const csv = generateCSV(SAMPLE)
    expect(csv.charCodeAt(0)).toBe(0xFEFF)
  })

  it('includes parish name and date range in header', () => {
    const csv = generateCSV(SAMPLE)
    expect(csv).toContain('Parafia Testowa')
    expect(csv).toContain('2026-01-01')
    expect(csv).toContain('2026-05-27')
  })

  it('includes both section headers', () => {
    const csv = generateCSV(SAMPLE)
    expect(csv).toContain('Ranking punktowy')
    expect(csv).toContain('Statystyki obecności')
  })

  it('lists members in descending points order', () => {
    const csv = generateCSV(SAMPLE)
    const janPos = csv.indexOf('Jan Kowalski')
    const piotrPos = csv.indexOf('Piotr Nowak')
    expect(janPos).toBeLessThan(piotrPos)
  })

  it('formats attendance rate with one decimal', () => {
    const csv = generateCSV(SAMPLE)
    expect(csv).toContain('90.0%')
    expect(csv).toContain('50.0%')
  })

  it('shows fallback message for empty members', () => {
    const csv = generateCSV({ ...SAMPLE, members: [] })
    expect(csv.match(/Brak danych/g)?.length).toBe(2)  // once per section
  })
})

describe('generateHTML', () => {
  it('includes parish name', () => {
    expect(generateHTML(SAMPLE)).toContain('Parafia Testowa')
  })

  it('includes date range', () => {
    const html = generateHTML(SAMPLE)
    expect(html).toContain('2026-01-01')
    expect(html).toContain('2026-05-27')
  })

  it('contains exactly two <table> elements', () => {
    const count = (generateHTML(SAMPLE).match(/<table/g) ?? []).length
    expect(count).toBe(2)
  })

  it('shows fallback row for empty members', () => {
    const html = generateHTML({ ...SAMPLE, members: [] })
    expect(html).toContain('Brak danych w wybranym okresie')
  })
})

describe('buildExportData', () => {
  it('counts scheduled (excluding excused) and present correctly', async () => {
    const profiles    = [{ id: 'u1', full_name: 'Jan Kowalski' }]
    const assignments = [
      { profile_id: 'u1', status: 'present' },
      { profile_id: 'u1', status: 'absent' },
      { profile_id: 'u1', status: 'excused' },   // nie liczy do scheduled
    ]
    const points = [{ profile_id: 'u1', amount: 10 }, { profile_id: 'u1', amount: 5 }]

    const supabase: any = {
      from: jest.fn()
        .mockReturnValueOnce(makeChain(profiles))
        .mockReturnValueOnce(makeChain(assignments))
        .mockReturnValueOnce(makeChain(points)),
    }

    const result = await buildExportData(supabase, 'p1', 'Parafia', '2026-01-01', '2026-05-27')

    expect(result.members[0].scheduled).toBe(2)       // present + absent
    expect(result.members[0].present).toBe(1)          // tylko present
    expect(result.members[0].attendanceRate).toBe(50)
    expect(result.members[0].points).toBe(15)
  })

  it('counts confirmed status as present', async () => {
    const profiles    = [{ id: 'u1', full_name: 'Jan Kowalski' }]
    const assignments = [{ profile_id: 'u1', status: 'confirmed' }]

    const supabase: any = {
      from: jest.fn()
        .mockReturnValueOnce(makeChain(profiles))
        .mockReturnValueOnce(makeChain(assignments))
        .mockReturnValueOnce(makeChain([])),
    }

    const result = await buildExportData(supabase, 'p1', 'Parafia', '2026-01-01', '2026-05-27')
    expect(result.members[0].present).toBe(1)
  })

  it('sorts members by points descending', async () => {
    const profiles = [
      { id: 'u1', full_name: 'Jan Kowalski' },
      { id: 'u2', full_name: 'Piotr Nowak' },
    ]
    const points = [
      { profile_id: 'u1', amount: 10 },
      { profile_id: 'u2', amount: 20 },
    ]

    const supabase: any = {
      from: jest.fn()
        .mockReturnValueOnce(makeChain(profiles))
        .mockReturnValueOnce(makeChain([]))
        .mockReturnValueOnce(makeChain(points)),
    }

    const result = await buildExportData(supabase, 'p1', 'Parafia', '2026-01-01', '2026-05-27')
    expect(result.members[0].fullName).toBe('Piotr Nowak')
    expect(result.members[1].fullName).toBe('Jan Kowalski')
  })

  it('returns empty members array when no profiles', async () => {
    const supabase: any = {
      from: jest.fn()
        .mockReturnValueOnce(makeChain([]))
        .mockReturnValueOnce(makeChain([]))
        .mockReturnValueOnce(makeChain([])),
    }

    const result = await buildExportData(supabase, 'p1', 'Parafia', '2026-01-01', '2026-05-27')
    expect(result.members).toHaveLength(0)
  })

  it('attendanceRate is 0 when scheduled is 0', async () => {
    const profiles = [{ id: 'u1', full_name: 'Jan Kowalski' }]

    const supabase: any = {
      from: jest.fn()
        .mockReturnValueOnce(makeChain(profiles))
        .mockReturnValueOnce(makeChain([]))
        .mockReturnValueOnce(makeChain([])),
    }

    const result = await buildExportData(supabase, 'p1', 'Parafia', '2026-01-01', '2026-05-27')
    expect(result.members[0].attendanceRate).toBe(0)
  })
})
