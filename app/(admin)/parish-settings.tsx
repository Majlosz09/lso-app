import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Share, StyleSheet, Switch, View } from 'react-native'
import { Stack, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import QRCode from 'react-native-qrcode-svg'
import { supabase } from '../../lib/supabase'
import { PublicScheduleCard } from '../../components/admin/PublicScheduleCard'
import { useAuthStore } from '../../stores/authStore'
import { buildParishQrValue } from '../../lib/checkin'
import * as Clipboard from 'expo-clipboard'
import Toast from 'react-native-toast-message'
import { ALL_METHODS, AttendanceMethod, legacyMode, METHOD_INFO, parishMethods, parishPrimary, toggleMethod } from '../../lib/attendance'
import { useTheme } from '../../lib/ThemeContext'
import { sans } from '../../lib/theme'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import GpsLocationPicker from '../../components/GpsLocationPicker'
import { ChoiceCard } from '../../components/auth/formParts'
import { AppText, Button, Card, Chip, ListRow, ScreenHeader, Sheet, TextField } from '../../components/ui'
import { TourTarget } from '../../components/tour/TourTarget'
import { KeyboardScrollView } from '../../components/ui/KeyboardScrollView'

function ToggleRow({ value, onChange, title, sub }: { value: boolean; onChange: (v: boolean) => void; title: string; sub: string }) {
  const { colors: c } = useTheme()
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={styles.toggleRow}>
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{title}</AppText>
        <AppText variant="small" muted>{sub}</AppText>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: c.primary, false: c.inputBorder }} thumbColor="#FFFFFF" {...({ activeThumbColor: '#FFFFFF' } as any)} />
    </Pressable>
  )
}

