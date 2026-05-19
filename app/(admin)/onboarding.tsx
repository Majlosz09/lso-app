import { useState, useMemo } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { ServiceType, SERVICE_TYPE_LABELS, AttendanceMode } from '../../types/database'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'

const DAYS = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So']
const DAYS_FULL = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota']
const SERVICE_TYPES: ServiceType[] = ['msza_assigned', 'msza_extra', 'nabozenstwo', 'zbiorka']
const STEPS = ['Witaj', 'Msze', 'Punkty', 'Obecność', 'Gotowe']

const ATTENDANCE_MODES: {
  value: AttendanceMode
  icon: React.ComponentProps<typeof Ionicons>['name']
  label: string
  description: string
}[] = [
  {
    value: 'button',
    icon: 'hand-right-outline',
    label: 'Przycisk',
    description: 'Ministranci sami zaznaczają obecność przyciskiem w aplikacji',
  },
  {
    value: 'gps',
    icon: 'location-outline',
    label: 'GPS',
    description: 'Obecność weryfikowana automatycznie na podstawie lokalizacji',
  },
  {
    value: 'qr',
    icon: 'qr-code-outline',
    label: 'Kod QR',
    description: 'Ministranci skanują kod QR wyświetlony przez księdza/admina',
  },
  {
    value: 'admin',
    icon: 'shield-checkmark-outline',
    label: 'Tylko admin',
    description: 'Wyłącznie ksiądz lub admin może oznaczyć obecność ministranta',
  },
]

type MassEntry = { key: string; day: number; time: string; label: string }

