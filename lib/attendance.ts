// Z1: kilka metod potwierdzania obecności + metoda główna.
// Działa także przed migracją 20260930000000 (wtedy metody wynikają ze starego attendance_mode).
import type { AttendanceMode } from '../types/database'

export type AttendanceMethod = AttendanceMode // 'qr' | 'gps' | 'button' | 'admin'
export const SELF_METHODS: AttendanceMethod[] = ['qr', 'gps', 'button']
export const ALL_METHODS: AttendanceMethod[] = ['qr', 'gps', 'button', 'admin']

type ParishLike = {
  attendance_mode?: AttendanceMode | null
  attendance_methods?: string[] | null
  attendance_primary?: string | null
} | null | undefined

export function parishMethods(p: ParishLike): AttendanceMethod[] {
  const list = (p?.attendance_methods ?? []).filter((m): m is AttendanceMethod => ALL_METHODS.includes(m as AttendanceMethod))
  if (list.length) return ALL_METHODS.filter(m => list.includes(m))
  return [p?.attendance_mode ?? 'button']
}

export function parishPrimary(p: ParishLike): AttendanceMethod {
  const methods = parishMethods(p)
  const primary = p?.attendance_primary as AttendanceMethod | undefined
  return primary && methods.includes(primary) ? primary : (p?.attendance_mode && methods.includes(p.attendance_mode) ? p.attendance_mode : methods[0])
}

/** Metody, którymi ministrant potwierdza obecność sam (bez 'admin'). */
export function selfMethods(p: ParishLike): AttendanceMethod[] {
  return parishMethods(p).filter(m => m !== 'admin')
}

/** Metoda otwierana po „Potwierdź obecność”: główna, a gdy główną jest „zaznacza opiekun” — pierwsza własna. */
export function selfPrimary(p: ParishLike): AttendanceMethod | null {
  const primary = parishPrimary(p)
  if (primary !== 'admin') return primary
  return selfMethods(p)[0] ?? null
}

/** Tryb dla reguł dostępności: 'admin' gdy ministrant nie może sam się zameldować. */
export function effectiveMode(p: ParishLike): 'self' | 'admin' {
  return selfMethods(p).length ? 'self' : 'admin'
}

/** Włącz/wyłącz metodę; zostaje min. jedna, a metoda główna zawsze należy do włączonych. */
export function toggleMethod(
  methods: AttendanceMethod[],
  primary: AttendanceMethod,
  m: AttendanceMethod,
): { methods: AttendanceMethod[]; primary: AttendanceMethod; error?: string } {
  if (methods.includes(m)) {
    if (methods.length === 1) return { methods, primary, error: 'Zostaw włączoną co najmniej jedną metodę' }
    const next = methods.filter(x => x !== m)
    return { methods: next, primary: primary === m ? next[0] : primary }
  }
  const next = ALL_METHODS.filter(x => x === m || methods.includes(x))
  return { methods: next, primary }
}

/** Wartość attendance_mode dla starszych wersji aplikacji (jak trigger w bazie). */
export function legacyMode(methods: AttendanceMethod[], primary: AttendanceMethod): AttendanceMode {
  const self = methods.filter(m => m !== 'admin')
  if (!self.length) return 'admin'
  return primary !== 'admin' ? primary : self[0]
}

export const METHOD_INFO: Record<AttendanceMethod, { label: string; sub: string; icon: string; short: string }> = {
  qr:     { label: 'Kod QR w zakrystii',        sub: 'Ministrant skanuje wydrukowany kod',        icon: 'qrcode-scan',  short: 'QR' },
  gps:    { label: 'Lokalizacja GPS',           sub: 'Obecność, gdy telefon jest przy kościele',   icon: 'map-marker',   short: 'GPS' },
  button: { label: 'Samodzielne potwierdzenie', sub: 'Ministrant sam oznacza obecność przyciskiem', icon: 'gesture-tap',  short: 'samodzielnie' },
  admin:  { label: 'Zaznacza ksiądz / opiekun', sub: 'Opiekun odhacza listę obecności po służbie', icon: 'shield-check', short: 'ksiądz' },
}
