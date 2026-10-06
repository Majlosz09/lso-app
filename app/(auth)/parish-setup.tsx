import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { sans } from '../../lib/theme'
import type { AttendanceMode } from '../../types/database'
import GpsLocationPicker from '../../components/GpsLocationPicker'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { ChoiceCard } from '../../components/auth/formParts'
import { AppText, Button, Chip, Segmented, Sheet, TextField } from '../../components/ui'

// Alert.alert nie wyświetla się na webie — Toast działa wszędzie
const showError = (message: string) => Toast.show({ type: 'error', text1: 'Błąd', text2: message })

type Tab = 'join' | 'create'

export default function ParishSetupScreen() {
  const router = useRouter()
  const { profile, user, fetchProfile } = useAuthStore()
  // Dane z formularza rejestracji (zapisane w metadanych konta, gdy trzeba było potwierdzić e-mail)
  const meta = (user?.user_metadata ?? {}) as Record<string, string | undefined>
  const [tab, setTab] = useState<Tab>(meta.parish_name ? 'create' : 'join')

  const [inviteCode, setInviteCode] = useState('')
  const [joinRole, setJoinRole] = useState<'member' | 'parent'>(profile?.role === 'parent' ? 'parent' : 'member')
  const [rocznik, setRocznik] = useState(profile?.rocznik ? String(profile.rocznik) : '')
  // Profil bez prawdziwego imienia (np. imię = e-mail) — poprosimy o nie przy dołączaniu
  const needsName = !profile?.full_name?.trim() || profile.full_name.includes('@')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [parishName, setParishName] = useState(meta.parish_name ?? '')
  const [parishCity, setParishCity] = useState(meta.parish_city ?? '')
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [attendanceMode, setAttendanceMode] = useState<AttendanceMode>('button')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [gpsRadius, setGpsRadius] = useState('200')
  const [loading, setLoading] = useState(false)

  const { colors: c } = useTheme()

  const handleLogout = () => setConfirmLogout(true)

  const ATTENDANCE_OPTIONS: { mode: AttendanceMode; label: string; sub: string; icon: string }[] = useMemo(() => [
    { mode: 'button', label: 'Samodzielne potwierdzenie', sub: 'Ministrant sam oznacza obecność przyciskiem', icon: 'gesture-tap' },
    { mode: 'qr',     label: 'Kod QR w zakrystii',        sub: 'Ministrant skanuje wydrukowany kod',        icon: 'qrcode-scan' },
    { mode: 'gps',    label: 'Lokalizacja GPS',           sub: 'Obecność, gdy telefon jest przy kościele',   icon: 'map-marker' },
    { mode: 'admin',  label: 'Zaznacza ksiądz / opiekun', sub: 'Opiekun odhacza listę obecności po służbie', icon: 'shield-check' },
  ], [])

  const handleJoin = async () => {
    if (!inviteCode.trim() || inviteCode.trim().length !== 6) {
      showError('Wpisz 6-znakowy kod parafii.')
      return
    }
    if (needsName && (!firstName.trim() || !lastName.trim())) {
      showError('Wpisz imię i nazwisko.')
      return
    }
    const yr = parseInt(rocznik)
    if (joinRole === 'member' && (!rocznik || isNaN(yr) || yr < 1990 || yr > new Date().getFullYear())) {
      showError('Podaj poprawny rocznik (np. 2014).')
      return
    }
    setLoading(true)
    const { data: foundId, error } = await supabase
      .rpc('get_parish_by_invite_code', { code: inviteCode.trim().toUpperCase() })

    if (error || !foundId) {
      showError('Nieznany kod parafii. Sprawdź kod i spróbuj ponownie.')
      setLoading(false)
      return
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        parish_id: foundId,
        role: joinRole,
        rocznik: joinRole === 'member' ? yr : null,
        ...(needsName ? { full_name: `${firstName.trim()} ${lastName.trim()}` } : {}),
      })
      .eq('id', profile?.id)

    setLoading(false)
    if (updateError) {
      showError(updateError.message)
      return
    }
    await fetchProfile()
    router.replace('/(tabs)')
  }

  const handleCreate = async () => {
    if (!parishName.trim()) {
      showError('Wpisz nazwę parafii.')
      return
    }
    if (attendanceMode === 'gps') {
      const latNum = parseFloat(lat.trim())
      const lngNum = parseFloat(lng.trim())
      if (isNaN(latNum) || isNaN(lngNum)) {
        showError('Wpisz współrzędne kościoła dla trybu GPS.')
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
      showError('Nie udało się utworzyć parafii: ' + (parishError?.message ?? 'Nieznany błąd'))
      setLoading(false)
      return
    }

    const { error: updateError } = await supabase
      .from('profiles')
      // założyciel parafii zostaje jej administratorem
      .update({ parish_id: parishData.id, role: 'admin' })
      .eq('id', profile?.id)

    setLoading(false)
    if (updateError) {
      showError(updateError.message)
      return
    }
    await fetchProfile()
    router.replace('/(tabs)')
  }

  return (
    <AuthLayout
      title={tab === 'join' ? 'Dołącz do parafii' : 'Nowa parafia'}
      subtitle="Twoje konto nie jest jeszcze przypisane do żadnej parafii."
    >
      <Segmented
        value={tab}
        onChange={setTab}
        options={[{ value: 'join', label: 'Dołącz z kodem' }, { value: 'create', label: 'Utwórz parafię' }]}
      />

      {tab === 'join' ? (
        <>
          <View style={styles.group}>
            <AppText variant="label" muted>Kim jesteś?</AppText>
            <View style={styles.chips}>
              <Chip label="Ministrant" icon="account" selected={joinRole === 'member'} onPress={() => setJoinRole('member')} />
              <Chip label="Rodzic" icon="human-male-female-child" selected={joinRole === 'parent'} onPress={() => setJoinRole('parent')} />
            </View>
          </View>
          {needsName && (
            <View style={styles.row}>
              <TextField label="Imię" placeholder="Imię" value={firstName} onChangeText={setFirstName} containerStyle={styles.flex} />
              <TextField label="Nazwisko" placeholder="Nazwisko" value={lastName} onChangeText={setLastName} containerStyle={styles.flex} />
            </View>
          )}
          {joinRole === 'member' && (
            <TextField label="Rocznik" placeholder="np. 2014" keyboardType="number-pad" maxLength={4} value={rocznik} onChangeText={setRocznik} />
          )}
          <TextField
            label="Kod parafii"
            placeholder="6-znakowy kod (np. AB12CD)"
            autoCapitalize="characters"
            value={inviteCode}
            onChangeText={t => setInviteCode(t.toUpperCase())}
            maxLength={6}
            style={styles.code}
          />
          <Button label="Dołącz do parafii" onPress={handleJoin} loading={loading} />
        </>
      ) : (
        <>
          <TextField label="Nazwa parafii *" placeholder="np. Parafia pw. św. Jana" value={parishName} onChangeText={setParishName} />
          <TextField label="Miejscowość (opcjonalnie)" placeholder="np. Warszawa" value={parishCity} onChangeText={setParishCity} />

          <View style={styles.group}>
            <AppText variant="label" muted>Weryfikacja obecności</AppText>
            {ATTENDANCE_OPTIONS.map(opt => (
              <ChoiceCard
                key={opt.mode}
                icon={opt.icon}
                title={opt.label}
                subtitle={opt.sub}
                selected={attendanceMode === opt.mode}
                onPress={() => setAttendanceMode(opt.mode)}
              />
            ))}
          </View>

          {attendanceMode === 'gps' && (
            <View style={[styles.gpsBox, { backgroundColor: c.goldSurface }]}>
              <AppText variant="label" color={c.goldText}>Lokalizacja kościoła</AppText>
              <GpsLocationPicker
                lat={lat}
                lng={lng}
                gpsRadius={gpsRadius}
                onLatChange={setLat}
                onLngChange={setLng}
                onGpsRadiusChange={setGpsRadius}
              />
            </View>
          )}

          <Button label="Utwórz parafię" onPress={handleCreate} loading={loading} />
        </>
      )}

      <Pressable onPress={handleLogout} accessibilityRole="button" style={styles.logout}>
        <AppText style={[styles.logoutText, { color: c.subtext }]}>Wyloguj się</AppText>
      </Pressable>

      <Sheet
        visible={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        title="Wylogować się?"
        footer={
          <>
            <Button label="Wyloguj" variant="danger" onPress={() => { setConfirmLogout(false); supabase.auth.signOut() }} />
            <Button label="Anuluj" variant="secondary" onPress={() => setConfirmLogout(false)} />
          </>
        }
      >
        <AppText muted>Czy na pewno chcesz się wylogować?</AppText>
      </Sheet>
    </AuthLayout>
  )
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  chips: { flexDirection: 'row', gap: 8 },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  code: { ...sans(800), letterSpacing: 1 },
  gpsBox: { gap: 8, borderRadius: 14, padding: 12 },
  logout: { alignSelf: 'center', padding: 10, cursor: 'pointer' } as any,
  logoutText: { ...sans(700), fontSize: 14 },
})
