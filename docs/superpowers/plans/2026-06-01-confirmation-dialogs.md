# Confirmation Dialogs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `Alert.alert` confirmation dialogs to 9 user-triggered actions that currently execute immediately without asking the user to confirm.

**Architecture:** Inline `Alert.alert` wrapping in each handler — the Supabase mutation moves into the `onPress` callback of the confirm button. No new files or abstractions. Consistent with existing codebase patterns (e.g. `badge-management.tsx:111`, `schedules.tsx:44`).

**Tech Stack:** React Native `Alert` API (already imported in all target files), Expo Router, Supabase JS client.

---

## Files Modified

| File | Changes |
|------|---------|
| `app/(admin)/member-detail.tsx` | `handleChangeRank` (line 190), `handleAwardBadge` (line 243) |
| `app/(admin)/rank-assignment.tsx` | `handleSetRank` (line 67) |
| `app/(admin)/absence-requests.tsx` | `handleApprove` (line 52), `handleReject` (line 66), call sites (lines 146–147) |
| `app/(admin)/schedule-detail.tsx` | `handleAdd` (line 190) |
| `app/(tabs)/schedule.tsx` | `doSignUp` (line 597), `unsignOne` (line 617), `reportAbsence` (line 660) |

---

## Task 1 — member-detail.tsx: handleChangeRank

**Files:**
- Modify: `app/(admin)/member-detail.tsx:190-201`

> Note: `handleAwardBadge` is in Task 2. Do Task 1 and 2 in the same file edit session so you only open the file once.

- [ ] **Step 1: Replace handleChangeRank (lines 190–201)**

Replace:
```ts
const handleChangeRank = async (rankId: string | null) => {
  const { error } = await supabase
    .from('profiles')
    .update({ rank_id: rankId })
    .eq('id', id)
  if (error) {
    Alert.alert('Błąd', error.message)
  } else {
    setProfile(prev => prev ? { ...prev, rank_id: rankId } : prev)
  }
  setRankModalVisible(false)
}
```

