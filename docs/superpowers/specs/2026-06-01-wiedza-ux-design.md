# Design: Ekran Wiedza + Ulepszenia UX

**Data:** 2026-06-01  
**Status:** Zatwierdzony

---

## Scope

Dwa obszary zmian:
1. **Ekran Wiedza** — nowy ekran zastępujący placeholder "wkrótce coś tu będzie"
2. **Ulepszenia UX** — bug fix + opisy kontekstowe + toast system + onboarding

---

## 1. Ekran Wiedza

### Architektura

Treść jest **statyczna** — zakodowana w `lib/wiedza.ts`, bez tabel Supabase. Nie wymaga uprawnień ani synchronizacji.

Hierarchia danych:
```
Kategoria (6)
  └── Sekcja (2–5 per kategoria)
        └── Element (tytuł + treść)
```

### Kategorie i zawartość

| Emoji | Kategoria | Sekcje | Elementy |
|-------|-----------|--------|----------|
| 🙏 | Modlitwy | Podstawowe, Dla funkcji, Przy zakładaniu szat, Do Patronów, Na zbiórki | ~13 modlitw |
| 📖 | Słowniczek | Naczynia, Kościół, Księgi, Szaty, Materiały, Kolory | ~40 haseł |
| ✨ | Patroni | — | 4 sylwetki (Tarsycjusz, Dominik Savio, Berchmans, Stanisław Kostka) |
| 🤲 | Postawy i Gesty | Postawy, Gesty, Skłony i przyklęknięcia | ~10 elementów |
| ⛪ | Msza Święta | I–V (Obrzędy Wstępne, Liturgia Słowa, Liturgia Eucharystyczna, Obrzędy Komunii, Obrzędy Zakończenia) | ~20 etapów |
| 🏅 | Stopnie i Posługi | — | 13 funkcji (Kandydat → Ceremoniarz) |

Treść pochodzi z dokumentu "Wiedza - aplikacja lso.pdf".  
**Brak blokowania treści po stopniu** — wszystko widoczne dla każdego.

### Nawigacja (Podejście B + C dla Słowniczka)

**Ekran 1 — Główna Wiedzy** (`app/(tabs)/wiedza.tsx`)  
Grid 2×3 kart kategorii z emoji, nazwą i licznikiem elementów.

**Ekran 2a — Lista sekcji/elementów** (`app/wiedza/[categoryId].tsx`)  
FlatList z sekcjami jako nagłówkami. Każdy element tap → Ekran 3.

**Ekran 2b — Słowniczek** (`app/wiedza/slowniczek.tsx`)  
Wyszukiwarka (TextInput z instant filter) + chipy kategorii (Naczynia, Kościół, Szaty, Kolory, Wszystkie). FlatList filtrowany reactywnie. Tap hasła → `app/wiedza/slowniczek/[itemId].tsx` (ten sam layout co Ekran 3, ale nawigacja poprzednia/następna w obrębie przefiltrowanej listy).

**Ekran 3 — Czytelnia** (`app/wiedza/[categoryId]/[itemId].tsx`)  
Pełnoekranowy widok treści. Nawigacja "← Poprzednia / Następna →" pomiędzy elementami tej samej sekcji.

### Struktura danych (`lib/wiedza.ts`)

```typescript
export interface WiedzaItem {
  id: string
  title: string
  subtitle?: string      // np. "łac. Calix" dla Słowniczka
  content: string
  tag?: string           // np. "Naczynia" dla Słowniczka
}

export interface WiedzaSection {
  id: string
  title: string
  items: WiedzaItem[]
}

export interface WiedzaCategory {
  id: string
  title: string
  emoji: string
  sections: WiedzaSection[]
  searchable?: boolean   // true tylko dla Słowniczka
}

export const WIEDZA_DATA: WiedzaCategory[] = [ ... ]
```

---

## 2. Ulepszenia UX

### 2a. Bug — Admin: zapis obecności na zbiórce

**Symptom:** Admin zaznacza obecnych na zbiórce, zapisuje — brak efektu, brak komunikatu błędu.  
**Działanie:** Zbadać `app/(admin)/(admin-tabs)/schedules.tsx` i powiązane pliki obsługi obecności — prawdopodobna przyczyna to brakujące pole (`schedule_id` lub `attendance_mode`) albo błąd RLS dla tabeli `attendance` blokowany cicho. Po znalezieniu przyczyny: naprawić logikę zapisu + dodać jawny komunikat błędu (przez toast z sekcji 2c) zamiast cichego failsafe.

### 2b. Opisy kontekstowe (Help texts)

Trzy typy opisów:

