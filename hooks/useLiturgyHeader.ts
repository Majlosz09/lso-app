import { useMemo } from 'react'
import { getLiturgicalDay, LiturgicalEntry } from '../lib/liturgy'
import { headerPalette, HeaderPalette, VESTMENT_NAMES, VestmentColor } from '../lib/theme'
import { useTheme } from '../lib/ThemeContext'

/** YYYY-MM-DD w czasie lokalnym (toISOString przesuwa datę po północy UTC). */
export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export type LiturgyHeader = {
  entry: LiturgicalEntry
  color: VestmentColor
  palette: HeaderPalette
  /** np. „szaty czerwone” */
  vestmentName: string
}

/** Dzień liturgiczny + paleta nagłówka w kolorze szat (domyślnie dziś). */
export function useLiturgyHeader(dateStr?: string): LiturgyHeader {
  const { isDark } = useTheme()
  const date = dateStr ?? localDateStr()
  return useMemo(() => {
    const entry = getLiturgicalDay(date)
    const color = (entry.color ?? 'GREEN') as VestmentColor
    return {
      entry,
      color,
      palette: headerPalette(color, isDark),
      vestmentName: VESTMENT_NAMES[color] ?? VESTMENT_NAMES.GREEN,
    }
  }, [date, isDark])
}
