import { useEffect, useMemo, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { ScheduleCategory, CATEGORY_CONFIG } from '../../types/database'
import { SERVICE_MODE_INFO, ServiceMode } from '../../lib/massSchedule'
import { churchLabel, useChurches } from '../../hooks/useChurches'
import { usePointCategories } from '../../hooks/usePointCategories'
import { PointCategoryChips } from '../../components/points/PointCategoryChips'
import { DatePickerModal } from '../../components/DatePickerModal'
import { TimePickerModal } from '../../components/TimePickerModal'
import { useTheme } from '../../lib/ThemeContext'
import { addDays, dayShort, localDateStr, longDate, shortDate } from '../../lib/dates'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { DayStrip } from '../../components/services/DayStrip'
import { AppText, Button, Card, Chip, ListRow, ScreenHeader, TextField } from '../../components/ui'
import { KeyboardScrollView } from '../../components/ui/KeyboardScrollView'

const DEFAULT_TITLE: Record<ScheduleCategory, string> = {
  msza: 'Msza Święta',
  nabozenstwo: 'Nabożeństwo',
  zbiorka: 'Zbiórka ministrantów',
}
const COMMON_TIMES = ['07:00', '08:00', '10:00', '12:00', '17:00', '17:30', '18:00']

export default function ScheduleForm() {
  const router = useRouter()
  const isDesktop = useIsDesktop()
  const { profile } = useAuthStore()
  const insets = useSafeAreaInsets()
  const { colors: c } = useTheme()
  const { date: initDate, time: initTime, title: initTitle } = useLocalSearchParams<{
    date?: string; time?: string; title?: string
  }>()

  const today = localDateStr()
  const [category, setCategory] = useState<ScheduleCategory>('msza')
  const [title, setTitle] = useState(initTitle ?? '')
  const [titleTouched, setTitleTouched] = useState(!!initTitle)
  const [date, setDate] = useState(initDate ?? today)
  const [time, setTime] = useState(initTime ?? '')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [slotTimes, setSlotTimes] = useState<string[]>([])
  const [mode, setMode] = useState<ServiceMode | null>(null)
  const { churches, main, multi } = useChurches()
  const { serviceCategories } = usePointCategories()
  const [pointCategoryId, setPointCategoryId] = useState<string | null>(null)
  const [churchId, setChurchId] = useState<string | null>(null)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(today, i)), [today])

  // godziny z obowiązującego rozkładu w wybrany dzień (z uwzględnieniem zmian okresowych)
  useEffect(() => {
    if (!profile?.parish_id) return
    supabase.rpc('mass_slots', { p_parish: profile.parish_id, p_from: date, p_to: date })
      .then(({ data }) => setSlotTimes(((data ?? []) as any[]).map(t => String(t.slot_time).slice(0, 5))))
  }, [profile?.parish_id, date])
  // domyślnie: Msza = zapisy, nabożeństwo / zbiórka = grafik opiekuna
  const effectiveMode: ServiceMode = mode ?? (category === 'msza' ? 'signup' : 'assigned')

  const effectiveTitle = titleTouched ? title : DEFAULT_TITLE[category]
  const suggested = useMemo(
    () => Array.from(new Set([...slotTimes, ...COMMON_TIMES, ...(time ? [time] : [])])).sort(),
    [slotTimes, time],
  )

  const handleSubmit = async () => {
    if (!effectiveTitle.trim()) { Toast.show({ type: 'error', text1: 'Wpisz tytuł służby' }); return }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { Toast.show({ type: 'error', text1: 'Wybierz dzień' }); return }
    if (!/^\d{2}:\d{2}$/.test(time)) { Toast.show({ type: 'error', text1: 'Wybierz godzinę' }); return }

    setSubmitting(true)
    const { data, error } = await supabase.from('schedules').insert({
      title: effectiveTitle.trim(),
      group_id: null,
      date,
      time: time + ':00',
      category,
      service_mode: effectiveMode,
      point_category_id: effectiveMode === 'none' ? null : pointCategoryId,
      church_id: churchId ?? main?.id ?? null,
      location: '',
      gps_radius: 100,
      notes: notes.trim() || null,
      created_by: profile?.id,
      parish_id: profile?.parish_id,
    }).select('id').single()
    setSubmitting(false)

    if (error) {
      Toast.show({ type: 'error', text1: 'Nie udało się zapisać służby', text2: error.message })
      return
    }
    Toast.show({ type: 'success', text1: `Dodano: ${effectiveTitle.trim()} · ${dayShort(date)} ${time}` })
    if (data?.id) router.replace(`/(admin)/schedule-detail?id=${data.id}` as any)
    else router.back()
  }

  const outsideStrip = !days.includes(date)

  const form = (
    <View style={styles.form}>
      <View style={styles.group}>
        <AppText variant="label" muted>Rodzaj</AppText>
        <View style={styles.chips}>
          {(Object.keys(CATEGORY_CONFIG) as ScheduleCategory[]).map(key => (
            <Chip key={key} label={CATEGORY_CONFIG[key].label} selected={category === key} onPress={() => setCategory(key)} />
          ))}
        </View>
      </View>

      <PointCategoryChips categories={serviceCategories} value={pointCategoryId} onChange={setPointCategoryId} />

      <View style={styles.group}>
        <AppText variant="label" muted>Dzień</AppText>
        <DayStrip days={days} selected={date} onSelect={setDate} />
        <View style={styles.chips}>
          <Chip
            icon="calendar"
            label={outsideStrip ? `Inna data: ${longDate(date)}` : 'Inna data…'}
            selected={outsideStrip}
            onPress={() => setShowDatePicker(true)}
          />
        </View>
      </View>

      <View style={styles.group}>
        <AppText variant="label" muted>Godzina</AppText>
        <View style={styles.chips}>
          {suggested.map(t => <Chip key={t} label={t} selected={time === t} onPress={() => setTime(t)} />)}
          <Chip icon="clock-outline" label="Inna…" onPress={() => setShowTimePicker(true)} />
        </View>
      </View>

      {multi && (
        <View style={styles.group}>
          <AppText variant="label" muted>Kościół</AppText>
          <View style={styles.chips}>
            {churches.map(ch => (
              <Chip key={ch.id} icon="church" label={churchLabel(ch)} selected={(churchId ?? main?.id) === ch.id} onPress={() => setChurchId(ch.id)} />
            ))}
          </View>
        </View>
      )}

      <View style={styles.group}>
        <AppText variant="label" muted>Zapisy, obecność i punkty</AppText>
        <View style={styles.chips}>
          {(['signup', 'assigned', 'none'] as ServiceMode[]).map(m => (
            <Chip key={m} label={SERVICE_MODE_INFO[m].short} selected={effectiveMode === m} onPress={() => setMode(m)} />
          ))}
        </View>
        <AppText variant="small" muted>{SERVICE_MODE_INFO[effectiveMode].hint}</AppText>
      </View>

      <TextField
        label="Tytuł"
        placeholder={DEFAULT_TITLE[category]}
        value={effectiveTitle}
        onChangeText={t => { setTitle(t); setTitleTouched(true) }}
      />
      <TextField label="Uwagi dla ministrantów (opcjonalnie)" placeholder="np. zbiórka w zakrystii 15 min wcześniej" value={notes} onChangeText={setNotes} multiline />

      <Card flush>
        <ListRow
          first
          icon="calendar-sync"
          title="Powtarzaj regularnie"
          subtitle="Cykl służb: wiele terminów naraz (np. roraty, różaniec)"
          onPress={() => router.replace('/(admin)/schedule-series')}
        />
      </Card>
    </View>
  )

  const footer = (
    <View style={[styles.footer, { borderTopColor: c.border, backgroundColor: c.surface, paddingBottom: Math.max(insets.bottom, 12) }]}>
      <AppText variant="small" muted style={styles.center}>
        {`${effectiveTitle || '—'} · ${dayShort(date)} ${shortDate(date)}${time ? ` · ${time}` : ''}`}
      </AppText>
      <Button label="Dodaj do grafiku" onPress={handleSubmit} loading={submitting} />
    </View>
  )

  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: c.bg }]} enabled={false}>
      <Stack.Screen options={{ headerShown: false, title: 'Nowa służba' }} />
      <KeyboardScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={isDesktop && styles.desktop}>
        {!isDesktop && (
          <ScreenHeader
            title="Nowa służba"
            onBack={() => (router.canGoBack() ? router.back() : router.replace('/(admin)/(admin-tabs)/schedules'))}
            backLabel="Anuluj"
          />
        )}
        {isDesktop ? <Card large style={styles.deskCard}>{form}{footer}</Card> : form}
      </KeyboardScrollView>
      {!isDesktop && footer}

      <DatePickerModal visible={showDatePicker} value={date} onConfirm={setDate} onClose={() => setShowDatePicker(false)} />
      <TimePickerModal visible={showTimePicker} value={time} onConfirm={setTime} onClose={() => setShowTimePicker(false)} />
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  form: { padding: 16, gap: 18 },
  group: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  footer: { padding: 16, gap: 10, borderTopWidth: 1 },
  desktop: { padding: 28, paddingHorizontal: 32, maxWidth: 760 },
  deskCard: { padding: 0 },
})
