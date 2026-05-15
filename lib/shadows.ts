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
    web: { boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
  })!,

  // Standard — elevation 2, used for main content cards
  md: Platform.select({
    native: nat('#000', 0.06, 8, 2),
    web: { boxShadow: '0 2px 8px rgba(0,0,0,0.10)' },
  })!,

  // Brand — purple glow, used for primary action cards/buttons
  brand: Platform.select({
    native: nat('#534AB7', 0.30, 10, 4),
    web: { boxShadow: '0 4px 10px rgba(83,74,183,0.30)' },
  })!,
}
