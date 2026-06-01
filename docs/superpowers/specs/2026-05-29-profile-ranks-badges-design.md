# Profile Ranks & Badges Visibility Design

## Goal

Uzupełnić informacje o randze i odznakach w każdym widoku profilu aplikacji: publiczny ekran profilu ministranta dostępny dla wszystkich użytkowników, aktualizacja widoku rodzica, masowe przydzielanie rang przez admina oraz katalog odznak z kryteriami.

## Architecture

Cztery niezależne zmiany bazujące na istniejących tabelach (`profiles`, `ranks`, `member_badges`, `badge_definitions`). Nowe ekrany w istniejących grupach routera (`(tabs)` i `(admin)`). Logika kryteriów odznak rozszerzona o opisy w `lib/badges.ts` bez migracji bazy.

## Tech Stack

Expo Router, React Native, Supabase (RLS), TypeScript. Istniejące wzorce: `useTheme`, `shadow`, `useSafeAreaInsets`.

---

## A. Publiczny ekran profilu (`app/(tabs)/member-profile.tsx`)

### Opis

Nowy ekran read-only dostępny dla ministranta i rodzica, pokazujący profil dowolnego członka parafii. Parametr URL: `?id=<profileId>`.

### Dane

```ts
// Jedno zapytanie do Supabase:
supabase.from('profiles')
  .select(`
    id, full_name, avatar_url, rank_id,
    ranks(name),
    member_badges(
      awarded_at, is_active,
      badge_definition:badge_definitions(id, name, icon, persistence, criteria_key)
    )
  `)
  .eq('id', profileId)
  .single()
```

Filtr aktywnych odznak: `is_active = true`. Dla odznak `persistence = 'status'` pokazujemy tylko aktywne; dla `persistence = 'permanent'` zawsze aktywne.

RLS na `profiles` i `member_badges` automatycznie ogranicza dostęp do tej samej parafii.

### Widok

- Awatar (read-only) + imię + chip rangi
- Pasek formacyjny (ten sam `FormationSection` co w `profile.tsx`)
- Sekcja odznak (ten sam `BadgesSection`)
- Brak pól edytowalnych
- Przycisk wstecz w nagłówku

### Nawigacja do ekranu

Dodać `onPress={() => router.push('/(tabs)/member-profile?id=' + item.profile_id)}` w:

1. **`app/(tabs)/points.tsx`** — wiersze rankingu (tam gdzie wyświetlane jest imię i punkty)
2. **`app/(tabs)/schedule.tsx`** — lista uczestników danej służby (po otwarciu szczegółów dyżuru)

### Rejestracja w routerze

`app/(tabs)/_layout.tsx` — dodać `<Tabs.Screen name="member-profile" options={{ href: null }} />` (ukrywa z paska nawigacji, ale rejestruje ekran).

---

## B. Aktualizacja widoku rodzica

### `app/(tabs)/profile.tsx` — `ParentProfile`

Istniejące karty dzieci w sekcji "Powiązane dzieci" rozszerzyć o:
- Chip z rangą dziecka (nazwa rangi lub "Brak rangi" jeśli null)
- Ikonki odznak (max 4, reszta `+N`)
- `onPress` na kartę → `router.push('/(tabs)/member-profile?id=' + child.id)`

Dane: rozszerzyć query w `ParentProfile` o `rank_id, ranks(name), member_badges(is_active, badge_definition:badge_definitions(icon, persistence))`

### `app/(tabs)/index.tsx` — `ParentHomeView`

Karty dzieci w widoku głównym rodzica — te same zmiany co wyżej (rank chip + badge icons + nawigacja).

---

## C. Masowe przydzielanie rang (`app/(admin)/rank-assignment.tsx`)

### Opis

Ekran admina z listą wszystkich aktywnych członków parafii (role = 'member'). Umożliwia zmianę rangi każdego członka bezpośrednio z listy bez wchodzenia w jego profil.

### Sortowanie

Kolejność: najpierw członkowie bez rangi (`rank_id IS NULL`), potem alphabetycznie po `full_name`.

### Dane

```ts
// Członkowie parafii:
supabase.from('profiles')
  .select('id, full_name, avatar_url, rank_id, ranks(name)')
  .eq('parish_id', parishId)
  .eq('role', 'member')
  .order('full_name')

// Rangi (raz przy mount):
supabase.from('ranks')
  .select('id, name, order')
  .or(`parish_id.is.null,parish_id.eq.${parishId}`)
  .order('order')
```

### Widok

Każdy wiersz listy:
- Awatar (inicjały jeśli brak zdjęcia) + imię
- Chip rangi (lub "Brak rangi" w kolorze szarym) — klikalny
- Kliknięcie chipu otwiera Modal z listą rang + opcja "Brak rangi" (null)

