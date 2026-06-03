# Badge Management Redesign + Award Flow

**Date:** 2026-06-03
**Scope:** `app/(admin)/badge-management.tsx`

## Problem

The current badge management screen is functional but visually flat — three sections stacked without hierarchy or color differentiation. There is no way to award a badge to a specific member from this screen; only the history of past manual awards is visible.

## Goals

1. Improve the visual design of the screen (section headers, icon tiles, section separation).
2. Add a 3-step wizard (bottom sheet) to award a manual badge to a specific member.

## Decisions

| Decision | Choice | Reason |
|---|---|---|
| Award entry point | Floating Action Button (FAB) in bottom-right | Does not clutter the screen; familiar mobile pattern |
| Award modal layout | 3-step wizard (not single form) | Search/list of members is more usable than a dropdown at larger group sizes |
| Which badges are awardable | Only `type = 'manual'` badge definitions | System auto-badges are computed, not granted |

---

## 1. Visual Redesign (main screen)

### Section headers
Replace plain `SECTION_LABEL` text with a row: `[colored accent bar] SECTION LABEL`. Each section gets its own accent color:
- **Odznaki parafii** — `#FFC107` (gold)
- **Ostatnio przyznane** — `#30d158` (green)
- **Katalog systemowy** — `#636366` (grey)

### Badge rows (parish badges)
Wrap the emoji icon in a rounded tile (`28×28`, `borderRadius: 8`, `background: #FFC10720`) instead of rendering a bare emoji. Show a subtitle "Przyznawana ręcznie" below the name.

### Catalog section split
Split the existing "KATALOG ODZNAK" into two sub-sections:
- **Odznaki parafii** — shows manual badges with gold styling + delete button + add form.
- **Katalog systemowy** — shows auto system badges with a grey "Auto" chip, no delete button. Shown collapsed at the bottom of the screen.

### History section
Rename "HISTORIA PRZYZNANYCH" → "OSTATNIO PRZYZNANE". Keep existing data (name, member, date, awarder, note). Limit to last 10 records (previously 30) to keep the screen lightweight.

### FAB
A `42×42` circle button, gradient `#FFC107 → #FF9800`, positioned `bottom: 16, right: 16` (above `safeAreaInsets.bottom`). A persistent tooltip label "Przyznaj odznakę" is shown to the left of the FAB at all times. On press: open the award bottom sheet.

---

## 2. Award Wizard (bottom sheet)

### Structure
A `Modal` (or bottom sheet via `react-native` `Modal` with slide animation) renders over the screen with a semi-transparent backdrop. Three internal steps are tracked by a local `step` state variable (`1 | 2 | 3`).

### Step indicators
A row of 3 dots at the top of the sheet: pending dots are grey `#3a3a3c`, the active dot is gold `#FFC107` and wider (20 px), completed dots are green `#30d158`.

### Step 1 — Select member
- Title: `KROK 1 / 3 — Wybierz ministranta`
- A `TextInput` search bar filters `profiles` by `full_name` (case-insensitive, client-side filter on the pre-fetched list).
- A `FlatList` renders matching members. Tapping a row selects it (highlight + checkmark). Only one member can be selected.
- Members loaded from Supabase on modal open: `profiles` where `parish_id = parishId` and `role = 'member'`, ordered by `full_name`.
- Buttons: **Anuluj** (closes modal) | **Dalej →** (disabled until member selected).

### Step 2 — Select badge
- Title: `KROK 2 / 3 — Wybierz odznakę`
- Subtitle: `Dla: <selected member full_name>`.
- A flat list of manual badge definitions (`type = 'manual'`, parish or system). Each row: icon + name. Tapping selects it (gold highlight + gold checkmark). Only one badge.
- Buttons: **← Wstecz** (back to step 1) | **Dalej →** (disabled until badge selected).

### Step 3 — Confirm
- Title: `KROK 3 / 3 — Potwierdź`
- Summary card: badge icon + badge name + "dla:" + member full name.
- Optional `TextInput` for a note (multiline, max 200 chars).
- Buttons: **← Wstecz** (back to step 2) | **🏅 Przyznaj** (executes award, disabled while loading).

### Award action
On "Przyznaj" press:
```
supabase.from('member_badges').upsert({
  profile_id: selectedMember.id,
  badge_definition_id: selectedBadge.id,
  awarded_by: currentAdminProfileId,
  note: note.trim() || null,
  is_active: true,
}, { onConflict: 'profile_id,badge_definition_id' })
```
On success: close modal, call `fetchData()` to refresh history. On error: show `Alert`.

---

## 3. Data

No schema changes required. The `member_badges` table already has `awarded_by`, `note`, and the unique constraint on `(profile_id, badge_definition_id)`. Upsert handles re-awarding (e.g. admin awards same badge twice — updates `awarded_at` and `note`).

New fetch needed for the wizard:
- Members list: `profiles` (parish, role=member) — fetched once on modal open, stored in state.
- Manual badges for step 2: already in `allBadges` state (filtered `type = 'manual'`).

---

## 4. Component structure

All changes are within `app/(admin)/badge-management.tsx`. No new files needed. The wizard state is local (`useState`): `wizardVisible`, `wizardStep`, `selectedMember`, `selectedBadge`, `note`, `members`, `awarding`.

---

## 5. Out of scope

- Revoking/removing an awarded badge from a member (not requested).
- Showing a member's full badge history from this screen.
- Push notification to the member upon award.
