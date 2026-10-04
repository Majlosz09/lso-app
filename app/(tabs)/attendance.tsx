import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { sans, serif } from '../../lib/theme'
import { addDays, dayNum, dayShort, localDateStr, relativeDay, shortDate } from '../../lib/dates'
import { serviceAvailability } from '../../lib/serviceRules'
import { AttendanceMethod, METHOD_INFO, parishMethods } from '../../lib/attendance'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { Service, useServices } from '../../hooks/useServices'
import { useServiceActions } from '../../components/services/useServiceActions'
import { AppText, Button, Card, Chip, Icon } from '../../components/ui'
import { ReportAttendanceSheet, reportable } from '../../components/services/ReportAttendanceSheet'
import { ReportsStatus } from '../../components/services/ChildReports'

const NAVY = '#071C3A'
const MUTED = '#C9D3E3'
const GOLD_I = '#E3C98E'

const COPY: Record<string, { title: string; accent: string; icon: string; hint: string }> = {
  qr: { title: 'Zeskanuj kod', accent: 'w zakrystii', icon: 'qrcode-scan', hint: 'Kod wisi przy drzwiach zakrystii. Obecność liczy się od 30 minut przed rozpoczęciem.' },
  gps: { title: 'Potwierdź', accent: 'przy kościele', icon: 'map-marker-radius', hint: 'Sprawdzimy lokalizację telefonu — musisz być przy kościele.' },
  button: { title: 'Jesteś', accent: 'na służbie?', icon: 'hand-back-right', hint: 'Potwierdź obecność jednym przyciskiem, gdy jesteś już w zakrystii.' },
  admin: { title: 'Obecność', accent: 'zaznacza opiekun', icon: 'shield-check', hint: 'W tej parafii listę obecności odhacza ksiądz lub opiekun po służbie.' },
}

/** Służby z otwartym oknem meldowania (najpierw moje), inaczej najbliższa moja. */
function pickService(services: Service[], mode: string): { open: Service[]; service?: Service; ready: boolean } {
  const open = services
    .filter(s => serviceAvailability(s, mode).canCheckIn)
    .sort((a, b) => Number(!!b.mine) - Number(!!a.mine) || a.time.localeCompare(b.time))
  if (open.length) return { open, service: open[0], ready: true }
  const now = Date.now()
  const upcoming = services.find(s => s.mine && !s.attended && new Date(`${s.date}T${s.time}`).getTime() > now)
  return { open, service: upcoming, ready: false }
}

