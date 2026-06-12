# Welcome Screen Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `app/(auth)/welcome.tsx` — fullscreen gradient hero z obydwoma CTA widocznymi od razu, 4 karty funkcji z chattem, jeden przycisk rejestracji logiczny dla wszystkich ról.

**Architecture:** Jeden plik, zero nowych komponentów. Zastąpienie flat hero gradientem `expo-linear-gradient`. Oba przyciski w hero. Sekcja funkcji scrolluje się poniżej.

**Tech Stack:** React Native, Expo SDK 54, `expo-linear-gradient` (do instalacji), `Ionicons`, `lib/theme.ts`, `lib/shadows.ts`

---

## Files

| Action | Path |
|--------|------|
| Modify | `app/(auth)/welcome.tsx` |

---

### Task 1: Zainstaluj expo-linear-gradient

**Files:**
- Modify: `package.json` (automatycznie przez Expo install)

- [ ] **Krok 1: Sprawdź czy paczka jest już dostępna**

```bash
cd "C:\Users\brival\Desktop\Projekty\lso-app"
grep "linear-gradient" package.json
```

Oczekiwany wynik: brak outputu (paczka nie jest zainstalowana).

- [ ] **Krok 2: Zainstaluj przez Expo (zapewnia kompatybilną wersję)**

```bash
npx expo install expo-linear-gradient
```

Oczekiwany wynik: paczka dodana do `package.json`, `node_modules/expo-linear-gradient` istnieje.

- [ ] **Krok 3: Zweryfikuj instalację**

```bash
grep "linear-gradient" package.json
```

Oczekiwany wynik: `"expo-linear-gradient": "~X.X.X"` w dependencies.

- [ ] **Krok 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install expo-linear-gradient"
```

---

### Task 2: Przepisz welcome.tsx

**Files:**
- Modify: `app/(auth)/welcome.tsx`

> **Uwaga:** `lib/shadows.ts` eksportuje tylko `shadow.xs`, `shadow.md`, `shadow.brand` — brak `shadow.sm`. Stary kod używał `shadow.sm` (undefined, bez efektu). Nowy kod używa poprawnych tokenów.

- [ ] **Krok 1: Zastąp całą zawartość pliku**

Zastąp `app/(auth)/welcome.tsx` tym kodem:

```tsx
import { useMemo } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, StatusBar } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'
import { shadow } from '../../lib/shadows'

const FEATURES = [
  {
    icon: 'calendar-outline' as const,
    label: 'Grafik służb',
    sub: 'Automatyczny plan na cały rok liturgiczny z powiadomieniami push',
  },
  {
    icon: 'location-outline' as const,
    label: 'Weryfikacja obecności',
    sub: 'GPS, kod QR lub potwierdzenie przez opiekuna — w kilka sekund',
  },
  {
    icon: 'trophy-outline' as const,
    label: 'System punktów i rankingi',
    sub: 'Rankingi i historia punktów motywujące do regularnej służby',
  },
  {
    icon: 'chatbubbles-outline' as const,
    label: 'Czat z opiekunem',
    sub: 'Komunikacja wewnątrz grupy — bez zewnętrznych komunikatorów',
  },
]

