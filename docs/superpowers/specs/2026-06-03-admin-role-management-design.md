# Admin Role Management — Design Spec
**Date:** 2026-06-03

## Overview

Admin zarządzający parafią może nadawać i odbierać uprawnienia administratora innym kontom w tej samej parafii, bezpośrednio z zakładki Członkowie.

## Scope

- Zmiana schematu DB: nowa kolumna `role_before_admin` w tabeli `profiles` (zarządzana w Supabase Dashboard)
- Zmiany w kodzie: wyłącznie `app/(admin)/(admin-tabs)/members.tsx`

## Architektura

### Nowy chip filtra

Dodanie trzeciego chipa `admin` do istniejącego `chipRow`. Typ `Filter` rozszerzony o `'admin'`.

Gdy filtr `'admin'` jest aktywny:
- Query do Supabase pobiera profile z `role = 'admin'` w tej samej `parish_id`
- Lista renderuje wiersze adminów z ikoną usunięcia uprawnień po prawej stronie
- Na dole (poniżej FlatList) stały przycisk **"+ Przydziel prawa admina"**

### Przycisk usunięcia uprawnień (każdy wiersz admina)

- Ikona `person-remove-outline` po prawej stronie wiersza (zamiast `chevron-forward`)
- `onPress` → sprawdzenie liczby adminów w parafii przez Supabase
  - Jeśli admins.length <= 1 → `Alert.alert('Błąd', 'Nie można usunąć jedynego administratora parafii.')`
  - W przeciwnym razie → `Alert.alert` z potwierdzeniem → `UPDATE profiles SET role = role_before_admin ?? 'member', role_before_admin = NULL WHERE id = item.id`
  - Po sukcesie: odświeżenie listy + `Toast.show` z potwierdzeniem

### Bottom sheet "Przydziel prawa admina"

State: `assignModalVisible: boolean`, `candidateSearch: string`, `candidates: Member[]`, `assigningId: string | null`.

Otwierany przyciskiem na dole widoku admina. Przy otwarciu jednorazowy fetch wszystkich profili z `role IN ('member', 'parent')` tej parafii → zapisane w `candidates`.

Zawartość modala:
1. Nagłówek z tytułem i X do zamknięcia
2. `TextInput` do wyszukiwania po imieniu (filtruje lokalnie `candidates`)
3. `FlatList` z wynikami — tapnięcie wiersza → `Alert.alert` z potwierdzeniem → `UPDATE profiles SET role_before_admin = role, role = 'admin' WHERE id = candidate.id` → zamknięcie modala + odświeżenie listy adminów + Toast

## Zabezpieczenia

| Scenariusz | Zachowanie |
|---|---|
| Próba usunięcia jedynego admina | Alert z błędem, brak zmiany w DB |
| Przydzielenie komuś kto jest już adminem | Niemożliwe — kandydaci to tylko `member`/`parent` |
| Brak kandydatów (wszyscy są adminami lub brak innych kont) | Empty state w modalu |

## Dane

### Zmiana schematu (Supabase Dashboard)

Dodanie kolumny do tabeli `profiles`:
```sql
ALTER TABLE profiles ADD COLUMN role_before_admin text DEFAULT NULL;
```
Kolumna nullable, bez constraintów — przechowuje poprzednią rolę (`member` lub `parent`) wyłącznie gdy konto ma `role = 'admin'`.

### Supabase operations

- `SELECT id, full_name, role, phone, rocznik FROM profiles WHERE parish_id = X AND role = 'admin'` — lista adminów
- `SELECT COUNT(*) FROM profiles WHERE parish_id = X AND role = 'admin'` — przed usunięciem uprawnień
- `UPDATE profiles SET role = COALESCE(role_before_admin, 'member'), role_before_admin = NULL WHERE id = Y` — usunięcie uprawnień (przywrócenie poprzedniej roli)
- `SELECT id, full_name, role FROM profiles WHERE parish_id = X AND role IN ('member','parent') ORDER BY full_name` — kandydaci do nadania uprawnień
- `UPDATE profiles SET role_before_admin = role, role = 'admin' WHERE id = Y` — nadanie uprawnień (zapisanie poprzedniej roli)

## Co się nie zmienia

- `member-detail.tsx` — bez zmian; rola wyświetlana read-only
- Chipa "Ministranci" i "Rodzice" — bez zmian w query
- Brak nowych plików, brak nowych tras nawigacyjnych
