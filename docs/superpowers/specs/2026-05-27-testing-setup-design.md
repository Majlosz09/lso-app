# Testing Setup Design — LSO App

**Data:** 2026-05-27  
**Cel:** Dodanie unit testów i component testów do projektu lso-app (Expo/React Native)  
**Podejście:** Jest + React Native Testing Library

---

## 1. Architektura i struktura plików

```
lso-app/
├── __tests__/
│   ├── lib/
│   │   ├── checkin.test.ts
│   │   ├── status.test.ts
│   │   └── liturgy.test.ts
│   └── components/
│       ├── login.test.tsx
│       └── profile.test.tsx
├── __mocks__/
│   ├── @supabase/
│   │   └── supabase-js.ts
│   └── expo-router.ts
├── jest.config.js
└── jest.setup.ts
```

### Nowe zależności (devDependencies)

- `@testing-library/react-native` — renderowanie komponentów w testach
- `@testing-library/jest-native` — dodatkowe matchery (`.toBeVisible()`, `.toHaveTextContent()`)

`jest-expo` dostępny przez preset Expo — nie wymaga osobnej instalacji.

---

## 2. Unit testy dla `lib/`

Testowane są wyłącznie czyste funkcje (bez wywołań Supabase ani expo-location).

### Kandydatki z `lib/checkin.ts`

- `validateParishQr(scannedValue, parishId)` — sprawdza poprawność QR kodu
- `buildParishQrValue(parishId)` — buduje string QR
- `getDistanceMeters(lat1, lng1, lat2, lng2)` — oblicza odległość GPS (Haversine)

### Przykład

```ts
// __tests__/lib/checkin.test.ts
import { validateParishQr, buildParishQrValue } from '../../lib/checkin'

describe('validateParishQr', () => {
  it('returns true for correct parish QR', () => {
    expect(validateParishQr('lso-checkin:abc123', 'abc123')).toBe(true)
  })
  it('returns false for wrong parish', () => {
    expect(validateParishQr('lso-checkin:abc123', 'xyz999')).toBe(false)
  })
  it('returns false for malformed value', () => {
    expect(validateParishQr('random-string', 'abc123')).toBe(false)
  })
})

describe('buildParishQrValue', () => {
  it('builds correct QR string', () => {
    expect(buildParishQrValue('abc123')).toBe('lso-checkin:abc123')
  })
})
```

Funkcje wywołujące Supabase (`checkInButton`, `checkInGps`) testowane z mockiem — bez uderzania w bazę.

---

## 3. Component testy

Testowane jest **zachowanie UI** — renderowanie, interakcje użytkownika, wywołania zależności.

### Mockowane zależności

- `expo-router` — `useRouter().replace` jako `jest.fn()`
- `../../lib/supabase` — `supabase.auth.signInWithPassword` jako `jest.fn()`

### Przykład (ekran logowania)

```tsx
// __tests__/components/login.test.tsx
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import LoginScreen from '../../app/(auth)/login'

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn() }),
}))

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: jest.fn().mockResolvedValue({ error: null }),
    },
  },
}))

describe('LoginScreen', () => {
  it('shows error when fields are empty', async () => {
    const { getByText } = render(<LoginScreen />)
    fireEvent.press(getByText('Zaloguj się'))
    await waitFor(() => {
      expect(getByText('Podaj email i hasło')).toBeTruthy()
    })
  })

  it('calls signInWithPassword with correct credentials', async () => {
    const { getByPlaceholderText, getByText } = render(<LoginScreen />)
    fireEvent.changeText(getByPlaceholderText('Email'), 'test@test.com')
    fireEvent.changeText(getByPlaceholderText('Hasło'), 'secret123')
    fireEvent.press(getByText('Zaloguj się'))
    await waitFor(() => {
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@test.com',
        password: 'secret123',
      })
    })
  })
})
```

**Zasada:** nie testujemy stylów ani layoutu — tylko logikę i zachowanie.

---

## 4. E2E testy — teoria (bez konfiguracji)

**Narzędzie:** Detox (standard dla React Native)

Detox steruje prawdziwym emulatorem — żadnych mocków, pełny przepływ użytkownika.

```
Test runner (Jest) → Detox → Emulator/Symulator → Aplikacja
```

### Kiedy dodać Detox do LSO App

- Gdy UI jest stabilny (mniej zmian w komponentach)
- Gdy unit + component testy nie wystarczają do wykrycia bugów integracyjnych
- Gdy działa CI/CD (GitHub Actions z emulatorem)

**Obecna ocena:** Za wcześnie — koszt konfiguracji ~4-8h, projekt na etapie aktywnego rozwoju.

---

## Zakres implementacji

1. Zainstalować `@testing-library/react-native` i `@testing-library/jest-native`
2. Stworzyć `jest.config.js` z preset `jest-expo`
3. Stworzyć `jest.setup.ts` z importem matcherów
4. Stworzyć mocki w `__mocks__/`
5. Napisać unit testy dla `lib/checkin.ts` (funkcje czyste)
6. Napisać component test dla `app/(auth)/login.tsx`
