# Checkin & Liturgy Fixes Design

**Data:** 2026-05-27
**Zakres:** Dwie poprawki jakościowe w `lib/checkin.ts` i `lib/liturgy.ts`

---

## Fix 1: GPS Timeout (lib/checkin.ts)

### Problem

`validateGps` wywołuje `Location.getCurrentPositionAsync({ accuracy: Accuracy.High })` bez żadnego ograniczenia czasowego. Jeśli GPS nie odpowiada (słaby sygnał, wyłączony), funkcja zawiesza się w nieskończoność bez feedbacku dla użytkownika.

### Rozwiązanie

Owinąć `getCurrentPositionAsync` w `Promise.race()` z timeoutem 15 sekund. Timeout rzuca błąd, który łapie istniejący `try/catch` w `validateGps` i zwraca czytelny komunikat.

### Zmiana kodu

**Plik:** `lib/checkin.ts` — tylko wewnątrz `validateGps`

```ts
const GPS_TIMEOUT_MS = 15_000

// W try/catch bloku validateGps:
const timeoutPromise = new Promise<never>((_, reject) =>
  setTimeout(() => reject(new Error('timeout')), GPS_TIMEOUT_MS)
)
pos = await Promise.race([
  Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
  timeoutPromise,
])
```

Istniejący `catch` w `validateGps` obsługuje timeout automatycznie. Wiadomość błędu:
```
'Przekroczono czas oczekiwania na lokalizację (15s). Sprawdź czy GPS jest włączony.'
```

### Brak zmian poza validateGps

`checkInGps` i `checkInButton` — bez zmian. Wszystkie callery `validateGps` (`schedule.tsx:567`) — bez zmian.

---

## Fix 2: getLiturgicalDay fallback (lib/liturgy.ts)

### Problem

`getLiturgicalDay` zwraca `null` dla dat nieobecnych w `liturgy.json`. Konsumenci nie mogą odróżnić "zwykły dzień" od "błąd danych". Typ `LiturgicalEntry | null` zmusza callery do warunków `if (lit)` zamiast po prostu korzystania z wartości.

### Rozwiązanie

Dodać eksportowaną stałą `LITURGICAL_FERIA` reprezentującą zwykły dzień i zwracać ją zamiast `null`. Zmienić typ zwracany na `LiturgicalEntry` — nigdy `null`.

### Zmiana kodu

**Plik:** `lib/liturgy.ts`

```ts
// Nowa eksportowana stała
export const LITURGICAL_FERIA: LiturgicalEntry = {
  name: 'Dzień powszedni',
  type: 'FERIA',
  typeLabel: 'Feria',
  color: 'GREEN',
}

// Zmieniony typ zwracany
export function getLiturgicalDay(dateStr: string): LiturgicalEntry {
  return (data as Record<string, LiturgicalEntry>)[dateStr] ?? LITURGICAL_FERIA
}
```

### Aktualizacja konsumentów (4 miejsca)

TypeScript wymusi poprawki — kod nie skompiluje się z nieprawidłowymi `if (lit)` checks.

| Plik | Linia | Aktualna logika | Po poprawce |
|------|-------|-----------------|-------------|
| `app/(tabs)/index.tsx` | 60-61 | `todayLiturgy ? getLiturgicalAccentColor(todayLiturgy) : null` | `getLiturgicalAccentColor(todayLiturgy)` |
| `app/(tabs)/index.tsx` | 125 | `getLiturgicalDay(selectedDay)` + `if (selectedLiturgy)` | Usunąć guard |
| `app/(admin)/(admin-tabs)/index.tsx` | 88 | `todayLiturgy ? ... : null` | Usunąć guard |
| `app/(admin)/(admin-tabs)/index.tsx` | 174 | `lit ? ... : null` | Usunąć guard |

**Niezmienione:** `app/(admin)/schedule-day.tsx:48` — tam `null` pochodzi z braku `date`, nie z `getLiturgicalDay`.

---

## Testy

### Nowe testy w `__tests__/lib/checkin.test.ts`

```ts
import * as Location from 'expo-location'

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
```

### Nowe testy w `__tests__/lib/liturgy.test.ts`

```ts
it('returns LITURGICAL_FERIA for unknown date', () => {
  const result = getLiturgicalDay('1900-01-01')
  expect(result.type).toBe('FERIA')
  expect(result).toBe(LITURGICAL_FERIA)
})

it('returns LiturgicalEntry for known date', () => {
  const result = getLiturgicalDay('2025-12-25')
  expect(result.type).not.toBe('FERIA')
})
```

---

## Zakres implementacji

1. `lib/checkin.ts` — dodać `GPS_TIMEOUT_MS` i `Promise.race` w `validateGps`
2. `lib/liturgy.ts` — dodać `LITURGICAL_FERIA`, zmienić typ i implementację `getLiturgicalDay`
3. `app/(tabs)/index.tsx` — usunąć null guards dla liturgii
4. `app/(admin)/(admin-tabs)/index.tsx` — usunąć null guards dla liturgii
5. `__tests__/lib/checkin.test.ts` — dodać test timeoutu GPS
6. `__tests__/lib/liturgy.test.ts` — dodać testy fallback FERIA