export default function AttendanceScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const isDesktop = useIsDesktop()
  const { colors: c } = useTheme()
  const parish = useAuthStore(s => s.parish)
  const profileId = useAuthStore(s => s.profile?.id)
  const today = localDateStr()
  // od przedwczoraj — do zgłoszeń obecności po fakcie (48 h)
  const { services, loading, refresh } = useServices(addDays(today, -2), addDays(today, 7))
  const [reportOpen, setReportOpen] = useState(false)
  const [chosenId, setChosenId] = useState<string | null>(null)
  const actions = useServiceActions(refresh)
  // metoda główna parafii; pozostałe włączone metody jako „Inna metoda”
  const [method, setMethod] = useState<AttendanceMethod | null>(actions.primary)
  useEffect(() => { setMethod(actions.primary) }, [actions.primary])
  const mode = actions.mode === 'admin' ? 'admin' : (method ?? 'button')
  const picked = useMemo(() => pickService(services, actions.mode), [services, actions.mode])
  const ready = picked.ready
  const service = picked.open.find(s => s.id === chosenId) ?? picked.service
  const canReport = services.some(s => reportable(s))
  const copy = COPY[mode] ?? COPY.button
  const attendedToday = services.find(s => s.date === today && s.attended)

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))
  const opensAt = service ? (() => {
    const d = new Date(`${service.date}T${service.time}`)
    d.setMinutes(d.getMinutes() - 30)
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  })() : ''

  return (
    <View style={[styles.flex, { backgroundColor: NAVY }]}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 20 }, isDesktop && styles.desktop]}>
        <View style={styles.top}>
          {!isDesktop && (
            <Pressable accessibilityRole="button" accessibilityLabel="Zamknij" onPress={close} style={styles.close}>
              <Icon name="close" size={22} color="#FFFFFF" filled />
            </Pressable>
          )}
          <AppText variant="eyebrow" color={c.gold} style={styles.eyebrow}>Potwierdź obecność</AppText>
        </View>

        <View style={styles.center}>
          <AppText style={[serif(), styles.title]}>
            {copy.title}{'\n'}<AppText style={[serif(true), styles.title, { color: GOLD_I }]}>{copy.accent}</AppText>
          </AppText>
          <View style={[styles.frame, { borderColor: c.gold }]}>
            <Icon name={copy.icon} size={64} color={MUTED} />
            {mode === 'gps' && parish?.gps_radius ? (
              <AppText style={styles.frameText}>{`promień ${parish.gps_radius} m`}</AppText>
            ) : null}
          </View>
          <AppText style={styles.hint}>{copy.hint}</AppText>
          {actions.methods.length > 1 && (
            <View style={styles.methods}>
              <AppText style={styles.hintSmall}>Metoda:</AppText>
              {actions.methods.map(m => (
                <Chip key={m} label={METHOD_INFO[m].short} icon={METHOD_INFO[m].icon} selected={method === m} onPress={() => setMethod(m)} />
              ))}
            </View>
          )}
          {mode !== 'admin' && parishMethods(parish).includes('admin') && (
            <AppText style={styles.hintSmall}>Opiekun może też zaznaczyć obecność po służbie.</AppText>
          )}
        </View>

        <View style={styles.bottom}>
          {loading ? (
            <ActivityIndicator color={c.gold} />
          ) : picked.open.length > 1 ? (
            <View style={styles.choices}>
              <AppText style={styles.hintSmall}>Na czym jesteś?</AppText>
              {picked.open.map(s => {
                const on = s.id === service?.id
                return (
                  <Pressable key={s.id} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => setChosenId(s.id)}>
                    <Card style={[styles.svcCard, on && { borderColor: c.gold, borderWidth: 2 }]}>
                      <Icon name={on ? 'radiobox-marked' : 'radiobox-blank'} size={22} color={on ? c.goldInk : c.subtext} filled />
                      <View style={styles.flex}>
                        <AppText variant="bodyStrong" numberOfLines={1}>{`${s.title} · ${s.time}`}</AppText>
                        <AppText variant="small" muted>{s.mine ? 'Twój dyżur' : 'bez zapisu — liczy się jak służba dodatkowa'}</AppText>
                      </View>
                    </Card>
                  </Pressable>
                )
              })}
            </View>
          ) : service ? (
            <Card large style={styles.svcCard}>
              <View style={[styles.dateTile, { backgroundColor: c.primary }]}>
                <AppText style={[styles.dow, { color: c.gold }]}>{dayShort(service.date).toUpperCase()}</AppText>
                <AppText style={styles.num}>{dayNum(service.date)}</AppText>
              </View>
              <View style={styles.flex}>
                <AppText variant="bodyStrong" numberOfLines={1}>{`${service.title} · ${service.time}`}</AppText>
                <AppText variant="small" muted>
                  {`${dayShort(service.date)} ${shortDate(service.date)} · ${service.mine ? 'Twój dyżur' : 'bez zapisu — liczy się jak służba dodatkowa'}`}
                </AppText>
              </View>
            </Card>
          ) : (
            <Card large style={styles.svcCard}>
              <Icon name={attendedToday ? 'check-circle' : 'calendar-blank'} size={28} color={attendedToday ? c.success : c.subtext} filled={!!attendedToday} />
              <AppText variant="body" style={styles.flex}>
                {attendedToday ? 'Obecność na dzisiejszej służbie już zapisana.' : 'Nie masz teraz służby do potwierdzenia.'}
              </AppText>
            </Card>
          )}

          {mode === 'admin' ? null : ready && service ? (
            <Button
              label="Potwierdzam obecność"
              icon="account-check"
              variant="gold"
              onPress={() => actions.checkIn(service, method ?? undefined)}
              loading={actions.busyId === service.id}
            />
          ) : service ? (
            <Button
              label={`Możliwe od ${opensAt} (${relativeDay(service.date)})`}
              variant="outlineLight"
              disabled
            />
          ) : (
            <Button label="Przejdź do grafiku" variant="outlineLight" onPress={() => router.replace('/(tabs)/schedule')} />
          )}
          {canReport && (
            <Pressable accessibilityRole="button" onPress={() => setReportOpen(true)} style={styles.reportLink}>
              <Icon name="account-question" size={18} color={GOLD_I} />
              <AppText style={styles.reportText}>Byłeś, ale nie potwierdziłeś? Zgłoś obecność</AppText>
            </Pressable>
          )}
          {!!profileId && <ReportsStatus profileIds={[profileId]} canWithdraw title="Moje zgłoszenia" />}
        </View>
      </ScrollView>
      {actions.sheets}
      <ReportAttendanceSheet visible={reportOpen} onClose={() => setReportOpen(false)} services={services} onSent={refresh} />
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  scroll: { flexGrow: 1, paddingHorizontal: 24 },
  desktop: { maxWidth: 520, width: '100%', alignSelf: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 44 },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, paddingVertical: 24 },
  title: { fontSize: 36, lineHeight: 39, color: '#FFFFFF', textAlign: 'center' },
  frame: {
    width: 230, height: 230, borderRadius: 30, borderWidth: 3, borderStyle: 'dashed',
    backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  frameText: { ...sans(700), fontSize: 13, color: MUTED },
  hint: { ...sans(500), fontSize: 14, lineHeight: 21, color: MUTED, textAlign: 'center', maxWidth: 320 },
  methods: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 8 },
  choices: { gap: 8 },
  reportLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10 },
  reportText: { ...sans(700), fontSize: 13, color: GOLD_I, textDecorationLine: 'underline' },
  hintSmall: { ...sans(500), fontSize: 12, color: '#8497B5', textAlign: 'center' },
  bottom: { gap: 12 },
  svcCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dateTile: { width: 52, borderRadius: 12, paddingVertical: 6, alignItems: 'center' },
  dow: { ...sans(800), fontSize: 10 },
  num: { ...sans(800), fontSize: 22, lineHeight: 26, color: '#FFFFFF' },
})
