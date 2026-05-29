# Attendance Sheet (Zbiórka) Design

## Goal

Umożliwić adminowi szybkie zaznaczenie listy obecności dla zbiórki z poziomu ekranu szczegółów wydarzenia. Naprawić brakujące przyznawanie punktów gdy admin oznacza obecność.

## Architecture

Jedna zmiana — `app/(admin)/schedule-detail.tsx`. Nowy przycisk widoczny tylko dla `category === 'zbiorka'` otwiera Modal (bottom sheet) z lokalnym stanem draft. Zmiany aplikowane dopiero po kliknięciu "Zapisz". Bug fix: istniejący `handleToggleAttendance` zastępuje ręczny INSERT wywołaniem RPC `check_in_and_award_points`.

## Tech Stack

React Native (Modal, FlatList), Expo Router, Supabase RPC, TypeScript, useTheme, useSafeAreaInsets.

---

## Zmiany w schedule-detail.tsx

### Przycisk "Zaznacz obecność"

Widoczny tylko gdy `schedule?.category === 'zbiorka'`. Umieszczony w obszarze akcji ekranu (np. obok istniejących przycisków). Kliknięcie ustawia `setAttendanceSheetVisible(true)`.

### Stan bottom sheet'a

```ts
const [attendanceSheetVisible, setAttendanceSheetVisible] = useState(false)
const [draftIds, setDraftIds] = useState<Set<string>>(new Set())
const [saving, setSaving] = useState(false)
```

`draftIds` jest inicjalizowany kopią `attendanceIds` przy otwarciu sheeta.

### Widok bottom sheet'a

Modal `animationType="slide"` wyrównany do dołu ekranu.

Zawartość:
- Handle bar
- Nagłówek: nazwa zbiórki + "Zaznacz kto jest obecny"
- FlatList z uczestnikami (z `schedule.assignments`):
  - Wiersz: awatar z inicjałami + `full_name` + toggle (checkmark-circle / ellipse-outline)
  - Kliknięcie wiersza lub toggle'a przełącza `draftIds`
- Stopka: licznik "X z N obecnych" + przycisk "Zapisz"

### Logika zapisu (handleSaveAttendance)

```ts
// Nowo zaznaczeni (w draft, nie byli w attendanceIds)
for (const profileId of draftIds) {
  if (!attendanceIds.has(profileId)) {
    await supabase.rpc('check_in_and_award_points', {
      p_schedule_id: id,
      p_profile_id: profileId,
      p_parish_id: parishId,
    })
  }
}

// Odznaczeni (byli w attendanceIds, nie ma w draft)
for (const profileId of attendanceIds) {
  if (!draftIds.has(profileId)) {
    await supabase.from('attendance').delete()
      .eq('schedule_id', id).eq('profile_id', profileId)
    const assignment = schedule.assignments.find(a => a.profile_id === profileId)
    if (assignment) await handleChangeStatus(assignment.id, 'absent')
  }
}

setAttendanceIds(new Set(draftIds))
setAttendanceSheetVisible(false)
```

Optimistic update `attendanceIds` po zapisie. `Alert.alert` przy błędzie, spinner na przycisku Zapisz.

### Bug fix: handleToggleAttendance

Zastąpić ręczny `supabase.from('attendance').insert(...)` wywołaniem RPC:

```ts
// BYŁO:
await supabase.from('attendance').insert({ schedule_id, profile_id, method: 'manual', ... })
// JEST:
await supabase.rpc('check_in_and_award_points', {
  p_schedule_id: id,
  p_profile_id: profileId,
  p_parish_id: adminProfile?.parish_id,
})
```

Logika toggle OFF (odznaczanie) pozostaje bez zmian — DELETE z attendance + status 'absent'.

---

## Zmiany w plikach

| Plik | Zmiana |
|------|--------|
| `app/(admin)/schedule-detail.tsx` | Przycisk + Modal attendance sheet + bug fix handleToggleAttendance |

---

## Error Handling

- Błąd RPC przy zapisie → `Alert.alert('Błąd', error.message)`, rollback przez `fetchSchedule()`
- Pusta lista uczestników → komunikat "Brak przypisanych ministrantów"

## Testing

- Przycisk widoczny tylko dla `category === 'zbiorka'`
- Sheet inicjalizuje się ze stanem aktualnej obecności
- Zapisz: wywołuje RPC dla nowo zaznaczonych, DELETE+absent dla odznaczonych
- Licznik aktualizuje się na bieżąco
- `handleToggleAttendance` (poza sheetem) wywołuje RPC zamiast ręcznego INSERT
