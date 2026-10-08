import { useEffect, useState } from 'react'
import { AppState, Platform, StyleSheet, Switch, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { useAuthStore } from '../stores/authStore'
import { useTheme } from '../lib/ThemeContext'
import { PushState, disablePush, enablePush, openPhoneSettings, registerForPush, sendTestPush } from '../lib/notifications'
import { AppText, Button, Card, Icon } from './ui'

const TEXT: Record<PushState, string> = {
  on: 'Włączone — dostaniesz informację o dyżurach, zmianach w grafiku, zgłoszeniach i punktach.',
  off: 'Wyłączone w aplikacji. Ten telefon nie dostaje powiadomień.',
  denied: 'Telefon nie ma zgody na powiadomienia. Włącz przełącznik i zezwól.',
  blocked: 'Zablokowane w ustawieniach telefonu. Otwórz ustawienia → Powiadomienia → zezwól, potem wróć tutaj.',
  unsupported: Platform.OS === 'web'
    ? 'Powiadomienia działają w aplikacji LSO App na telefonie (App Store / Google Play).'
    : 'Niedostępne w tej wersji aplikacji (Expo Go).',
  error: 'Nie udało się zarejestrować telefonu (brak internetu?). Spróbuj ponownie.',
}

/**
 * Powiadomienia na tym urządzeniu: przełącznik, ustawienia telefonu, test.
 * banner — tylko ostrzeżenie na górze Profilu, gdy powiadomienia nie działają z powodu zgody telefonu.
 */
export function PushSettingsCard({ banner = false }: { banner?: boolean }) {
  const { colors: c } = useTheme()
  const profileId = useAuthStore(s => s.profile?.id)
  const state = useAuthStore(s => s.pushState)
  const setState = useAuthStore(s => s.setPushState)
  const [busy, setBusy] = useState(false)

  // po powrocie z ustawień telefonu sprawdzamy ponownie (bez pytania o zgodę)
  useEffect(() => {
    if (!profileId) return
    const sub = AppState.addEventListener('change', st => {
      if (st === 'active') registerForPush(profileId, false).then(setState, () => {})
    })
    return () => sub.remove()
  }, [profileId])

  if (!profileId) return null
  const s: PushState = state ?? 'unsupported'

  if (banner) {
    if (s !== 'blocked' && s !== 'denied') return null
    return (
      <View style={[styles.banner, { backgroundColor: c.goldSurface, borderColor: c.gold }]}>
        <Icon name="bell-off" size={22} color={c.goldInk} />
        <View style={styles.flex}>
          <AppText variant="bodyStrong" color={c.goldText}>Powiadomienia wyłączone</AppText>
          <AppText variant="small" color={c.goldText}>Nie dostaniesz przypomnień o służbie ani zmian w grafiku.</AppText>
        </View>
        <Button compact label="Włącz" onPress={() => toggle(true)} />
      </View>
    )
  }

  async function toggle(on: boolean) {
    if (!profileId) return
    setBusy(true)
    try {
      const next = on ? await enablePush(profileId) : await disablePush(profileId)
      setState(next)
      if (on && next === 'on') Toast.show({ type: 'success', text1: 'Powiadomienia włączone' })
      if (on && next === 'blocked') Toast.show({ type: 'info', text1: 'Zezwól na powiadomienia w ustawieniach telefonu', text2: 'Potem wróć do aplikacji.' })
      if (on && next === 'error') Toast.show({ type: 'error', text1: 'Nie udało się włączyć', text2: 'Sprawdź internet i spróbuj ponownie.' })
    } finally {
      setBusy(false)
    }
  }

  async function test() {
    setBusy(true)
    try {
      const sent = await sendTestPush()
      Toast.show(sent
        ? { type: 'success', text1: 'Wysłano powiadomienie testowe', text2: 'Powinno przyjść w ciągu kilku sekund.' }
        : { type: 'error', text1: 'Ten telefon nie jest zarejestrowany', text2: 'Wyłącz i włącz powiadomienia ponownie.' })
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Nie udało się wysłać', text2: e?.message })
    } finally {
      setBusy(false)
    }
  }

  const switchable = s !== 'unsupported'
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <Icon name={s === 'on' ? 'bell-ring' : 'bell-off'} size={22} color={s === 'on' ? c.success : c.goldInk} />
        <View style={styles.flex}>
          <AppText variant="bodyStrong">Powiadomienia</AppText>
          <AppText variant="small" muted>{TEXT[s]}</AppText>
        </View>
        {switchable && (
          <Switch value={s === 'on'} disabled={busy} onValueChange={toggle}
            trackColor={{ true: c.primary, false: c.inputBorder }} thumbColor="#FFFFFF" />
        )}
      </View>
      {s === 'blocked' && <Button compact variant="secondary" icon="cog" label="Otwórz ustawienia telefonu" onPress={openPhoneSettings} />}
      {s === 'error' && <Button compact variant="secondary" icon="refresh" label="Spróbuj ponownie" onPress={() => toggle(true)} loading={busy} />}
      {s === 'on' && <Button compact variant="secondary" icon="send" label="Wyślij testowe powiadomienie" onPress={test} loading={busy} />}
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1 },
})
