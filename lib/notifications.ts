// Powiadomienia push: rejestracja telefonu, włączanie / wyłączanie w aplikacji, test.
// Telefon jest przypięty tylko do zalogowanego konta (claim_push_token odpina go od innych kont),
// wylogowanie odpina go od konta (release_push_token). Migracja 20261008000000_push_tokens.sql.
import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { Linking, Platform } from 'react-native'
import { getNotifications } from './pushSupport'
import { supabase } from './supabase'

/**
 * on          — włączone, telefon zarejestrowany
 * off         — wyłączone w aplikacji (przełącznik w Profilu)
 * denied      — system jeszcze może zapytać o zgodę
 * blocked     — zgoda odmówiona na stałe → tylko ustawienia telefonu
 * unsupported — web / Expo Go
 * error       — nie udało się pobrać tokenu (np. brak internetu)
 */
export type PushState = 'on' | 'off' | 'denied' | 'blocked' | 'unsupported' | 'error'

const offKey = (profileId: string) => `push-off:${profileId}`

async function isOffInApp(profileId: string): Promise<boolean> {
  try { return (await AsyncStorage.getItem(offKey(profileId))) === '1' } catch { return false }
}
async function setOffInApp(profileId: string, off: boolean) {
  try {
    if (off) await AsyncStorage.setItem(offKey(profileId), '1')
    else await AsyncStorage.removeItem(offKey(profileId))
  } catch { /* bez pamięci */ }
}

/**
 * Rejestruje telefon dla zalogowanego konta.
 * ask = true → pokaż systemowe pytanie o zgodę, jeśli jeszcze można; false → tylko sprawdź.
 */
export async function registerForPush(profileId: string, ask: boolean): Promise<PushState> {
  const Notifications = getNotifications()
  if (!Notifications) return 'unsupported'
  if (await isOffInApp(profileId)) return 'off'

  if (Platform.OS === 'android') {
    // kanał musi istnieć przed pytaniem o zgodę (Android 13+)
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Powiadomienia LSO',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1A237E',
    })
  }

  let perm = await Notifications.getPermissionsAsync()
  if (!perm.granted && ask && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync()
  if (!perm.granted) return perm.canAskAgain ? 'denied' : 'blocked'

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)
    const { error } = await supabase.rpc('claim_push_token', { p_token: token })
    if (error) throw error
    return 'on'
  } catch {
    return 'error'
  }
}

/** Przełącznik w Profilu: włącz. Gdy system blokuje — otwiera ustawienia telefonu. */
export async function enablePush(profileId: string): Promise<PushState> {
  await setOffInApp(profileId, false)
  const state = await registerForPush(profileId, true)
  if (state === 'blocked') Linking.openSettings().catch(() => {})
  return state
}

/** Przełącznik w Profilu: wyłącz (telefon odpięty od konta, aplikacja nie zapyta ponownie). */
export async function disablePush(profileId: string): Promise<PushState> {
  await setOffInApp(profileId, true)
  await supabase.rpc('release_push_token').then(undefined, () => {})
  return 'off'
}

/** Wylogowanie: telefon nie dostaje już powiadomień tego konta (wybór „wyłączone” zostaje). */
export async function releasePushOnSignOut(): Promise<void> {
  if (!getNotifications()) return
  await supabase.rpc('release_push_token').then(undefined, () => {})
}

/** Testowe powiadomienie na ten telefon. false = telefon nie jest zarejestrowany. */
export async function sendTestPush(): Promise<boolean> {
  const { data, error } = await supabase.rpc('send_test_push')
  if (error) throw error
  return data === true
}

export const openPhoneSettings = () => Linking.openSettings().catch(() => {})