Zapis:
```ts
supabase.from('profiles').update({ rank_id: selectedId }).eq('id', memberId)
```

Optymistyczny update UI — zmiana widoczna od razu, rollback przy błędzie z `Alert`.

### Nawigacja

`app/(admin)/(admin-tabs)/index.tsx` — dodać tile "Przydziel rangi" w sekcji Ustawienia, obok istniejącego "Zarządzaj rangami".

`app/(admin)/_layout.tsx` — zarejestrować `<Stack.Screen name="rank-assignment" options={{ title: 'Przydziel rangi' }} />`.

---

## D. Katalog odznak

### Opisy kryteriów w `lib/badges.ts`

Dodać eksportowaną mapę:

```ts
export const BADGE_CATALOG: Record<string, { description: string }> = {
  regularny:    { description: 'Minimum 3 dyżury w ostatnich 30 dniach' },
  seria_5:      { description: '5 dyżurów z rzędu bez nieobecności' },
  seria_10:     { description: '10 dyżurów z rzędu bez nieobecności' },
  seria_15:     { description: '15 dyżurów z rzędu bez nieobecności' },
  seria_20:     { description: '20 dyżurów z rzędu bez nieobecności' },
  weteran_100:  { description: 'Łącznie 100 zaliczonych dyżurów' },
  weteran_250:  { description: 'Łącznie 250 zaliczonych dyżurów' },
  weteran_500:  { description: 'Łącznie 500 zaliczonych dyżurów' },
  rocznica_1:   { description: '1 rok w aplikacji' },
  rocznica_2:   { description: '2 lata w aplikacji' },
  rocznica_5:   { description: '5 lat w aplikacji' },
  top3:         { description: 'Top 3 w rankingu parafii (przyznawana raz)' },
  sumienny:     { description: 'Przyznawana ręcznie przez animatora' },
  animator:     { description: 'Przyznawana ręcznie przez animatora' },
  szczegolna:   { description: 'Przyznawana ręcznie przez animatora' },
}
```

### Ekran `app/(tabs)/badge-catalog.tsx`

Lista wszystkich odznak z `badge_definitions` (systemowe + parafialne) wzbogacona o opis z `BADGE_CATALOG`.

Każdy wiersz: ikona emoji + nazwa + opis kryterium. Dla odznak parafialnych (parish_id != null) opis: "Przyznawana ręcznie przez animatora".

Nawigacja: przycisk/link w `app/(tabs)/profile.tsx` (zarówno `MemberProfile` jak i `ParentProfile`) — np. "Zobacz dostępne odznaki →" na dole sekcji odznak.

### Sekcja w `app/(admin)/badge-management.tsx`

Dodać trzecią sekcję "KATALOG ODZNAK" na dole ekranu — ta sama lista co wyżej, ale inline (nie osobny ekran admina).

---

## Zmiany w plikach — podsumowanie

| Plik | Typ zmiany |
|------|-----------|
| `lib/badges.ts` | Dodać `BADGE_CATALOG` map |
| `app/(tabs)/member-profile.tsx` | Nowy ekran |
| `app/(tabs)/_layout.tsx` | Rejestracja `member-profile` (href: null) |
| `app/(tabs)/profile.tsx` | `ParentProfile`: rank chip + badges + nawigacja do member-profile; link do badge-catalog |
| `app/(tabs)/index.tsx` | `ParentHomeView`: rank chip + badges + nawigacja do member-profile |
| `app/(tabs)/points.tsx` | Nawigacja z wierszy rankingu do member-profile |
| `app/(tabs)/schedule.tsx` | Nawigacja z listy uczestników do member-profile |
| `app/(tabs)/badge-catalog.tsx` | Nowy ekran |
| `app/(admin)/rank-assignment.tsx` | Nowy ekran |
| `app/(admin)/_layout.tsx` | Rejestracja `rank-assignment` |
| `app/(admin)/(admin-tabs)/index.tsx` | Tile "Przydziel rangi" |
| `app/(admin)/badge-management.tsx` | Sekcja katalogu odznak |

---

## Error Handling

- Brak profilu (`data === null`) → komunikat "Nie znaleziono profilu" z przyciskiem wstecz
- Błąd sieci przy zmianie rangi → `Alert.alert('Błąd', error.message)`, rollback UI
- Pusta lista rang → w pickerze zawsze opcja "Brak rangi"

## Testing

- `member-profile` wyświetla poprawnie dla ministranta z rangą i bez
- `member-profile` wyświetla poprawnie dla ministranta z odznakami i bez
- Zmiana rangi w `rank-assignment` zapisuje się i odświeża listę
- `badge-catalog` wyświetla wszystkie systemowe odznaki z opisami
- Rodzic widzi rangi i odznaki dzieci w `ParentProfile` i `ParentHomeView`
