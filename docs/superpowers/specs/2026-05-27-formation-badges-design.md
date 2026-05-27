# Formation & Badges Design

**Data:** 2026-05-27  
**Zakres:** Stopnie formacyjne z progress barem + system odznak dla ministranta

---

## Cel

Pokazać ministrantowi jego miejsce na ścieżce formacyjnej (progress bar) oraz wyróżnienia (odznaki) za regularność, staż i szczególną posługę. Admin przypisuje stopień formacyjny i przyznaje odznaki ręczne; część odznak przyznawana jest automatycznie przez aplikację.

---

## Architektura

Dwie warstwy:

1. **Stopnie formacyjne** — istniejąca tabela `ranks` (ma już `name`, `order`, `is_system`, `parish_id`). Zmiana tylko w UI: zamiast pojedynczej etykiety pokazujemy progress bar z wszystkimi stopniami.

2. **Odznaki** — dwie nowe tabele Supabase: `badge_definitions` + `member_badges`.

---

## Stopnie formacyjne

### Domyślny zestaw (ładowany jako `is_system = true`)

| order | name |
|-------|------|
| 1 | Kandydat |
| 2 | Ministrant |
| 3 | Lektor Młodszy |
| 4 | Lektor Starszy |
| 5 | Ceremoniarz |

Admin może dodać własne stopnie lub usunąć niestandardowe (ekran `rank-management.tsx` bez zmian funkcjonalnych).

### Przypisanie stopnia

Admin przypisuje stopień z ekranu `member-detail.tsx` (istniejący mechanizm `rank_id` w profilu). System wyświetla wskazówkę przy kryteriach, ale decyzja należy do admina.

---

## Odznaki

### Schemat bazy danych

```sql
-- Definicje odznak (system + custom per parafia)
create table badge_definitions (
  id           uuid primary key default gen_random_uuid(),
  parish_id    uuid references parishes(id) on delete cascade,  -- null = system
  name         text not null,
  icon         text not null,          -- emoji, np. '🔥'
  type         text not null,          -- 'auto' | 'manual'
  persistence  text not null,          -- 'status' | 'permanent'
  criteria_key text not null,          -- 'regularny'|'seria_5'|'seria_10'|'seria_15'|'seria_20'|
                                       -- 'weteran_100'|'weteran_250'|'weteran_500'|
                                       -- 'rocznica_1'|'rocznica_2'|'rocznica_5'|
                                       -- 'top3'|'sumienny'|'animator'|'szczegolna'|'custom'
  created_at   timestamptz default now()
);

-- Odznaki przyznane członkom
create table member_badges (
  id                    uuid primary key default gen_random_uuid(),
  profile_id            uuid references profiles(id) on delete cascade,
  badge_definition_id   uuid references badge_definitions(id) on delete cascade,
  awarded_at            timestamptz default now(),
  awarded_by            uuid references profiles(id),   -- null = system
  note                  text,
  is_active             boolean default true,
  unique (profile_id, badge_definition_id)
);
```

RLS: `member_badges` widoczne dla właściciela profilu i adminów tej samej parafii.

### Katalog odznak

#### Auto-statusowe (obliczane przy ładowaniu profilu; `is_active` aktualizowany przy każdym odczycie)

| criteria_key | icon | name | Kryterium |
|---|---|---|---|
| `regularny` | 🔥 | Regularny | ≥80% frekwencji w ostatnich 30 dniach (liczba `present`/`scheduled` z `schedule_assignments`) |
| `seria_5` | ⚡ | Seria 5 | ≥5 ostatnich przypisanych służb z rzędu bez statusu `absent` |
| `seria_10` | ⚡ | Seria 10 | ≥10 j.w. |
| `seria_15` | ⚡ | Seria 15 | ≥15 j.w. |
| `seria_20` | ⚡ | Seria 20 | ≥20 j.w. |

Logika Serii: pobierz ostatnie N służb z `schedule_assignments` posortowanych malejąco wg daty. Licz od najnowszej, przerywaj gdy status = `absent`. Aktualna długość serii = liczba kolejnych non-`absent`. Aktywne są wszystkie progi ≤ bieżącej serii. Nieobecność zeruje wszystkie progi (`is_active = false` dla seria_5/10/15/20).

#### Auto-trwałe (przyznawane raz, `is_active` nigdy nie zmienia się na false)

