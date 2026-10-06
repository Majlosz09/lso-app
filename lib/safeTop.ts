import { Platform, StatusBar } from 'react-native'

/** Dodatkowy oddech pod paskiem statusu na telefonie (zegar, wycięcie aparatu, Dynamic Island). */
const NATIVE_EXTRA = 12

/**
 * Górny odstęp nagłówka rysowanego przez sam ekran (headerShown: false).
 * insetsTop — z useSafeAreaInsets(); na Androidzie (edge-to-edge) bierzemy co najmniej wysokość paska statusu,
 * gdyby inset przyszedł jako 0. `extra` — odstęp projektu (jak dotąd na webie).
 */
export function topGap(insetsTop: number, extra = 8): number {
  if (Platform.OS === 'web') return insetsTop + extra
  const statusBar = Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0
  return Math.max(insetsTop, statusBar) + extra + NATIVE_EXTRA
}
