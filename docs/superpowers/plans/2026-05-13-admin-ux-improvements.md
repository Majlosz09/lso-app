# Admin UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dodać stały bottom navigation bar w panelu admina oraz poprawić drobne problemy UX (teksty, puste stany).

**Architecture:** Zamieniamy Stack navigator w `(admin-tabs)/_layout.tsx` na Tabs z Expo Router — identyczny wzorzec jak w `(tabs)/_layout.tsx`. Detail screens (schedule-detail, member-detail itd.) zostają w rodzicielskim Stack `(admin)/_layout.tsx`. Profile tab ukryty z paska (`href: null`), dostępny przez avatar w headerze.

**Tech Stack:** Expo Router (Tabs), Ionicons, React Native StyleSheet

---

## Task 1: Bottom nav bar — zamiana Stack → Tabs w (admin-tabs)

**Files:**
- Modify: `app/(admin)/(admin-tabs)/_layout.tsx`

- [ ] **Step 1: Zamień całą zawartość pliku**

```tsx
import { Tabs, useRouter } from 'expo-router'
import { TouchableOpacity, Image } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '../../../stores/authStore'

export default function AdminTabsLayout() {
  const router = useRouter()
  const { profile } = useAuthStore()
  const avatarUrl = profile?.avatar_url

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#534AB7',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#e0e0e0',
          paddingBottom: 4,
        },
        headerStyle: { backgroundColor: '#534AB7' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Panel',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
          headerTitle: 'Panel administratora',
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push('/(admin)/(admin-tabs)/profile')}
              style={{ marginRight: 16 }}
              hitSlop={8}
            >
              {avatarUrl
                ? <Image
                    source={{ uri: avatarUrl }}
                    style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)' }}
                  />
                : <Ionicons name="person-circle-outline" size={30} color="#fff" />
              }
            </TouchableOpacity>
          ),
        }}
      />
      <Tabs.Screen
        name="members"
        options={{
          title: 'Ministranci',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push('/(admin)/rank-management')}
              style={{ marginRight: 16 }}
              hitSlop={8}
            >
              <Ionicons name="ribbon-outline" size={22} color="#fff" />
            </TouchableOpacity>
          ),
        }}
      />
      <Tabs.Screen
        name="schedules"
        options={{
          title: 'Grafiki',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="announcements"
        options={{
          title: 'Ogłoszenia',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="megaphone-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="points"
        options={{
          title: 'Punkty',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trophy-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{ href: null }}
      />
    </Tabs>
  )
}
```

- [ ] **Step 2: Sprawdź w przeglądarce**

Otwórz `http://localhost:8081`. Dolny pasek z 5 zakładkami: Panel, Ministranci, Grafiki, Ogłoszenia, Punkty. Kliknij każdą — nawigacja działa, header pokazuje prawidłowy tytuł.

- [ ] **Step 3: Commit**

```bash
git add app/(admin)/(admin-tabs)/_layout.tsx
git commit -m "feat: add bottom navigation bar to admin panel"
```

---

## Task 2: Poprawka tekstu "Nadch. służby" w profilu admina

**Files:**
- Modify: `app/(tabs)/profile.tsx` (linia 207)

- [ ] **Step 1: Zmień label**

W funkcji `AdminProfile` znajdź:
```tsx
<StatCard icon="calendar" iconColor="#27ae60" value={stats.upcoming} label="Nadch. służby" />
```
Zmień na:
```tsx
<StatCard icon="calendar" iconColor="#27ae60" value={stats.upcoming} label="Nadchodzące służby" />
```

- [ ] **Step 2: Commit**

```bash
git add "app/(tabs)/profile.tsx"
git commit -m "fix: expand abbreviated label in admin profile stats"
```

---

## Task 3: Poprawka etykiet Odbiorców w ogłoszeniach

**Files:**
- Modify: `app/(admin)/(admin-tabs)/announcements.tsx` (linia 16)