With:
```ts
const handleChangeRank = (rankId: string | null) => {
  const rankName = rankId ? (ranksList.find(r => r.id === rankId)?.name ?? 'nieznaną rangę') : null
  const rankDisplay = rankName ? `rangę „${rankName}"` : 'brak rangi'
  Alert.alert(
    'Zmień rangę',
    `Przypisać ${rankDisplay} ministrancowi ${profile.full_name}?`,
    [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Przypisz',
        onPress: async () => {
          const { error } = await supabase
            .from('profiles')
            .update({ rank_id: rankId })
            .eq('id', id)
          if (error) {
            Alert.alert('Błąd', error.message)
          } else {
            setProfile(prev => prev ? { ...prev, rank_id: rankId } : prev)
          }
          setRankModalVisible(false)
        },
      },
    ]
  )
}
```

- [ ] **Step 2: Verify manually**

Run the app (`npx expo start`), navigate to any member detail screen as admin, tap the rank change button, pick a rank. Expected: Alert "Zmień rangę" appears before the rank is updated. Tapping "Anuluj" keeps the modal open; "Przypisz" closes modal and saves.

---

## Task 2 — member-detail.tsx: handleAwardBadge

**Files:**
- Modify: `app/(admin)/member-detail.tsx:243-264`

- [ ] **Step 1: Replace handleAwardBadge (lines 243–264)**

Replace:
```ts
const handleAwardBadge = async () => {
  if (!selectedBadgeDef) return
  setAwarding(true)
  const { error } = await supabase.from('member_badges').insert({
    profile_id: id,
    badge_definition_id: selectedBadgeDef.id,
    awarded_by: adminProfile!.id,
    note: awardNote.trim() || null,
    is_active: true,
  })
  setAwarding(false)
  if (error) {
    Alert.alert('Błąd', error.message === 'duplicate key value violates unique constraint "member_badges_profile_id_badge_definition_id_key"'
      ? 'Ta odznaka została już wcześniej przyznana.'
      : error.message)
    return
  }
  setAwardSheetVisible(false)
  setAwardNote('')
  setSelectedBadgeDef(null)
  loadBadges()
}
```

With:
```ts
const handleAwardBadge = () => {
  if (!selectedBadgeDef) return
  Alert.alert(
    'Przyznaj odznakę',
    `Przyznać odznakę „${selectedBadgeDef.name}" ministrancowi ${profile.full_name}?`,
    [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Przyznaj',
        onPress: async () => {
          setAwarding(true)
          const { error } = await supabase.from('member_badges').insert({
            profile_id: id,
            badge_definition_id: selectedBadgeDef.id,
            awarded_by: adminProfile!.id,
            note: awardNote.trim() || null,
            is_active: true,
          })
          setAwarding(false)
          if (error) {
            Alert.alert('Błąd', error.message === 'duplicate key value violates unique constraint "member_badges_profile_id_badge_definition_id_key"'
              ? 'Ta odznaka została już wcześniej przyznana.'
              : error.message)
            return
          }
          setAwardSheetVisible(false)
          setAwardNote('')
          setSelectedBadgeDef(null)
          loadBadges()
        },
      },
    ]
  )
}
```

- [ ] **Step 2: Verify manually**

Navigate to a member detail, tap "Przyznaj odznakę", select a badge, tap "Przyznaj". Expected: Alert "Przyznaj odznakę" appears over the badge modal. "Anuluj" dismisses the alert (modal stays open). "Przyznaj" awards the badge and closes the modal.

- [ ] **Step 3: Commit**

```bash
git add app/(admin)/member-detail.tsx
git commit -m "feat: add confirmation dialogs to rank change and badge award in member-detail"
```

---

## Task 3 — rank-assignment.tsx: handleSetRank

**Files:**
- Modify: `app/(admin)/rank-assignment.tsx:67-83`

- [ ] **Step 1: Replace handleSetRank (lines 67–83)**

Replace:
```ts
const handleSetRank = async (memberId: string, rankId: string | null) => {
  const rankName = rankId ? ranks.find(r => r.id === rankId)?.name ?? null : null
  setMembers(prev =>
    prev.map(m => m.id === memberId ? { ...m, rank_id: rankId, rank_name: rankName } : m)
  )
  setPickerTarget(null)

  const { error } = await supabase
    .from('profiles')
    .update({ rank_id: rankId })
    .eq('id', memberId)

  if (error) {
    Alert.alert('Błąd', error.message)
    fetchData()
  }
}
```

With:
```ts
const handleSetRank = (memberId: string, rankId: string | null) => {
  const rankName = rankId ? ranks.find(r => r.id === rankId)?.name ?? null : null
  const memberName = members.find(m => m.id === memberId)?.full_name ?? 'ministranta'
  const rankDisplay = rankName ? `rangę „${rankName}"` : 'brak rangi'
  Alert.alert(
    'Zmień rangę',
    `Przypisać ${rankDisplay} ministrancowi ${memberName}?`,
    [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Przypisz',
        onPress: async () => {
          setMembers(prev =>
            prev.map(m => m.id === memberId ? { ...m, rank_id: rankId, rank_name: rankName } : m)
          )
          setPickerTarget(null)
          const { error } = await supabase
            .from('profiles')
            .update({ rank_id: rankId })
            .eq('id', memberId)
          if (error) {
            Alert.alert('Błąd', error.message)
            fetchData()
          }
        },
      },
    ]
  )
}
```

- [ ] **Step 2: Verify manually**

Navigate to rank assignment screen, tap a member, pick a rank. Expected: Alert "Zmień rangę" appears over the picker sheet. "Anuluj" closes the alert (sheet stays open). "Przypisz" saves and closes the sheet.

- [ ] **Step 3: Commit**

```bash
git add "app/(admin)/rank-assignment.tsx"
git commit -m "feat: add confirmation dialog to rank assignment"
```

---

## Task 4 — absence-requests.tsx: handleApprove and handleReject

**Files:**
- Modify: `app/(admin)/absence-requests.tsx:52-78` (handlers)
- Modify: `app/(admin)/absence-requests.tsx:146-147` (call sites in RequestCard usage)

The handlers currently accept `id: string`; they need to be changed to accept the full `AbsenceRequest` object so the alert can show the member name and date.

- [ ] **Step 1: Replace handleApprove (lines 52–64)**

Replace:
```ts
const handleApprove = async (id: string) => {
  setProcessingId(id)
  try {
    const { error } = await supabase
      .from('schedule_assignments')
      .update({ status: 'confirmed', admin_note: null })
      .eq('id', id)
    if (error) { Alert.alert('Błąd', error.message); return }
    setRequests(prev => prev.filter(r => r.id !== id))
  } finally {
    setProcessingId(null)
  }
}
```

With:
```ts
const handleApprove = (request: AbsenceRequest) => {
  const dateStr = new Date(request.schedule.date + 'T12:00:00').toLocaleDateString('pl-PL', {
    weekday: 'short', day: 'numeric', month: 'long',
  })
  Alert.alert(
    'Zatwierdź nieobecność',
    `Zatwierdzić nieobecność ${request.profile.full_name} na służbie ${dateStr}?`,
    [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Zatwierdź',
        onPress: async () => {
          setProcessingId(request.id)
          try {
            const { error } = await supabase
              .from('schedule_assignments')
              .update({ status: 'confirmed', admin_note: null })
              .eq('id', request.id)
            if (error) { Alert.alert('Błąd', error.message); return }
            setRequests(prev => prev.filter(r => r.id !== request.id))
          } finally {
            setProcessingId(null)
          }
        },
      },
    ]
  )
}
```

- [ ] **Step 2: Replace handleReject (lines 66–78)**

Replace:
```ts
const handleReject = async (id: string) => {
  setProcessingId(id)
  try {
    const { error } = await supabase
      .from('schedule_assignments')
      .update({ status: 'absent', admin_note: REJECTION_NOTE })
      .eq('id', id)
    if (error) { Alert.alert('Błąd', error.message); return }
    setRequests(prev => prev.filter(r => r.id !== id))
  } finally {
    setProcessingId(null)
  }
}
```

With:
```ts
const handleReject = (request: AbsenceRequest) => {
  Alert.alert(
    'Odrzuć nieobecność',
    `Odrzucić zgłoszenie nieobecności ${request.profile.full_name}?`,
    [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Odrzuć',
        style: 'destructive',
        onPress: async () => {
          setProcessingId(request.id)
          try {
            const { error } = await supabase
              .from('schedule_assignments')
              .update({ status: 'absent', admin_note: REJECTION_NOTE })
              .eq('id', request.id)
            if (error) { Alert.alert('Błąd', error.message); return }
            setRequests(prev => prev.filter(r => r.id !== request.id))
          } finally {
            setProcessingId(null)
          }
        },
      },
    ]
  )
}
```

- [ ] **Step 3: Update call sites (lines ~146–147)**

Find the two lines in the `FlatList` `renderItem` that call the handlers and change them from passing `item.id` to passing `item`:

Replace:
```tsx
onApprove={() => handleApprove(item.id)}
onReject={() => handleReject(item.id)}
```

With:
```tsx
onApprove={() => handleApprove(item)}
onReject={() => handleReject(item)}
```

- [ ] **Step 4: Verify manually**

Navigate to Admin → Absence Requests. Tap "Zatwierdź" on a card. Expected: Alert "Zatwierdź nieobecność" appears with the member name and date. "Anuluj" does nothing. "Zatwierdź" approves and removes the card. Repeat for "Odrzuć" — confirm the button shows as destructive (red on iOS).

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/absence-requests.tsx"
git commit -m "feat: add confirmation dialogs to single absence approve/reject"
```

