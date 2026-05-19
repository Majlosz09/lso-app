import { useMemo, useState } from 'react'
import {
  View, Text, TextInput, StyleSheet, ScrollView,
  TouchableOpacity, Alert, ActivityIndicator, Platform,
  KeyboardAvoidingView,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { ScheduleCategory, CATEGORY_CONFIG } from '../../types/database'
import { DatePickerModal } from '../../components/DatePickerModal'
import { TimePickerModal } from '../../components/TimePickerModal'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'

const DAYS = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function uuid4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

function formatDate(d: string) {
  if (!DATE_RE.test(d)) return null
  return new Date(d + 'T12:00:00').toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function ScheduleSeriesScreen() {
  const router = useRouter()
  const { profile } = useAuthStore()
  const insets = useSafeAreaInsets()
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  const [title, setTitle] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedDays, setSelectedDays] = useState<number[]>([])
  const [times, setTimes] = useState<Record<number, string>>({})
  const [category, setCategory] = useState<ScheduleCategory>('msza')
  const [submitting, setSubmitting] = useState(false)

  const [showFromPicker, setShowFromPicker] = useState(false)
  const [showToPicker, setShowToPicker] = useState(false)
  const [editingTimeForDay, setEditingTimeForDay] = useState<number | null>(null)

  const toggleDay = (dow: number) => {
    const adding = !selectedDays.includes(dow)
    setSelectedDays(prev => adding ? [...prev, dow] : prev.filter(d => d !== dow))
    if (adding) {
      setTimes(prev => ({ ...prev, [dow]: prev[dow] ?? '18:00' }))
    } else {
      setTimes(prev => { const next = { ...prev }; delete next[dow]; return next })
    }
  }

  const setPreset = (days: number[]) => {
    setSelectedDays(days)
    setTimes(prev => {
      const next: Record<number, string> = {}
      days.forEach(d => { next[d] = prev[d] ?? '18:00' })
      return next
    })
  }

  const validRange = DATE_RE.test(dateFrom) && DATE_RE.test(dateTo) && dateFrom <= dateTo

  const previewDates = useMemo(() => {
    if (!validRange || selectedDays.length === 0) return []
    const results: { date: string; dow: number }[] = []
    const cur = new Date(dateFrom + 'T12:00:00')
    const end = new Date(dateTo + 'T12:00:00')
    while (cur <= end) {
      const dow = cur.getDay()
      if (selectedDays.includes(dow)) {
        results.push({ date: cur.toISOString().split('T')[0], dow })
      }
      cur.setDate(cur.getDate() + 1)
    }
    return results
  }, [dateFrom, dateTo, selectedDays, validRange])

  const previewSummary = useMemo(() => {
    if (previewDates.length === 0) return null
    const counts: Record<number, number> = {}
    previewDates.forEach(({ dow }) => { counts[dow] = (counts[dow] ?? 0) + 1 })
    return Object.entries(counts)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([dow, n]) => `${DAYS[Number(dow)]} ×${n}`)
      .join(' · ')
  }, [previewDates])

  const validate = (): string | null => {
    if (!title.trim()) return 'Wpisz tytuł nabożeństwa.'
    if (!DATE_RE.test(dateFrom)) return 'Wybierz datę "Od".'
    if (!DATE_RE.test(dateTo)) return 'Wybierz datę "Do".'
    if (dateFrom > dateTo) return 'Data "Od" musi być wcześniejsza lub równa "Do".'
    if (selectedDays.length === 0) return 'Wybierz co najmniej jeden dzień tygodnia.'
    for (const dow of selectedDays) {
      if (!TIME_RE.test(times[dow] ?? '')) return `Wybierz godzinę dla dnia ${DAYS[dow]}.`
    }
    if (previewDates.length === 0) return 'Brak terminów w podanym zakresie dla wybranych dni.'
    return null
  }

  const handleSubmit = async () => {
    const err = validate()
    if (err) {
      if (Platform.OS === 'web') { window.alert(err) } else { Alert.alert('Błąd', err) }
      return
    }
    setSubmitting(true)
    const seriesId = uuid4()
    const rows = previewDates.map(({ date, dow }) => ({
      title: title.trim(),
      date,
      time: (times[dow] ?? '18:00') + ':00',
      category,
      series_id: seriesId,
      group_id: null,
      location: '',
      gps_radius: 100,
      notes: null,
      created_by: profile?.id,
      parish_id: profile?.parish_id,
    }))
    const { error } = await supabase.from('schedules').insert(rows)
    setSubmitting(false)
    if (error) {
      if (Platform.OS === 'web') { window.alert('Błąd: ' + error.message) } else { Alert.alert('Błąd', error.message) }
    } else {
      router.replace('/(admin)/(admin-tabs)/schedules')
    }
  }

  const sortedSelected = [...selectedDays].sort((a, b) => a - b)

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) }]} keyboardShouldPersistTaps="handled">

        <Text style={styles.label}>Tytuł *</Text>
        <TextInput
          style={styles.input}
          placeholder="np. Majowe, Różaniec, Roraty"
          value={title}
          onChangeText={setTitle}
        />

        <Text style={styles.label}>Zakres dat *</Text>
        <View style={styles.dateRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sublabel}>Od</Text>
            <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowFromPicker(true)}>
              <Ionicons name="calendar-outline" size={16} color={c.primary} />
              {dateFrom
                ? <Text style={styles.pickerBtnText}>{formatDate(dateFrom)}</Text>
                : <Text style={styles.pickerBtnPlaceholder}>Wybierz</Text>
              }
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sublabel}>Do</Text>
            <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowToPicker(true)}>
              <Ionicons name="calendar-outline" size={16} color={c.primary} />
              {dateTo
                ? <Text style={styles.pickerBtnText}>{formatDate(dateTo)}</Text>
                : <Text style={styles.pickerBtnPlaceholder}>Wybierz</Text>
              }
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.label}>Kategoria *</Text>
        <View style={styles.categoryRow}>
          {(Object.entries(CATEGORY_CONFIG) as [ScheduleCategory, typeof CATEGORY_CONFIG[ScheduleCategory]][]).map(([key, cfg]) => (
            <TouchableOpacity
              key={key}
              style={[styles.categoryChip, category === key && { backgroundColor: cfg.bg, borderColor: cfg.color }]}
              onPress={() => setCategory(key)}
            >
              <View style={[styles.categoryDot, { backgroundColor: cfg.color }]} />
              <Text style={[styles.categoryChipText, category === key && { color: cfg.color, fontWeight: '700' }]}>
                {cfg.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Dni tygodnia *</Text>
        <View style={styles.dayChips}>
          {DAYS.map((d, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.dayChip, selectedDays.includes(i) && styles.dayChipActive]}
              onPress={() => toggleDay(i)}
            >
              <Text style={[styles.dayChipText, selectedDays.includes(i) && styles.dayChipTextActive]}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.presetsRow}>
          <TouchableOpacity style={styles.presetBtn} onPress={() => setPreset([1, 2, 3, 4, 5])}>
            <Text style={styles.presetBtnText}>Pn–Pt</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.presetBtn} onPress={() => setPreset([0, 1, 2, 3, 4, 5, 6])}>
            <Text style={styles.presetBtnText}>Wszystkie</Text>
          </TouchableOpacity>
          {selectedDays.length > 0 && (
            <TouchableOpacity style={styles.presetBtn} onPress={() => setPreset([])}>
              <Text style={[styles.presetBtnText, { color: c.danger }]}>Wyczyść</Text>
            </TouchableOpacity>
          )}
        </View>

        {sortedSelected.length > 0 && (
          <>
            <Text style={styles.label}>Godziny</Text>
            {sortedSelected.map(dow => (
              <TouchableOpacity
                key={dow}
                style={styles.timeRow}
                onPress={() => setEditingTimeForDay(dow)}
              >
                <Text style={styles.dayLabel}>{DAYS[dow]}</Text>
                <View style={[styles.pickerBtn, { flex: 1, paddingVertical: 10 }]}>
                  <Ionicons name="time-outline" size={15} color={c.primary} />
                  {times[dow]
                    ? <Text style={styles.pickerBtnText}>{times[dow]}</Text>
                    : <Text style={styles.pickerBtnPlaceholder}>Wybierz</Text>
                  }
                  <Ionicons name="chevron-down" size={14} color={c.textTertiary} />
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}

        <View style={[styles.preview, previewDates.length === 0 && styles.previewEmpty]}>
          {previewDates.length === 0 ? (
            <Text style={styles.previewEmptyText}>Brak terminów — uzupełnij zakres i dni</Text>
          ) : (
            <>
              <Text style={styles.previewCount}>Podgląd: {previewDates.length} terminów</Text>
              <Text style={styles.previewSummary}>{previewSummary}</Text>
            </>
          )}
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, (submitting || previewDates.length === 0) && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting || previewDates.length === 0}
        >
          {submitting
            ? <ActivityIndicator color="#fff" />
            : (
              <>
                <Text style={styles.submitBtnText}>
                  Utwórz {previewDates.length > 0 ? previewDates.length : ''} służb
                </Text>
                <Ionicons name="checkmark" size={18} color="#fff" />
              </>
            )
          }
        </TouchableOpacity>
      </ScrollView>

      <DatePickerModal
        visible={showFromPicker}
        value={dateFrom}
        onConfirm={d => { setDateFrom(d); if (dateTo && d > dateTo) setDateTo(d) }}
        onClose={() => setShowFromPicker(false)}
      />
      <DatePickerModal
        visible={showToPicker}
        value={dateTo}
        minDate={dateFrom || undefined}
        onConfirm={setDateTo}
        onClose={() => setShowToPicker(false)}
      />
      <TimePickerModal
        visible={editingTimeForDay !== null}
        value={editingTimeForDay !== null ? (times[editingTimeForDay] ?? '') : ''}
        onConfirm={t => {
          if (editingTimeForDay !== null) setTimes(prev => ({ ...prev, [editingTimeForDay]: t }))
        }}
        onClose={() => setEditingTimeForDay(null)}
      />
    </KeyboardAvoidingView>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    content: { padding: 16, gap: 6 },

    label: { fontSize: 13, fontWeight: '600', color: c.subtext, marginTop: 10, marginBottom: 2 },
    sublabel: { fontSize: 12, color: c.subtext, marginBottom: 4 },
    input: {
      backgroundColor: c.surface, borderRadius: 10, padding: 13,
      fontSize: 15, color: c.text, borderWidth: 1, borderColor: c.border,
    },

    pickerBtn: {
      backgroundColor: c.surface, borderRadius: 10, padding: 13,
      flexDirection: 'row', alignItems: 'center', gap: 8,
      borderWidth: 1, borderColor: c.border,
    },
    pickerBtnText: { flex: 1, fontSize: 14, color: c.text },
    pickerBtnPlaceholder: { flex: 1, fontSize: 14, color: c.textTertiary },

    dateRow: { flexDirection: 'row', gap: 10 },

    categoryRow: { flexDirection: 'row', gap: 8 },
    categoryChip: {
      flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 10, paddingVertical: 10, borderRadius: 10,
      backgroundColor: c.bg, borderWidth: 1.5, borderColor: c.border,
    },
    categoryDot: { width: 8, height: 8, borderRadius: 4 },
    categoryChipText: { fontSize: 12, color: c.subtext, fontWeight: '500', flexShrink: 1 },

    dayChips: { flexDirection: 'row', gap: 6, marginTop: 4 },
    dayChip: {
      flex: 1, paddingVertical: 9, borderRadius: 10,
      backgroundColor: c.primarySurface, alignItems: 'center',
    },
    dayChipActive: { backgroundColor: c.primary },
    dayChipText: { fontSize: 12, fontWeight: '600', color: c.subtext },
    dayChipTextActive: { color: '#fff' },

    presetsRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
    presetBtn: {
      paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8,
      backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
    },
    presetBtnText: { fontSize: 13, color: c.primary, fontWeight: '600' },

    timeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    dayLabel: { width: 26, fontSize: 14, fontWeight: '700', color: c.primary },

    preview: {
      backgroundColor: c.primaryAlpha08, borderRadius: 12, padding: 14, marginTop: 16,
      borderWidth: 1, borderColor: c.primaryAlpha12, gap: 4,
    },
    previewEmpty: { backgroundColor: c.primarySurface, borderColor: c.border },
    previewEmptyText: { fontSize: 13, color: c.textTertiary, textAlign: 'center' },
    previewCount: { fontSize: 15, fontWeight: '700', color: c.primary },
    previewSummary: { fontSize: 13, color: c.subtext },

    submitBtn: {
      backgroundColor: c.primary, borderRadius: 12, padding: 16,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 8, marginTop: 8,
    },
    submitBtnDisabled: { opacity: 0.45 },
    submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  })
}
