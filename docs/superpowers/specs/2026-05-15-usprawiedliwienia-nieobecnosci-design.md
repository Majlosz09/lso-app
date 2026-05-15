# Usprawiedliwienia nieobecności — Design Spec

**Data:** 2026-05-15  
**Status:** Approved

---

## Cel

Zamknięcie przepływu zgłoszeń nieobecności: ministrant zgłasza nieobecność przez aplikację, admin widzi wszystkie oczekujące zgłoszenia w jednym miejscu, zatwierdza lub odrzuca każde z nich (lub wszystkie naraz), a ministrant widzi wynik decyzji na swojej karcie służby.

---

## Przepływ statusów

```
assigned
   └─► excused          (ministrant zgłasza nieobecność — już zaimplementowane)
           ├─► confirmed    (admin zatwierdza — "Nieobecność usprawiedliwiona")
           └─► absent       (admin odrzuca — "Usprawiedliwienie nie zostało zatwierdzone")
```

Statusy i etykiety już istnieją w `lib/status.ts` — bez zmian.

---

## Zmiany w bazie danych

### 1. Nowa kolumna `admin_note`

```sql
ALTER TABLE schedule_assignments
  ADD COLUMN admin_note text;
```

Przechowuje wiadomość zwrotną od admina widoczną dla ministranta.  
Przy zatwierdzeniu: `null`. Przy odrzuceniu: stała wiadomość (patrz niżej).

### 2. Polityka RLS — UPDATE własnego assignment przez membera

```sql
CREATE POLICY "member_update_own_assignment"
ON schedule_assignments FOR UPDATE
TO authenticated
USING (profile_id = auth.uid())
WITH CHECK (profile_id = auth.uid());
```

Potrzebna do działania istniejącego `reportAbsence()` w `schedule.tsx`.

---

## Architektura — nowe i zmienione pliki

### Nowy ekran: `app/(admin)/absence-requests.tsx`

Ekran dostępny przez nawigację z panelu admina. Wyświetla wszystkie przypisania ze statusem `excused` należące do parafii admina, posortowane rosnąco po dacie służby.

**Dane:** zapytanie do `schedule_assignments` z joinem na `schedules` i `profiles`:
```
schedule_assignments
  .select('id, absence_reason, profile:profiles(full_name), schedule:schedules(title, date, time)')
  .eq('status', 'excused')
  .eq('parish_id', adminProfile.parish_id)
  .order('schedules.date', ascending: true)
```

**Akcje:**

| Akcja | Zmiana statusu | admin_note |
|---|---|---|
| Zatwierdź | `confirmed` | `null` |
| Odrzuć | `absent` | `"Usprawiedliwienie nie zostało zatwierdzone. Skontaktuj się z księdzem, aby wyjaśnić sytuację."` |
| Zatwierdź wszystkie | `confirmed` dla wszystkich widocznych | `null` |

Przycisk "Zatwierdź wszystkie" pojawia się tylko gdy liczba oczekujących ≥ 2.  
Po wykonaniu akcji na ostatnim elemencie ekran pokazuje pusty stan ("Brak oczekujących zgłoszeń").

### Zmodyfikowany: `app/(admin)/(admin-tabs)/index.tsx`

Dodanie badge'a w sekcji panelu — widoczny tylko gdy `count > 0`:

- Kolor tła: `#fff3e0`, obramowanie: `#e67e22`
- Kółko z liczbą po lewej (pomarańczowe)
- Tekst: **"Usprawiedliwienia nieobecności"** + podtytuł "N oczekują na decyzję"
- Tapnięcie → `router.push('/(admin)/absence-requests')`
- Count pobierany przy `useEffect` i odświeżany przy `useFocusEffect`

### Zmodyfikowany: `app/(tabs)/schedule.tsx` — komponent `MyScheduleCard`

Dodanie sekcji informacji zwrotnej na karcie służby ministranta, gdy `myStatus === 'absent'` i istnieje `myAbsenceReason` (czyli ministrant wcześniej zgłaszał nieobecność):

```
[karta służby]
  ...
  ┌─ czerwona ramka ─────────────────────────────┐
  │ ⚠ Usprawiedliwienie nie zostało zatwierdzone │
  │ Twoja prośba o usprawiedliwienie nie została │
  │ zaakceptowana. Skontaktuj się z księdzem,    │
  │ aby wyjaśnić sytuację.                       │
  └──────────────────────────────────────────────┘
```

Warunek wyświetlenia: `schedule.myStatus === 'absent' && schedule.myAdminNote`  
Treść pobierana z `myAdminNote` — fakt istnienia tej wartości potwierdza że admin świadomie odrzucił zgłoszenie (a nie że status `absent` pochodzi z innego źródła).

Przy statusie `confirmed` — istniejący badge "Nieobecność usprawiedliwiona" (niebieski) pozostaje bez zmian — tylko upewniamy się że tekst brzmi "Nieobecność usprawiedliwiona".

---

## Dane do pobrania w `fetchMine()` (schedule.tsx)

Dodać `admin_note` do selecta:

```ts
.select('id, role, status, schedule_id, absence_reason, admin_note')
```

I przekazać do stanu jako `myAdminNote`.

---

## Obsługa błędów

- Jeśli UPDATE nie zwróci żadnego wiersza (RLS) → `Alert.alert('Błąd uprawnień', ...)`
- Bulk approve: wykonywane jako `Promise.all()` — przy błędzie całość jest przerywana i wyświetlany alert

---

## Czego ta specyfikacja NIE obejmuje

- Push notyfikacje przy decyzji admina (osobny feature #4 na roadmapie)
- Historia zatwierdzonych/odrzuconych w ekranie admina (możliwe rozszerzenie w przyszłości)
