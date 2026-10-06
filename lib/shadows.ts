import { Platform } from 'react-native'

// Platform-safe shadow styles.
// Use `...shadow.xs` / `...shadow.md` / `...shadow.brand` in StyleSheet.create.
// On web: renders as CSS boxShadow (no deprecation warning).
// On native: renders as shadow* props + elevation.

const nat = (
  color: string,
  opacity: number,
  radius: number,
  elevation: number,
) => ({
  shadowColor: color,
  shadowOpacity: opacity,
  shadowRadius: radius,
  shadowOffset: { width: 0, height: Math.ceil(radius / 3) },
  elevation,
})

export const shadow = {
  // Subtle — elevation 1, used for small cards and chips
  xs: Platform.select({
    native: nat('#000', 0.04, 4, 1),
    web: { boxShadow: '0 1px 4px rgba(0,0,0,0.08)' } as any,
  })!,

  // Standard — elevation 2, used for main content cards
  md: Platform.select({
    native: nat('#000', 0.06, 8, 2),
    web: { boxShadow: '0 2px 8px rgba(0,0,0,0.10)' } as any,
  })!,

  // Brand — indigo glow, used for primary action cards/buttons
  brand: Platform.select({
    native: nat('#0B2E5C', 0.22, 10, 4),
    web: { boxShadow: '0 4px 10px rgba(11,46,92,0.22)' } as any,
  })!,

  // Float — subtle panel shadow for floating overlays (reaction picker, action menu)
  float: Platform.select({
    native: nat('#000', 0.12, 6, 3),
    web: { boxShadow: '0 2px 6px rgba(0,0,0,0.12)' } as any,
  })!,

  // Fab — prominent shadow for floating action buttons
  fab: Platform.select({
    native: nat('#000', 0.25, 4, 4),
    web: { boxShadow: '0 2px 4px rgba(0,0,0,0.25)' } as any,
  })!,

  // Redesign v2 — karta wyróżniona („moja służba”)
  featured: Platform.select({
    native: nat('#0B2E5C', 0.12, 18, 4),
    web: { boxShadow: '0 6px 18px rgba(11,46,92,0.12)' } as any,
  })!,

  // Karta hero (najbliższa służba na Domu)
  hero: Platform.select({
    native: nat('#0B2E5C', 0.16, 30, 8),
    web: { boxShadow: '0 10px 30px rgba(11,46,92,0.16)' } as any,
  })!,

  // Złoty FAB „Obecność” w tab barze
  goldFab: Platform.select({
    native: nat('#8A6A1F', 0.35, 14, 8),
    web: { boxShadow: '0 8px 20px rgba(138,106,31,0.35)' } as any,
  })!,

  // Toast
  toast: Platform.select({
    native: nat('#0B1F38', 0.35, 30, 10),
    web: { boxShadow: '0 14px 30px rgba(11,31,56,0.35)' } as any,
  })!,

  // Modal (web)
  modal: Platform.select({
    native: nat('#071C3A', 0.35, 40, 12),
    web: { boxShadow: '0 30px 80px rgba(7,28,58,0.35)' } as any,
  })!,
}