**Empty states** — gdy lista jest pusta, wyświetlić ikonę + tytuł + opis co zrobić. Dotyczy:
- `schedule.tsx` — "Brak służb w tym tygodniu. Administrator przypisze Cię do grafiku."
- `points.tsx` (Historia) — "Brak historii punktów. Punkty zdobywasz za każdą potwierdzoną służbę."
- `announcements.tsx` — "Brak ogłoszeń. Administrator pojawi się tutaj z nowościami."
- `(admin)` ekrany z listami członków/służb — stosowne opisy dla pustych list.

**Nagłówki sekcji z ℹ** — przy sekcjach które nie są oczywiste (np. "Punkty", "Ranking", "Tryb QR") dodać ikonę ℹ która otwiera mały Modal z wyjaśnieniem.

**Podpisy przy akcjach** — pod przyciskami "Zgłoś nieobecność", "Zapisz się cyklicznie" itp. dodać krótki szary tekst wyjaśniający co się stanie.

### 2c. Toast system

**Biblioteka:** `react-native-toast-message`  
**Umiejscowienie:** `<Toast />` w `app/_layout.tsx` (root layout) aby był dostępny z każdego ekranu.

Trzy typy toastów:
- ✅ **success** (zielony) — po każdym pomyślnym zapisie/akcji
- ❌ **error** (czerwony) — po każdym błędzie zamiast cichego failsafe
- ℹ️ **info** (fioletowy `#534AB7`) — po akcjach informacyjnych (np. wypisanie z służby cyklicznej)

Czas wyświetlania: **3 sekundy**. Toast pojawia się u góry ekranu, nie blokuje UI.

Akcje które dostają toast (minimum):
- Zapis obecności (admin i ministrant)
- Zapisanie/wypisanie ze służby
- Zgłoszenie nieobecności
- Dodanie/edycja ogłoszenia
- Ręczne przyznanie punktów
- Każdy błąd sieciowy

### 2d. Onboarding

**Trigger:** Pole `onboarding_completed: boolean` w tabeli `profiles` (domyślnie `false`).  
**Migracja DB:** Dodać kolumnę `ALTER TABLE profiles ADD COLUMN onboarding_completed boolean DEFAULT false`.  
Po `fetchProfile()`, jeśli `profile.onboarding_completed === false` → `OnboardingModal` wyświetla się jako fullscreen modal **na wierzchu** normalnego ekranu (nie zastępuje nawigacji). Użytkownik widzi aplikację pod modalem gdy ten znika.

**Flow:**
1. Po pierwszym zalogowaniu wyświetla się fullscreen modal z 5 slajdami
2. Każdy slajd: duże emoji, tytuł, 2-3 zdania opisu, dot-indicator, przyciski "Pomiń" / "Dalej →"
3. Na ostatnim slajdzie przycisk "Zaczynamy!" → `UPDATE profiles SET onboarding_completed = true` → modal znika

**5 slajdów** (jeden per główna zakładka):
1. 📅 **Grafik** — nadchodzące służby, jak się zapisać / wypisać
2. ✅ **Obecność** — jak potwierdzić obecność (przycisk / GPS / QR)
3. 🏆 **Punkty** — jak zdobywasz punkty, ranking parafii
4. 📢 **Ogłoszenia** — wiadomości od administratora
5. 📚 **Wiedza** — modlitwy, słowniczek, ceremoniał

**Dostęp po fakcie:** Profil → "Instruktaż aplikacji" (wyróżniony przycisk z ikoną 🎓). Otwiera ten sam modal od nowa.

**Implementacja:** `components/OnboardingModal.tsx` — reużywalny komponent obsługujący oba przypadki (pierwsza wizyta i powrót z profilu).

---

## Pliki do stworzenia/zmiany

| Akcja | Plik |
|-------|------|
| NOWY | `lib/wiedza.ts` |
| NOWY | `app/wiedza/[categoryId].tsx` |
| NOWY | `app/wiedza/slowniczek.tsx` |
| NOWY | `app/wiedza/[categoryId]/[itemId].tsx` — czytelnia dla kategorii B |
| NOWY | `app/wiedza/slowniczek/[itemId].tsx` — czytelnia dla Słowniczka |
| NOWY | `components/OnboardingModal.tsx` |
| NOWY | `components/Toast.tsx` (wrapper konfiguracyjny) |
| ZMIANA | `app/(tabs)/wiedza.tsx` — zastąpić placeholder |
| ZMIANA | `app/_layout.tsx` — dodać `<Toast />` + logika onboardingu |
| ZMIANA | `app/(tabs)/profile.tsx` — dodać przycisk "Instruktaż" |
| ZMIANA | `package.json` — dodać `react-native-toast-message` |
| ZMIANA | `app/(admin)/[plik obecności].tsx` — bug fix |
| ZMIANA | Ekrany z empty states i help texts |
