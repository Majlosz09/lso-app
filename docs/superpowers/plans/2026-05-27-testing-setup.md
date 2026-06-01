# Testing Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Skonfigurować Jest + React Native Testing Library i napisać unit testy dla `lib/` oraz component testy dla ekranu logowania.

**Architecture:** Jest z preset `jest-expo` obsługuje transpilację React Native/Expo. Manualne mocki w `__mocks__/` pokrywają `expo-router` i `@expo/vector-icons` globalnie. Testy Supabase i ThemeContext używają inline `jest.mock()` dla czytelności. TDD — najpierw testy, potem weryfikacja.

**Tech Stack:** jest-expo, @testing-library/react-native, TypeScript

---

### Task 1: Instalacja zależności i konfiguracja Jest

**Files:**
- Modify: `package.json`
- Create: `jest.config.js`
- Create: `jest.setup.ts`

- [ ] **Step 1: Zainstaluj zależności testowe**

```bash
cd lso-app
npx expo install jest-expo @testing-library/react-native --save-dev
```

Expected: pakiety dodane do `node_modules`, `package.json` zaktualizowany w sekcji `devDependencies`.

- [ ] **Step 2: Dodaj skrypt test do package.json**

W `package.json`, w sekcji `"scripts"`, dodaj dwa wpisy:

```json
"test": "jest",
"test:watch": "jest --watch"
```

- [ ] **Step 3: Utwórz jest.config.js**

Plik: `lso-app/jest.config.js`

```js
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|wonka|@supabase)',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
}
```

- [ ] **Step 4: Utwórz jest.setup.ts**

Plik: `lso-app/jest.setup.ts`

```ts
import '@testing-library/react-native/extend-expect'
```

- [ ] **Step 5: Uruchom Jest — weryfikacja konfiguracji (zero testów)**

```bash
npx jest --passWithNoTests
```

Expected: `Test Suites: 0 skipped` lub `No tests found` — brak błędów konfiguracyjnych.

- [ ] **Step 6: Commit**

```bash
git add jest.config.js jest.setup.ts package.json package-lock.json
git commit -m "chore: add jest-expo and react-native testing library setup"
```

---

### Task 2: Manualne mocki dla modułów node_modules

**Files:**
- Create: `__mocks__/expo-router.ts`
- Create: `__mocks__/@expo/vector-icons.ts`

- [ ] **Step 1: Utwórz mock expo-router**

Plik: `lso-app/__mocks__/expo-router.ts`

```ts
import React from 'react'

const mockReplace = jest.fn()
const mockPush = jest.fn()
const mockBack = jest.fn()

module.exports = {
  useRouter: () => ({ replace: mockReplace, push: mockPush, back: mockBack }),
  useLocalSearchParams: () => ({}),
  useSegments: () => [],
  Link: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  router: { replace: mockReplace, push: mockPush, back: mockBack },
  Redirect: () => null,
}
```

- [ ] **Step 2: Utwórz katalog @expo w __mocks__ i mock vector-icons**

Plik: `lso-app/__mocks__/@expo/vector-icons.ts`

```ts
import React from 'react'
import { Text } from 'react-native'

const createIconSet = () => {
  const Icon = ({ name }: { name: string }) =>
    React.createElement(Text, { testID: `icon-${name}` }, name)
  return Icon
}

module.exports = {
  Ionicons: createIconSet(),
  MaterialIcons: createIconSet(),
  FontAwesome: createIconSet(),
  AntDesign: createIconSet(),
}
```

- [ ] **Step 3: Uruchom Jest — zero testów, zero błędów importu mocków**

```bash
npx jest --passWithNoTests
```

Expected: bez błędów.

- [ ] **Step 4: Commit**

```bash
git add __mocks__/
git commit -m "chore: add manual mocks for expo-router and vector-icons"
```

---

### Task 3: Unit testy dla lib/checkin.ts

**Files:**
- Create: `__tests__/lib/checkin.test.ts`

Testujemy dwie wyeksportowane czyste funkcje: `validateParishQr` i `buildParishQrValue`.
Funkcja `getDistanceMeters` jest prywatna (nie eksportowana) — nie testujemy jej bezpośrednio.

- [ ] **Step 1: Utwórz plik testowy**

Plik: `lso-app/__tests__/lib/checkin.test.ts`

