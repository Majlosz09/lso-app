# Export Feature Design

**Data:** 2026-05-27
**Zakres:** Eksport raportu obecności i rankingu punktowego z panelu admina

---

## Cel

Umożliwić adminowi (księdzu/animatorowi) wygenerowanie i udostępnienie raportu za wybrany okres w formacie CSV lub PDF. Raport zawiera ranking punktowy i statystyki obecności ministrантów.

---

## Architektura

Trzy nowe jednostki z oddzielnymi odpowiedzialnościami:

| Plik | Odpowiedzialność |
|------|-----------------|
| `lib/export.ts` | Czysta logika: pobieranie danych, generowanie CSV/HTML, udostępnianie pliku |
| `components/ExportModal.tsx` | UI modalu z opcjami eksportu (format, okres) |
| `app/(admin)/statistics.tsx` | Minimalna zmiana: ikona eksportu w nagłówku |

---

## lib/export.ts

### Typy

```ts
export type MemberExportRow = {
  fullName: string
  scheduled: number   // liczba przypisanych służb
  present: number     // liczba potwierdzeń obecności
  attendanceRate: number  // present/scheduled * 100, zaokrąglone do 1 miejsca
  points: number      // suma punktów w okresie
}

export type ExportData = {
  parishName: string
  from: string        // YYYY-MM-DD
  to: string          // YYYY-MM-DD
  generatedAt: string // ISO timestamp
  members: MemberExportRow[]  // posortowane wg points malejąco
}
```

### Funkcje

**`buildExportData(supabase, parishId, parishName, from, to): Promise<ExportData>`**

Wykonuje trzy równoległe zapytania (`Promise.all`):

1. **Assignments** — `schedule_assignments` JOIN `schedules` JOIN `profiles`
   - Filtr: `parish_id`, `schedules.date BETWEEN from AND to`, `status IN ('assigned','present','absent','excused')`
   - Cel: liczba przypisanych służb per member

2. **Attendance** — `attendance` JOIN `schedules`
   - Filtr: `parish_id`, `schedules.date BETWEEN from AND to`
   - Cel: liczba faktycznych obecności per member (z tabeli attendance, niezależnie od statusu assignment)

3. **Points** — `points`
   - Filtr: `parish_id`, `created_at BETWEEN from AND to`
   - Cel: suma punktów per member

Zwraca `ExportData` z `members` posortowanymi wg `points` malejąco.

---

**`generateCSV(data: ExportData): string`**

Generuje string CSV z dwoma sekcjami oddzielonymi pustą linią:

```
Ranking punktowy — {parishName} — {from} do {to}

Lp.,Imię i nazwisko,Punkty
1,Jan Kowalski,120
...

Statystyki obecności

Imię i nazwisko,Liczba służb,Obecny,Frekwencja
Jan Kowalski,24,22,91.7%
...
```

Separator: `,`. Kodowanie: UTF-8 z BOM (`﻿`) dla poprawnego otwarcia w Excel.

---

**`generateHTML(data: ExportData): string`**

Generuje kompletny dokument HTML z:
- Nagłówkiem: nazwa parafii, okres, data wygenerowania
- Dwiema tabelami HTML (ranking i obecność)
- Inline CSS: czarno-biały, czytelny na wydruku (font-family: serif, border-collapse)

Wejście do `expo-print.printToFileAsync({ html })`.

---

**`shareFile(uri: string): Promise<void>`**

Wrapper na `Sharing.shareAsync(uri)` z expo-sharing.

---

## components/ExportModal.tsx

### Props

```ts
type ExportModalProps = {
  visible: boolean
  onClose: () => void
  parishId: string
  parishName: string
}
```

### Układ

```
┌─────────────────────────────┐
│  Eksportuj raport           │
├─────────────────────────────┤
│  Format                     │
│  ○ CSV / Excel   ● PDF      │
├─────────────────────────────┤
│  Okres                      │
│  [7 dni] [30 dni] [90 dni] [365 dni]  │
│  [ Niestandardowy ▾ ]       │
│  (jeśli wybrany: Od: __ Do: __)       │
├─────────────────────────────┤
│      [ Eksportuj ]          │
└─────────────────────────────┘
```

