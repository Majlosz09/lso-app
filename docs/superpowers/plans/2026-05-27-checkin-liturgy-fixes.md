# Checkin & Liturgy Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dodać 15-sekundowy timeout do `validateGps` i sprawić żeby `getLiturgicalDay` zawsze zwracało `LiturgicalEntry` (nigdy `null`).

**Architecture:** Dwie niezależne poprawki w `lib/`. Fix 1: `Promise.race` z `setTimeout` w `validateGps` — zero nowych zależności, istniejący `catch` obsługuje timeout automatycznie. Fix 2: Eksportowana stała `LITURGICAL_FERIA` zastępuje `null` w `getLiturgicalDay` — TypeScript wymusi aktualizację 5 miejsc użycia w `app/`.

**Tech Stack:** TypeScript, expo-location, Jest (fake timers)

---

## File Structure

| Plik | Zmiana |
|------|--------|
| `lib/checkin.ts` | Dodać `GPS_TIMEOUT_MS` i `Promise.race` w `validateGps` |
| `lib/liturgy.ts` | Dodać `LITURGICAL_FERIA`, zmienić typ i impl. `getLiturgicalDay` |
| `app/(tabs)/index.tsx` | Usunąć null guardy dla liturgii (3 miejsca) |
| `app/(admin)/(admin-tabs)/index.tsx` | Usunąć null guardy dla liturgii (2 miejsca) |
| `__tests__/lib/checkin.test.ts` | Dodać test timeoutu GPS |
| `__tests__/lib/liturgy.test.ts` | Dodać testy FERIA fallback |

---

### Task 1: GPS Timeout

**Files:**
- Modify: `lib/checkin.ts:57-79`
- Modify: `__tests__/lib/checkin.test.ts`

- [ ] **Step 1: Napisz failing test (na końcu pliku `__tests__/lib/checkin.test.ts`)**

Dodaj nowy blok `describe` po istniejących testach:

```ts
import * as Location from 'expo-location'

describe('validateGps', () => {
  it('returns error when GPS times out after 15s', async () => {
    jest.useFakeTimers()
    ;(Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' })
    ;(Location.getCurrentPositionAsync as jest.Mock).mockReturnValue(new Promise(() => {}))

    const resultPromise = validateGps({ parishLat: 0, parishLng: 0, parishRadius: 100 })
    jest.advanceTimersByTime(15_000)
    const result = await resultPromise

    expect(result.success).toBe(false)
    expect((result as any).message).toContain('15s')
    jest.useRealTimers()
  })
})
```

Dodaj też import `validateGps` na górze pliku (obok istniejących importów):

```ts
import { validateParishQr, buildParishQrValue, validateGps } from '../../lib/checkin'
```

- [ ] **Step 2: Uruchom test — powinien FAIL**

```bash
npx jest __tests__/lib/checkin.test.ts --verbose
```