```ts
import { validateParishQr, buildParishQrValue } from '../../lib/checkin'

describe('validateParishQr', () => {
  it('returns true for matching parishId', () => {
    expect(validateParishQr('lso-checkin:abc123', 'abc123')).toBe(true)
  })

  it('returns false for different parishId', () => {
    expect(validateParishQr('lso-checkin:abc123', 'xyz999')).toBe(false)
  })

  it('returns false for malformed QR value', () => {
    expect(validateParishQr('random-string', 'abc123')).toBe(false)
  })

  it('returns false for empty strings', () => {
    expect(validateParishQr('', '')).toBe(false)
  })
})

describe('buildParishQrValue', () => {
  it('builds correct QR string with parishId', () => {
    expect(buildParishQrValue('abc123')).toBe('lso-checkin:abc123')
  })

  it('round-trips correctly with validateParishQr', () => {
    const parishId = 'test-parish-99'
    const qr = buildParishQrValue(parishId)
    expect(validateParishQr(qr, parishId)).toBe(true)
  })
})
```

- [ ] **Step 2: Uruchom testy — powinny przejść**

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
```

- [ ] **Step 3: Commit**

```bash
git add __tests__/lib/checkin.test.ts
git commit -m "test: add unit tests for validateParishQr and buildParishQrValue"
```

---

### Task 4: Unit testy dla lib/liturgy.ts

**Files:**
- Create: `__tests__/lib/liturgy.test.ts`

Testujemy `getLiturgicalAccentColor` i `getLiturgicalBgColor` — czyste funkcje bez zewnętrznych zależności.

- [ ] **Step 1: Utwórz plik testowy**

Plik: `lso-app/__tests__/lib/liturgy.test.ts`

```ts
import {
  getLiturgicalAccentColor,
  getLiturgicalBgColor,
  COLOR_HEX,
  LiturgicalEntry,
} from '../../lib/liturgy'

const makeEntry = (type: string, color?: string): LiturgicalEntry => ({
  name: 'Test',
  type,
  typeLabel: 'Test Label',
  color,
})

describe('getLiturgicalAccentColor', () => {
  it('returns color for SOLEMNITY', () => {
    expect(getLiturgicalAccentColor(makeEntry('SOLEMNITY', 'RED'))).toBe(COLOR_HEX.RED)
  })

  it('returns color for FEAST', () => {
    expect(getLiturgicalAccentColor(makeEntry('FEAST', 'WHITE'))).toBe(COLOR_HEX.WHITE)
  })

  it('returns null for FERIA (not in show-dot list)', () => {
    expect(getLiturgicalAccentColor(makeEntry('FERIA', 'GREEN'))).toBeNull()
  })

  it('returns null for SUNDAY (not in show-dot list)', () => {
    expect(getLiturgicalAccentColor(makeEntry('SUNDAY', 'GREEN'))).toBeNull()
  })

  it('returns null when color is unknown', () => {
    expect(getLiturgicalAccentColor(makeEntry('SOLEMNITY', 'UNKNOWN'))).toBeNull()
  })
})

describe('getLiturgicalBgColor', () => {
  it('returns null when no color defined', () => {
    expect(getLiturgicalBgColor(makeEntry('FERIA', undefined))).toBeNull()
  })

  it('returns null for GREEN FERIA', () => {
    expect(getLiturgicalBgColor(makeEntry('FERIA', 'GREEN'))).toBeNull()
  })

  it('returns color for GREEN non-FERIA', () => {
    expect(getLiturgicalBgColor(makeEntry('MEMORIAL', 'GREEN'))).toBe(COLOR_HEX.GREEN)
  })

  it('returns null for WHITE MEMORIAL (not important enough)', () => {
    expect(getLiturgicalBgColor(makeEntry('MEMORIAL', 'WHITE'))).toBeNull()
  })

  it('returns color for WHITE SOLEMNITY', () => {
    expect(getLiturgicalBgColor(makeEntry('SOLEMNITY', 'WHITE'))).toBe(COLOR_HEX.WHITE)
  })

  it('returns RED for RED FEAST', () => {
    expect(getLiturgicalBgColor(makeEntry('FEAST', 'RED'))).toBe(COLOR_HEX.RED)
  })
})
```

- [ ] **Step 2: Uruchom testy**

```bash
npx jest __tests__/lib/liturgy.test.ts --verbose
```

Expected:
```
PASS __tests__/lib/liturgy.test.ts
  getLiturgicalAccentColor
    ✓ returns color for SOLEMNITY
    ✓ returns color for FEAST
    ✓ returns null for FERIA (not in show-dot list)
    ✓ returns null for SUNDAY (not in show-dot list)
    ✓ returns null when color is unknown
  getLiturgicalBgColor
    ✓ returns null when no color defined
    ✓ returns null for GREEN FERIA
    ✓ returns color for GREEN non-FERIA
    ✓ returns null for WHITE MEMORIAL (not important enough)
    ✓ returns color for WHITE SOLEMNITY
    ✓ returns RED for RED FEAST
