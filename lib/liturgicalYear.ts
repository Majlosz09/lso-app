// Kalendarz liturgiczny Polski liczony na bieżąco (dowolny rok) — romcal v3 + kalendarz własny Polski.
// Polskie zasady: Objawienie Pańskie 6 I, Boże Ciało w czwartek, Wniebowstąpienie w 7. niedzielę Wielkanocy.
import { Romcal } from 'romcal'
import { Poland_Pl } from '@romcal/calendar.poland'

export type LiturgicalEntry = {
  name: string
  /** SOLEMNITY | FEAST | MEMORIAL | OPT_MEMORIAL | COMMEMORATION | SUNDAY | FERIA | HOLY_WEEK | TRIDUUM */
  type: string
  typeLabel: string
  /** WHITE | RED | GREEN | PURPLE | ROSE */
  color?: string
  /** identyfikator obchodu (np. corpus_christi, ash_wednesday) */
  id?: string
  /** święto nakazane (także każda niedziela) */
  holyDay?: boolean
  /** okres: ADVENT | CHRISTMAS_TIME | LENT | PASCHAL_TRIDUUM | EASTER_TIME | ORDINARY_TIME */
  season?: string
}

/** Zmień, gdy zmienia się sposób liczenia — unieważnia zapisany w telefonie cache. */
export const LITURGY_ENGINE_VERSION = 'romcal3-dev140-pl1'

export const TYPE_LABELS: Record<string, string> = {
  SOLEMNITY: 'Uroczystość',
  TRIDUUM: 'Triduum Paschalne',
  HOLY_WEEK: 'Wielki Tydzień',
  FEAST: 'Święto',
  MEMORIAL: 'Wspomnienie',
  OPT_MEMORIAL: 'Wspomnienie dowolne',
  COMMEMORATION: 'Wspomnienie',
  SUNDAY: 'Niedziela',
  FERIA: 'Feria',
}

const NAME_FIX: Record<string, string> = {
  holy_thursday: 'Wielki Czwartek',
  thursday_of_the_lords_supper: 'Wielki Czwartek',
  good_friday: 'Wielki Piątek',
  holy_saturday: 'Wielka Sobota',
}

type RomcalDay = {
  id: string
  name: string
  rank: string
  isOptional?: boolean
  isHolyDayOfObligation?: boolean
  seasons?: string[]
  periods?: string[]
  colors?: string[]
}

let engine: Romcal | null = null
const getEngine = () => (engine ??= new Romcal({ localizedCalendar: Poland_Pl, ascensionOnSunday: true } as any))

/** „2 Niedziela zwykła” → „2. Niedziela zwykła”, „wtorek 1 tygodnia” → „wtorek 1. tygodnia”. */
export function polishOrdinals(name: string): string {
  return name.replace(/(^|\s)(\d{1,2}) (?=(Niedziela|niedziela|tygodnia))/g, '$1$2. ')
}

function cleanName(d: RomcalDay): string {
  if (NAME_FIX[d.id]) return NAME_FIX[d.id]
  if (d.name.includes('$(')) return d.id.replace(/_/g, ' ')
  return polishOrdinals(d.name)
}

function mapType(d: RomcalDay): string {
  switch (d.rank) {
    case 'SOLEMNITY': return 'SOLEMNITY'
    case 'FEAST': return 'FEAST'
    case 'MEMORIAL': return 'MEMORIAL'
    case 'OPTIONAL_MEMORIAL': return 'OPT_MEMORIAL'
    case 'SUNDAY': return 'SUNDAY'
  }
  if (d.seasons?.includes('PASCHAL_TRIDUUM')) return 'TRIDUUM'
  if (d.periods?.includes('HOLY_WEEK')) return 'HOLY_WEEK'
  return 'FERIA'
}

function mapColor(colors: string[] | undefined, season: string | undefined): string {
  const c = colors?.find(x => ['WHITE', 'RED', 'GREEN', 'PURPLE', 'ROSE'].includes(x))
  if (c) return c
  if (colors?.includes('BLACK')) return 'PURPLE'
  return season === 'ORDINARY_TIME' ? 'GREEN' : 'PURPLE' // Wielka Sobota — bez Mszy w dzień
}

/** Jeden dzień z listy obchodów romcala → wpis do UI. */
export function normalizeDay(list: RomcalDay[]): LiturgicalEntry {
  const main = list.find(x => !x.isOptional) ?? list[0]
  const triduum = main.rank === 'WEEKDAY' ? list.find(x => x.seasons?.includes('PASCHAL_TRIDUUM')) : undefined
  const pick = triduum ?? main
  const season = pick.seasons?.[pick.seasons.length - 1]
  let type = mapType(pick)
  let name = cleanName(pick)
  let color = mapColor(pick.colors, season)

  // dzień powszedni ze wspomnieniem dowolnym — pokazujemy wspomnienie (w Wielkim Poście / późnym Adwencie jako wspomnienie, kolor dnia)
  const optional = !triduum && pick.rank === 'WEEKDAY' ? list.find(x => x.isOptional) : undefined
  if (optional) {
    const privileged = season === 'LENT' || pick.periods?.includes('DAYS_BEFORE_CHRISTMAS') || pick.periods?.includes('HOLY_WEEK')
    name = cleanName(optional)
    type = privileged ? 'COMMEMORATION' : 'OPT_MEMORIAL'
    if (!privileged) color = mapColor(optional.colors, season)
  }

  return {
    name, type, typeLabel: TYPE_LABELS[type] ?? type, color,
    id: optional?.id ?? pick.id,
    holyDay: list.some(x => x.isHolyDayOfObligation && !x.isOptional),
    season,
  }
}

/** Cały rok kalendarzowy: { 'YYYY-MM-DD': wpis }. */
export async function computeLiturgicalYear(year: number): Promise<Record<string, LiturgicalEntry>> {
  const cal = (await getEngine().generateCalendar(year)) as unknown as Record<string, RomcalDay[]>
  const out: Record<string, LiturgicalEntry> = {}
  for (const [date, list] of Object.entries(cal)) {
    if (list?.length) out[date] = normalizeDay(list)
  }
  return out
}