Problem: "Ministranci" (FIXED_AUDIENCES) wygląda jak duplikat rangi "Ministrant" z bazy danych.

- [ ] **Step 1: Zmień etykietę**

Znajdź:
```tsx
const FIXED_AUDIENCES: AudienceOption[] = [
  { key: 'all', label: 'Wszyscy', color: '#534AB7' },
  { key: 'members', label: 'Ministranci', color: '#2980b9' },
  { key: 'parents', label: 'Rodzice', color: '#27ae60' },
]
```
Zmień na:
```tsx
const FIXED_AUDIENCES: AudienceOption[] = [
  { key: 'all', label: 'Wszyscy', color: '#534AB7' },
  { key: 'members', label: 'Wszyscy ministranci', color: '#2980b9' },
  { key: 'parents', label: 'Wszyscy rodzice', color: '#27ae60' },
]
```

- [ ] **Step 2: Sprawdź w przeglądarce**

Otwórz Ogłoszenia → Nowe ogłoszenie. Sekcja Odbiorcy powinna pokazywać "Wszyscy ministranci" i "Wszyscy rodzice" zamiast "Ministranci" i "Rodzice".

- [ ] **Step 3: Commit**

```bash
git add "app/(admin)/(admin-tabs)/announcements.tsx"
git commit -m "fix: clarify audience labels to avoid confusion with rank names"
```

---

## Task 4: Empty state w Ministranci — dodaj CTA z kodem zaproszenia

**Files:**
- Modify: `app/(admin)/(admin-tabs)/members.tsx`

- [ ] **Step 1: Przeczytaj plik i znajdź empty state**

Znajdź komponent renderowany gdy lista ministrantów jest pusta (`ListEmptyComponent` lub pusty widok). Obecny stan to tylko "Brak użytkowników" z ikoną.

- [ ] **Step 2: Rozszerz empty state o CTA**

Zastąp pusty stan tak, aby zawierał hint o kodzie zaproszenia i link do parish-settings. Znajdź import `useRouter` (lub dodaj) i `useAuthStore`. Przykład:

```tsx
import { useRouter } from 'expo-router'
import { useAuthStore } from '../../../stores/authStore'

// wewnątrz komponentu:
const router = useRouter()
const { parish } = useAuthStore()

// ListEmptyComponent lub empty view:
<View style={styles.empty}>
  <Ionicons name="people-outline" size={48} color="#ccc" />
  <Text style={styles.emptyText}>Brak użytkowników</Text>
  <Text style={styles.emptyHint}>
    Zaproś ministrantów kodem: <Text style={styles.emptyCode}>{parish?.invite_code ?? '—'}</Text>
  </Text>
  <TouchableOpacity
    style={styles.emptyBtn}
    onPress={() => router.push('/(admin)/parish-settings')}
  >
    <Text style={styles.emptyBtnText}>Zarządzaj kodem zaproszenia</Text>
  </TouchableOpacity>
</View>
```

Dodaj style do `StyleSheet.create`:
```tsx
emptyHint: { fontSize: 13, color: '#aaa', textAlign: 'center', marginTop: 4 },
emptyCode: { fontWeight: '700', color: '#534AB7' },
emptyBtn: {
  marginTop: 8, paddingHorizontal: 20, paddingVertical: 10,
  backgroundColor: '#534AB711', borderRadius: 10, borderWidth: 1, borderColor: '#534AB733',
},
emptyBtnText: { fontSize: 14, color: '#534AB7', fontWeight: '600' },
```

- [ ] **Step 3: Sprawdź wizualnie**

Przejdź do zakładki Ministranci. Pusty stan powinien pokazywać kod zaproszenia i przycisk do ustawień.

- [ ] **Step 4: Commit**

```bash
git add "app/(admin)/(admin-tabs)/members.tsx"
git commit -m "feat: add invite code CTA to empty members state"
```
