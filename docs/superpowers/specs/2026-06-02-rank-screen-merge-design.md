# Design: Scalenie ekranu rang i przypisywania rang

**Data:** 2026-06-02  
**Status:** Zatwierdzony

## Problem

Zarządzanie rangami jest podzielone na dwa osobne miejsca:
- Przycisk `ribbon-outline` w headerze zakładki „Ministranci" → `rank-management.tsx` (CRUD rang)
- Kafelek „Przydziel rangi" na dashboardzie → `rank-assignment.tsx` (przypisywanie rang ministrantom)

Admin musi wiedzieć o dwóch miejscach. Cel: jedno miejsce dla wszystkiego co dotyczy rang.

## Rozwiązanie

Połączyć funkcje `rank-management.tsx` w ekran `rank-assignment.tsx` jako **zwijalna sekcja na górze**, domyślnie zwinięta.

## Układ ekranu

```
┌──────────────────────────────────────┐
│  ← Przydziel rangi                   │  header (bez zmian)
├──────────────────────────────────────┤
│  🎗  RANGI MINISTRANCKIE   [5]  ▾   │  ← kliknij aby rozwinąć
├──────────────────────────────────────┤
│  MINISTRANCI                         │  sekcja zawsze widoczna
│   Marek Wiśniewski  [Brak rangi ▾]  │  (bez rangi na górze)
│   Adam Kowalski     [Ministrant ▾]  │
│   Piotr Nowak       [Lektor St. ▾]  │
└──────────────────────────────────────┘
```

Stan rozwinięty sekcji rang:

```
│  🎗  RANGI MINISTRANCKIE   [5]  ▲   │
│    🎗  Kandydat       [systemowa]    │
│    🎗  Ministrant     [systemowa]    │
│    🎗  Lektor Młodszy [systemowa]    │
│    🎗  Lektor Starszy [systemowa]    │
│    🎗  Ceremoniarz    [systemowa]    │
│    🎗  Moja ranga   [✏️]  [🗑️]      │  tylko niesystemowe
│    ┌────────────────────┐  [+]       │
│    │ Nazwa nowej rangi… │            │
│    └────────────────────┘            │
```

## Komponenty i stan

Plik `app/(admin)/rank-assignment.tsx` rozszerzony o:

```typescript
// Nowy stan dla sekcji rang
const [ranksExpanded, setRanksExpanded] = useState(false)
const [newRankName, setNewRankName] = useState('')
const [addingRank, setAddingRank] = useState(false)
const [editingRankId, setEditingRankId] = useState<string | null>(null)
const [editingRankName, setEditingRankName] = useState('')
const [renamingRank, setRenamingRank] = useState(false)
const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
```

## Funkcje CRUD rang (przeniesione z rank-management.tsx)

- `handleAddRank()` — insert do tabeli `ranks` z `parish_id` admina
- `handleStartEditRank(rank)` — ustawia stan edycji inline
- `handleRenameRank()` — update nazwy w `ranks`
- `handleCancelEditRank()` — resetuje stan edycji
- `handleDeleteRank(rankId)` — delete z `ranks` (tylko niesystemowe)

## Obsługa usuwania (web-safe)

`Alert.alert` jest no-op na web. Zamiast dialogu systemowego: kliknięcie ikony kosza ustawia `confirmDeleteId = rank.id`, co zamienia wiersz w tryb potwierdzenia inline:

```
│  🎗  Moja ranga   [Usuń?]  [✓ Tak]  [✗ Nie]  │
```

Kliknięcie „Tak" → wywołuje delete, resetuje `confirmDeleteId`.  
Kliknięcie „Nie" → resetuje `confirmDeleteId`.

## Zmiany nawigacji

**`app/(admin)/(admin-tabs)/_layout.tsx`:**
- Usunąć `TouchableOpacity` z ikoną `ribbon-outline` z `headerRight` zakładki „Ministranci"
- Zostawić tylko przycisk awatara w `headerRight`

**`app/(admin)/rank-management.tsx`:**
- Plik pozostaje bez zmian (zarejestrowana trasa Expo Router)
- Brak linku do niego — staje się martwą trasą
- Nie usuwamy, by nie powodować błędów w Stack.Screen w `_layout.tsx`

## Fetch rang

Aktualne `fetchData()` w `rank-assignment.tsx` pobiera już rangi:
```typescript
supabase.from('ranks').select('id, name, order')
  .or(`parish_id.is.null,parish_id.eq.${parishId}`)
  .order('order')
```

Rozszerzyć query o pole `is_system` i `parish_id` (potrzebne do renderowania badge i logiki edycji/usuwania):
```typescript
supabase.from('ranks').select('id, name, order, is_system, parish_id')
```

Typ `RankOption` rozszerzyć: `{ id: string; name: string; order: number; is_system: boolean; parish_id: string | null }`

## Komunikaty błędów

Wszystkie błędy CRUD rang przez `Toast.show({ type: 'error', text1: 'Błąd', text2: error.message })` — żadnych `Alert.alert` (no-op na web).

## Co NIE wchodzi w zakres

- Reordering rang (drag & drop) — poza zakresem
- Usuwanie ekranu `rank-management` z `_layout.tsx` — zostawiamy dla bezpieczeństwa
