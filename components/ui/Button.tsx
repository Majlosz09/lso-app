import { ActivityIndicator, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import { useTheme } from '../../lib/ThemeContext'
import { radius, sans } from '../../lib/theme'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { AppText } from './AppText'
import { Icon } from './Icon'

type Variant = 'primary' | 'gold' | 'secondary' | 'ghost' | 'danger' | 'outlineLight'

type Props = {
  label: string
  onPress?: () => void
  variant?: Variant
  icon?: string
  loading?: boolean
  disabled?: boolean
  /** mały przycisk (40 px) zamiast głównego (52 mobile / 46 web) */
  compact?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
}

export function Button({
  label, onPress, variant = 'primary', icon, loading, disabled, compact, style, testID,
}: Props) {
  const { colors: c } = useTheme()
  const isDesktop = useIsDesktop()
  const height = compact ? 40 : isDesktop ? 46 : 52

  const palette: Record<Variant, { bg: string; fg: string; border?: string }> = {
    primary:      { bg: c.primary, fg: c.onPrimary },
    gold:         { bg: c.gold, fg: '#071C3A' },
    secondary:    { bg: c.surface, fg: c.primary, border: c.inputBorder },
    ghost:        { bg: 'transparent', fg: c.primary },
    danger:       { bg: c.danger, fg: '#FFFFFF' },
    outlineLight: { bg: 'transparent', fg: '#FFFFFF', border: '#2A4470' },
  }
  const p = palette[variant]
  const isDisabled = disabled || loading

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed, hovered }: any) => [
        styles.base,
        {
          height,
          backgroundColor: p.bg,
          borderColor: p.border ?? 'transparent',
          borderWidth: p.border ? 1 : 0,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : hovered ? 0.93 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <View style={styles.row}>
          {icon && <Icon name={icon} size={20} color={p.fg} />}
          <AppText variant="button" color={p.fg} style={compact && styles.compactText}>
            {label}
          </AppText>
        </View>
      )}
    </Pressable>
  )
}

/** Kwadratowy przycisk z ikoną (46 px), np. zamiana / nie mogę być. */
export function IconButton({
  icon, onPress, color, accessibilityLabel, size = 46, style,
}: {
  icon: string
  onPress?: () => void
  color?: string
  accessibilityLabel: string
  size?: number
  style?: StyleProp<ViewStyle>
}) {
  const { colors: c } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconBtn,
        { width: size, height: size, borderColor: c.inputBorder, backgroundColor: c.surface, opacity: pressed ? 0.8 : 1 },
        style,
      ]}
    >
      <Icon name={icon} size={22} color={color ?? c.primary} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    cursor: 'pointer',
  } as any,
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  compactText: { ...sans(700), fontSize: 13 },
  iconBtn: {
    borderRadius: radius.input,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  } as any,
})