### Stan wewnętrzny

```ts
format: 'csv' | 'pdf'           // domyślnie 'pdf'
period: 7 | 30 | 90 | 365 | 'custom'  // domyślnie 30
customFrom: string              // YYYY-MM-DD, tylko dla 'custom'
customTo: string                // YYYY-MM-DD, tylko dla 'custom'
loading: boolean
```

### Przepływ akcji

1. User klika "Eksportuj"
2. `loading = true`, przycisk → `ActivityIndicator`
3. Wyliczone daty `from`/`to` (dla preset: today minus N dni; dla custom: wartości z pickerów)
4. `buildExportData(supabase, parishId, parishName, from, to)`
5. Jeśli CSV: `generateCSV(data)` → zapis do `FileSystem.cacheDirectory + 'raport.csv'` → `shareFile`
6. Jeśli PDF: `generateHTML(data)` → `Print.printToFileAsync({ html })` → `shareFile(uri)`
7. `loading = false`, `onClose()`
8. Błąd: `Alert.alert('Błąd', 'Nie udało się wygenerować raportu.')`

### Walidacja niestandardowego zakresu

- `customFrom` musi być ≤ `customTo`
- `customTo` musi być ≤ dzisiaj
- Błędy pokazywane inline pod pickerami (czerwony tekst)

### Brak danych

Jeśli `members` jest pustą tablicą — eksport jest wykonywany normalnie. Plik zawiera nagłówki tabel bez wierszy oraz notatkę "Brak danych w wybranym okresie."

---

## Zmiana w statistics.tsx

Minimalna: dodanie ikony download (`Ionicons name="download-outline"`) w prawym górnym rogu nagłówka ekranu Statystyki (headerRight). Kliknięcie → `setExportModalVisible(true)`.

Stan `exportModalVisible` i `<ExportModal>` renderowany na końcu komponentu.

---

## Testy

### `__tests__/lib/export.test.ts`

**`generateCSV`:**
- Sprawdza BOM na początku stringa
- Sprawdza nagłówki obu sekcji
- Sprawdza kolejność malejącą według punktów
- Sprawdza format procentów (np. `91.7%`)
- Sprawdza przypadek pustej tablicy members (brak wierszy, nagłówki obecne)

**`generateHTML`:**
- Sprawdza że zawiera nazwę parafii
- Sprawdza że zawiera obie tabele (`<table>`)
- Sprawdza że zawiera zakres dat

**`buildExportData`:**
- Mock Supabase zwracający 2 assignments, 1 attendance, 5 punktów dla jednego membera
- Sprawdza: `scheduled=2`, `present=1`, `attendanceRate=50`, `points=5`
- Sprawdza sortowanie malejące po punktach (kilku members)
- Sprawdza że `members` jest pustą tablicą gdy brak danych

Brak testów komponentowych dla `ExportModal` — logika jest w `lib/export.ts`.

---

## Zależności

| Pakiet | Użycie | Czy już zainstalowany? |
|--------|--------|------------------------|
| `expo-file-system` | Zapis CSV do cache | Tak (Expo SDK 54) |
| `expo-sharing` | Udostępnianie pliku przez share sheet | Tak (Expo SDK 54) |
| `expo-print` | Generowanie PDF z HTML | Tak (Expo SDK 54) |

Żadnych nowych zależności — wszystkie pakiety są częścią Expo SDK 54.

---

## Zakres implementacji

1. `lib/export.ts` — typy, `buildExportData`, `generateCSV`, `generateHTML`, `shareFile`
2. `__tests__/lib/export.test.ts` — testy jednostkowe (TDD)
3. `components/ExportModal.tsx` — modal z UI i integracją z lib/export.ts
4. `app/(admin)/statistics.tsx` — dodanie headerRight z ikoną i renderowanie modalu
