import { useEffect, useState, useMemo } from 'react'
import {
  View, Text, TextInput, StyleSheet, ScrollView,
  TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { MassTemplate, ScheduleCategory, CATEGORY_CONFIG, getCatColors } from '../../types/database'
import { DatePickerModal } from '../../components/DatePickerModal'
import { TimePickerModal } from '../../components/TimePickerModal'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'

export default function ScheduleForm() {
  const router = useRouter()
  const { profile } = useAuthStore()
  const insets = useSafeAreaInsets()
  const { colors: c, isDark } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
  const { date: initDate, time: initTime, title: initTitle } = useLocalSearchParams<{
    date?: string; time?: string; title?: string
  }>()

  const [title, setTitle] = useState(initTitle ?? '')
  const [date, setDate] = useState(initDate ?? '')
  const [time, setTime] = useState(initTime ?? '')
  const [category, setCategory] = useState<ScheduleCategory>('msza')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [templates, setTemplates] = useState<MassTemplate[]>([])
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)

  useEffect(() => {
    if (profile?.parish_id) {
      supabase.from('mass_templates').select('*')
        .eq('parish_id', profile.parish_id)
        .order('day_of_week').order('time')
        .then(({ data }) => setTemplates((data as MassTemplate[]) ?? []))
    }
  }, [])

  const suggestedTimes = date && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? templates.filter(t => t.day_of_week === new Date(date + 'T12:00:00').getDay()).map(t => t.time.slice(0, 5))
    : []

  const validate = () => {
    if (!title.trim()) return 'Wpisz tytuł służby.'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Wybierz datę.'
    if (!/^\d{2}:\d{2}$/.test(time)) return 'Wybierz godzinę.'
    return null
  }

  const handleSubmit = async () => {
    const err = validate()
    if (err) { Alert.alert('Błąd', err); return }

    setSubmitting(true)
    const { error } = await supabase.from('schedules').insert({
      title: title.trim(),
      group_id: null,
      date,
      time: time + ':00',
      category,
      location: '',
      gps_radius: 100,
      notes: notes.trim() || null,
      created_by: profile?.id,
      parish_id: profile?.parish_id,
    })
    setSubmitting(false)

    if (error) {
      Alert.alert('Błąd', 'Nie udało się zapisać służby: ' + error.message)
    } else {
      Alert.alert('Sukces', 'Służba została dodana!', [{ text: 'OK', onPress: () => router.back() }])
    }
  }

  const dateLabel = date
    ? new Date(date + 'T12:00:00').toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : null

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) }]} keyboardShouldPersistTaps="handled">

        <Text style={styles.label}>Tytuł służby *</Text>
        <TextInput
          style={styles.input}
          placeholder="np. Msza Święta niedzielna"
          value={title}
          onChangeText={setTitle}
        />

        <Text style={styles.label}>Data *</Text>
        <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowDatePicker(true)}>
          <Ionicons name="calendar-outline" size={18} color={c.primary} />
          <View style={{ flex: 1 }}>
            {dateLabel
              ? <Text style={styles.pickerBtnText}>{dateLabel}</Text>
              : <Text style={styles.pickerBtnPlaceholder}>Wybierz datę</Text>
            }
          </View>
          <Ionicons name="chevron-down" size={16} color={c.textTertiary} />
        </TouchableOpacity>

        <Text style={styles.label}>Godzina *</Text>
        {suggestedTimes.length > 0 && (
          <View style={styles.groupRow}>
            {suggestedTimes.map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.groupChip, time === t && styles.groupChipActive]}
                onPress={() => setTime(t)}
              >
                <Text style={[styles.groupChipText, time === t && styles.groupChipTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowTimePicker(true)}>
          <Ionicons name="time-outline" size={18} color={c.primary} />
          {time
            ? <Text style={[styles.pickerBtnText, { flex: 1 }]}>{time}</Text>
            : <Text style={[styles.pickerBtnPlaceholder, { flex: 1 }]}>Wybierz godzinę</Text>
          }
          <Ionicons name="chevron-down" size={16} color={c.textTertiary} />
        </TouchableOpacity>

        <Text style={styles.label}>Kategoria *</Text>
        <View style={styles.categoryRow}>
          {(Object.keys(CATEGORY_CONFIG) as ScheduleCategory[]).map(key => {
            const catCfg = getCatColors(key, isDark)
            return (
              <TouchableOpacity
                key={key}
                style={[styles.categoryChip, category === key && { backgroundColor: catCfg.bg, borderColor: catCfg.color }]}
                onPress={() => setCategory(key)}
              >
                <View style={[styles.categoryDot, { backgroundColor: catCfg.color }]} />
                <Text style={[styles.categoryChipText, category === key && { color: catCfg.color, fontWeight: '700' }]}>
                  {catCfg.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>

        <Text style={styles.label}>Notatki (opcjonalnie)</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          placeholder="Dodatkowe informacje..."
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
        />

        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.submitButtonText}>Zapisz służbę</Text>
          }
        </TouchableOpacity>
      </ScrollView>

      <DatePickerModal
        visible={showDatePicker}
        value={date}
        onConfirm={setDate}
        onClose={() => setShowDatePicker(false)}
      />
      <TimePickerModal
        visible={showTimePicker}
        value={time}
        onConfirm={setTime}
        onClose={() => setShowTimePicker(false)}
      />
    </KeyboardAvoidingView>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    content: { padding: 16, gap: 6 },

    label: { fontSize: 13, fontWeight: '600', color: c.subtext, marginTop: 8, marginBottom: 2 },
    input: {
      backgroundColor: c.surface, borderRadius: 10, padding: 13,
      fontSize: 15, color: c.text, borderWidth: 1, borderColor: c.border,
    },
    inputMultiline: { minHeight: 80, textAlignVertical: 'top' },

    pickerBtn: {
      backgroundColor: c.surface, borderRadius: 10, padding: 13,
      flexDirection: 'row', alignItems: 'center', gap: 10,
      borderWidth: 1, borderColor: c.border,
    },
    pickerBtnText: { fontSize: 15, color: c.text, flex: 1 },
    pickerBtnPlaceholder: { fontSize: 15, color: c.textTertiary, flex: 1 },

    categoryRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    categoryChip: {
      flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7,
      paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
      backgroundColor: c.bg, borderWidth: 1.5, borderColor: c.border,
    },
    categoryDot: { width: 8, height: 8, borderRadius: 4 },
    categoryChipText: { fontSize: 13, color: c.subtext, fontWeight: '500' },

    groupRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    groupChip: {
      borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
      backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
    },
    groupChipActive: { backgroundColor: c.primary, borderColor: c.primary },
    groupChipText: { fontSize: 14, color: c.subtext },
    groupChipTextActive: { color: '#fff', fontWeight: '600' },

    submitButton: {
      backgroundColor: c.primary, borderRadius: 12, padding: 16,
      alignItems: 'center', marginTop: 16,
    },
    submitButtonDisabled: { opacity: 0.6 },
    submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  })
}
