import { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { ServiceType } from '../../types/database'

const DAYS = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So']
const DAYS_FULL = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota']
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

type MassEntry = { key: string; day: number; time: string; label: string }

const DEFAULT_POINT_RULES: { service_type: ServiceType; points: number }[] = [
  { service_type: 'msza_assigned', points: 5 },
  { service_type: 'msza_extra',    points: 3 },
  { service_type: 'nabozenstwo',   points: 3 },
  { service_type: 'zbiorka',       points: 5 },
]

export default function OnboardingScreen() {
  const router = useRouter()
  const { profile, parish, fetchProfile } = useAuthStore()

  const [masses, setMasses] = useState<MassEntry[]>([])
  const [selectedDay, setSelectedDay] = useState(0)
  const [timeInput, setTimeInput] = useState('')
  const [labelInput, setLabelInput] = useState('')
  const [saving, setSaving] = useState(false)

  const addMass = () => {
    if (!TIME_RE.test(timeInput)) {
      Alert.alert('Błąd', 'Podaj godzinę w formacie GG:MM (np. 10:00)')
      return
    }
    setMasses(prev => [...prev, {
      key: Date.now().toString(),
      day: selectedDay,
      time: timeInput,
      label: labelInput.trim(),
    }])
    setTimeInput('')
    setLabelInput('')
  }

  const removeMass = (key: string) => setMasses(prev => prev.filter(m => m.key !== key))

  const handleFinish = async () => {
    if (masses.length === 0) {
      Alert.alert('Błąd', 'Dodaj co najmniej jedną Mszę.')
      return
    }
    setSaving(true)

    // 1. Save mass templates
    const { error: massErr } = await supabase.from('mass_templates').insert(
      masses.map(m => ({
        parish_id: profile?.parish_id,
        day_of_week: m.day,
        time: m.time + ':00',
        label: m.label || null,
      }))
    )
    if (massErr) {
      setSaving(false)
      Alert.alert('Błąd', 'Nie udało się zapisać rozkładu mszy.')
      return
    }

    // 2. Seed default point rules (4 fixed categories)
    await supabase.from('point_rules').upsert(
      DEFAULT_POINT_RULES.map(r => ({ parish_id: profile?.parish_id, ...r })),
      { onConflict: 'parish_id,service_type' }
    )

    // 3. Generate schedules for the next year
    const toDate = new Date()
    toDate.setFullYear(toDate.getFullYear() + 1)
    await supabase.rpc('generate_schedules_from_templates', {
      p_parish_id: profile?.parish_id,
      p_from_date: new Date().toISOString().split('T')[0],
      p_to_date: toDate.toISOString().split('T')[0],
    })

    // 4. Mark parish setup as done
    await supabase.from('parishes').update({ setup_done: true }).eq('id', parish?.id ?? '')

    setSaving(false)
    await fetchProfile()
    router.replace('/(admin)/(admin-tabs)')
  }

  const groupedMasses = DAYS.map((_, i) => ({
    day: i,
    items: masses.filter(m => m.day === i),
  })).filter(g => g.items.length > 0)

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#f5f5f5' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Rozkład Mszy Świętych</Text>
        <Text style={styles.subtitle}>
          Podaj kiedy odbywają się Msze w Twojej parafii. Na tej podstawie aplikacja automatycznie wypełni grafik służb na cały rok.
        </Text>

        <View style={styles.dayChips}>
          {DAYS.map((d, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.dayChip, selectedDay === i && styles.dayChipActive]}
              onPress={() => setSelectedDay(i)}
            >
              <Text style={[styles.dayChipText, selectedDay === i && styles.dayChipTextActive]}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.addRow}>
          <TextInput
            style={[styles.input, styles.inputTime]}
            placeholder="GG:MM"
            placeholderTextColor="#aaa"
            value={timeInput}
            onChangeText={setTimeInput}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
          />
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="Etykieta (opcjonalnie)"
            placeholderTextColor="#aaa"
            value={labelInput}
            onChangeText={setLabelInput}
          />
          <TouchableOpacity
            style={[styles.addBtn, !timeInput.trim() && { opacity: 0.4 }]}
            onPress={addMass}
            disabled={!timeInput.trim()}
          >
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {groupedMasses.length === 0 ? (
          <View style={styles.emptyHint}>
            <Ionicons name="time-outline" size={32} color="#ccc" />
            <Text style={styles.emptyHintText}>Dodaj co najmniej jedną Mszę</Text>
          </View>
        ) : (
          groupedMasses.map(({ day, items }) => (
            <View key={day} style={styles.daySection}>
              <Text style={styles.daySectionHeader}>{DAYS_FULL[day]}</Text>
              {items.map(m => (
                <View key={m.key} style={styles.massRow}>
                  <View style={styles.timeBadge}>
                    <Text style={styles.timeBadgeText}>{m.time}</Text>
                  </View>
                  <Text style={styles.massLabel} numberOfLines={1}>{m.label || 'Msza Święta'}</Text>
                  <TouchableOpacity onPress={() => removeMass(m.key)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={18} color="#e74c3c" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ))
        )}

        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={18} color="#534AB7" />
          <Text style={styles.infoText}>
            Grafik zostanie uzupełniony automatycznie na rok do przodu. Punkty za służby możesz dostosować w panelu admina po konfiguracji.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.finishBtn, (masses.length === 0 || saving) && styles.finishBtnDisabled]}
          onPress={handleFinish}
          disabled={masses.length === 0 || saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Text style={styles.finishBtnText}>Zakończ konfigurację</Text>
              <Ionicons name="checkmark" size={18} color="#fff" />
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 20, gap: 14 },

  title: { fontSize: 22, fontWeight: '800', color: '#1a1a1a' },
  subtitle: { fontSize: 14, color: '#777', lineHeight: 20 },

  dayChips: { flexDirection: 'row', gap: 6 },
  dayChip: {
    flex: 1, paddingVertical: 9, borderRadius: 10,
    backgroundColor: '#f0f0f0', alignItems: 'center',
  },
  dayChipActive: { backgroundColor: '#534AB7' },
  dayChipText: { fontSize: 12, fontWeight: '600', color: '#888' },
  dayChipTextActive: { color: '#fff' },

  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    backgroundColor: '#fff', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 12,
    fontSize: 15, color: '#1a1a1a', borderWidth: 1, borderColor: '#e8e8e8',
  },
  inputTime: { width: 72 },
  addBtn: {
    width: 46, height: 46, borderRadius: 10,
    backgroundColor: '#534AB7', justifyContent: 'center', alignItems: 'center',
  },

  emptyHint: {
    alignItems: 'center', paddingVertical: 32, gap: 8,
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1, borderColor: '#f0f0f0',
  },
  emptyHintText: { fontSize: 14, color: '#bbb' },

  daySection: {
    backgroundColor: '#fff', borderRadius: 14,
    overflow: 'hidden', borderWidth: 1, borderColor: '#f0f0f0',
  },
  daySectionHeader: {
    fontSize: 11, fontWeight: '700', color: '#534AB7',
    textTransform: 'uppercase', letterSpacing: 0.8,
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6,
    backgroundColor: '#534AB708',
  },
  massRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 11,
    borderTopWidth: 1, borderTopColor: '#f5f5f5',
  },
  timeBadge: {
    backgroundColor: '#534AB711', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
    minWidth: 52, alignItems: 'center',
  },
  timeBadgeText: { fontSize: 14, fontWeight: '700', color: '#534AB7' },
  massLabel: { flex: 1, fontSize: 14, color: '#555' },

  infoBox: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: '#534AB710', borderRadius: 12, padding: 14,
  },
  infoText: { flex: 1, fontSize: 13, color: '#534AB7', lineHeight: 18 },

  footer: {
    padding: 16,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f0f0f0',
  },
  finishBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: '#534AB7',
    paddingVertical: 14, borderRadius: 12,
  },
  finishBtnDisabled: { opacity: 0.45 },
  finishBtnText: { fontSize: 15, color: '#fff', fontWeight: '700' },
})