| criteria_key | icon | name | Kryterium |
|---|---|---|---|
| `weteran_100` | 🎖️ | Weteran 100 | ≥100 służb łącznie (status `present` lub `confirmed`) |
| `weteran_250` | 🎖️ | Weteran 250 | ≥250 j.w. |
| `weteran_500` | 🎖️ | Weteran 500 | ≥500 j.w. |
| `rocznica_1` | 🎂 | Rocznik 1 | ≥12 miesięcy od `profiles.created_at` |
| `rocznica_2` | 🎂 | Rocznik 2 | ≥24 miesięcy j.w. |
| `rocznica_5` | 🎂 | Rocznik 5 | ≥60 miesięcy j.w. |
| `top3` | 🏆 | Top 3 | w top 3 rankingu punktowego w bieżącym miesiącu (`points` z `created_at` w tym miesiącu) |

#### Ręczne-trwałe (admin przyznaje z opcjonalną notatką)

| criteria_key | icon | name |
|---|---|---|
| `sumienny` | ⭐ | Sumienny |
| `animator` | 👑 | Animator |
| `szczegolna` | ✝️ | Szczególna posługa |
| `custom` | 🎨 | (nazwa własna admina) |

Odznaki `custom` mają `parish_id` ustawione — są unikalne dla parafii.

### Obliczanie auto-odznak (`lib/badges.ts`)

```ts
export async function computeAndSyncBadges(
  supabase: SupabaseClient,
  profileId: string,
  parishId: string,
): Promise<void>
```

Funkcja wywoływana przy ładowaniu profilu (ministranta i widoku admina). Wykonuje potrzebne zapytania i upsertuje `member_badges`:
- Dla status-owych: ustawia `is_active` na podstawie bieżących danych
- Dla trwałych: insert gdy próg osiągnięty (ignoruje jeśli już istnieje)

Nie blokuje renderowania — wywołana fire-and-forget (`computeAndSyncBadges(...).catch(console.error)`).

---

## Zmiany UI

### `app/(tabs)/profile.tsx`

Nowa sekcja **"Formacja"** pod kartami statystyk:

```
┌─────────────────────────────────────────┐
│  ŚCIEŻKA FORMACJI                       │
│  ✓──────✓──────●──────○──────○         │
│  Kandydat  Ministrant  [Lektor Mł.]  Lektor St.  Ceremoniarz │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│  WYRÓŻNIENIA                            │
│  🔥        ⚡        🎖️                 │
│  Regularny  Seria 10  Weteran 100       │
└─────────────────────────────────────────┘
```

Progress bar: zielone kółka dla ukończonych stopni, granatowe dla bieżącego, szare dla przyszłych.  
Odznaki: tylko `is_active = true`. Tap na odznakę pokazuje tooltip z opisem i datą zdobycia.

### `app/(admin)/member-detail.tsx`

Nowa zakładka **"Odznaki"** (obok istniejących zakładek):
- Lista przyznanych odznak (`is_active = true`) z datą, przyznanym przez, notatką
- Przycisk "Przyznaj odznakę" → bottom sheet z listą dostępnych odznak ręcznych
- Bottom sheet: wybór odznaki + opcjonalna notatka + przycisk Zapisz

### Nowy ekran `app/(admin)/badge-management.tsx`

Dostępny z panelu admina (nowy wiersz w sekcji Ustawienia obok Statystyk).

Dwie sekcje:
1. **Odznaki parafii** — lista custom odznak (`parish_id = parishId`). Przycisk dodania własnej (nazwa + emoji picker). Usuwanie custom odznak.
2. **Historia przyznanych** — lista ostatnich przyznań w parafii (kto, kiedy, jaka odznaka).

### `app/(admin)/rank-management.tsx`

Brak zmian funkcjonalnych. Opcjonalna zmiana tytułu nagłówka na "Stopnie formacyjne".

### `app/(admin)/_layout.tsx`

Dodanie `<Stack.Screen name="badge-management" options={{ title: 'Odznaki' }} />`.

---

## Nowy ekran w panelu admina

W `app/(admin)/(admin-tabs)/index.tsx` dodać kafelek "Odznaki" w sekcji Ustawienia, prowadzący do `/(admin)/badge-management`.

---

## Testy

### `__tests__/lib/badges.test.ts`

**`computeAutoStatusBadges`:**
- Regularny: `present/scheduled ≥ 0.8` → aktywna; `< 0.8` → nieaktywna
- Seria: 5 non-absent z rzędu → `seria_5` aktywna; 1 `absent` → wszystkie serie nieaktywne
- Seria 10: potrzeba ≥10; przy 7 → tylko `seria_5` aktywna

**`computeAutoPermanentBadges`:**
- Weteran: 100 present → `weteran_100`; 99 → brak
- Rocznica: `created_at` przed 13 miesiącami → `rocznica_1`; przed 5 laty → `rocznica_1` + `rocznica_2` + `rocznica_5`
- Top 3: gdy w top 3 bieżącego miesiąca → `top3`

---

## Zależności

Brak nowych pakietów. Wszystko działa na istniejącym stosie (Supabase, React Native, expo-router).