---

## Task 5 — schedule-detail.tsx: handleAdd

**Files:**
- Modify: `app/(admin)/schedule-detail.tsx:190-204`

- [ ] **Step 1: Replace handleAdd (lines 190–204)**

Replace:
```ts
const handleAdd = async (member: MemberOption) => {
  if (!schedule) return
  setAdding(true)
  const { error } = await supabase.from('schedule_assignments').insert({
    schedule_id: schedule.id, profile_id: member.id, role: 'ministrant', status: 'assigned',
  })
  setAdding(false)
  if (error) {
    Toast.show({ type: 'error', text1: 'Błąd', text2: error.message })
  } else {
    setAddModalVisible(false)
    fetchSchedule()
    Toast.show({ type: 'success', text1: `Dodano ${member.full_name}` })
  }
}
```

With:
```ts
const handleAdd = (member: MemberOption) => {
  if (!schedule) return
  Alert.alert(
    'Dodaj do służby',
    `Dodać ${member.full_name} do tej służby?`,
    [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Dodaj',
        onPress: async () => {
          setAdding(true)
          const { error } = await supabase.from('schedule_assignments').insert({
            schedule_id: schedule.id, profile_id: member.id, role: 'ministrant', status: 'assigned',
          })
          setAdding(false)
          if (error) {
            Toast.show({ type: 'error', text1: 'Błąd', text2: error.message })
          } else {
            setAddModalVisible(false)
            fetchSchedule()
            Toast.show({ type: 'success', text1: `Dodano ${member.full_name}` })
          }
        },
      },
    ]
  )
}
```

