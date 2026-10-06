// Kolejka obecności potwierdzonych bez zasięgu (QR / GPS / przycisk działają w telefonie, wysyłka później).
// Testy: __tests__/lib/offlineQueue.test.ts
import AsyncStorage from '@react-native-async-storage/async-storage'

export type QueuedCheckIn = {
  /** klucz bez duplikatów: osoba + dzień + godzina + kościół */
  key: string
  profileId: string
  date: string
  /** HH:MM */
  time: string
  title: string
  scheduleId: string | null
  churchId: string | null
  method: 'manual' | 'qr' | 'gps'
  /** godzina meldowania (ISO) — trafia do bazy zamiast godziny wysłania */
  clientTime: string
  attempts: number
}

const KEY = 'checkin-queue:v1'

/** Błąd sieci (brak zasięgu / serwer nieosiągalny), a nie odmowa serwera. */
export function isNetworkError(e: unknown): boolean {
  const msg = String((e as any)?.message ?? e ?? '').toLowerCase()
  return /failed to fetch|network request failed|networkerror|load failed|fetch failed|network error|timeout|timed out|offline|internet/.test(msg)
}

export const queueKey = (profileId: string, date: string, time: string, churchId: string | null) => `${profileId}_${date}_${time}_${churchId ?? ''}`

export async function readQueue(): Promise<QueuedCheckIn[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    const list = raw ? (JSON.parse(raw) as QueuedCheckIn[]) : []
    return Array.isArray(list) ? list : []
  } catch { return [] }
}

export async function writeQueue(list: QueuedCheckIn[]): Promise<void> {
  try { await Promise.resolve(AsyncStorage.setItem(KEY, JSON.stringify(list))) } catch { /* bez pamięci — trudno */ }
}

/** Dodaje do kolejki (bez duplikatu tej samej służby). */
export function addToQueue(list: QueuedCheckIn[], item: QueuedCheckIn): QueuedCheckIn[] {
  return list.some(x => x.key === item.key) ? list : [...list, item]
}

/** Starsze niż 48 h nie mają szans — serwer je odrzuci. */
export function dropExpired(list: QueuedCheckIn[], now = new Date()): { keep: QueuedCheckIn[]; expired: QueuedCheckIn[] } {
  const limit = now.getTime() - 48 * 3600_000
  return {
    keep: list.filter(x => new Date(x.clientTime).getTime() >= limit),
    expired: list.filter(x => new Date(x.clientTime).getTime() < limit),
  }
}
