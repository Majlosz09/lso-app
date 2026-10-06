import { StyleSheet, View } from 'react-native'
import { AvatarImage } from '../AvatarImage'
import { sans } from '../../lib/theme'
import { AppText } from './AppText'

export function initials(fullName: string | null | undefined): string {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(p => p && !/^ks\.?$/i.test(p))
  if (parts.length === 0) return '?'
  const first = parts[0][0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}

type Props = {
  name?: string | null
  /** avatar_url z profilu (zdjęcie lub preset kolor+ikona) */
  avatarUrl?: string | null
  size?: number
  /** tło inicjałów, gdy brak avatara */
  color?: string
  textColor?: string
}

/** Avatar: zdjęcie / preset (kolor + ikona) / inicjały na złotym tle. */
export function Avatar({ name, avatarUrl, size = 40, color = '#C9A55A', textColor = '#071C3A' }: Props) {
  if (avatarUrl) return <AvatarImage avatarUrl={avatarUrl} size={size} />
  return (
    <View
      accessible
      accessibilityLabel={name ?? undefined}
      style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}
    >
      <AppText style={[sans(800), { fontSize: Math.round(size * 0.36), color: textColor }]}>{initials(name)}</AppText>
    </View>
  )
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
})