function parseTime(raw: string): string | null {
  const clean = raw.trim().replace(/[^\d:]/g, '')
  let h: number, m: number
  if (clean.includes(':')) {
    const [hs, ms = '0'] = clean.split(':')
    h = parseInt(hs); m = parseInt(ms)
  } else if (clean.length === 0) {
    return null
  } else if (clean.length <= 2) {
    h = parseInt(clean); m = 0
  } else {
    const hLen = Math.max(1, clean.length - 2)
    h = parseInt(clean.slice(0, hLen)); m = parseInt(clean.slice(hLen))
  }
  if (isNaN(h) || isNaN(m)) return null
  h = Math.min(23, Math.max(0, h)); m = Math.min(59, Math.max(0, m))
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export default function OnboardingScreen() {
  const router = useRouter()
  const { profile, parish, fetchProfile } = useAuthStore()
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
  const [step, setStep] = useState(0)

  const [masses, setMasses] = useState<MassEntry[]>([])
  const [selectedDay, setSelectedDay] = useState(0)
  const [timeInput, setTimeInput] = useState('')
  const [labelInput, setLabelInput] = useState('')

  const [pointValues, setPointValues] = useState<Record<ServiceType, string>>({
    msza_assigned: '5', msza_extra: '3', nabozenstwo: '3', zbiorka: '5',
  })

  const [attendanceMode, setAttendanceMode] = useState<AttendanceMode>('button')
  const [gpsLat, setGpsLat] = useState('')
  const [gpsLng, setGpsLng] = useState('')
  const [gpsRadius, setGpsRadius] = useState('200')

  const [saving, setSaving] = useState(false)

  const handleTimeBlur = () => {
    if (!timeInput.trim()) return
    const normalized = parseTime(timeInput)
    if (normalized) setTimeInput(normalized)
  }

  const addMass = () => {
    const time = parseTime(timeInput)
    if (!time) { Alert.alert('Błąd', 'Wpisz prawidłową godzinę, np. 09:00 lub 9:30.'); return }
    setMasses(prev => [...prev, { key: Date.now().toString(), day: selectedDay, time, label: labelInput.trim() }])
    setTimeInput(''); setLabelInput('')
  }

  const removeMass = (key: string) => setMasses(prev => prev.filter(m => m.key !== key))

  const handleFinish = async () => {
    for (const type of SERVICE_TYPES) {
      const n = parseInt(pointValues[type])
      if (isNaN(n) || n < 0) {
        Alert.alert('Błąd', `Nieprawidłowa wartość dla "${SERVICE_TYPE_LABELS[type]}".`); return
      }
    }
    if (attendanceMode === 'gps') {
      const lat = parseFloat(gpsLat)
      const lng = parseFloat(gpsLng)
      const radius = parseInt(gpsRadius)
      if (isNaN(lat) || isNaN(lng)) {
        Alert.alert('Błąd', 'Podaj prawidłowe współrzędne GPS.'); return
      }
      if (isNaN(radius) || radius < 10) {
        Alert.alert('Błąd', 'Promień musi być co najmniej 10 metrów.'); return
      }
    }
    setSaving(true)

    if (masses.length > 0) {
      const { error: massErr } = await supabase.from('mass_templates').insert(
        masses.map(m => ({ parish_id: profile?.parish_id, day_of_week: m.day, time: m.time + ':00', label: m.label || null }))
      )
      if (massErr) { setSaving(false); Alert.alert('Błąd', 'Nie udało się zapisać rozkładu mszy.'); return }
    }

    await supabase.from('point_rules').upsert(
      SERVICE_TYPES.map(type => ({ parish_id: profile?.parish_id, service_type: type, points: parseInt(pointValues[type]) })),
      { onConflict: 'parish_id,service_type' }
    )

    if (masses.length > 0) {
      const toDate = new Date()
      toDate.setFullYear(toDate.getFullYear() + 1)
      await supabase.rpc('generate_schedules_from_templates', {
        p_parish_id: profile?.parish_id,
        p_from_date: new Date().toISOString().split('T')[0],
        p_to_date: toDate.toISOString().split('T')[0],
      })
    }

    const attendanceUpdate: Record<string, unknown> = {
      setup_done: true,
      attendance_mode: attendanceMode,
    }
    if (attendanceMode === 'gps') {
      attendanceUpdate.lat = parseFloat(gpsLat)
      attendanceUpdate.lng = parseFloat(gpsLng)
      attendanceUpdate.gps_radius = parseInt(gpsRadius) || 200
    }

    const { error: parishErr } = await supabase
      .from('parishes').update(attendanceUpdate).eq('id', parish?.id ?? '')
    setSaving(false)
    if (parishErr) { Alert.alert('Błąd', 'Nie udało się zapisać konfiguracji parafii.'); return }
    setStep(4)
    fetchProfile().catch(() => {})
  }

  const groupedMasses = DAYS.map((_, i) => ({ day: i, items: masses.filter(m => m.day === i) })).filter(g => g.items.length > 0)

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

      {/* Progress bar — hidden on welcome and done screens */}
      {step > 0 && step < 4 && (
        <View style={styles.progressBar}>
          {STEPS.slice(1, 4).map((label, i) => (
            <View key={i} style={styles.progressStep}>
              {i > 0 && <View style={[styles.progressLine, step - 1 >= i && styles.progressLineActive]} />}
              <View style={[styles.dot, step - 1 >= i && styles.dotActive]} />
              <Text style={[styles.stepLabel, step - 1 === i && styles.stepLabelActive]}>{label}</Text>
            </View>
          ))}
        </View>
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* KROK 0: Witaj */}
        {step === 0 && (
          <View style={styles.welcomeContainer}>
            <View style={styles.welcomeIcon}>
              <Ionicons name="shield-checkmark" size={56} color={c.primary} />
            </View>
            <Text style={styles.welcomeTitle}>Witaj w LSO!</Text>
            <Text style={styles.welcomeSubtitle}>
              Twoja parafia jest prawie gotowa. Przeprowadzimy Cię przez krótką konfigurację — zajmie to tylko 2 minuty.
            </Text>

            <View style={styles.stepsList}>
              {[
                { icon: 'time-outline', label: 'Rozkład Mszy Świętych', sub: 'Godziny stałych mszy w tygodniu' },
                { icon: 'trophy-outline', label: 'Zasady punktacji', sub: 'Ile punktów za każdy typ służby' },
                { icon: 'location-outline', label: 'Weryfikacja obecności', sub: 'Jak ministranci potwierdzają obecność' },
              ].map((item, i) => (
                <View key={i} style={styles.stepsItem}>
                  <View style={styles.stepsIconWrap}>
                    <Ionicons name={item.icon as any} size={20} color={c.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stepsItemLabel}>{item.label}</Text>
                    <Text style={styles.stepsItemSub}>{item.sub}</Text>
                  </View>
                </View>
              ))}
            </View>

            <Text style={styles.inviteHint}>
              Kod zaproszenia dla ministrantów: <Text style={styles.inviteCode}>{parish?.invite_code ?? '—'}</Text>
            </Text>
          </View>
        )}

        {/* KROK 1: Rozkład Mszy */}
        {step === 1 && (
          <>
            <Text style={styles.title}>Rozkład Mszy Świętych</Text>
            <Text style={styles.subtitle}>
              Podaj kiedy odbywają się Msze w Twojej parafii. Na tej podstawie aplikacja automatycznie wypełni grafik służb na cały rok.
            </Text>

            <View style={styles.dayChips}>
              {DAYS.map((d, i) => (
                <TouchableOpacity key={i} style={[styles.dayChip, selectedDay === i && styles.dayChipActive]} onPress={() => setSelectedDay(i)}>
                  <Text style={[styles.dayChipText, selectedDay === i && styles.dayChipTextActive]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.addRow}>
              <TextInput
                style={styles.timeInput} placeholder="HH:MM" placeholderTextColor={c.textTertiary}
                value={timeInput} onChangeText={setTimeInput} onBlur={handleTimeBlur}
                keyboardType="numbers-and-punctuation" returnKeyType="next" maxLength={5}
              />
              <TextInput
                style={styles.labelInput} placeholder="Etykieta (opcjonalnie)" placeholderTextColor={c.textTertiary}
                value={labelInput} onChangeText={setLabelInput} returnKeyType="done" onSubmitEditing={addMass}
              />
              <TouchableOpacity style={styles.addBtn} onPress={addMass}>
                <Ionicons name="add" size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            {groupedMasses.length === 0 ? (
              <View style={styles.emptyHint}>
                <Ionicons name="time-outline" size={32} color="#D1D5DB" />
                <Text style={styles.emptyHintText}>Dodaj co najmniej jedną Mszę</Text>
              </View>
            ) : (
              groupedMasses.map(({ day, items }) => (
                <View key={day} style={styles.daySection}>
                  <Text style={styles.daySectionHeader}>{DAYS_FULL[day]}</Text>
                  {items.map(m => (
                    <View key={m.key} style={styles.massRow}>
                      <View style={styles.timeBadge}><Text style={styles.timeBadgeText}>{m.time}</Text></View>
                      <Text style={styles.massLabel} numberOfLines={1}>{m.label || 'Msza Święta'}</Text>
                      <TouchableOpacity onPress={() => removeMass(m.key)} hitSlop={8}>
                        <Ionicons name="trash-outline" size={18} color="#DC2626" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ))
            )}
          </>
        )}

        {/* KROK 2: Punktacja */}
        {step === 2 && (
          <>
            <Text style={styles.title}>Punktacja za służby</Text>
            <Text style={styles.subtitle}>
              Ustaw ile punktów ministranci otrzymują za każdy rodzaj służby. Możesz to zmienić w dowolnym momencie w ustawieniach parafii.
            </Text>
            {SERVICE_TYPES.map(type => (
              <View key={type} style={styles.ruleRow}>
                <Text style={styles.ruleLabel}>{SERVICE_TYPE_LABELS[type]}</Text>
                <View style={styles.ruleInputGroup}>
                  <TextInput
                    style={styles.ruleInput}
                    value={pointValues[type]}
                    onChangeText={v => setPointValues(prev => ({ ...prev, [type]: v.replace(/[^0-9]/g, '') }))}
                    keyboardType="number-pad" maxLength={3}
                  />
                  <Text style={styles.ruleUnit}>pkt</Text>
                </View>
              </View>
            ))}
          </>
        )}

        {/* KROK 3: Weryfikacja obecności */}
        {step === 3 && (
          <>
            <Text style={styles.title}>Weryfikacja obecności</Text>
            <Text style={styles.subtitle}>
              Wybierz w jaki sposób ministranci będą potwierdzać swoją obecność na służbach.
            </Text>
            {ATTENDANCE_MODES.map(mode => (
              <TouchableOpacity
                key={mode.value}
                style={[styles.modeCard, attendanceMode === mode.value && styles.modeCardActive]}
                onPress={() => setAttendanceMode(mode.value)}
                activeOpacity={0.75}
              >
                <View style={[styles.modeIconWrap, attendanceMode === mode.value && styles.modeIconWrapActive]}>
                  <Ionicons name={mode.icon} size={22} color={attendanceMode === mode.value ? '#fff' : c.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modeTitle, attendanceMode === mode.value && styles.modeTitleActive]}>
                    {mode.label}
                  </Text>
                  <Text style={styles.modeSub}>{mode.description}</Text>
                </View>
                {attendanceMode === mode.value && (
                  <Ionicons name="checkmark-circle" size={22} color={c.primary} />
                )}
              </TouchableOpacity>
            ))}

            {attendanceMode === 'gps' && (
              <View style={styles.gpsFields}>
                <Text style={styles.gpsTitle}>Lokalizacja kościoła</Text>
                <Text style={styles.gpsSub}>
                  Podaj współrzędne kościoła i promień w metrach, w którym ministranci mogą potwierdzić obecność.
                </Text>
                <View style={styles.gpsRow}>
                  <TextInput
                    style={styles.gpsInput}
                    placeholder="Szerokość (np. 50.0613)"
                    placeholderTextColor={c.textTertiary}
                    value={gpsLat}
                    onChangeText={setGpsLat}
                    keyboardType="decimal-pad"
                  />
                  <TextInput
                    style={styles.gpsInput}
                    placeholder="Długość (np. 19.9372)"
                    placeholderTextColor={c.textTertiary}
                    value={gpsLng}
                    onChangeText={setGpsLng}
                    keyboardType="decimal-pad"
                  />
                </View>
                <TextInput
                  style={[styles.gpsInput, { width: '100%' }]}
                  placeholder="Promień w metrach (domyślnie 200)"
                  placeholderTextColor={c.textTertiary}
                  value={gpsRadius}
                  onChangeText={setGpsRadius}
                  keyboardType="number-pad"
                />
              </View>
            )}
          </>
        )}

        {/* KROK 4: Gotowe */}
        {step === 4 && (
          <View style={styles.doneContainer}>
            <View style={styles.doneIcon}>
              <Ionicons name="checkmark-circle" size={64} color="#16A34A" />
            </View>
            <Text style={styles.doneTitle}>Parafia skonfigurowana!</Text>
            <Text style={styles.doneSubtitle}>
              Wszystko gotowe. Możesz teraz zaprosić ministrantów do aplikacji.
            </Text>

            <View style={styles.inviteCard}>
              <Text style={styles.inviteCardLabel}>Kod zaproszenia dla ministrantów</Text>
              <Text style={styles.inviteCardCode}>{parish?.invite_code ?? '—'}</Text>
              <Text style={styles.inviteCardHint}>
                Ministranci wpisują ten kod podczas rejestracji, żeby dołączyć do Twojej parafii.
              </Text>
            </View>

            <View style={styles.nextStepsList}>
              <Text style={styles.nextStepsTitle}>Co dalej?</Text>
              {[
                'Udostępnij kod zaproszenia ministrantom',
                'Sprawdź grafik służb w zakładce Grafiki',
                'Przypisuj ministrantów do służb',
              ].map((item, i) => (
                <View key={i} style={styles.nextStepItem}>
                  <View style={styles.nextStepNum}><Text style={styles.nextStepNumText}>{i + 1}</Text></View>
                  <Text style={styles.nextStepText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

      </ScrollView>

      {/* Footer buttons */}
      <View style={styles.footer}>
        {step === 1 && (
          <TouchableOpacity style={styles.backBtn} onPress={() => setStep(0)}>
            <Ionicons name="arrow-back" size={18} color={c.primary} />
            <Text style={styles.backBtnText}>Wróć</Text>
          </TouchableOpacity>
        )}
        {step === 2 && (
          <TouchableOpacity style={styles.backBtn} onPress={() => setStep(1)}>
            <Ionicons name="arrow-back" size={18} color={c.primary} />
            <Text style={styles.backBtnText}>Wróć</Text>
          </TouchableOpacity>
        )}
        {step === 3 && (
          <TouchableOpacity style={styles.backBtn} onPress={() => setStep(2)}>
            <Ionicons name="arrow-back" size={18} color={c.primary} />
            <Text style={styles.backBtnText}>Wróć</Text>
          </TouchableOpacity>
        )}

        {step === 0 && (
          <TouchableOpacity style={styles.nextBtn} onPress={() => setStep(1)}>
            <Text style={styles.nextBtnText}>Zacznij konfigurację</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
        )}
        {step === 1 && (
          <TouchableOpacity
            style={[styles.nextBtn, masses.length === 0 && styles.nextBtnDisabled]}
            onPress={() => setStep(2)}
            disabled={masses.length === 0}
          >
            <Text style={styles.nextBtnText}>Dalej</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
        )}
        {step === 2 && (
          <TouchableOpacity style={styles.nextBtn} onPress={() => setStep(3)}>
            <Text style={styles.nextBtnText}>Dalej</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
        )}
        {step === 3 && (
          <TouchableOpacity style={[styles.nextBtn, saving && styles.nextBtnDisabled]} onPress={handleFinish} disabled={saving}>
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <><Text style={styles.nextBtnText}>Zakończ konfigurację</Text><Ionicons name="checkmark" size={18} color="#fff" /></>
            }
          </TouchableOpacity>
        )}
        {step === 4 && (
          <TouchableOpacity style={[styles.nextBtn, { backgroundColor: '#16A34A' }]} onPress={() => router.replace('/(admin)/(admin-tabs)')}>
            <Text style={styles.nextBtnText}>Przejdź do panelu</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    progressBar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      paddingHorizontal: 24, paddingVertical: 18,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.primarySurface,
    },
    progressStep: { alignItems: 'center', gap: 6, flexDirection: 'row' },
    dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: c.border },
    dotActive: { backgroundColor: c.primary },
    stepLabel: { fontSize: 12, color: c.textTertiary, fontWeight: '500', marginLeft: 6 },
    stepLabelActive: { color: c.primary, fontWeight: '700' },
    progressLine: { width: 28, height: 2, backgroundColor: c.border, marginHorizontal: 8 },
    progressLineActive: { backgroundColor: c.primary },

    scroll: { flex: 1 },
    content: { padding: 20, gap: 14 },

    // Welcome
    welcomeContainer: { alignItems: 'center', gap: 20, paddingTop: 20 },
    welcomeIcon: {
      width: 100, height: 100, borderRadius: 28,
      backgroundColor: c.primaryAlpha08 + '6', alignItems: 'center', justifyContent: 'center',
    },
    welcomeTitle: { fontSize: 28, fontWeight: '800', color: c.text, textAlign: 'center' },
    welcomeSubtitle: { fontSize: 15, color: c.subtext, lineHeight: 22, textAlign: 'center' },
    stepsList: { width: '100%', gap: 10 },
    stepsItem: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: c.surface, borderRadius: 14, padding: 14,
      borderWidth: 1, borderColor: c.primarySurface,
    },
    stepsIconWrap: {
      width: 40, height: 40, borderRadius: 12,
      backgroundColor: c.primaryAlpha08 + '6', alignItems: 'center', justifyContent: 'center',
    },
    stepsItemLabel: { fontSize: 14, fontWeight: '600', color: c.text },
    stepsItemSub: { fontSize: 12, color: c.textTertiary, marginTop: 2 },
    inviteHint: { fontSize: 13, color: c.subtext, textAlign: 'center' },
    inviteCode: { fontWeight: '800', color: c.primary, letterSpacing: 2 },

    // Steps 1 & 2
    title: { fontSize: 22, fontWeight: '800', color: c.text },
    subtitle: { fontSize: 14, color: c.subtext, lineHeight: 20 },

    dayChips: { flexDirection: 'row', gap: 6 },
    dayChip: { flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: c.primarySurface, alignItems: 'center' },
    dayChipActive: { backgroundColor: c.primary },
    dayChipText: { fontSize: 12, fontWeight: '600', color: c.subtext },
    dayChipTextActive: { color: '#fff' },

    addRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.surface, borderRadius: 14,
      borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 12, paddingVertical: 10,
    },
    timeInput: {
      width: 68, backgroundColor: c.bg, borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 10,
      fontSize: 15, fontWeight: '700', color: c.primary, textAlign: 'center',
      borderWidth: 1, borderColor: c.border,
    },
    labelInput: {
      flex: 1, backgroundColor: c.bg, borderRadius: 8,
      paddingHorizontal: 12, paddingVertical: 10,
      fontSize: 14, color: c.text, borderWidth: 1, borderColor: c.border,
    },
    addBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' },

    emptyHint: {
      alignItems: 'center', paddingVertical: 32, gap: 8,
      backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.primarySurface,
    },
    emptyHintText: { fontSize: 14, color: c.textTertiary },

    daySection: { backgroundColor: c.surface, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: c.primarySurface },
    daySectionHeader: {
      fontSize: 11, fontWeight: '700', color: c.primary,
      textTransform: 'uppercase', letterSpacing: 0.8,
      paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6, backgroundColor: c.primaryAlpha08,
    },
    massRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 14, paddingVertical: 11,
      borderTopWidth: 1, borderTopColor: c.bg,
    },
    timeBadge: { backgroundColor: c.primaryAlpha08, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, minWidth: 52, alignItems: 'center' },
    timeBadgeText: { fontSize: 14, fontWeight: '700', color: c.primary },
    massLabel: { flex: 1, fontSize: 14, color: c.subtext },

    ruleRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: c.surface, borderRadius: 12, padding: 14,
      borderWidth: 1, borderColor: c.primarySurface,
    },
    ruleLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: c.text },
    ruleInputGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    ruleInput: {
      backgroundColor: c.primarySurface, borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 7,
      fontSize: 18, fontWeight: '800', color: c.primary,
      minWidth: 48, textAlign: 'center',
    },
    ruleUnit: { fontSize: 12, color: c.subtext, fontWeight: '600' },

    // Attendance mode cards
    modeCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: c.surface, borderRadius: 14, padding: 14,
      borderWidth: 2, borderColor: c.primarySurface,
    },
    modeCardActive: { borderColor: c.primary, backgroundColor: c.primaryAlpha08 },
    modeIconWrap: {
      width: 44, height: 44, borderRadius: 12,
      backgroundColor: c.primaryAlpha08 + '6', alignItems: 'center', justifyContent: 'center',
    },
    modeIconWrapActive: { backgroundColor: c.primary },
    modeTitle: { fontSize: 15, fontWeight: '700', color: c.text },
    modeTitleActive: { color: c.primary },
    modeSub: { fontSize: 12, color: c.textTertiary, marginTop: 2, lineHeight: 17 },

    // GPS fields
    gpsFields: {
      backgroundColor: c.surface, borderRadius: 14, padding: 16, gap: 12,
      borderWidth: 1, borderColor: c.primaryAlpha20,
    },
    gpsTitle: { fontSize: 14, fontWeight: '700', color: c.text },
    gpsSub: { fontSize: 13, color: c.subtext, lineHeight: 18 },
    gpsRow: { flexDirection: 'row', gap: 10 },
    gpsInput: {
      flex: 1, backgroundColor: c.bg, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 11,
      fontSize: 14, color: c.text, borderWidth: 1, borderColor: c.border,
    },

    // Done
    doneContainer: { alignItems: 'center', gap: 24, paddingTop: 20 },
    doneIcon: {
      width: 110, height: 110, borderRadius: 32,
      backgroundColor: c.success + '14', alignItems: 'center', justifyContent: 'center',
    },
    doneTitle: { fontSize: 26, fontWeight: '800', color: c.text, textAlign: 'center' },
    doneSubtitle: { fontSize: 15, color: c.subtext, lineHeight: 22, textAlign: 'center' },

    inviteCard: {
      width: '100%', backgroundColor: c.primary, borderRadius: 16, padding: 20, alignItems: 'center', gap: 8,
    },
    inviteCardLabel: { fontSize: 12, color: '#ffffffaa', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
    inviteCardCode: { fontSize: 36, fontWeight: '900', color: '#fff', letterSpacing: 6 },
    inviteCardHint: { fontSize: 12, color: '#ffffffaa', textAlign: 'center', lineHeight: 18 },

    nextStepsList: { width: '100%', gap: 10 },
    nextStepsTitle: { fontSize: 13, fontWeight: '700', color: c.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8 },
    nextStepItem: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.primarySurface },
    nextStepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: c.primaryAlpha08 + '6', alignItems: 'center', justifyContent: 'center' },
    nextStepNumText: { fontSize: 13, fontWeight: '800', color: c.primary },
    nextStepText: { flex: 1, fontSize: 14, color: c.subtext },

    // Footer
    footer: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
      padding: 16, gap: 12,
      backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.primarySurface,
    },
    backBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingVertical: 12, paddingHorizontal: 16,
      borderRadius: 12, borderWidth: 1, borderColor: c.primaryAlpha20,
    },
    backBtnText: { fontSize: 15, color: c.primary, fontWeight: '600' },
    nextBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 8, backgroundColor: c.primary, paddingVertical: 14, borderRadius: 12,
    },
    nextBtnDisabled: { opacity: 0.45 },
    nextBtnText: { fontSize: 15, color: '#fff', fontWeight: '700' },
  })
}
