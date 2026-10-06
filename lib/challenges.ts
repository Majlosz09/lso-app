// Wyzwania sezonowe: gotowe szablony (daty z kalendarza liturgicznego — liturgical_anchors w bazie).

export type Challenge = {
  id: string
  name: string
  description: string | null
  date_from: string
  date_to: string
  goal: number
  bonus_points: number
  title_filter: string | null
  category: string | null
  icon: string
}

export type BoardRow = { id: string; name: string; count: number; done: boolean; me: boolean }

export type ChallengePreset = {
  key: string
  name: string
  icon: string
  description: string
  goal: number
  bonus: number
  filter: string | null
  category?: string | null
  /** okres: kotwice liturgiczne albo stałe daty (MM-DD) */
  from: { anchor: string; offset?: number } | { md: string }
  to: { anchor: string; offset?: number } | { md: string }
}

export const CHALLENGE_PRESETS: ChallengePreset[] = [
  { key: 'roraty', name: 'Roraty', icon: 'weather-sunset-up', goal: 10, bonus: 20, filter: 'rorat',
    description: 'Bądź na Roratach w Adwencie — wczesnym rankiem, z lampionem.', from: { anchor: 'advent_start' }, to: { anchor: 'dec23' } },
  { key: 'droga', name: 'Droga Krzyżowa', icon: 'cross', goal: 5, bonus: 15, filter: 'droga',
    description: 'Piątkowe nabożeństwa Drogi Krzyżowej w Wielkim Poście.', from: { anchor: 'ash_wednesday' }, to: { anchor: 'good_friday' } },
  { key: 'gorzkie', name: 'Gorzkie Żale', icon: 'candle', goal: 4, bonus: 10, filter: 'gorzk',
    description: 'Niedzielne Gorzkie Żale w Wielkim Poście.', from: { anchor: 'ash_wednesday' }, to: { anchor: 'palm_sunday' } },
  { key: 'triduum', name: 'Triduum Paschalne', icon: 'church', goal: 3, bonus: 20, filter: null,
    description: 'Wielki Czwartek, Wielki Piątek i Wigilia Paschalna — najważniejsze dni roku.', from: { anchor: 'holy_thursday' }, to: { anchor: 'holy_saturday' } },
  { key: 'rozaniec', name: 'Różaniec październikowy', icon: 'circle-multiple', goal: 10, bonus: 15, filter: 'róża',
    description: 'Nabożeństwa różańcowe w październiku.', from: { md: '10-01' }, to: { md: '10-31' } },
  { key: 'majowe', name: 'Nabożeństwa majowe', icon: 'flower', goal: 10, bonus: 15, filter: 'maj',
    description: 'Majówki — nabożeństwa ku czci Matki Bożej.', from: { md: '05-01' }, to: { md: '05-31' } },
  { key: 'wakacje', name: 'Wakacje przy ołtarzu', icon: 'white-balance-sunny', goal: 12, bonus: 30, filter: null,
    description: 'Służba także w wakacje — każda Msza i nabożeństwo się liczy.', from: { md: '07-01' }, to: { md: '08-31' } },
]

const shift = (iso: string, n = 0) => {
  const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Daty szablonu w danym roku (kotwice z liturgical_anchors tego roku). */
export function presetDates(p: ChallengePreset, year: number, anchors: Record<string, string>): { from: string; to: string } | null {
  const one = (x: ChallengePreset['from']) => ('md' in x ? `${year}-${x.md}` : anchors[x.anchor] ? shift(anchors[x.anchor], x.offset ?? 0) : null)
  const from = one(p.from), to = one(p.to)
  return from && to ? { from, to } : null
}

/** Najbliższa edycja: tegoroczna, a jeśli już minęła — przyszłoroczna. */
export function nextPresetDates(p: ChallengePreset, today: string, anchorsByYear: Record<number, Record<string, string>>) {
  const y = Number(today.slice(0, 4))
  const now = presetDates(p, y, anchorsByYear[y] ?? {})
  if (now && now.to >= today) return { ...now, year: y }
  const next = presetDates(p, y + 1, anchorsByYear[y + 1] ?? {})
  return next ? { ...next, year: y + 1 } : null
}

export function challengeStatus(c: Pick<Challenge, 'date_from' | 'date_to'>, today: string): 'active' | 'upcoming' | 'ended' {
  if (today < c.date_from) return 'upcoming'
  if (today > c.date_to) return 'ended'
  return 'active'
}
