import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Calendar, LocaleConfig } from 'react-native-calendars'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { sans, serif, VESTMENT_DOT, VestmentColor } from '../../lib/theme'
import { getLiturgicalDay, getLiturgicalBgColor } from '../../lib/liturgy'
import { localDateStr } from '../../lib/dates'
import { AppText } from '../ui'

LocaleConfig.locales['pl'] = {
  monthNames: ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'],
  monthNamesShort: ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'],
  dayNames: ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'],
  dayNamesShort: ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb'],
  today: 'Dziś',
}
LocaleConfig.defaultLocale = 'pl'

/**
 * Kalendarz miesiąca z kolorami dni liturgicznych i kropką przy dniach ze służbami.
 * Dotknięcie dnia → lista służb tego dnia (schedule-day).
 */
export function MonthCalendar() {
  const router = useRouter()
  const parishId = useAuthStore(s => s.profile?.parish_id)
  const { colors: c, isDark } = useTheme()
  const today = localDateStr()
  const [scheduleDates, setScheduleDates] = useState<Set<string>>(new Set())

  const fetchMonth = useCallback(async (year: number, month: number) => {
    if (!parishId) return
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const last = new Date(year, month, 0).getDate()
    const end = `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`
    const { data } = await supabase.from('schedules').select('date').eq('parish_id', parishId).gte('date', start).lte('date', end)
    setScheduleDates(new Set((data ?? []).map((s: any) => s.date)))
  }, [parishId])

  useEffect(() => {
    const now = new Date()
    fetchMonth(now.getFullYear(), now.getMonth() + 1)
  }, [fetchMonth])

  const marked = useMemo(() => {
    const m: Record<string, any> = {}
    scheduleDates.forEach(d => { m[d] = { dots: [{ key: 's', color: c.primary }] } })
    return m
  }, [scheduleDates, c.primary])

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Calendar
        key={isDark ? 'dark' : 'light'}
        markingType="multi-dot"
        markedDates={marked}
        onMonthChange={(m: { year: number; month: number }) => fetchMonth(m.year, m.month)}
        firstDay={1}
        enableSwipeMonths
        style={{ backgroundColor: c.surface }}
        theme={{
          arrowColor: c.primary,
          calendarBackground: c.surface,
          backgroundColor: c.surface,
          monthTextColor: c.text,
          textMonthFontFamily: serif().fontFamily,
          textMonthFontSize: 22,
          textSectionTitleColor: c.subtext,
          textDayHeaderFontFamily: sans(700).fontFamily,
        } as any}
        dayComponent={({ date, state, marking }: any) => {
          const isToday = date.dateString === today
          const disabled = state === 'disabled'
          const lit = getLiturgicalDay(date.dateString)
          const litBg = getLiturgicalBgColor(lit)
          const hasService = !!marking?.dots?.length
          const vest = (lit.color ?? 'GREEN') as VestmentColor
          return (
            <Pressable
              onPress={() => router.push(`/(admin)/schedule-day?date=${date.dateString}` as any)}
              style={styles.day}
              accessibilityRole="button"
              accessibilityLabel={`${date.day}, ${lit.name}`}
            >
              <View style={[
                styles.circle,
                litBg && { backgroundColor: litBg + '33' },
                isToday && { backgroundColor: c.primary },
              ]}>
                <AppText style={[styles.num, { color: isToday ? '#FFFFFF' : disabled ? c.iconMuted : c.text }]}>{date.day}</AppText>
              </View>
              <View style={[styles.dot, { backgroundColor: hasService ? VESTMENT_DOT[vest] === '#FFFFFF' ? c.gold : c.primary : 'transparent' }]} />
            </Pressable>
          )
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, overflow: 'hidden', paddingVertical: 6 },
  day: { alignItems: 'center', width: 36, cursor: 'pointer' } as any,
  circle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  num: { ...sans(700), fontSize: 13, fontVariant: ['tabular-nums'] },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 2 },
})