```

- [ ] **Step 3: Commit**

```bash
git add __tests__/lib/liturgy.test.ts
git commit -m "test: add unit tests for liturgy accent and background color helpers"
```

---

### Task 5: Component test dla ekranu logowania

**Files:**
- Create: `__tests__/components/login.test.tsx`

Testujemy zachowanie UI: renderowanie pól, walidację pustych pól, wywołanie Supabase z poprawnymi danymi, wyświetlanie przetłumaczonego błędu. `expo-router` jest mockowany globalnie przez `__mocks__/expo-router.ts` — nie potrzeba inline mock.

- [ ] **Step 1: Utwórz plik testowy**

Plik: `lso-app/__tests__/components/login.test.tsx`

```tsx
import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import LoginScreen from '../../app/(auth)/login'

const mockSignIn = jest.fn()

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: mockSignIn,
    },
  },
}))

jest.mock('../../lib/ThemeContext', () => ({
  useTheme: () => ({
    colors: require('../../lib/theme').lightColors,
    isDark: false,
    scheme: 'light',
  }),
}))

beforeEach(() => {
  mockSignIn.mockReset()
})

describe('LoginScreen', () => {
  it('renders email and password inputs', () => {
    const { getByPlaceholderText } = render(<LoginScreen />)
    expect(getByPlaceholderText('Email')).toBeTruthy()
    expect(getByPlaceholderText('Hasło')).toBeTruthy()
  })

  it('shows error when both fields are empty', async () => {
    const { getByText } = render(<LoginScreen />)
    fireEvent.press(getByText('Zaloguj się'))
    await waitFor(() => {
      expect(getByText('Wypełnij email i hasło')).toBeTruthy()
    })
  })

  it('does not call supabase when fields are empty', async () => {
    const { getByText } = render(<LoginScreen />)
    fireEvent.press(getByText('Zaloguj się'))
    await waitFor(() => {
      expect(mockSignIn).not.toHaveBeenCalled()
    })
  })

  it('calls signInWithPassword with correct email and password', async () => {
    mockSignIn.mockResolvedValue({ error: null })

    const { getByPlaceholderText, getByText } = render(<LoginScreen />)
    fireEvent.changeText(getByPlaceholderText('Email'), 'test@example.com')
    fireEvent.changeText(getByPlaceholderText('Hasło'), 'secret123')
    fireEvent.press(getByText('Zaloguj się'))

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'secret123',
      })
    })
  })

  it('shows translated error on invalid credentials', async () => {
    mockSignIn.mockResolvedValue({
      error: { message: 'Invalid login credentials' },
    })

    const { getByPlaceholderText, getByText } = render(<LoginScreen />)
    fireEvent.changeText(getByPlaceholderText('Email'), 'wrong@example.com')
    fireEvent.changeText(getByPlaceholderText('Hasło'), 'wrongpass')
    fireEvent.press(getByText('Zaloguj się'))

    await waitFor(() => {
      expect(getByText('Nieprawidłowy email lub hasło')).toBeTruthy()
    })
  })
})
```

- [ ] **Step 2: Uruchom testy komponentu**

```bash
npx jest __tests__/components/login.test.tsx --verbose
```

Expected:
```
PASS __tests__/components/login.test.tsx
  LoginScreen
    ✓ renders email and password inputs
    ✓ shows error when both fields are empty
    ✓ does not call supabase when fields are empty
    ✓ calls signInWithPassword with correct email and password
    ✓ shows translated error on invalid credentials
```

- [ ] **Step 3: Uruchom wszystkie testy razem**

```bash
npx jest --verbose
```

Expected: wszystkie 17 testów — PASS, 3 test suites.

- [ ] **Step 4: Commit**

```bash
git add __tests__/components/login.test.tsx
git commit -m "test: add component tests for LoginScreen"
```
