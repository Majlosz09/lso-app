// „Ułóż grafik za mnie” — sprawiedliwa propozycja obsady (czysta funkcja, testy w __tests__/lib/autoSchedule.test.ts).
//
// Zasady:
//  - obsadzamy tylko braki (do docelowej liczby), istniejący zapis zostaje,
//  - najpierw osoby z najmniejszym obciążeniem (służby w ostatnich tygodniach + już przydzielone w tej propozycji),
//  - nikt dwa razy o tej samej porze ani dwa razy w tej samej służbie,
//  - limit służb na osobę w tygodniu (pn–nd), liczony łącznie z istniejącymi zapisami,
//  - drobna preferencja: kto zwykle służy w ten dzień tygodnia o tej godzinie (stały zapis) — wcześniej,
//  - wynik deterministyczny (remis: alfabetycznie), żeby ponowne „Pokaż propozycję” dawało to samo.

export type AutoService = {
  key: string
  date: string
  /** HH:MM */
  time: string
  title: string
  category: 'msza' | 'nabozenstwo' | 'zbiorka'
  /** ile osób już jest (aktywnych) */
  people: string[]
  sunday: boolean
}

export type AutoMember = {
  id: string
  name: string
  /** służby w ostatnich tygodniach (historia) */
  recent: number
  /** stałe zapisy: klucze `${dow}_${HH:MM}` */
  regular?: string[]
}

export type AutoTargets = { weekday: number; sunday: number; devotion: number }

export type AutoOptions = {
  targets: AutoTargets
  maxPerWeek: number
}

export type AutoProposal = { serviceKey: string; memberIds: string[] }[]

function weekKey(date: string): string {
  const d = new Date(date + 'T12:00:00')
  const dow = d.getDay()
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
  return d.toISOString().slice(0, 10)
}

export function targetFor(s: Pick<AutoService, 'category' | 'sunday'>, t: AutoTargets): number {
  if (s.category !== 'msza') return t.devotion
  return s.sunday ? t.sunday : t.weekday
}

export function proposeSchedule(services: AutoService[], members: AutoMember[], opts: AutoOptions): AutoProposal {
  const sorted = [...services].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
  const assigned = new Map<string, number>()          // w tej propozycji
  const perWeek = new Map<string, number>()           // `${member}_${week}` → istniejące + proponowane
  const busyAt = new Set<string>()                    // `${member}_${date}_${time}`

  for (const s of sorted) {
    const wk = weekKey(s.date)
    for (const m of s.people) {
      perWeek.set(`${m}_${wk}`, (perWeek.get(`${m}_${wk}`) ?? 0) + 1)
      busyAt.add(`${m}_${s.date}_${s.time}`)
    }
  }

  const out: AutoProposal = []
  for (const s of sorted) {
    const need = targetFor(s, opts.targets) - s.people.length
    if (need <= 0) continue
    const wk = weekKey(s.date)
    const dow = new Date(s.date + 'T12:00:00').getDay()
    const slotKey = `${dow}_${s.time}`
    const candidates = members
      .filter(m => !s.people.includes(m.id))
      .filter(m => !busyAt.has(`${m.id}_${s.date}_${s.time}`))
      .filter(m => (perWeek.get(`${m.id}_${wk}`) ?? 0) < opts.maxPerWeek)
      .map(m => ({
        m,
        // obciążenie: historia + to, co już dostał w propozycji (waga 2 — wyrównujemy bieżący okres)
        score: m.recent + 2 * (assigned.get(m.id) ?? 0) - (m.regular?.includes(slotKey) ? 1.5 : 0),
      }))
      .sort((a, b) => a.score - b.score || a.m.name.localeCompare(b.m.name, 'pl'))
      .slice(0, need)
    if (!candidates.length) continue
    const ids = candidates.map(c => c.m.id)
    for (const id of ids) {
      assigned.set(id, (assigned.get(id) ?? 0) + 1)
      perWeek.set(`${id}_${wk}`, (perWeek.get(`${id}_${wk}`) ?? 0) + 1)
      busyAt.add(`${id}_${s.date}_${s.time}`)
    }
    out.push({ serviceKey: s.key, memberIds: ids })
  }
  return out
}

/** Podsumowanie: ile służb dostaje każdy w propozycji (do podglądu sprawiedliwości). */
export function proposalLoad(p: AutoProposal): Map<string, number> {
  const m = new Map<string, number>()
  for (const x of p) for (const id of x.memberIds) m.set(id, (m.get(id) ?? 0) + 1)
  return m
}