export default function ParishSettingsScreen() {
  const { parish, fetchProfile } = useAuthStore()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { colors: c } = useTheme()
  const isDesktop = useIsDesktop()
  const [confirmRegen, setConfirmRegen] = useState(false)

  const [name, setName] = useState(parish?.name ?? '')
  const [city, setCity] = useState(parish?.city ?? '')
  const [saving, setSaving] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [inviteCode, setInviteCode] = useState(parish?.invite_code ?? '')

  const [methods, setMethods] = useState<AttendanceMethod[]>(parishMethods(parish))
  const [primary, setPrimary] = useState<AttendanceMethod>(parishPrimary(parish))
  const [lat, setLat] = useState(parish?.lat?.toString() ?? '')
  const [lng, setLng] = useState(parish?.lng?.toString() ?? '')
  const [gpsRadius, setGpsRadius] = useState(parish?.gps_radius?.toString() ?? '200')
  const [savingAttendance, setSavingAttendance] = useState(false)
  const [allowMemberDm, setAllowMemberDm] = useState(parish?.allow_member_dm ?? false)
  const [savingDm, setSavingDm] = useState(false)
  // N13 — przed migracją 20261001030000 kolumn nie ma (undefined) → przełączniki ukryte
  const [parentsGeneral, setParentsGeneral] = useState(parish?.parents_see_general ?? false)
  const [memberPolls, setMemberPolls] = useState(parish?.members_can_create_polls ?? true)
  const chatExtras = parish?.parents_see_general !== undefined
  const [qrModalVisible, setQrModalVisible] = useState(false)

  const showToast = (msg: string) => Toast.show({ type: 'success', text1: msg })

  useEffect(() => {
    if (parish) {
      setName(parish.name)
      setCity(parish.city ?? '')
      setInviteCode(parish.invite_code)
      setMethods(parishMethods(parish))
      setPrimary(parishPrimary(parish))
      setLat(parish.lat?.toString() ?? '')
      setLng(parish.lng?.toString() ?? '')
      setGpsRadius(parish.gps_radius?.toString() ?? '200')
      setAllowMemberDm(parish.allow_member_dm ?? false)
      setParentsGeneral(parish.parents_see_general ?? false)
      setMemberPolls(parish.members_can_create_polls ?? true)
    }
  }, [parish])

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Błąd', 'Nazwa parafii nie może być pusta.'); return }
    setSaving(true)
    const { error } = await supabase
      .from('parishes')
      .update({ name: name.trim(), city: city.trim() || null })
      .eq('id', parish?.id)
    setSaving(false)
    if (error) { Alert.alert('Błąd', error.message); return }
    await fetchProfile()
    showToast('Dane parafii zostały zaktualizowane.')
  }

  const handleSaveAttendance = async () => {
    const latNum = lat.trim() ? parseFloat(lat.trim()) : null
    const lngNum = lng.trim() ? parseFloat(lng.trim()) : null
    const radiusNum = parseInt(gpsRadius.trim()) || 200

    if (methods.includes('gps')) {
      if (latNum === null || lngNum === null || isNaN(latNum) || isNaN(lngNum)) {
        Alert.alert('Błąd', 'Wpisz poprawne współrzędne kościoła (szerokość i długość geograficzną).')
        return
      }
      if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
        Alert.alert('Błąd', 'Nieprawidłowe współrzędne. Szerokość: -90…90, długość: -180…180.')
        return
      }
    }

    setSavingAttendance(true)
    const base = { attendance_mode: legacyMode(methods, primary), lat: latNum, lng: lngNum, gps_radius: radiusNum }
    let { error } = await supabase
      .from('parishes')
      .update({ ...base, attendance_methods: methods, attendance_primary: primary })
      .eq('id', parish?.id)
    // baza bez migracji 20260930000000 — zapisz przynajmniej pojedynczy tryb
    if (error && /attendance_(methods|primary)/.test(error.message)) {
      ({ error } = await supabase.from('parishes').update(base).eq('id', parish?.id))
    }
    setSavingAttendance(false)
    if (error) { Alert.alert('Błąd', error.message); return }
    try { await fetchProfile() } catch (e) { console.error('[save] fetchProfile error:', e) }
    showToast('Ustawienia weryfikacji obecności zostały zaktualizowane.')
  }

  const handleSaveDm = async () => {
    setSavingDm(true)
    const { error } = await supabase
      .from('parishes')
      .update(chatExtras
        ? { allow_member_dm: allowMemberDm, parents_see_general: parentsGeneral, members_can_create_polls: memberPolls }
        : { allow_member_dm: allowMemberDm })
      .eq('id', parish?.id)
    setSavingDm(false)
    if (error) { Alert.alert('Błąd', error.message); return }
    await fetchProfile()
    showToast('Ustawienia czatu zostały zaktualizowane.')
  }

  const doRegenerate = async () => {
    setRegenerating(true)
    const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // bez mylących 0/O, 1/I/L — jak gen_invite_code() w bazie
    const newCode = Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('')
    const { error } = await supabase
      .from('parishes')
      .update({ invite_code: newCode })
      .eq('id', parish?.id)
    setRegenerating(false)
    if (error) { Alert.alert('Błąd', error.message); return }
    setInviteCode(newCode)
    useAuthStore.setState(state =>
      state.parish ? { parish: { ...state.parish, invite_code: newCode } } : {}
    )
    Toast.show({ type: 'success', text1: `Nowy kod: ${newCode}`, text2: 'Stary przestał działać.' })
  }

  // Kopiowanie do schowka (web + telefon); udostępnianie osobnym przyciskiem na telefonie
  const handleCopy = async () => {
    try {
      await Clipboard.setStringAsync(inviteCode)
      Toast.show({ type: 'success', text1: 'Skopiowano kod', text2: inviteCode })
    } catch {
      Toast.show({ type: 'error', text1: 'Nie udało się skopiować', text2: 'Zaznacz kod i skopiuj ręcznie.' })
    }
  }

  const handleShare = () => {
    Share.share({ message: `Kod do dołączenia do parafii w LSO App: ${inviteCode}
https://app.lsoapp.com` })
  }

  if (!parish) {
    return <View style={[styles.center, { backgroundColor: c.bg }]}><ActivityIndicator size="large" color={c.primary} /></View>
  }

  const dataCard = (
    <Card large style={styles.card}>
      <AppText variant="eyebrow" color={c.goldInk}>Dane parafii</AppText>
      <TextField label="Nazwa" value={name} onChangeText={setName} placeholder="Nazwa parafii" />
      <TextField label="Miejscowość" value={city} onChangeText={setCity} placeholder="np. Warszawa" />
      <Button label="Zapisz" compact style={styles.selfStart} onPress={handleSave} loading={saving} />
    </Card>
  )

  const codeCard = (
    <Card large style={styles.card}>
      <AppText variant="eyebrow" color={c.goldInk}>Kod zaproszenia</AppText>
      <AppText variant="small" muted>Podaj go ministrantom i rodzicom — dołączą nim do parafii (po Twoim zatwierdzeniu).</AppText>
      <View style={styles.codeRow}>
        <AppText selectable style={[styles.code, { color: c.text }]}>{inviteCode}</AppText>
        <Button label="Kopiuj" icon="content-copy" variant="secondary" compact onPress={handleCopy} />
        {Platform.OS !== 'web' && <Button label="Udostępnij" icon="share-variant" variant="secondary" compact onPress={handleShare} />}
      </View>
      <Button label="Wygeneruj nowy kod" icon="refresh" variant="ghost" compact style={styles.selfStart} onPress={() => setConfirmRegen(true)} loading={regenerating} />
    </Card>
  )

  const attendanceCard = (
    <Card large style={styles.card}>
      <AppText variant="eyebrow" color={c.goldInk}>Potwierdzanie obecności</AppText>
      <AppText variant="small" muted>Zaznacz jedną lub kilka metod. Metoda główna otwiera się po „Potwierdź obecność”, pozostałe ministrant wybierze na ekranie obecności.</AppText>
      {ALL_METHODS.map(m => (
        <ChoiceCard
          key={m}
          icon={METHOD_INFO[m].icon}
          title={methods.length > 1 && primary === m ? `${METHOD_INFO[m].label} · główna` : METHOD_INFO[m].label}
          subtitle={METHOD_INFO[m].sub}
          multi
          selected={methods.includes(m)}
          onPress={() => {
            const r = toggleMethod(methods, primary, m)
            if (r.error) { Toast.show({ type: 'error', text1: r.error }); return }
            setMethods(r.methods); setPrimary(r.primary)
          }}
        />
      ))}
      {methods.length > 1 && (
        <View style={styles.primaryBox}>
          <AppText variant="label">Metoda główna</AppText>
          <View style={styles.primaryChips}>
            {methods.map(m => (
              <Chip key={m} label={METHOD_INFO[m].label} icon={METHOD_INFO[m].icon} selected={primary === m} onPress={() => setPrimary(m)} />
            ))}
          </View>
        </View>
      )}
      {methods.includes('gps') && (
        <View style={[styles.gpsBox, { backgroundColor: c.goldSurface }]}>
          <AppText variant="label" color={c.goldText}>Lokalizacja kościoła</AppText>
          <GpsLocationPicker lat={lat} lng={lng} gpsRadius={gpsRadius} onLatChange={setLat} onLngChange={setLng} onGpsRadiusChange={setGpsRadius} />
        </View>
      )}
      {methods.includes('qr') && (
        <Button label="Pokaż kod QR do wydruku" icon="qrcode" variant="secondary" onPress={() => setQrModalVisible(true)} />
      )}
      <Button label="Zapisz ustawienia obecności" onPress={handleSaveAttendance} loading={savingAttendance} />
    </Card>
  )

  const chatCard = (
    <Card large style={styles.card}>
      <AppText variant="eyebrow" color={c.goldInk}>Czat</AppText>
      <ToggleRow
        value={allowMemberDm}
        onChange={setAllowMemberDm}
        title="Wiadomości prywatne między ministrantami"
        sub={allowMemberDm ? 'Włączone — ministranci i rodzice mogą pisać między sobą' : 'Wyłączone — rozmowę prywatną zaczyna tylko opiekun'}
      />
      {chatExtras && (
        <>
          <ToggleRow
            value={parentsGeneral}
            onChange={setParentsGeneral}
            title="Rodzice widzą kanał ogólny"
            sub={parentsGeneral ? 'Rodzice czytają kanał „Ministranci” (bez pisania)' : 'Kanał „Ministranci” tylko dla ministrantów i opiekunów'}
          />
          <ToggleRow
            value={memberPolls}
            onChange={setMemberPolls}
            title="Ministranci mogą tworzyć ankiety"
            sub={memberPolls ? 'Każdy w kanale może założyć ankietę' : 'Ankiety zakłada tylko opiekun'}
          />
        </>
      )}
      <Button label="Zapisz ustawienia czatu" variant="secondary" onPress={handleSaveDm} loading={savingDm} />
    </Card>
  )

  const configCard = (
    <Card flush>
      <View style={styles.cardHead}><AppText variant="eyebrow" color={c.goldInk}>Konfiguracja</AppText></View>
      <ListRow first icon="clock-outline" title="Rozkład Mszy Świętych" subtitle="Stały tydzień, zmiany okresowe, niedziele" onPress={() => router.push('/(admin)/mass-schedule')} />
      <ListRow icon="church" title="Kościoły i kaplice" subtitle="Filie, kaplice i ich lokalizacja GPS" onPress={() => router.push('/(admin)/churches' as any)} />
      <ListRow icon="account-star" title="Funkcje liturgiczne" subtitle="Lektor, ceremoniarz, turyferariusz… — kto co może pełnić" onPress={() => router.push('/(admin)/functions' as any)} />
      <ListRow icon="tablet" title="Tryb zakrystii (tablet)" subtitle="Dzieci bez telefonu potwierdzają obecność na wspólnym tablecie" onPress={() => router.push('/(admin)/kiosk' as any)} />
      <ListRow icon="star-circle" title="Reguły punktowania" subtitle="Ile punktów za jaką służbę" onPress={() => router.push('/(admin)/point-rules')} />
      <ListRow icon="trophy" title="Wyzwania sezonowe" subtitle="Roraty, Droga Krzyżowa, Różaniec… z premią punktową" onPress={() => router.push('/(admin)/challenges' as any)} />
      <ListRow icon="calendar-sync" title="Stałe dyżury" subtitle="Kto służy co tydzień" onPress={() => router.push('/(admin)/recurring-assignments')} />
      <ListRow icon="shield-star" title="Rangi" subtitle="Ścieżka formacji i przypisywanie" onPress={() => router.push('/(admin)/rank-management')} />
      <ListRow icon="medal" title="Odznaki" subtitle="Tworzenie i przyznawanie" onPress={() => router.push('/(admin)/badge-management')} />
      <ListRow icon="book-open-variant" title="Wiedza parafii" subtitle="Własne wpisy" onPress={() => router.push('/(admin)/wiedza-admin')} />
      <ListRow icon="flag" title="Zgłoszenia z czatu" subtitle="Moderacja wiadomości" onPress={() => router.push('/(admin)/chat-reports')} />
    </Card>
  )

  return (
    <View style={[styles.flex, { backgroundColor: c.bg }]}>
      <Stack.Screen options={{ title: 'Ustawienia parafii', headerShown: false }} />
      <KeyboardScrollView contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 16 }}>
        {!isDesktop && (
          <ScreenHeader
            eyebrow={parish.name}
            title="Ustawienia parafii"
            onBack={() => (router.canGoBack() ? router.back() : router.replace('/(admin)/(admin-tabs)'))}
          />
        )}
        {isDesktop ? (
          <View style={styles.desktop}>
            <View style={styles.col}>{dataCard}{codeCard}<TourTarget id="settings:public"><PublicScheduleCard /></TourTarget><TourTarget id="settings:config">{configCard}</TourTarget></View>
            <View style={styles.col}>{attendanceCard}{chatCard}</View>
          </View>
        ) : (
          <View style={styles.body}>{dataCard}{codeCard}<TourTarget id="settings:public"><PublicScheduleCard /></TourTarget>{attendanceCard}{chatCard}<TourTarget id="settings:config">{configCard}</TourTarget></View>
        )}
      </KeyboardScrollView>

      <Sheet
        visible={confirmRegen}
        onClose={() => setConfirmRegen(false)}
        title="Wygenerować nowy kod?"
        footer={<><Button label="Wygeneruj nowy" variant="danger" onPress={() => { setConfirmRegen(false); doRegenerate() }} /><Button label="Anuluj" variant="secondary" onPress={() => setConfirmRegen(false)} /></>}
      >
        <AppText muted>{`Stary kod ${inviteCode} przestanie działać. Osoby, które już dołączyły, zostają w parafii.`}</AppText>
      </Sheet>

      <Sheet visible={qrModalVisible} onClose={() => setQrModalVisible(false)} title="Kod QR parafii">
        <AppText muted>Wydrukuj i wywieś w zakrystii. Ministranci skanują go przy każdej służbie.</AppText>
        <View style={styles.qrWrap}>
          <QRCode value={buildParishQrValue(parish.id)} size={220} color="#000000" backgroundColor="#FFFFFF" />
        </View>
        <AppText variant="bodyStrong" style={styles.centerText}>{parish.name}</AppText>
      </Sheet>
    </View>
  )
}

const styles = StyleSheet.create({
  primaryBox: { gap: 8 },
  primaryChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  centerText: { textAlign: 'center' },
  selfStart: { alignSelf: 'flex-start' },
  body: { padding: 16, gap: 14 },
  desktop: { flexDirection: 'row', gap: 20, padding: 28, paddingHorizontal: 32, alignItems: 'flex-start' },
  col: { flex: 1, gap: 16 },
  card: { gap: 12, padding: 18 },
  cardHead: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 8 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  code: { ...sans(800), fontSize: 30, letterSpacing: 2, flex: 1, minWidth: 140, fontVariant: ['tabular-nums'] },
  gpsBox: { gap: 8, borderRadius: 14, padding: 12 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, cursor: 'pointer' } as any,
  qrWrap: { alignSelf: 'center', padding: 16, backgroundColor: '#FFFFFF', borderRadius: 16 },
})
