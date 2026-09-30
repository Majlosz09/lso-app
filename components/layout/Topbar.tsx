import { Pressable, StyleSheet, View } from 'react-native'
import { useTheme } from '../../lib/ThemeContext'
import { sans, serif } from '../../lib/theme'
import { useLiturgyHeader } from '../../hooks/useLiturgyHeader'
import { AppText, Icon } from '../ui'
import { NotificationBell } from './NotificationBell'

type Props = {
  title: string
  subtitle?: string
  onBack?: () => void
}

const MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia']

export function todayLabel(d = new Date()): string {
  return `Dziś, ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** Górny pasek wersji webowej: tytuł, podtytuł, pigułka dnia liturgicznego. */
export function Topbar({ title, subtitle, onBack }: Props) {
  const { colors: c } = useTheme()
  const { palette, vestmentName } = useLiturgyHeader()

  return (
    <View style={[styles.bar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
      {onBack && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Wstecz"
          onPress={onBack}
          style={[styles.back, { borderColor: c.inputBorder }]}
        >
          <Icon name="chevron-left" size={22} color={c.primary} />
        </Pressable>
      )}
      <View style={styles.titles}>
        <AppText style={[styles.title, { color: c.text }]} numberOfLines={1} accessibilityRole="header">
          {title}
        </AppText>
        {!!subtitle && <AppText style={[styles.subtitle, { color: c.subtext }]} numberOfLines={1}>{subtitle}</AppText>}
      </View>
      <NotificationBell />
      <View style={[styles.pill, { backgroundColor: palette.bg }]}>
        <Icon name="church" size={16} color={palette.accent} />
        <AppText style={[styles.pillText, { color: palette.fg }]}>Dziś · {vestmentName}</AppText>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    height: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 32,
    borderBottomWidth: 1,
  },
  back: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  } as any,
  titles: { flex: 1, minWidth: 0 },
  title: { ...serif(), fontSize: 30, lineHeight: 34 },
  subtitle: { ...sans(500), fontSize: 12, marginTop: 2 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  pillText: { ...sans(700), fontSize: 12 },
})
