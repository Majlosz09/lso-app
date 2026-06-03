# Confirmation Dialogs — Design Spec

**Date:** 2026-06-01  
**Approach:** Inline `Alert.alert` in each handler (consistent with existing codebase)

## Problem

9 user-triggered actions in the app lack confirmation dialogs before executing irreversible or significant Supabase mutations. All destructive delete actions already have confirmations; this spec covers the remaining write/update actions.

## Scope

### Admin actions

| File | Handler | Line | Action | Destructive? |
|------|---------|------|--------|--------------|
| `app/(admin)/member-detail.tsx` | `handleChangeRank` | 190 | Assigns rank to member | No |
| `app/(admin)/member-detail.tsx` | `handleAwardBadge` | 243 | Awards badge to member | No |
| `app/(admin)/rank-assignment.tsx` | `handleSetRank` | 67 | Assigns rank to member | No |
| `app/(admin)/absence-requests.tsx` | `handleApprove` | 52 | Approves single absence | No |
| `app/(admin)/absence-requests.tsx` | `handleReject` | 66 | Rejects single absence | Yes |
| `app/(admin)/schedule-detail.tsx` | `handleAdd` | 190 | Adds member to schedule | No |

### Member actions

| File | Handler | Line | Action | Destructive? |
|------|---------|------|--------|--------------|
| `app/(tabs)/schedule.tsx` | `doSignUp` | 597 | Signs up for a schedule slot | No |
| `app/(tabs)/schedule.tsx` | `unsignOne` | 617 | Removes self from single slot | No |
| `app/(tabs)/profile.tsx` | `reportAbsence` | 660 | Reports absence for a slot | No |

## Alert content

### Admin

**Zmiana rangi** (`handleChangeRank`, `handleSetRank`)
- Title: `Zmień rangę`
- Message: `Przypisać rangę „{rangaName}" ministrancowi {memberName}?`
- Buttons: `Anuluj` (cancel) / `Przypisz` (default)

**Przyznanie odznaki** (`handleAwardBadge`)
- Title: `Przyznaj odznakę`
- Message: `Przyznać odznakę „{badgeName}" ministrancowi {memberName}?`
- Buttons: `Anuluj` (cancel) / `Przyznaj` (default)

**Zatwierdź nieobecność** (`handleApprove`)
- Title: `Zatwierdź nieobecność`
- Message: `Zatwierdzić nieobecność {memberName} na służbie {date}?`
- Buttons: `Anuluj` (cancel) / `Zatwierdź` (default)

**Odrzuć nieobecność** (`handleReject`)
- Title: `Odrzuć nieobecność`
- Message: `Odrzucić zgłoszenie nieobecności {memberName}?`
- Buttons: `Anuluj` (cancel) / `Odrzuć` (destructive)

**Dodanie do służby** (`handleAdd`)
- Title: `Dodaj do służby`
- Message: `Dodać {memberName} do tej służby?`
- Buttons: `Anuluj` (cancel) / `Dodaj` (default)

### Member

**Zapis na służbę** (`doSignUp`)
- Title: `Zapisz na służbę`
- Message: `Zapisać się na służbę {date}?`
- Buttons: `Anuluj` (cancel) / `Zapisz` (default)

**Wypisanie ze służby** (`unsignOne`)
- Title: `Wypisz ze służby`
- Message: `Wypisać się z tej służby?`
- Buttons: `Anuluj` (cancel) / `Wypisz` (default)

**Zgłoszenie nieobecności** (`reportAbsence`)
- Title: `Zgłoś nieobecność`
- Message: `Zgłosić nieobecność na służbie {date}?`
- Buttons: `Anuluj` (cancel) / `Zgłoś` (default)

## Implementation pattern

Each handler is wrapped in an `Alert.alert` call. The Supabase mutation moves into the `onPress` callback of the confirm button:

```ts
Alert.alert(
  'Tytuł',
  'Treść z {dynamiczną} wartością',
  [
    { text: 'Anuluj', style: 'cancel' },
    { text: 'Akcja', onPress: async () => { /* istniejący kod mutacji */ } },
  ]
)
```

No new components, hooks, or utilities are introduced.

## Out of scope

- Stylistic changes to existing alerts
- Badge revocation (already has confirmation via destructive delete flow)
- Bulk approve all absences (already has Alert.alert confirmation)
