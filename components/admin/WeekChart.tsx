import { StyleSheet, View } from 'react-native'
import { useTheme } from '../../lib/ThemeContext'
import { sans } from '../../lib/theme'
import { dayShort, localDateStr } from '../../lib/dates'
import type { DayStaffing } from '../../hooks/useAdminDashboard'
import { AppText } from '../ui'

/** Słupki obsady tygodnia: zielony = wszystkie służby obsadzone, złoty = część, pusty = brak służb. */
export function WeekChart({ days, height = 96 }: { days: DayStaffing[]; height?: number }) {
  const { colors: c } = useTheme()
  const today = localDateStr()
  return (
    <View style={styles.row}>
      {days.map(d => {
        const ratio = d.total ? d.staffed / d.total : 0
        const full = d.total > 0 && d.staffed === d.total
        return (
          <View key={d.date} style={styles.col}>
            <View style={[styles.track, { height, backgroundColor: c.borderLight }]}>
              {d.total > 0 && (
                <View
                  style={[
                    styles.fill,
                    { height: Math.max(8, ratio * height), backgroundColor: full ? c.successStrong : c.gold },
                  ]}
                />
              )}
            </View>
            <AppText style={[styles.dow, { color: d.date === today ? c.primary : c.text }]}>{dayShort(d.date)}</AppText>
            <AppText style={[styles.ratio, { color: c.subtext }]}>{d.total ? `${d.staffed}/${d.total}` : '—'}</AppText>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  col: { flex: 1, alignItems: 'center', gap: 4 },
  track: { width: '100%', borderRadius: 10, justifyContent: 'flex-end', overflow: 'hidden' },
  fill: { width: '100%', borderRadius: 10 },
  dow: { ...sans(800), fontSize: 12 },
  ratio: { ...sans(600), fontSize: 11, fontVariant: ['tabular-nums'] },
})
