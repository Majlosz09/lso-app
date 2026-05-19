import { useState, useMemo } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { shadow } from '../../lib/shadows'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'
import type { AttendanceMode } from '../../types/database'

type Tab = 'join' | 'create'

const ATTENDANCE_OPTIONS: { mode: AttendanceMode; label: string; icon: string; color: string }[] = [
  { mode: 'button', label: 'Przycisk (bez weryfikacji)', icon: 'hand-left-outline',   color: '#10B981' },
  { mode: 'qr',     label: 'Kod QR w zakrystii',         icon: 'qr-code-outline',     color: '#1A237E' },
  { mode: 'gps',    label: 'Lokalizacja GPS',             icon: 'location-outline',    color: '#EA580C' },
]

export default function ParishSetupScreen() {
  const router = useRouter()
  const { profile, fetchProfile } = useAuthStore()
  const [tab, setTab] = useState<Tab>('join')

  const [inviteCode, setInviteCode] = useState('')
  const [parishName, setParishName] = useState('')
  const [parishCity, setParishCity] = useState('')
  const [attendanceMode, setAttendanceMode] = useState<AttendanceMode>('button')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [gpsRadius, setGpsRadius] = useState('200')
  const [loading, setLoading] = useState(false)

  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  const handleJoin = async () => {
    if (!inviteCode.trim() || inviteCode.trim().length !== 6) {
      Alert.alert('Błąd', 'Wpisz 6-znakowy kod parafii.')
      return
    }
    setLoading(true)
    const { data: foundId, error } = await supabase
      .rpc('get_parish_by_invite_code', { code: inviteCode.trim().toUpperCase() })

    if (error || !foundId) {
      Alert.alert('Błąd', 'Nieznany kod parafii. Sprawdź kod i spróbuj ponownie.')
      setLoading(false)
      return
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ parish_id: foundId })
      .eq('id', profile?.id)

    setLoading(false)
    if (updateError) {
      Alert.alert('Błąd', updateError.message)
      return
    }
    await fetchProfile()
    router.replace('/(tabs)')
  }

  const handleCreate = async () => {
    if (!parishName.trim()) {
      Alert.alert('Błąd', 'Wpisz nazwę parafii.')
      return
    }
    if (attendanceMode === 'gps') {
      const latNum = parseFloat(lat.trim())
      const lngNum = parseFloat(lng.trim())
      if (isNaN(latNum) || isNaN(lngNum)) {
        Alert.alert('Błąd', 'Wpisz współrzędne kościoła dla trybu GPS.')
        return
      }
    }
    setLoading(true)
    const latNum = lat.trim() ? parseFloat(lat.trim()) : null
    const lngNum = lng.trim() ? parseFloat(lng.trim()) : null
    const { data: parishData, error: parishError } = await supabase
      .from('parishes')
      .insert({
        name: parishName.trim(),
        city: parishCity.trim() || null,
        created_by: profile?.id,
        attendance_mode: attendanceMode,
        lat: latNum,
        lng: lngNum,
        gps_radius: parseInt(gpsRadius) || 200,
      })
      .select('id')
      .single()

    if (parishError || !parishData) {
      Alert.alert('Błąd', 'Nie udało się utworzyć parafii: ' + (parishError?.message ?? 'Nieznany błąd'))
      setLoading(false)
      return
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ parish_id: parishData.id })
      .eq('id', profile?.id)

    setLoading(false)
    if (updateError) {
      Alert.alert('Błąd', updateError.message)
      return
    }
    await fetchProfile()
    router.replace('/(tabs)')
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView style={styles.container} contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <View style={styles.iconWrapper}>
          <Ionicons name="business-outline" size={48} color={c.primary} />
        </View>
        <Text style={styles.title}>Dołącz do parafii</Text>
        <Text style={styles.subtitle}>Twoje konto nie jest jeszcze przypisane do żadnej parafii.</Text>

        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, tab === 'join' && styles.tabActive]}
            onPress={() => setTab('join')}
          >
            <Text style={[styles.tabText, tab === 'join' && styles.tabTextActive]}>Dołącz z kodem</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === 'create' && styles.tabActive]}
            onPress={() => setTab('create')}
          >
            <Text style={[styles.tabText, tab === 'create' && styles.tabTextActive]}>Utwórz parafię</Text>
          </TouchableOpacity>
        </View>

        {tab === 'join' ? (
          <>
            <Text style={styles.label}>Kod parafii</Text>
            <TextInput
              style={styles.input}
              placeholder="6-znakowy kod (np. AB12CD)"
              placeholderTextColor={c.textTertiary}
              autoCapitalize="characters"
              value={inviteCode}
              onChangeText={t => setInviteCode(t.toUpperCase())}
              maxLength={6}
            />
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleJoin}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>Dołącz do parafii</Text>
              }
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.label}>Nazwa parafii *</Text>
            <TextInput
              style={styles.input}
              placeholder="np. Parafia pw. św. Jana"
              placeholderTextColor={c.textTertiary}
              value={parishName}
              onChangeText={setParishName}
            />
            <Text style={styles.label}>Miejscowość (opcjonalnie)</Text>
            <TextInput
              style={styles.input}
              placeholder="np. Warszawa"
              placeholderTextColor={c.textTertiary}
              value={parishCity}
              onChangeText={setParishCity}
            />

            <Text style={[styles.label, { marginTop: 16 }]}>Weryfikacja obecności</Text>
            {ATTENDANCE_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.mode}
                style={[styles.modeRow, attendanceMode === opt.mode && { borderColor: opt.color, backgroundColor: opt.color + '0a' }]}
                onPress={() => setAttendanceMode(opt.mode)}
                activeOpacity={0.7}
              >
                <Ionicons name={opt.icon as any} size={18} color={attendanceMode === opt.mode ? opt.color : c.textTertiary} />
                <Text style={[styles.modeLabel, attendanceMode === opt.mode && { color: opt.color }]}>{opt.label}</Text>
                <View style={[styles.radioOuter, attendanceMode === opt.mode && { borderColor: opt.color }]}>
                  {attendanceMode === opt.mode && <View style={[styles.radioInner, { backgroundColor: opt.color }]} />}
                </View>
              </TouchableOpacity>
            ))}

            {attendanceMode === 'gps' && (
              <View style={styles.gpsBox}>
                <Text style={styles.gpsLabel}>Współrzędne kościoła</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput style={[styles.input, { flex: 1 }]} placeholder="Szerokość (lat)" placeholderTextColor={c.textTertiary} value={lat} onChangeText={setLat} keyboardType="numeric" />
                  <TextInput style={[styles.input, { flex: 1 }]} placeholder="Długość (lng)" placeholderTextColor={c.textTertiary} value={lng} onChangeText={setLng} keyboardType="numeric" />
                </View>
                <TextInput style={styles.input} placeholder="Promień w metrach (domyślnie 200)" placeholderTextColor={c.textTertiary} value={gpsRadius} onChangeText={setGpsRadius} keyboardType="numeric" />
              </View>
            )}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleCreate}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>Utwórz parafię</Text>
              }
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    inner: { justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 48 },

    iconWrapper: {
      width: 80, height: 80, borderRadius: 24,
      backgroundColor: c.primary + '11', justifyContent: 'center', alignItems: 'center',
      alignSelf: 'center', marginBottom: 20,
    },
    title: { fontSize: 28, fontWeight: '700', textAlign: 'center', color: c.text, marginBottom: 8 },
    subtitle: { fontSize: 14, textAlign: 'center', color: c.subtext, marginBottom: 28, lineHeight: 20 },

    tabRow: {
      flexDirection: 'row', backgroundColor: c.border,
      borderRadius: 10, padding: 3, marginBottom: 20,
    },
    tab: {
      flex: 1, paddingVertical: 10, borderRadius: 8,
      alignItems: 'center',
    },
    tabActive: {
      backgroundColor: c.surface,
      ...shadow.md,
    },
    tabText: { fontSize: 14, fontWeight: '500', color: c.subtext },
    tabTextActive: { color: c.primary, fontWeight: '600' },

    label: { fontSize: 13, fontWeight: '600', color: c.subtext, marginBottom: 6, marginTop: 4 },
    input: {
      backgroundColor: c.surface, borderRadius: 12,
      paddingHorizontal: 16, paddingVertical: 14,
      fontSize: 16, marginBottom: 12,
      borderWidth: 1, borderColor: c.border, color: c.text,
    },
    button: {
      backgroundColor: c.primary, borderRadius: 12,
      paddingVertical: 16, alignItems: 'center', marginTop: 8,
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },

    modeRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      borderWidth: 1.5, borderColor: c.border, borderRadius: 10,
      padding: 12, marginBottom: 6,
    },
    modeLabel: { flex: 1, fontSize: 14, fontWeight: '500', color: c.subtext },
    radioOuter: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: c.iconMuted, justifyContent: 'center', alignItems: 'center' },
    radioInner: { width: 8, height: 8, borderRadius: 4 },

    gpsBox: { gap: 8, backgroundColor: '#EA580C10', borderRadius: 10, padding: 12, marginBottom: 4 },
    gpsLabel: { fontSize: 13, fontWeight: '600', color: '#EA580C' },
  })
}