export default function WelcomeScreen() {
  const router = useRouter()
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0D1764" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <LinearGradient
          colors={['#0D1764', '#1A237E', '#283593']}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.circleTopRight} />
          <View style={styles.circleBottomLeft} />
          <Text style={[styles.crossDecor, styles.crossTopLeft]}>✝</Text>
          <Text style={[styles.crossDecor, styles.crossBottomRight]}>✝</Text>

          <View style={styles.logoWrap}>
            <Ionicons name="shield-half-outline" size={34} color="#fff" />
          </View>

          <Text style={styles.appName}>LSO App</Text>
          <Text style={styles.appFull}>Liturgiczna Służba Ołtarza</Text>
          <Text style={styles.tagline}>
            Cyfrowe narzędzie dla opiekunów i ministrantów
          </Text>

          <TouchableOpacity
            style={styles.btnGold}
            onPress={() => router.push('/(auth)/register')}
            activeOpacity={0.85}
          >
            <Ionicons name="person-add-outline" size={20} color="#0D1764" />
            <Text style={styles.btnGoldText}>Zarejestruj się</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.btnWhite}
            onPress={() => router.push('/(auth)/login')}
            activeOpacity={0.85}
          >
            <Ionicons name="key-outline" size={20} color="#1A237E" />
            <Text style={styles.btnWhiteText}>Zaloguj się</Text>
          </TouchableOpacity>

          <Text style={styles.scrollHint}>↓ POZNAJ FUNKCJE ↓</Text>
        </LinearGradient>

        {/* Features */}
        <View style={styles.section}>
          {FEATURES.map((f, i) => (
            <View key={i} style={styles.featureCard}>
              <View style={styles.featureIconWrap}>
                <Ionicons name={f.icon} size={22} color={c.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureLabel}>{f.label}</Text>
                <Text style={styles.featureSub}>{f.sub}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Free badge */}
        <View style={styles.freeBadge}>
          <Ionicons name="heart-outline" size={16} color="#6B5B00" />
          <Text style={styles.freeBadgeText}>
            Bezpłatna aplikacja misyjna — wspierana dobrowolnymi ofiarami
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    scroll: { flex: 1 },
    content: { paddingBottom: 48 },

    // Hero
    hero: {
      paddingTop: 72,
      paddingBottom: 32,
      paddingHorizontal: 24,
      alignItems: 'center',
      overflow: 'hidden',
    },

    // Decorative background elements
    circleTopRight: {
      position: 'absolute', top: -50, right: -50,
      width: 160, height: 160, borderRadius: 80,
      backgroundColor: 'rgba(255,255,255,0.04)',
    },
    circleBottomLeft: {
      position: 'absolute', bottom: -40, left: -40,
      width: 120, height: 120, borderRadius: 60,
      backgroundColor: 'rgba(255,255,255,0.03)',
    },
    crossDecor: {
      position: 'absolute',
      color: '#fff',
    },
    crossTopLeft: {
      top: 18, left: 18,
      fontSize: 38, opacity: 0.05,
      transform: [{ rotate: '-15deg' }],
    },
    crossBottomRight: {
      bottom: 28, right: 14,
      fontSize: 28, opacity: 0.04,
      transform: [{ rotate: '10deg' }],
    },

    // Logo
    logoWrap: {
      width: 76, height: 76, borderRadius: 22,
      backgroundColor: 'rgba(255,255,255,0.12)',
      justifyContent: 'center', alignItems: 'center',
      marginBottom: 14,
      borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
      ...shadow.md,
    },

    appName: {
      fontSize: 30, fontWeight: '900', color: '#fff',
      letterSpacing: 0.5, marginBottom: 4,
    },
    appFull: {
      fontSize: 10, fontWeight: '600',
      color: 'rgba(255,255,255,0.5)',
      letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 14,
    },
    tagline: {
      fontSize: 13, color: 'rgba(255,255,255,0.82)',
      textAlign: 'center', lineHeight: 22,
      maxWidth: 220, marginBottom: 26,
    },

    // CTAs
    btnGold: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'center', gap: 9,
      width: '100%', paddingVertical: 15,
      backgroundColor: '#FFC107', borderRadius: 14,
      marginBottom: 10,
      ...shadow.md,
    },
    btnGoldText: { fontSize: 14, fontWeight: '800', color: '#0D1764' },

    btnWhite: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'center', gap: 9,
      width: '100%', paddingVertical: 14,
      backgroundColor: '#fff', borderRadius: 14,
      ...shadow.md,
    },
    btnWhiteText: { fontSize: 14, fontWeight: '800', color: '#1A237E' },

    scrollHint: {
      marginTop: 18,
      fontSize: 9, color: 'rgba(255,255,255,0.3)',
      letterSpacing: 1.5, textTransform: 'uppercase',
    },

    // Features section
    section: { backgroundColor: c.bg, padding: 14, gap: 8 },

    featureCard: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 13,
      padding: 13,
      backgroundColor: c.surface,
      borderRadius: 14,
      borderWidth: 1, borderColor: c.border,
      ...shadow.xs,
    },
    featureIconWrap: {
      width: 42, height: 42, borderRadius: 12,
      backgroundColor: c.primarySurface,
      justifyContent: 'center', alignItems: 'center',
      flexShrink: 0,
    },
    featureLabel: { fontSize: 13, fontWeight: '700', color: c.text, marginBottom: 3 },
    featureSub: { fontSize: 11, color: c.subtext, lineHeight: 17 },

    // Free badge
    freeBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      marginHorizontal: 14, marginTop: 4,
      backgroundColor: '#FFF8E1',
      borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
      borderWidth: 1, borderColor: 'rgba(255,193,7,0.3)',
    },
    freeBadgeText: {
      flex: 1, fontSize: 11,
      color: '#6B5B00', fontWeight: '500', lineHeight: 17,
    },
  })
}
```

- [ ] **Krok 2: Sprawdź TypeScript — brak błędów kompilacji**

```bash
cd "C:\Users\brival\Desktop\Projekty\lso-app"
npx tsc --noEmit
```

Oczekiwany wynik: brak błędów (lub te same błędy co przed zmianą — nie wprowadzamy nowych).

- [ ] **Krok 3: Commit**

```bash
git add app/(auth)/welcome.tsx
git commit -m "feat: redesign welcome screen — gradient hero, dual CTA, chat feature"
```

---

### Task 3: Manualna weryfikacja wizualna

**Files:** brak zmian — tylko testowanie

- [ ] **Krok 1: Uruchom aplikację**

```bash
cd "C:\Users\brival\Desktop\Projekty\lso-app"
npx expo start
```

Otwórz na urządzeniu lub emulatorze.

- [ ] **Krok 2: Sprawdź hero**

Otwórz aplikację na nowo (wylogowany stan).

Oczekiwane:
- Gradient indygo widoczny od góry do ~60% ekranu
- Logo (tarcza) z frosted-glass efektem (biały, lekko przezroczysty)
- Napis "LSO App" duży, bold, biały
- Napis "LITURGICZNA SŁUŻBA OŁTARZA" drobny, uppercase, ściszony
- Tagline pod tytułem, wyśrodkowany
- Przycisk **złoty** "Zarejestruj się" — pełna szerokość
- Przycisk **biały** "Zaloguj się" — pełna szerokość, obie ikony widoczne
- Hint "↓ POZNAJ FUNKCJE ↓" na dole hero, ledwo widoczny

- [ ] **Krok 3: Sprawdź nawigację przycisków**

- Tap "Zarejestruj się" → otwiera `register.tsx` z ekranem wyboru (`ChooseScreen` z dwiema kartami: ministrant/rodzic i parafia)
- Tap "Zaloguj się" → otwiera `login.tsx`
- Tap Wstecz w obydwu → wraca do welcome

- [ ] **Krok 4: Sprawdź sekcję funkcji (scroll)**

Zescrolluj w dół.

Oczekiwane:
- Jasne tło `#F8F9FA` kontrastuje z gradientem
- 4 karty: Grafik służb, Weryfikacja obecności, System punktów i rankingi, Czat z opiekunem
- Każda karta ma ikonę na niebieskim tle `#E8EAF6`
- Brak karty "Zastępstwa"
- Złoty badge "Bezpłatna aplikacja misyjna" na dole

- [ ] **Krok 5: Sprawdź dark mode**

Przełącz motyw na dark (w ustawieniach urządzenia lub w app jeśli jest przełącznik).

Oczekiwane:
- Hero gradient bez zmian (hardcoded kolory — OK)
- Karty funkcji używają `c.surface` i `c.border` — dostosowują się do dark mode
- Badge "Bezpłatna" z hardcoded `#FFF8E1` — akceptowalne (złoty akcent działa na dark też)
