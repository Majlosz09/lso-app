import { ReactNode } from 'react'
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { HeaderPalette } from '../../lib/theme'
import { useLiturgyHeader } from '../../hooks/useLiturgyHeader'
import { AppText } from './AppText'
import { Icon } from './Icon'

type Props = {
  /** tytuł (Instrument Serif 36); można pominąć, gdy nagłówek ma własną treść (np. liczba punktów) */
  title?: string
  eyebrow?: string
  subtitle?: string
  /** pokazuje „‹ Wstecz” nad tytułem */
  onBack?: () => void
  backLabel?: string
  /** elementy po prawej od tytułu (np. przełącznik tygodnia) */
  right?: ReactNode
  /** pasek nad tytułem (np. logo parafii + dzwonek + avatar na Domu) */
  top?: ReactNode
  /** treść pod tytułem (segmenty, chipy) */
  children?: ReactNode
  /** dodatkowy padding na dole — pod kartę nachodzącą na nagłówek (Dom: 72) */
  overlap?: number
  /** nadpisanie palety (domyślnie kolor szat dnia) */
  palette?: HeaderPalette
  style?: StyleProp<ViewStyle>
}

/**
 * Nagłówek ekranu w kolorze szat liturgicznych dnia.
 * Tło sięga pod pasek statusu; styl paska dopasowany do jasności szat.
 */
export function ScreenHeader({
  title, eyebrow, subtitle, onBack, backLabel = 'Wstecz', right, top, children, overlap = 0, palette, style,
}: Props) {
  const today = useLiturgyHeader()
  const p = palette ?? today.palette
  const insets = useSafeAreaInsets()

  return (
    <View
      style={[
        styles.header,
        { backgroundColor: p.bg, paddingTop: insets.top + 6, paddingBottom: 20 + overlap },
        style,
      ]}
    >
      <StatusBar style={p.statusBar} />
      {top}
      {onBack && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          onPress={onBack}
          hitSlop={8}
          style={styles.back}
        >
          <Icon name="chevron-left" size={22} color={p.fg} />
          <AppText variant="label" color={p.fg} style={styles.backText}>{backLabel}</AppText>
        </Pressable>
      )}
      <View style={styles.titleRow}>
        <View style={styles.flex}>
          {!!eyebrow && <AppText variant="eyebrow" color={p.accent}>{eyebrow}</AppText>}
          {!!title && (
            <AppText variant="display" color={p.fg} style={!!eyebrow && styles.titleGap} accessibilityRole="header">
              {title}
            </AppText>
          )}
          {!!subtitle && <AppText variant="body" color={p.fg} style={styles.subtitle}>{subtitle}</AppText>}
        </View>
        {right}
      </View>
      {children}
    </View>
  )
}

/** Półprzezroczysta pigułka na nagłówku (np. „szaty czerwone”, „148 pkt · #4”). */
export function HeaderChip({ label, palette, dot, onPress }: {
  label: string
  palette: HeaderPalette
  dot?: string
  onPress?: () => void
}) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: palette.chip }]}
    >
      {dot && <View style={[styles.dot, { backgroundColor: dot }]} />}
      <AppText variant="label" color={palette.fg} style={styles.chipText}>{label}</AppText>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 22, gap: 14 },
  back: { flexDirection: 'row', alignItems: 'center', marginLeft: -6, alignSelf: 'flex-start', cursor: 'pointer' } as any,
  backText: { fontSize: 13 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  flex: { flex: 1 },
  titleGap: { marginTop: 6 },
  subtitle: { marginTop: 6, opacity: 0.9 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  chipText: { fontSize: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)' },
})
