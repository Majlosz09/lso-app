// Grafik zapisany w pamięci telefonu (do meldowania bez zasięgu). Każdy zakres dat to osobny klucz — bez sprzątania
// przybywało ich przy każdym przewinięciu tygodnia, a na Androidzie AsyncStorage ma ~6 MB razem z sesją logowania.
import AsyncStorage from '@react-native-async-storage/async-storage'

const PREFIX = 'services-cache:'

export function servicesCacheKey(profileId: string, from: string, to: string): string {
  return `${PREFIX}v1:${profileId}:${from}:${to}`
}

/** Które klucze usunąć: inne konto, inny format albo zakres, który już minął. */
export function staleServicesCacheKeys(keys: readonly string[], profileId: string, today: string): string[] {
  return keys.filter(k => {
    if (!k.startsWith(PREFIX)) return false
    const [, version, pid, , to] = k.split(':')
    return version !== 'v1' || pid !== profileId || !to || to < today
  })
}

let pruned = false
/** Raz na uruchomienie aplikacji. */
export async function pruneServicesCache(profileId: string, today: string): Promise<void> {
  if (pruned) return
  pruned = true
  try {
    const stale = staleServicesCacheKeys(await AsyncStorage.getAllKeys(), profileId, today)
    if (stale.length) await AsyncStorage.multiRemove(stale)
  } catch { /* brak pamięci — nic */ }
}
