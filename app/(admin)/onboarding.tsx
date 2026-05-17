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
import { ServiceType, SERVICE_TYPE_LABELS } from '../../types/database'

const DAYS = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So']
const DAYS_FULL = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota']
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const SERVICE_TYPES: ServiceType[] = ['msza_assigned', 'msza_extra', 'nabozenstwo', 'zbiorka']

type MassEntry = { key: string; day: number; time: string; label: string }

export default function OnboardingScreen() {
  const router = useRouter()
  const { profile, parish, fetchProfile } = useAuthStore()
  const [step, setStep] = useState(0)

  // Step 0: mass schedule
  const [masses, setMasses] = useState<MassEntry[]>([])
  const [selectedDay, setSelectedDay] = useState(0)
  const [timeInput, setTimeInput] = useState('')
  const [labelInput, setLabelInput] = useState('')

  // Step 1: point rules
  const [pointValues, setPointValues] = useState<Record<ServiceType, string>>({
    msza_assigned: '5', msza_extra: '3', nabozenstwo: '3', zbiorka: '5',
  })

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
    for (const type of SERVICE_TYPES) {
      const n = parseInt(pointValues[type])
      if (isNaN(n) || n < 0) {
        Alert.alert('Błąd', `Nieprawidłowa wartość dla "${SERVICE_TYPE_LABELS[type]}".`)
        return
      }
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

    // 2. Save point rules with admin-chosen values
    await supabase.from('point_rules').upsert(
      SERVICE_TYPES.map(type => ({
        parish_id: profile?.parish_id,
        service_type: type,
        points: parseInt(pointValues[type]),
      })),
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
      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View style={styles.progressStep}>
          <View style={[styles.dot, styles.dotActive]} />
          <Text style={[styles.stepLabel, step === 0 && styles.stepLabelActive]}>Rozkład Mszy</Text>
        </View>
        <View style={[styles.progressLine, step >= 1 && styles.progressLineActive]} />
        <View style={styles.progressStep}>
          <View style={[styles.dot, step >= 1 && styles.dotActive]} />
          <Text style={[styles.stepLabel, step === 1 && styles.stepLabelActive]}>Punktacja</Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 0 ? (
          <>
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
          </>
        ) : (
          <>
            <Text style={styles.title}>Punktacja za służby</Text>
            <Text style={styles.subtitle}>
              Ustaw ile punktów ministranci otrzymują za każdy rodzaj służby. Możesz to zmienić w dowolnym momencie w panelu admina.
            </Text>

            {SERVICE_TYPES.map(type => (
              <View key={type} style={styles.ruleRow}>
                <Text style={styles.ruleLabel}>{SERVICE_TYPE_LABELS[type]}</Text>
                <View style={styles.ruleInputGroup}>
                  <TextInput
                    style={styles.ruleInput}
                    value={pointValues[type]}
                    onChangeText={v => setPointValues(prev => ({ ...prev, [type]: v.replace(/[^0-9]/g, '') }))}
                    keyboardType="number-pad"
                    maxLength={3}
                  />
                  <Text style={styles.ruleUnit}>pkt</Text>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {step === 1 && (
          <TouchableOpacity style={styles.backBtn} onPress={() => setStep(0)}>
            <Ionicons name="arrow-back" size={18} color="#534AB7" />
            <Text style={styles.backBtnText}>Wróć</Text>
          </TouchableOpacity>
        )}
        {step === 0 ? (
          <TouchableOpacity
            style={[styles.nextBtn, masses.length === 0 && styles.nextBtnDisabled]}
            onPress={() => setStep(1)}
            disabled={masses.length === 0}
          >
            <Text style={styles.nextBtnText}>Dalej</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.nextBtn, saving && styles.nextBtnDisabled]}
            onPress={handleFinish}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Text style={styles.nextBtnText}>Zakończ konfigurację</Text>
                <Ionicons name="checkmark" size={18} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  progressBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, paddingVertical: 20,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
    gap: 0,
  },
  progressStep: { alignItems: 'center', gap: 6 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#e0e0e0' },
  dotActive: { backgroundColor: '#534AB7' },
  stepLabel: { fontSize: 12, color: '#aaa', fontWeight: '500' },
  stepLabelActive: { color: '#534AB7', fontWeight: '700' },
  progressLine: { flex: 1, height: 2, backgroundColor: '#e0e0e0', marginHorizontal: 8, marginBottom: 18 },
  progressLineActive: { backgroundColor: '#534AB7' },

  scroll: { flex: 1 },
  content: { padding: 20, gap: 14 },

  title: { fontSize: 22, fontWeight: '800', color: '#1a1a1a' },
  subtitle: { fontSize: 14, color: '#777', lineHeight: 20 },

  dayChips: { flexDirection: 'row', gap: 6 },
  dayChip: { flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: '#f0f0f0', alignItems: 'center' },
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
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#f0f0f0',
  },
  emptyHintText: { fontSize: 14, color: '#bbb' },

  daySection: { backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#f0f0f0' },
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
    paddingHorizontal: 10, paddingVertical: 4, minWidth: 52, alignItems: 'center',
  },
  timeBadgeText: { fontSize: 14, fontWeight: '700', color: '#534AB7' },
  massLabel: { flex: 1, fontSize: 14, color: '#555' },

  ruleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#f0f0f0',
  },
  ruleLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  ruleInputGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ruleInput: {
    backgroundColor: '#f0f0f0', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7,
    fontSize: 18, fontWeight: '800', color: '#534AB7',
    minWidth: 48, textAlign: 'center',
  },
  ruleUnit: { fontSize: 12, color: '#888', fontWeight: '600' },

  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
    padding: 16, gap: 12,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f0f0f0',
  },
  backBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 12, paddingHorizontal: 16,
    borderRadius: 12, borderWidth: 1, borderColor: '#534AB733',
  },
  backBtnText: { fontSize: 15, color: '#534AB7', fontWeight: '600' },
  nextBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: '#534AB7', paddingVertical: 14, borderRadius: 12,
  },
  nextBtnDisabled: { opacity: 0.45 },
  nextBtnText: { fontSize: 15, color: '#fff', fontWeight: '700' },
})
