import { useEffect, useRef, useState } from 'react'
import { Modal, Pressable, StyleSheet, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { sans, serif } from '../../lib/theme'
import { CheckInResult, validateGps, validateParishQr } from '../../lib/checkin'
import { dayShort, longDate } from '../../lib/dates'
import { AttendanceMethod, effectiveMode, selfMethods, selfPrimary } from '../../lib/attendance'
import type { Service } from '../../hooks/useServices'
import { ChoiceCard } from '../auth/formParts'
import { AppText, Button, Icon, Sheet } from '../ui'
import { AbsenceSheet } from './AbsenceSheet'
import { SwapSheet } from './SwapSheet'
import { useSwapStore } from '../../stores/swapStore'
import { useCheckinQueue } from '../../stores/checkinQueueStore'
import { isNetworkError, queueKey } from '../../lib/offlineQueue'

const DAY_ACC = ['niedzielę', 'poniedziałek', 'wtorek', 'środę', 'czwartek', 'piątek', 'sobotę']

export { ABSENCE_REASONS, absenceReasonText } from './AbsenceSheet'

/**
 * Akcje ministranta na służbie (zameldowanie, zapis, wypis, nieobecność) + ich arkusze.
 * Ekran renderuje `sheets` i woła `checkIn/openSignUp/openUnsign/openAbsence`.
 */
export function useServiceActions(onChanged: () => void) {
  const { profile, parish } = useAuthStore()
  const { colors: c } = useTheme()
  const [busyId, setBusyId] = useState<string | null>(null)

  const [signUpFor, setSignUpFor] = useState<Service | null>(null)
  const [signUpMode, setSignUpMode] = useState<'once' | 'recurring'>('once')
  const [unsign, setUnsign] = useState<{ service: Service; commitmentId: string | null } | null>(null)
  const [absenceFor, setAbsenceFor] = useState<Service | null>(null)
  const [swapFor, setSwapFor] = useState<Service | null>(null)
  const outgoingSwaps = useSwapStore(st => st.outgoing)
  const loadSwaps = useSwapStore(st => st.load)
  useEffect(() => { if (profile?.id) loadSwaps(profile.id) }, [profile?.id])

  const [cameraPermission, requestCameraPermission] = useCameraPermissions()
  const [qrFor, setQrFor] = useState<Service | null>(null)
  const qrScanned = useRef(false)

  // 'admin' = ministrant nie melduje się sam (reguły dostępności); metody własne i główna z ustawień parafii
  const mode = effectiveMode(parish)
  const methods = selfMethods(parish)
  const primary = selfPrimary(parish)

  // ── Zameldowanie ─────────────────────────────────────────────────────────
  // brak zasięgu: obecność zostaje w telefonie z godziną meldowania i idzie sama po powrocie sieci
  const queueOffline = async (s: Service, method: 'manual' | 'qr' | 'gps', clientTime: string) => {
    await useCheckinQueue.getState().enqueue({
      key: queueKey(profile!.id, s.date, s.time, s.churchId ?? null), profileId: profile!.id,
      date: s.date, time: s.time, title: s.title, scheduleId: s.isTemplate ? null : s.id, churchId: s.churchId ?? null,
      method, clientTime, attempts: 0,
    })
    setBusyId(null)
    Toast.show({ type: 'info', text1: 'Brak internetu — obecność zapisana w telefonie', text2: 'Aplikacja wyśle ją sama, gdy wróci zasięg (do 48 h).' })
  }

  const doCheckIn = async (s: Service, method: 'manual' | 'qr' | 'gps' = 'manual') => {
    setBusyId(s.id)
    const clientTime = new Date().toISOString()
    let scheduleId = s.id
    if (s.isTemplate) {
      // pozycja z rozkładu bez służby w bazie — tworzymy służbę BEZ zapisu
      // (meldowanie bez zapisu = punkty jak za Mszę dodatkową / nabożeństwo)
      const { data, error } = await supabase.rpc('materialize_slot', { p_date: s.date, p_time_label: s.time, p_church_id: s.churchId })
      if (error && isNetworkError(error)) { await queueOffline(s, method, clientTime); return }
      if (error || !data) {
        setBusyId(null)
        Toast.show({ type: 'error', text1: 'Błąd', text2: error?.message ?? 'Nie znaleziono służby.' })
        return
      }
      scheduleId = data as string
    }
    const { data, error } = await supabase.rpc('check_in_and_award_points', {
      p_schedule_id: scheduleId,
      p_profile_id: profile!.id,
      p_parish_id: profile!.parish_id,
      p_method: method,
    })
    if (error && isNetworkError(error)) { await queueOffline(s, method, clientTime); return }
    setBusyId(null)
    if (error) { Toast.show({ type: 'error', text1: 'Błąd', text2: error.message }); return }
    const result = data as any
    if (result.already_checked_in) Toast.show({ type: 'info', text1: 'Obecność już zapisana' })
    else if (result.points_awarded > 0) Toast.show({ type: 'success', text1: `Obecność potwierdzona · +${result.points_awarded} pkt`, text2: result.reason })
    else Toast.show({ type: 'success', text1: 'Obecność potwierdzona' })
    onChanged()
  }

  const checkIn = async (s: Service, method?: AttendanceMethod) => {
    const m = method ?? primary
    if (!m || m === 'admin') {
      Toast.show({ type: 'info', text1: 'W tej parafii obecność zaznacza opiekun' })
      return
    }
    if (m === 'gps') {
      // GPS kościoła tej Mszy (filia / kaplica), inaczej kościoła parafialnego
      const gpsTarget = s.churchGps ?? (parish?.lat != null && parish?.lng != null ? { lat: parish.lat, lng: parish.lng, radius: parish.gps_radius ?? 200 } : null)
      if (!gpsTarget) {
        Toast.show({ type: 'error', text1: 'Błąd konfiguracji', text2: 'Opiekun nie ustawił lokalizacji tego kościoła.' })
        return
      }
      setBusyId(s.id)
      let gps: CheckInResult = { success: false, message: 'Nie można uzyskać lokalizacji.' }
      try {
        gps = await Promise.race([
          validateGps({ parishLat: gpsTarget.lat, parishLng: gpsTarget.lng, parishRadius: gpsTarget.radius }),
          new Promise<CheckInResult>(resolve => setTimeout(
            () => resolve({ success: false, message: 'Przekroczono czas oczekiwania na lokalizację. Sprawdź czy GPS i uprawnienia są aktywne.' }),
            25_000,
          )),
        ])
      } finally {
        setBusyId(null)
      }
      if (!gps.success) { Toast.show({ type: 'error', text1: 'Nie można zameldować', text2: gps.message }); return }
      await doCheckIn(s, 'gps')
      return
    }
    if (m === 'qr') {
      if (!cameraPermission?.granted) {
        const { granted } = await requestCameraPermission()
        if (!granted) { Toast.show({ type: 'error', text1: 'Brak dostępu', text2: 'Zezwól aplikacji na dostęp do kamery.' }); return }
      }
      qrScanned.current = false
      setQrFor(s)
      return
    }
    await doCheckIn(s)
  }

  // ── Zapis ────────────────────────────────────────────────────────────────
  const openSignUp = (s: Service) => { setSignUpMode('once'); setSignUpFor(s) }
  const confirmSignUp = async () => {
    const s = signUpFor
    if (!s) return
    setSignUpFor(null)
    setBusyId(s.id)
    const { data, error } = await supabase.rpc('sign_up_for_slot', { p_date: s.date, p_time_label: s.time, p_mode: signUpMode, p_church_id: s.churchId })
    setBusyId(null)
    if (error) { Toast.show({ type: 'error', text1: 'Błąd', text2: error.message }); return }
    if (signUpMode === 'recurring') {
      const count = (data as any)?.count ?? 1
      Toast.show({
        type: 'success',
        text1: `Zapisano cyklicznie: ${dayShort(s.date)} ${s.time} co tydzień`,
        text2: `Objęto ${count} ${count === 1 ? 'służbę' : 'służb'}.`,
      })
    } else {
      Toast.show({ type: 'success', text1: `Zapisano: ${s.title} · ${dayShort(s.date)} ${s.time}` })
    }
    onChanged()
  }

  // ── Wypis ────────────────────────────────────────────────────────────────
  const openUnsign = async (s: Service) => {
    if (!s.mine) return
    const dow = new Date(s.date + 'T12:00:00').getDay()
    const { data: commitment } = await supabase
      .from('recurring_commitments')
      .select('id')
      .eq('profile_id', profile!.id)
      .eq('day_of_week', dow)
      .eq('time_slot', s.time)
      .maybeSingle()
    setUnsign({ service: s, commitmentId: commitment?.id ?? null })
  }
  const doUnsign = async (cycle: boolean) => {
    const u = unsign
    if (!u?.service.mine) return
    setUnsign(null)
    setBusyId(u.service.id)
    const ops = [supabase.from('schedule_assignments').delete().eq('id', u.service.mine.id)]
    if (cycle && u.commitmentId) ops.push(supabase.from('recurring_commitments').delete().eq('id', u.commitmentId))
    const results = await Promise.all(ops)
    setBusyId(null)
    const err = results.find(r => r.error)?.error
    if (err) { Toast.show({ type: 'error', text1: 'Błąd', text2: err.message }); return }
    Toast.show({ type: 'success', text1: cycle ? 'Wypisano z całego cyklu' : 'Wypisano z tej służby' })
    onChanged()
  }

  // ── Nieobecność ──────────────────────────────────────────────────────────
  const openAbsence = (s: Service) => setAbsenceFor(s)
  const sendAbsence = async (text: string) => {
    const s = absenceFor
    if (!s?.mine) return
    setBusyId(s.id)
    const { error } = await supabase
      .from('schedule_assignments')
      .update({ status: 'excused', absence_reason: text })
      .eq('id', s.mine.id)
    setBusyId(null)
    if (error) { Toast.show({ type: 'error', text1: 'Błąd', text2: error.message }); return }
    setAbsenceFor(null)
    Toast.show({ type: 'success', text1: 'Zgłoszenie wysłane do opiekuna' })
    onChanged()
  }

  // ── Zamiana (N4) ─────────────────────────────────────────────────────────
  const openSwap = (s: Service) => setSwapFor(s)
  const sendSwap = async (toId: string, toName: string) => {
    const s = swapFor
    if (!s) return
    setBusyId(s.id)
    const err = await useSwapStore.getState().request(s.id, toId)
    setBusyId(null)
    if (err) { Toast.show({ type: 'error', text1: 'Nie udało się wysłać', text2: err }); return }
    setSwapFor(null)
    Toast.show({ type: 'success', text1: `Prośba o zamianę wysłana: ${toName}` })
  }
  /** Otwarta prośba o zamianę tej służby (do kogo). */
  const pendingSwap = (s: Service) => outgoingSwaps[s.id] ?? null
  const cancelSwap = async (s: Service) => {
    const p = outgoingSwaps[s.id]
    if (!p) return
    setBusyId(s.id)
    const err = await useSwapStore.getState().cancel(p.id)
    setBusyId(null)
    if (err) Toast.show({ type: 'error', text1: 'Błąd', text2: err })
    else Toast.show({ type: 'success', text1: 'Prośba o zamianę wycofana' })
  }

  const sheets = (
    <>
      <SwapSheet service={swapFor} busy={!!swapFor && busyId === swapFor.id} onClose={() => setSwapFor(null)} onSubmit={sendSwap} />
      <Sheet
        visible={!!signUpFor}
        onClose={() => setSignUpFor(null)}
        eyebrow={signUpFor ? `${longDate(signUpFor.date)} · ${signUpFor.time}` : undefined}
        title={signUpFor ? `Zapisz się: ${signUpFor.title}` : ''}
        footer={
          <>
            <Button label="Zapisz się" onPress={confirmSignUp} />
            <Button label="Anuluj" variant="secondary" onPress={() => setSignUpFor(null)} />
          </>
        }
      >
        <ChoiceCard
          icon="calendar-check"
          title="Jednorazowo"
          subtitle="Tylko na tę służbę"
          selected={signUpMode === 'once'}
          onPress={() => setSignUpMode('once')}
        />
        <ChoiceCard
          icon="calendar-sync"
          title="Co tydzień"
          subtitle={signUpFor ? `Stały dyżur: każd${[0, 3, 6].includes(new Date(signUpFor.date + 'T12:00:00').getDay()) ? 'ą' : 'y'} ${DAY_ACC[new Date(signUpFor.date + 'T12:00:00').getDay()]} o ${signUpFor.time}` : ''}
          selected={signUpMode === 'recurring'}
          onPress={() => setSignUpMode('recurring')}
        />
      </Sheet>

      <Sheet
        visible={!!unsign}
        onClose={() => setUnsign(null)}
        title="Wypisać się?"
        eyebrow={unsign ? `${unsign.service.title} · ${longDate(unsign.service.date)} ${unsign.service.time}` : undefined}
        footer={unsign?.commitmentId ? (
          <>
            <Button label="Tylko z tej służby" variant="danger" onPress={() => doUnsign(false)} />
            <Button label="Z całego cyklu" variant="secondary" onPress={() => doUnsign(true)} />
          </>
        ) : (
          <>
            <Button label="Wypisz się" variant="danger" onPress={() => doUnsign(false)} />
            <Button label="Anuluj" variant="secondary" onPress={() => setUnsign(null)} />
          </>
        )}
      >
        <AppText muted>
          {unsign?.commitmentId
            ? 'Ta służba jest częścią Twojego stałego dyżuru. Wypisać się tylko z niej czy z całego cyklu?'
            : 'Miejsce zwolni się dla innych ministrantów.'}
        </AppText>
      </Sheet>

      <AbsenceSheet
        visible={!!absenceFor}
        onClose={() => setAbsenceFor(null)}
        eyebrow={absenceFor ? `${absenceFor.title} · ${longDate(absenceFor.date)} ${absenceFor.time}` : undefined}
        busy={busyId === absenceFor?.id}
        onSubmit={sendAbsence}
      />

      <Modal visible={!!qrFor} animationType="slide" onRequestClose={() => setQrFor(null)}>
        <View style={[styles.qr, { backgroundColor: '#071C3A' }]}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={e => {
              if (qrScanned.current) return
              if (!validateParishQr(e.data, profile!.parish_id!)) {
                Toast.show({ type: 'error', text1: 'Nieprawidłowy kod', text2: 'Ten kod QR nie należy do Twojej parafii.' })
                return
              }
              qrScanned.current = true
              const pending = qrFor
              setQrFor(null)
              if (pending) doCheckIn(pending, 'qr')
            }}
          />
          <View style={styles.qrOverlay} pointerEvents="none">
            <AppText style={[serif(), styles.qrTitle]}>
              Zeskanuj kod{'\n'}<AppText style={[serif(true), styles.qrTitle, { color: '#E3C98E' }]}>w zakrystii</AppText>
            </AppText>
            <View style={[styles.qrFrame, { borderColor: c.gold }]} />
            <AppText style={styles.qrHint}>Kod wisi przy drzwiach zakrystii.</AppText>
          </View>
          <Pressable accessibilityLabel="Zamknij" onPress={() => setQrFor(null)} style={styles.qrClose}>
            <Icon name="close" size={24} color="#FFFFFF" filled />
          </Pressable>
        </View>
      </Modal>
    </>
  )

  // ── Zgłoszenie obecności po fakcie (do 48 h, zatwierdza opiekun) ──
  const reportAttendance = async (s: Service) => {
    setBusyId(s.id)
    const { error } = await supabase.rpc('report_attendance', { p_date: s.date, p_time: s.time, p_category: s.category, p_church_id: s.churchId })
    setBusyId(null)
    if (error) { Toast.show({ type: 'error', text1: 'Nie wysłano', text2: error.message }); return }
    Toast.show({ type: 'success', text1: 'Zgłoszenie wysłane do opiekuna', text2: 'Punkty dostaniesz po zatwierdzeniu.' })
    onChanged()
  }

  return { reportAttendance, checkIn, openSignUp, openUnsign, openAbsence, openSwap, pendingSwap, cancelSwap, busyId, sheets, mode, methods, primary, onChanged }
}

const styles = StyleSheet.create({
  qr: { flex: 1 },
  qrOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 22, padding: 28 },
  qrTitle: { fontSize: 34, lineHeight: 37, color: '#FFFFFF', textAlign: 'center' },
  qrFrame: { width: 250, height: 250, borderRadius: 28, borderWidth: 3 },
  qrHint: { ...sans(600), fontSize: 14, color: '#C9D3E3', textAlign: 'center' },
  qrClose: {
    position: 'absolute', top: 52, left: 20, width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center',
  },
})
