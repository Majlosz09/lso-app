// Czy aplikacja może używać powiadomień push (expo-notifications).
// Wyłączone: web, Expo Go (Expo usunęło z niego push — sam import modułu sypie błędami przy starcie)
// oraz ręcznie zmienną EXPO_PUBLIC_DISABLE_PUSH=1 (np. do testów). Moduł ładujemy leniwie przez getNotifications().
import Constants, { ExecutionEnvironment } from 'expo-constants'
import { Platform } from 'react-native'

export const PUSH_ENABLED =
  Platform.OS !== 'web' &&
  Constants.executionEnvironment !== ExecutionEnvironment.StoreClient &&
  process.env.EXPO_PUBLIC_DISABLE_PUSH !== '1'

type NotificationsModule = typeof import('expo-notifications')

/** Moduł expo-notifications albo null, gdy push jest wyłączony. */
export function getNotifications(): NotificationsModule | null {
  if (!PUSH_ENABLED) return null
  return require('expo-notifications') as NotificationsModule
}