- [ ] **Step 2: Check that Alert is imported**

Look at the top of `app/(admin)/schedule-detail.tsx`. If `Alert` is not in the `react-native` import, add it:

```ts
import { View, Text, ..., Alert } from 'react-native'
```

- [ ] **Step 3: Verify manually**

Open a schedule detail, tap the "+" button, pick a member. Expected: Alert "Dodaj do służby" appears with the member's name. "Anuluj" does nothing; "Dodaj" adds them.

- [ ] **Step 4: Commit**

```bash
git add "app/(admin)/schedule-detail.tsx"
git commit -m "feat: add confirmation dialog to adding member to schedule"
```

---

## Task 6 — schedule.tsx: doSignUp, unsignOne, reportAbsence

**Files:**
- Modify: `app/(tabs)/schedule.tsx:597-615` (doSignUp)
- Modify: `app/(tabs)/schedule.tsx:617-623` (unsignOne)
- Modify: `app/(tabs)/schedule.tsx:660-670` (reportAbsence)

- [ ] **Step 1: Replace doSignUp (lines 597–615)**

Replace:
```ts
const doSignUp = async (scheduleId: string, date: string, timeSlot: string, mode: 'once' | 'recurring') => {
  const key = `${date}_${timeSlot}`
  setSigningUpId(key)
  const { data, error } = await supabase.rpc('sign_up_for_slot', {
    p_date: date,
    p_time_label: timeSlot,
    p_mode: mode,
  })
  setSigningUpId(null)
  if (error) { Alert.alert('Błąd', error.message); return }
  if (mode === 'recurring') {
    const dow = new Date(date + 'T12:00:00').getDay()
    const DAY_FULL_LOCAL = ['Niedzielę', 'Poniedziałek', 'Wtorek', 'Środę', 'Czwartek', 'Piątek', 'Sobotę']
    Alert.alert('Cykl aktywny',
      `Zapisano cyklicznie na każd${dow === 0 || dow === 3 || dow === 6 ? 'ą' : 'y'} ${DAY_FULL_LOCAL[dow]} o ${timeSlot}. Objęto ${(data as any)?.count ?? 1} służb.`
    )
  }
  fetchWeekSchedules(weekDays)
}
```

With:
```ts
const doSignUp = (scheduleId: string, date: string, timeSlot: string, mode: 'once' | 'recurring') => {
  const dateStr = new Date(date + 'T12:00:00').toLocaleDateString('pl-PL', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
  Alert.alert(
    'Zapisz na służbę',
    `Zapisać się na służbę ${dateStr} o ${timeSlot}?`,
    [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Zapisz',
        onPress: async () => {
          const key = `${date}_${timeSlot}`
          setSigningUpId(key)
          const { data, error } = await supabase.rpc('sign_up_for_slot', {
            p_date: date,
            p_time_label: timeSlot,
            p_mode: mode,
          })
          setSigningUpId(null)
          if (error) { Alert.alert('Błąd', error.message); return }
          if (mode === 'recurring') {
            const dow = new Date(date + 'T12:00:00').getDay()
            const DAY_FULL_LOCAL = ['Niedzielę', 'Poniedziałek', 'Wtorek', 'Środę', 'Czwartek', 'Piątek', 'Sobotę']
            Alert.alert('Cykl aktywny',
              `Zapisano cyklicznie na każd${dow === 0 || dow === 3 || dow === 6 ? 'ą' : 'y'} ${DAY_FULL_LOCAL[dow]} o ${timeSlot}. Objęto ${(data as any)?.count ?? 1} służb.`
            )
          }
          fetchWeekSchedules(weekDays)
        },
      },
    ]
  )
}
```

