import { memo } from 'react'
import { StyleProp, TextStyle } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'

type Props = {
  /** nazwa z MaterialCommunityIcons, bez sufiksu „-outline” */
  name: string
  size?: number
  color?: string
  /** true = ikona wypełniona (aktywna zakładka), false = wersja „-outline” jeśli istnieje */
  filled?: boolean
  style?: StyleProp<TextStyle>
}

const glyphs = MaterialCommunityIcons.glyphMap as Record<string, number>

// Ikony, których wariant „-outline” to inny symbol (np. plus w kwadracie) — zawsze bez sufiksu
const NO_OUTLINE = new Set(['plus', 'minus', 'close', 'check', 'check-all', 'arrow-right', 'arrow-left', 'pencil', 'magnify'])

export function resolveIconName(name: string, filled: boolean): string {
  if (filled || NO_OUTLINE.has(name)) return name
  const outline = `${name}-outline`
  return outline in glyphs ? outline : name
}

/** Ikony redesignu (odpowiednik Material Symbols Rounded: FILL 0/1). */
function IconComponent({ name, size = 22, color, filled = false, style }: Props) {
  return (
    <MaterialCommunityIcons
      name={resolveIconName(name, filled) as any}
      size={size}
      color={color}
      style={style}
    />
  )
}

export const Icon = memo(IconComponent)