Expected: test timeoutu FAIL (brak timeout w implementacji, `getCurrentPositionAsync` nigdy nie resolve'uje więc test wisi)

- [ ] **Step 3: Zaimplementuj timeout w `lib/checkin.ts`**

Zmień `validateGps` — dodaj stałą i `Promise.race`. Kompletna nowa wersja funkcji:

```ts
const GPS_TIMEOUT_MS = 15_000

export async function validateGps(params: {
  parishLat: number
  parishLng: number
  parishRadius: number
}): Promise<CheckInResult> {
  const { status } = await Location.requestForegroundPermissionsAsync()
  if (status !== 'granted') {
    return { success: false, message: 'Brak dostępu do lokalizacji. Zezwól aplikacji na dostęp w ustawieniach.' }
  }
  let pos: Location.LocationObject
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), GPS_TIMEOUT_MS)
    )
    pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      timeoutPromise,
    ])
  } catch {
    return { success: false, message: 'Przekroczono czas oczekiwania na lokalizację (15s). Sprawdź czy GPS jest włączony.' }
  }
  const dist = Math.round(
    getDistanceMeters(pos.coords.latitude, pos.coords.longitude, params.parishLat, params.parishLng)
  )
  if (dist > params.parishRadius) {
    return { success: false, message: `Jesteś ${dist}m od kościoła (wymagane: ${params.parishRadius}m).` }
  }
  return { success: true }
}
```

Stałą `GPS_TIMEOUT_MS = 15_000` umieść bezpośrednio przed funkcją `validateGps` (linia ~57).

- [ ] **Step 4: Uruchom test — powinien PASS**

```bash
npx jest __tests__/lib/checkin.test.ts --verbose
```

Expected:
```
PASS __tests__/lib/checkin.test.ts
  validateParishQr
    ✓ returns true for matching parishId
    ✓ returns false for different parishId
    ✓ returns false for malformed QR value
    ✓ returns false for empty strings
  buildParishQrValue
    ✓ builds correct QR string with parishId
    ✓ round-trips correctly with validateParishQr
  validateGps
    ✓ returns error when GPS times out after 15s
```

- [ ] **Step 5: Commit**

```bash
git add lib/checkin.ts __tests__/lib/checkin.test.ts
git commit -m "fix: add 15s timeout to validateGps via Promise.race"
```

---

### Task 2: getLiturgicalDay FERIA fallback

**Files:**
- Modify: `lib/liturgy.ts:10-12`
- Modify: `__tests__/lib/liturgy.test.ts`

- [ ] **Step 1: Napisz failing testy w `__tests__/lib/liturgy.test.ts`**

Dodaj import `getLiturgicalDay` i `LITURGICAL_FERIA` na górze pliku (obok istniejących importów):

```ts
import {
  getLiturgicalAccentColor,
  getLiturgicalBgColor,
  getLiturgicalDay,
  LITURGICAL_FERIA,
  COLOR_HEX,
  LiturgicalEntry,
} from '../../lib/liturgy'
```

Dodaj nowy blok `describe` na końcu pliku:

```ts
describe('getLiturgicalDay', () => {
  it('returns LITURGICAL_FERIA for unknown date', () => {
    const result = getLiturgicalDay('1900-01-01')
    expect(result.type).toBe('FERIA')
    expect(result).toBe(LITURGICAL_FERIA)
  })

  it('returns LiturgicalEntry (not FERIA) for Christmas 2025', () => {
    const result = getLiturgicalDay('2025-12-25')
    expect(result.type).not.toBe('FERIA')
    expect(result.name).toBeTruthy()
  })
})
```

- [ ] **Step 2: Uruchom testy — powinny FAIL**

```bash
npx jest __tests__/lib/liturgy.test.ts --verbose
```

Expected: FAIL — `LITURGICAL_FERIA` nie istnieje (błąd importu)

- [ ] **Step 3: Zaimplementuj w `lib/liturgy.ts`**

Zamień linie 10-12 (`getLiturgicalDay`) na:

```ts
export const LITURGICAL_FERIA: LiturgicalEntry = {
  name: 'Dzień powszedni',
  type: 'FERIA',
  typeLabel: 'Feria',
  color: 'GREEN',
}

export function getLiturgicalDay(dateStr: string): LiturgicalEntry {
  return (data as Record<string, LiturgicalEntry>)[dateStr] ?? LITURGICAL_FERIA
}
```

- [ ] **Step 4: Uruchom testy liturgii — powinny PASS**

```bash
npx jest __tests__/lib/liturgy.test.ts --verbose
```

Expected: 13 testów PASS (11 istniejących + 2 nowe).

- [ ] **Step 5: Sprawdź czy TypeScript zgłasza błędy kompilacji w konsumentach**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: błędy TypeScript w `app/(tabs)/index.tsx` i `app/(admin)/(admin-tabs)/index.tsx` — to jest oczekiwane, naprawimy w Task 3.

- [ ] **Step 6: Commit**

```bash
git add lib/liturgy.ts __tests__/lib/liturgy.test.ts
git commit -m "fix: getLiturgicalDay returns LITURGICAL_FERIA instead of null"
```

---

### Task 3: Aktualizacja konsumentów getLiturgicalDay

**Files:**
- Modify: `app/(tabs)/index.tsx`
- Modify: `app/(admin)/(admin-tabs)/index.tsx`

TypeScript wymusił błędy po Task 2. Naprawiamy 5 miejsc — usuń null guardy gdzie funkcje kolorów już zwracają `null` dla FERIA, i zmień warunek renderowania bannera liturgicznego.

- [ ] **Step 1: Zaktualizuj `app/(tabs)/index.tsx` — linie ~59-61 (MemberHomeView)**

Zmień:
```ts
const todayLiturgy = getLiturgicalDay(today)
const litAccent = todayLiturgy ? getLiturgicalAccentColor(todayLiturgy) : null
const litBg = todayLiturgy ? getLiturgicalBgColor(todayLiturgy) : null
```

Na:
```ts
const todayLiturgy = getLiturgicalDay(today)
const litAccent = getLiturgicalAccentColor(todayLiturgy)
const litBg = getLiturgicalBgColor(todayLiturgy)
```

- [ ] **Step 2: Zaktualizuj `app/(tabs)/index.tsx` — linia ~185 (banner liturgii w churchSection)**

Zmień:
```tsx
{selectedLiturgy && (
```

Na:
```tsx
{selectedLiturgy.type !== 'FERIA' && (
```

Wyjaśnienie: FERIA fallback jest teraz zawsze truthy — warunek `type !== 'FERIA'` zachowuje oryginalne zachowanie (banner tylko dla dni ze specjalnym wspomnieniem).

- [ ] **Step 3: Zaktualizuj `app/(tabs)/index.tsx` — linie ~339-341 (ParentHomeView)**

Zmień:
```ts
const todayLiturgy = getLiturgicalDay(today)
const litAccent = todayLiturgy ? getLiturgicalAccentColor(todayLiturgy) : null
const litBg = todayLiturgy ? getLiturgicalBgColor(todayLiturgy) : null
```

Na:
```ts
const todayLiturgy = getLiturgicalDay(today)
const litAccent = getLiturgicalAccentColor(todayLiturgy)
const litBg = getLiturgicalBgColor(todayLiturgy)
```

- [ ] **Step 4: Zaktualizuj `app/(admin)/(admin-tabs)/index.tsx` — linie ~88-90**

Zmień:
```ts
const todayLiturgy = getLiturgicalDay(today)
const todayAccentColor = todayLiturgy ? getLiturgicalAccentColor(todayLiturgy) : null
const todayBgColor = todayLiturgy ? getLiturgicalBgColor(todayLiturgy) : null
```

Na:
```ts
const todayLiturgy = getLiturgicalDay(today)
const todayAccentColor = getLiturgicalAccentColor(todayLiturgy)
const todayBgColor = getLiturgicalBgColor(todayLiturgy)
```

- [ ] **Step 5: Zaktualizuj `app/(admin)/(admin-tabs)/index.tsx` — linia ~175 (dayComponent w kalendarzu)**

Zmień:
```ts
const litBg = lit ? getLiturgicalBgColor(lit) : null
```

Na:
```ts
const litBg = getLiturgicalBgColor(lit)
```

- [ ] **Step 6: Weryfikacja TypeScript — zero błędów**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: brak błędów (lub tylko błędy niezwiązane z tymi zmianami).

- [ ] **Step 7: Uruchom wszystkie testy**

```bash
npx jest --verbose
```

Expected: 24 testy PASS, 3 test suites (22 poprzednie + 1 GPS timeout + 2 FERIA fallback = 25... ale GPS jest 1 nowy test = 23, FERIA to 2 = 25 total — sprawdź czy wszystkie przechodzą).

- [ ] **Step 8: Commit**

```bash
git add app/\(tabs\)/index.tsx app/\(admin\)/\(admin-tabs\)/index.tsx
git commit -m "fix: remove null guards for getLiturgicalDay in consumers"
```
