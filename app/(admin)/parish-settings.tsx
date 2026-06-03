import { useEffect, useState, useMemo, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView, Share, Modal, Platform,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import QRCode from 'react-native-qrcode-svg'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { shadow } from '../../lib/shadows'
import { buildParishQrValue } from '../../lib/checkin'
import type { AttendanceMode } from '../../types/database'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'
import GpsLocationPicker from '../../components/GpsLocationPicker'

export default function ParishSettingsScreen() {
  const { parish, fetchProfile } = useAuthStore()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  const ATTENDANCE_OPTIONS: { mode: AttendanceMode; label: string; sub: string; icon: string; color: string }[] = useMemo(() => [
    { mode: 'button', label: 'Przycisk',    sub: 'Zameldowanie jednym kliknięciem, bez weryfikacji', icon: 'hand-left-outline',   color: '#10B981' },
    { mode: 'qr',     label: 'Kod QR',      sub: 'Ministrant skanuje kod QR wywiesony w zakrystii',  icon: 'qr-code-outline',     color: c.primary },
    { mode: 'gps',    label: 'Lokalizacja', sub: 'Weryfikacja przez GPS — ministrant musi być blisko kościoła', icon: 'location-outline', color: '#EA580C' },
  ], [c.primary])

  const [name, setName] = useState(parish?.name ?? '')
  const [city, setCity] = useState(parish?.city ?? '')
  const [saving, setSaving] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [inviteCode, setInviteCode] = useState(parish?.invite_code ?? '')

  const [attendanceMode, setAttendanceMode] = useState<AttendanceMode>(parish?.attendance_mode ?? 'button')
  const [lat, setLat] = useState(parish?.lat?.toString() ?? '')
  const [lng, setLng] = useState(parish?.lng?.toString() ?? '')
  const [gpsRadius, setGpsRadius] = useState(parish?.gps_radius?.toString() ?? '200')
  const [savingAttendance, setSavingAttendance] = useState(false)
  const [allowMemberDm, setAllowMemberDm] = useState(parish?.allow_member_dm ?? false)
  const [savingDm, setSavingDm] = useState(false)
  const [qrModalVisible, setQrModalVisible] = useState(false)

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToastMsg(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(null), 3000)
  }

  useEffect(() => {
    if (parish) {
      setName(parish.name)
      setCity(parish.city ?? '')
      setInviteCode(parish.invite_code)
      setAttendanceMode(parish.attendance_mode ?? 'button')
      setLat(parish.lat?.toString() ?? '')
      setLng(parish.lng?.toString() ?? '')
      setGpsRadius(parish.gps_radius?.toString() ?? '200')
      setAllowMemberDm(parish.allow_member_dm ?? false)
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

    if (attendanceMode === 'gps') {
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
    const { error } = await supabase
      .from('parishes')
      .update({
        attendance_mode: attendanceMode,
        lat: latNum,
        lng: lngNum,
        gps_radius: radiusNum,
      })
      .eq('id', parish?.id)
    setSavingAttendance(false)
    if (error) { Alert.alert('Błąd', error.message); return }
    try { await fetchProfile() } catch (e) { console.error('[save] fetchProfile error:', e) }
    showToast('Ustawienia weryfikacji obecności zostały zaktualizowane.')
  }

  const handleSaveDm = async () => {
    setSavingDm(true)
    const { error } = await supabase
      .from('parishes')
      .update({ allow_member_dm: allowMemberDm })
      .eq('id', parish?.id)
    setSavingDm(false)
    if (error) { Alert.alert('Błąd', error.message); return }
    await fetchProfile()
    showToast('Ustawienia czatu zostały zaktualizowane.')
  }

  const handleRegenerate = () => {
    Alert.alert(
      'Regeneruj kod',
      'Stary kod zaproszenia przestanie działać. Czy na pewno chcesz wygenerować nowy kod?',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Regeneruj', style: 'destructive',
          onPress: async () => {
            setRegenerating(true)
            const newCode = Math.random().toString(36).substring(2, 8).toUpperCase()
            const { error } = await supabase
              .from('parishes')
              .update({ invite_code: newCode })
              .eq('id', parish?.id)
            setRegenerating(false)
            if (error) { Alert.alert('Błąd', error.message); return }
            setInviteCode(newCode)
            await fetchProfile()
          },
        },
      ]
    )
  }

  const handleCopy = () => {
    Share.share({ message: `Kod do dołączenia do parafii: ${inviteCode}` })
  }

  if (!parish) {
    return <View style={styles.center}><ActivityIndicator size="large" color={c.primary} /></View>
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) }]}
      >
        {/* Dane parafii */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dane parafii</Text>
          <Text style={styles.label}>Nazwa parafii *</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Nazwa parafii" placeholderTextColor={c.textTertiary} />
          <Text style={styles.label}>Miejscowość</Text>
          <TextInput style={styles.input} value={city} onChangeText={setCity} placeholder="np. Warszawa" placeholderTextColor={c.textTertiary} />
          <TouchableOpacity style={[styles.saveButton, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveButtonText}>Zapisz zmiany</Text>}
          </TouchableOpacity>
        </View>

        {/* Weryfikacja obecności */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Weryfikacja obecności</Text>
          <Text style={styles.sectionSub}>Wybierz jak ministranci będą potwierdzać swoją obecność na służbie.</Text>

          {ATTENDANCE_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.mode}
              style={[styles.modeRow, attendanceMode === opt.mode && { borderColor: opt.color, backgroundColor: opt.color + '0a' }]}
              onPress={() => setAttendanceMode(opt.mode)}
              activeOpacity={0.7}
            >
              <View style={[styles.modeIcon, { backgroundColor: opt.color + '18' }]}>
                <Ionicons name={opt.icon as any} size={20} color={opt.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modeLabel, attendanceMode === opt.mode && { color: opt.color }]}>{opt.label}</Text>
                <Text style={styles.modeSub}>{opt.sub}</Text>
              </View>
              <View style={[styles.radioOuter, attendanceMode === opt.mode && { borderColor: opt.color }]}>
                {attendanceMode === opt.mode && <View style={[styles.radioInner, { backgroundColor: opt.color }]} />}
              </View>
            </TouchableOpacity>
          ))}

          {/* GPS fields */}
          {attendanceMode === 'gps' && (
            <View style={styles.gpsBox}>
              <Text style={styles.gpsBoxTitle}>Lokalizacja kościoła</Text>
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

          {/* QR display button */}
          {attendanceMode === 'qr' && (
            <TouchableOpacity style={styles.qrButton} onPress={() => setQrModalVisible(true)}>
              <Ionicons name="qr-code-outline" size={18} color={c.primary} />
              <Text style={styles.qrButtonText}>Pokaż kod QR do wydruku</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.saveButton, savingAttendance && { opacity: 0.6 }]}
            onPress={handleSaveAttendance}
            disabled={savingAttendance}
          >
            {savingAttendance
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.saveButtonText}>Zapisz ustawienia</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Kod zaproszenia */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Kod zaproszenia</Text>
          <Text style={styles.sectionSub}>Podaj ten kod ministrantom i rodzicom, aby mogli dołączyć do Twojej parafii.</Text>
          <View style={styles.codeRow}>
            <Text style={styles.codeText}>{inviteCode}</Text>
            <TouchableOpacity style={styles.copyButton} onPress={handleCopy}>
              <Ionicons name="copy-outline" size={20} color={c.primary} />
              <Text style={styles.copyButtonText}>Kopiuj</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={[styles.regenButton, regenerating && { opacity: 0.6 }]} onPress={handleRegenerate} disabled={regenerating}>
            {regenerating
              ? <ActivityIndicator color="#DC2626" size="small" />
              : <><Ionicons name="refresh-outline" size={16} color={c.danger} /><Text style={styles.regenButtonText}>Regeneruj kod</Text></>
            }
          </TouchableOpacity>
        </View>

        {/* Czat */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Czat</Text>
          <Text style={styles.sectionSub}>
            Zdecyduj czy ministranci mogą pisać prywatne wiadomości między sobą.
            Admini zawsze mogą pisać z każdym.
          </Text>
          <TouchableOpacity
            style={[styles.modeRow, allowMemberDm && { borderColor: c.primary, backgroundColor: c.primary + '0a' }]}
            onPress={() => setAllowMemberDm(prev => !prev)}
            activeOpacity={0.7}
          >
            <View style={[styles.modeIcon, { backgroundColor: c.primary + '18' }]}>
              <Ionicons name="chatbubble-outline" size={20} color={c.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.modeLabel, allowMemberDm && { color: c.primary }]}>
                Prywatne wiadomości między ministrantami
              </Text>
              <Text style={styles.modeSub}>
                {allowMemberDm ? 'Włączone — ministranci mogą pisać między sobą' : 'Wyłączone — tylko admin może inicjować DM'}
              </Text>
            </View>
            <View style={[styles.radioOuter, allowMemberDm && { borderColor: c.primary }]}>
              {allowMemberDm && <View style={[styles.radioInner, { backgroundColor: c.primary }]} />}
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveButton, savingDm && { opacity: 0.6 }]}
            onPress={handleSaveDm}
            disabled={savingDm}
          >
            {savingDm
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.saveButtonText}>Zapisz ustawienia czatu</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Konfiguracja */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Konfiguracja</Text>
          <Text style={styles.sectionSub}>Zarządzaj rozkładem Mszy i regułami punktowania.</Text>
          <TouchableOpacity style={styles.navRow} onPress={() => router.push('/(admin)/mass-schedule')}>
            <View style={[styles.navIcon, { backgroundColor: '#8e44ad18' }]}>
              <Ionicons name="time-outline" size={20} color="#8e44ad" />
            </View>
            <View style={styles.navInfo}>
              <Text style={styles.navTitle}>Rozkład Mszy</Text>
              <Text style={styles.navSub}>Tygodniowy plan godzin</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={c.iconMuted} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.navRow} onPress={() => router.push('/(admin)/point-rules')}>
            <View style={[styles.navIcon, { backgroundColor: '#FFC10715' }]}>
              <Ionicons name="trophy-outline" size={20} color="#FFC107" />
            </View>
            <View style={styles.navInfo}>
              <Text style={styles.navTitle}>Reguły punktowania</Text>
              <Text style={styles.navSub}>Typy służb i ich wartości</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={c.iconMuted} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Success toast */}
      {toastMsg && (
        <View style={styles.toast} pointerEvents="none">
          <Ionicons name="checkmark-circle" size={20} color="#fff" />
          <Text style={styles.toastText}>{toastMsg}</Text>
        </View>
      )}

      {/* QR Modal */}
      <Modal visible={qrModalVisible} transparent animationType="fade" onRequestClose={() => setQrModalVisible(false)}>
        <TouchableOpacity style={styles.qrOverlay} activeOpacity={1} onPress={() => setQrModalVisible(false)}>
          <TouchableOpacity style={styles.qrCard} activeOpacity={1}>
            <Text style={styles.qrCardTitle}>Kod QR parafii</Text>
            <Text style={styles.qrCardSub}>Wydrukuj i wywieś w zakrystii. Ministranci skanują go aplikacją przy każdej służbie.</Text>
            <View style={styles.qrWrapper}>
              <QRCode
                value={buildParishQrValue(parish.id)}
                size={220}
                color="#000000"
                backgroundColor="#FFFFFF"
              />
            </View>
            <Text style={styles.qrParishName}>{parish.name}</Text>
            <TouchableOpacity style={styles.qrCloseBtn} onPress={() => setQrModalVisible(false)}>
              <Text style={styles.qrCloseBtnText}>Zamknij</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    content: { padding: 16, gap: 16 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    section: { backgroundColor: c.surface, borderRadius: 16, padding: 16, ...shadow.md, gap: 6 },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: c.text, marginBottom: 4 },
    sectionSub: { fontSize: 13, color: c.subtext, lineHeight: 18, marginBottom: 8 },

    label: { fontSize: 13, fontWeight: '600', color: c.subtext, marginTop: 6 },
    input: {
      backgroundColor: c.bg, borderRadius: 10, padding: 13,
      fontSize: 15, color: c.text, borderWidth: 1, borderColor: c.border,
    },
    saveButton: { backgroundColor: c.primary, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 8 },
    saveButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },

    // Attendance mode options
    modeRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      borderWidth: 1.5, borderColor: c.border, borderRadius: 12,
      padding: 12, marginBottom: 8,
    },
    modeIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    modeLabel: { fontSize: 15, fontWeight: '600', color: c.text },
    modeSub: { fontSize: 12, color: c.textTertiary, marginTop: 2, lineHeight: 16 },
    radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: c.iconMuted, justifyContent: 'center', alignItems: 'center' },
    radioInner: { width: 10, height: 10, borderRadius: 5 },

    // GPS fields
    gpsBox: { backgroundColor: '#EA580C10', borderRadius: 12, padding: 14, gap: 4, marginBottom: 4 },
    gpsBoxTitle: { fontSize: 14, fontWeight: '700', color: '#EA580C', marginBottom: 8 },

    // QR button
    qrButton: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.primaryAlpha08, borderRadius: 10, padding: 13,
      borderWidth: 1, borderColor: c.primaryAlpha20, marginBottom: 4,
    },
    qrButtonText: { fontSize: 14, color: c.primary, fontWeight: '600' },

    codeRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: c.primaryAlpha08, borderRadius: 12, padding: 16,
      borderWidth: 1, borderColor: c.primaryAlpha20,
    },
    codeText: { fontSize: 28, fontWeight: '800', color: c.primary, letterSpacing: 4, fontVariant: ['tabular-nums'] },
    copyButton: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: c.surface, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
      borderWidth: 1, borderColor: c.primaryAlpha20,
    },
    copyButtonText: { fontSize: 14, color: c.primary, fontWeight: '600' },
    regenButton: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 6, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: c.danger + '33',
    },
    regenButtonText: { fontSize: 14, color: c.danger, fontWeight: '500' },

    navRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
    navIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    navInfo: { flex: 1 },
    navTitle: { fontSize: 15, fontWeight: '600', color: c.text },
    navSub: { fontSize: 12, color: c.textTertiary, marginTop: 1 },
    divider: { height: 1, backgroundColor: c.primarySurface, marginVertical: 2 },

    toast: {
      position: Platform.OS === 'web' ? ('fixed' as any) : 'absolute',
      bottom: 24, left: 20, right: 20, zIndex: 9999,
      backgroundColor: '#10B981', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
      flexDirection: 'row', alignItems: 'center', gap: 10,
      ...shadow.md,
    },
    toastText: { color: '#fff', fontSize: 14, fontWeight: '600', flex: 1 },

    // QR Modal
    qrOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    qrCard: {
      backgroundColor: c.surface, borderRadius: 24, padding: 28,
      alignItems: 'center', gap: 8, width: '100%', maxWidth: 340,
      ...shadow.brand,
    },
    qrCardTitle: { fontSize: 20, fontWeight: '700', color: c.text },
    qrCardSub: { fontSize: 13, color: c.subtext, textAlign: 'center', lineHeight: 18 },
    qrWrapper: { padding: 16, backgroundColor: c.surface, borderRadius: 12, marginVertical: 8 },
    qrParishName: { fontSize: 14, fontWeight: '600', color: c.primary },
    qrCloseBtn: {
      backgroundColor: c.primary, borderRadius: 12, paddingHorizontal: 32, paddingVertical: 12, marginTop: 8,
    },
    qrCloseBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  })
}
