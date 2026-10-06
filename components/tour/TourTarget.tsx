import { ReactNode } from 'react'
import { StyleProp, View, ViewStyle } from 'react-native'
import { registerTourTarget } from '../../stores/tourStore'

/**
 * Ref oznaczający element, który przewodnik (lib/tour.ts) może podświetlić: `<Pressable ref={tourRef('nav:home')}>`.
 * Nowy callback przy każdym renderze jest w porządku — React odpina stary (null) i podpina nowy.
 */
export function tourRef(id: string) {
  let cur: View | null = null
  return (v: View | null) => {
    registerTourTarget(id, v, cur)
    cur = v
  }
}

/** Opakowanie dla elementów bez własnego ref (np. karta złożona z kilku komponentów). Nie zmienia wyglądu. */
export function TourTarget({ id, children, style }: { id: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View ref={tourRef(id)} collapsable={false} style={style}>{children}</View>
}
