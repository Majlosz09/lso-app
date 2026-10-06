import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import { useTheme } from '../../lib/ThemeContext'
import { AppText } from './AppText'

type Option<T extends string> = { value: T; label: string }

type Props<T extends string> = {
  options: Option<T>[]
  value: T
  onChange: (v: T) => void
  /** 'onHeader' = półprzezroczysty wariant na kolorowym nagłówku szat */
  tone?: 'default' | 'onHeader'
  /** kolory nagłówka (dla tone='onHeader') */
  headerFg?: string
  headerChip?: string
  style?: StyleProp<ViewStyle>
}

export function Segmented<T extends string>({
  options, value, onChange, tone = 'default', headerFg, headerChip, style,
}: Props<T>) {
  const { colors: c } = useTheme()
  const onHeader = tone === 'onHeader'
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.wrap, { backgroundColor: onHeader ? headerChip : c.borderLight }, style]}
    >
      {options.map(o => {
        const active = o.value === value
        const fg = onHeader
          ? active ? c.primary : headerFg
          : active ? c.text : c.subtext
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.item, active && { backgroundColor: onHeader ? '#FFFFFF' : c.surface }]}
          >
            <AppText variant="label" color={fg} style={styles.text}>{o.label}</AppText>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 12 },
  item: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 9, cursor: 'pointer' } as any,
  text: { fontSize: 13 },
})