- [ ] **Step 2: Replace unsignOne (lines 617–623)**

Replace:
```ts
const unsignOne = async (assignmentId: string) => {
  setUnsigningId(assignmentId)
  const { error } = await supabase.from('schedule_assignments').delete().eq('id', assignmentId)
  setUnsigningId(null)
  if (error) { Alert.alert('Błąd', error.message); return }
  fetchWeekSchedules(weekDays)
}
```

With:
```ts
const unsignOne = (assignmentId: string) => {
  Alert.alert(
    'Wypisz ze służby',
    'Wypisać się z tej służby?',
    [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Wypisz',
        onPress: async () => {
          setUnsigningId(assignmentId)
          const { error } = await supabase.from('schedule_assignments').delete().eq('id', assignmentId)
          setUnsigningId(null)
          if (error) { Alert.alert('Błąd', error.message); return }
          fetchWeekSchedules(weekDays)
        },
      },
    ]
  )
}
```

- [ ] **Step 3: Replace reportAbsence (lines 660–670)**

Replace:
```ts
const reportAbsence = async (assignmentId: string, reason: string) => {
  setReportingAbsenceId(assignmentId)
  const { error } = await supabase
    .from('schedule_assignments')
    .update({ status: 'excused', absence_reason: reason })
    .eq('id', assignmentId)
  setReportingAbsenceId(null)
  if (error) { Alert.alert('Błąd', error.message); return }
  setAbsenceModal({ visible: false, assignmentId: '', title: '', reason: '' })
  fetchWeekSchedules(weekDays)
}
```

With:
```ts
const reportAbsence = (assignmentId: string, reason: string) => {
  Alert.alert(
    'Zgłoś nieobecność',
    'Zgłosić nieobecność na tej służbie?',
    [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Zgłoś',
        onPress: async () => {
          setReportingAbsenceId(assignmentId)
          const { error } = await supabase
            .from('schedule_assignments')
            .update({ status: 'excused', absence_reason: reason })
            .eq('id', assignmentId)
          setReportingAbsenceId(null)
          if (error) { Alert.alert('Błąd', error.message); return }
          setAbsenceModal({ visible: false, assignmentId: '', title: '', reason: '' })
          fetchWeekSchedules(weekDays)
        },
      },
    ]
  )
}
```

- [ ] **Step 4: Verify manually — sign up**

As a member, open the schedule, tap "Zapisz się" on a slot, choose "Jednorazowo". Expected: Alert "Zapisz na służbę" with the date appears. "Anuluj" does nothing. "Zapisz" signs up.

- [ ] **Step 5: Verify manually — unsign**

As a member, tap "Wypisz" on a slot you're signed up for. Expected: unsign modal appears (scope picker) → tap "Tylko tę" → Alert "Wypisz ze służby" appears. "Anuluj" does nothing. "Wypisz" removes you.

- [ ] **Step 6: Verify manually — report absence**

As a member, tap "Zgłoś nieobecność" on an assigned slot, enter a reason, tap "Zgłoś". Expected: Alert "Zgłoś nieobecność" appears over the absence modal. "Anuluj" dismisses alert and keeps the modal open with the typed reason. "Zgłoś" submits and closes the modal.

- [ ] **Step 7: Commit**

```bash
git add "app/(tabs)/schedule.tsx"
git commit -m "feat: add confirmation dialogs to sign up, unsign, and report absence"
```

---

## Self-Review

**Spec coverage:**
- ✅ handleChangeRank (member-detail) — Task 1
- ✅ handleAwardBadge (member-detail) — Task 2
- ✅ handleSetRank (rank-assignment) — Task 3
- ✅ handleApprove (absence-requests) — Task 4
- ✅ handleReject (absence-requests) — Task 4
- ✅ handleAdd (schedule-detail) — Task 5
- ✅ doSignUp (schedule) — Task 6
- ✅ unsignOne (schedule) — Task 6
- ✅ reportAbsence (schedule) — Task 6

**Placeholder scan:** No TBD, no TODO, no "similar to Task N" — all code is complete.

**Type consistency:** All handlers updated consistently — function signatures match their call sites. The only signature change is `absence-requests.tsx` (id→AbsenceRequest); both the handler definitions and the call sites at lines 146–147 are updated in Task 4.
