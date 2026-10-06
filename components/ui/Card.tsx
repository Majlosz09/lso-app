import { Pressable, StyleProp, StyleSheet, View, ViewProps, ViewStyle } from 'react-native'
import { useTheme } from '../../lib/ThemeContext'
import { radius } from '../../lib/theme'
import { shadow } from '../../lib/shadows'
import { AppText } from './AppText'

type Props = ViewProps & {
  /** karta główna (radius 20) */
  large?: boolean
  /** wyróżniona — granatowa ramka + cień („moja służba”) */
  featured?: boolean
  /** bez wewnętrznego paddingu (np. lista wierszy) */
  flush?: boolean
  onPress?: () => void
  style?: StyleProp<ViewStyle>
}

export function Card({ large, featured, flush, onPress, style, children, ...rest }: Props) {
  const { colors: c } = useTheme()
  const cardStyle = [
    styles.card,
    {
      backgroundColor: c.surface,
      borderColor: featured ? c.primary : c.border,
      borderRadius: large ? radius.modal : radius.card,
      padding: flush ? 0 : 14,
    },
    featured && shadow.featured,
    style,
  ]
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [cardStyle, pressed && { opacity: 0.9 }, styles.pointer]}
        {...rest}
      >
        {children}
      </Pressable>
    )
  }
  return <View style={cardStyle} {...rest}>{children}</View>
}

/** Nagłówek sekcji: eyebrow po lewej, opcjonalna akcja po prawej. */
export function SectionHeader({
  title, action, onAction, style,
}: { title: string; action?: string; onAction?: () => void; style?: StyleProp<ViewStyle> }) {
  const { colors: c } = useTheme()
  return (
    <View style={[styles.section, style]}>
      <AppText variant="eyebrow" color={c.goldInk} style={styles.flex}>{title}</AppText>
      {action && (
        <Pressable onPress={onAction} accessibilityRole="button" style={styles.pointer}>
          <AppText variant="label" color={c.primary}>{action}</AppText>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, overflow: 'hidden' },
  section: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, marginBottom: 8 },
  flex: { flex: 1 },
  pointer: { cursor: 'pointer' } as any,
})
