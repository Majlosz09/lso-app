# Dark Mode — Design Spec
**Date:** 2026-05-19  
**Project:** LSO App (React Native / Expo)  
**Status:** Approved

---

## 1. Overview

Implement a full dark mode for the LSO app using a ThemeContext architecture. The app currently has ~37 files with hardcoded hex color values in module-level `StyleSheet.create()` calls. This spec describes the complete theme system, color tokens, refactoring pattern, and user-facing override control.

---

## 2. Architecture

### `lib/theme.ts`
Single source of truth for all color tokens. Exports two objects (`lightColors`, `darkColors`) and the `Colors` type.

### `lib/ThemeContext.tsx`
React Context that:
- Reads `useColorScheme()` from React Native as system default
- Merges with `themeOverride` from Zustand (`'light' | 'dark' | 'system'`)
- Exports `ThemeProvider` (wraps the app) and `useTheme()` hook
- `useTheme()` returns `{ colors: Colors, isDark: boolean, scheme: 'light' | 'dark' }`

### `stores/authStore.ts`
Add `themeOverride: 'light' | 'dark' | 'system'` (default: `'system'`). Persist to AsyncStorage alongside existing store state.

### `app/_layout.tsx`
Wrap the root Stack in `<ThemeProvider>`:
```tsx
<ThemeProvider>
  <Stack ... />
</ThemeProvider>
```

---

## 3. Color Tokens

| Token | Light | Dark | Role |
|---|---|---|---|
| `bg` | `#F8F9FA` | `#0F1724` | App background |
| `surface` | `#FFFFFF` | `#1A2332` | Cards, tiles |
| `surfaceElevated` | `#FFFFFF` | `#1E2A3B` | Modals, elevated surfaces |
| `primary` | `#1A237E` | `#7986CB` | Buttons, icons, accents |
| `primaryDark` | `#0D1764` | `#5C6BC0` | Active/pressed states |
| `primarySurface` | `#E8EAF6` | `#1A237E44` | Icon bg, chip bg |
| `header` | `#1A237E` | `#1A237E` | AppBar — navy in both modes |
| `text` | `#0D1B2A` | `#F0F4FF` | Primary text |
| `subtext` | `#6B7280` | `#94A3B8` | Secondary text |
| `textTertiary` | `#9CA3AF` | `#64748B` | Placeholders, hints |
| `border` | `#E5E7EB` | `#2D3D52` | Card borders |
| `borderLight` | `#F3F4F6` | `#1E2D42` | Subtle separators |
| `gold` | `#FFC107` | `#FFC107` | Points, trophies — unchanged |
| `inputBg` | `#F3F4F6` | `#0F1B2D` | Text input backgrounds |
| `danger` | `#DC2626` | `#F87171` | Errors, absent status |
| `success` | `#16A34A` | `#4ADE80` | Present status, success |

**Fixed colors (unchanged in both modes):**
- Category colors: `#0EA5E9` (nabozenstwo), `#10B981` (zbiorka)
- Liturgical colors: `#C8950A`, `#C0392B`, `#2E7D32`, `#6A1B9A`, `#C2185B`, `#F57F17`
- Gold: `#FFC107`

---

## 4. Refactoring Pattern (37 files)

Every component follows this exact pattern:

```tsx
// Top of file — new import
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'

// Inside component — before return
const { colors: c } = useTheme()
const styles = useMemo(() => createStyles(c), [c])

// Inline icon colors in JSX
<Ionicons color={c.primary} />   // was: color="#1A237E"
<Ionicons color={c.text} />      // was: color="#0D1B2A"

// Outside component — StyleSheet becomes a factory function
function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { backgroundColor: c.bg },
    card:      { backgroundColor: c.surface, borderColor: c.border },
    title:     { color: c.text },
    sub:       { color: c.subtext },
    input:     { backgroundColor: c.inputBg, color: c.text },
    primary:   { backgroundColor: c.primary },
    // ...
  })
}
```

**Alpha variants:** Hardcoded alpha strings like `#1A237E33` become `c.primary + '33'` (string concatenation). This works because all 6-char hex tokens append a 2-char hex alpha. The `theme.ts` also exports pre-defined alpha tokens for the most common cases:
- `c.primaryAlpha08` = primary + `'14'` (~8%)
- `c.primaryAlpha12` = primary + `'1F'` (~12%)
- `c.primaryAlpha20` = primary + `'33'` (~20%)

For gold alpha: `c.gold + '18'`, `c.gold + '30'` etc. continue as string concatenation.

---

## 5. User Override (Profile Screen)

Both `app/(tabs)/profile.tsx` and `app/(admin)/(admin-tabs)/profile.tsx` get a new "Wygląd" section:

```
┌─────────────────────────────────┐
│  Wygląd                         │
│  ┌────────┬─────────┬─────────┐ │
│  │ Jasny  │ Ciemny  │ System  │ │
│  └────────┴─────────┴─────────┘ │
└─────────────────────────────────┘
```

Active button highlighted with primary color. Selecting any option writes to `authStore.themeOverride` which is persisted in AsyncStorage.

---

## 6. Files Changed

### New files
- `lib/theme.ts`
- `lib/ThemeContext.tsx`

### Modified files
- `stores/authStore.ts` — add `themeOverride` field + AsyncStorage persist
- `app/_layout.tsx` — add `ThemeProvider` wrapper
- `app/(admin)/(admin-tabs)/_layout.tsx` — header color via theme
- `app/(tabs)/_layout.tsx` — header color via theme
- All 37 `.tsx` files in `app/` and `components/` — StyleSheet → `createStyles(c)` pattern

---

## 7. Out of Scope

- Per-screen theme (all screens share one theme)
- Custom color picker for users
- Status bar color adaptation (can be added later via `expo-status-bar`)
