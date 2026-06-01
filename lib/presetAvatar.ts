export type PresetColor = {
  bg: string
  iconColor: string
}

export type PresetIconDef = {
  icon: string
  label: string
}

export const PRESET_ICONS: PresetIconDef[] = [
  { icon: 'flame',          label: 'Płomień' },
  { icon: 'heart',          label: 'Serce' },
  { icon: 'star',           label: 'Gwiazda' },
  { icon: 'leaf',           label: 'Liść' },
  { icon: 'sunny',          label: 'Słońce' },
  { icon: 'moon',           label: 'Księżyc' },
  { icon: 'musical-notes',  label: 'Nuty' },
  { icon: 'book',           label: 'Książka' },
  { icon: 'trophy',         label: 'Puchar' },
  { icon: 'bicycle',        label: 'Rower' },
  { icon: 'flash',          label: 'Błyskawica' },
  { icon: 'infinite',       label: 'Nieskończoność' },
  { icon: 'game-controller', label: 'Gry' },
  { icon: 'basketball',     label: 'Koszykówka' },
  { icon: 'paw',            label: 'Łapa' },
  { icon: 'diamond',        label: 'Diament' },
]

export const PRESET_COLORS: PresetColor[] = [
  { bg: '#1A237E', iconColor: '#fff' },
  { bg: '#6A1B9A', iconColor: '#fff' },
  { bg: '#1565C0', iconColor: '#fff' },
  { bg: '#1B5E20', iconColor: '#fff' },
  { bg: '#BF360C', iconColor: '#fff' },
  { bg: '#00838F', iconColor: '#fff' },
  { bg: '#880E4F', iconColor: '#fff' },
  { bg: '#37474F', iconColor: '#fff' },
]

const PRESET_PREFIX = 'preset:'

export function buildPresetUrl(iconName: string, colorIndex: number): string {
  return `${PRESET_PREFIX}${iconName}:${colorIndex}`
}

export function parsePresetUrl(url: string | null | undefined): {
  icon: string; colorIndex: number; color: PresetColor
} | null {
  if (!url?.startsWith(PRESET_PREFIX)) return null
  const rest = url.slice(PRESET_PREFIX.length)
  const lastColon = rest.lastIndexOf(':')
  if (lastColon === -1) return null
  const iconName = rest.slice(0, lastColon)
  const colorIndex = parseInt(rest.slice(lastColon + 1))
  if (isNaN(colorIndex) || colorIndex < 0 || colorIndex >= PRESET_COLORS.length) return null
  return { icon: iconName, colorIndex, color: PRESET_COLORS[colorIndex] }
}

export function isPresetUrl(url: string | null | undefined): boolean {
  return !!url?.startsWith(PRESET_PREFIX)
}
