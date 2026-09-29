import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import { useTheme } from '../../lib/ThemeContext'
import { radius } from '../../lib/theme'
import { AppText } from './AppText'
import { Icon } from './Icon'

type Props = {
  label: string
  selected?: boolean
  onPress?: () => void
  icon?: string
  style?: StyleProp<ViewStyle>
}

/** Pigułka wyboru (powód nieobecności, adresaci, format eksportu…). */
export function Chip({ label, selected, onPress, icon, style }: Props) {
  const { colors: c } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? c.primary : c.surface,
          borderColor: selected ? c.primary : c.inputBorder,
        },
        style,
      ]}
    >
      {icon && <Icon name={icon} size={16} color={selected ? c.onPrimary : c.goldInk} />}
      <AppText variant="label" color={selected ? c.onPrimary : c.text}>{label}</AppText>
    </Pressable>
  )
}

/** Mała etykieta statusu (nie-klikalna). */
export function Badge({
  label, tone = 'gold', style,
}: { label: string; tone?: 'gold' | 'success' | 'danger' | 'navy' | 'muted'; style?: StyleProp<ViewStyle> }) {
  const { colors: c } = useTheme()
  const tones = {
    gold:    { bg: c.goldSurface, fg: c.goldText },
    success: { bg: c.successSurface, fg: c.success },
    danger:  { bg: c.dangerSurface, fg: c.danger },
    navy:    { bg: c.primarySurface, fg: c.primary },
    muted:   { bg: c.borderLight, fg: c.subtext },
  }[tone]
  return (
    <View style={[styles.badge, { backgroundColor: tones.bg }, style]}>
      <AppText variant="label" color={tones.fg} style={styles.badgeText}>{label}</AppText>
    </View>
  )
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    cursor: 'pointer',
  } as any,
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11 },
})
