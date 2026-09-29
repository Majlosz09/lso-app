import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useTheme } from '../../lib/ThemeContext'
import { sans, VESTMENT_DOT, VestmentColor } from '../../lib/theme'
import { getLiturgicalDay } from '../../lib/liturgy'
import { dayNum, dayShort, localDateStr } from '../../lib/dates'
import { AppText } from '../ui'

/** Pasek dni (DZIŚ / WT 29 …) z kropką koloru szat liturgicznych. */
export function DayStrip({ days, selected, onSelect }: {
  days: string[]
  selected: string
  onSelect: (d: string) => void
}) {
  const { colors: c } = useTheme()
  const today = localDateStr()
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {days.map(d => {
        const active = d === selected
        const color = (getLiturgicalDay(d).color ?? 'GREEN') as VestmentColor
        return (
          <Pressable
            key={d}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(d)}
            style={[
              styles.day,
              { backgroundColor: active ? c.primary : c.surface, borderColor: active ? c.primary : c.border },
            ]}
          >
            <AppText style={[styles.dow, { color: active ? c.gold : c.subtext }]}>
              {d === today ? 'DZIŚ' : dayShort(d).toUpperCase()}
            </AppText>
            <AppText style={[styles.num, { color: active ? '#FFFFFF' : c.text }]}>{dayNum(d)}</AppText>
            <View
              style={[
                styles.dot,
                { backgroundColor: VESTMENT_DOT[color] },
                color === 'WHITE' && { borderWidth: 1, borderColor: c.gold },
              ]}
            />
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 2 },
  day: {
    width: 46,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    gap: 2,
    cursor: 'pointer',
  } as any,
  dow: { ...sans(700), fontSize: 10, letterSpacing: 0.5 },
  num: { ...sans(800), fontSize: 17, lineHeight: 21, fontVariant: ['tabular-nums'] },
  dot: { width: 7, height: 7, borderRadius: 4, marginTop: 1 },
})
