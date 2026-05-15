# Gamification — Auto Points Design

## Goal

Automatically award points to a minister when they self-check in to a scheduled service. Points are determined by 4 fixed service categories configured per parish by the admin. The separate "poza dyżurem" form is removed — everything goes through the unified schedule view.

## Architecture

Check-in triggers a point award in the same action. The schedule view is rebuilt as a single unified screen (week strip + event list) replacing the current three-tab layout. The existing `point_rules` table is restructured to use a fixed `service_type` enum instead of a free-text `label`. Points are inserted into the existing `points` table on every successful check-in.

**Tech stack:** React Native / Expo Router, Supabase JS v2, PostgreSQL RLS.

---

## Data Model

### `point_rules` table — modified

Current columns: `id, parish_id, label (text), points, created_at`

Change: replace `label` with `service_type` enum. Add unique constraint on `(parish_id, service_type)` so each parish has exactly one rule per category.

```sql
-- New enum
CREATE TYPE service_type_enum AS ENUM (
  'msza_assigned',   -- Msza z dyżurem (signed up + checked in)
  'msza_extra',      -- Msza poza dyżurem (no signup, checked in)
  'nabozenstwo',     -- Nabożeństwo
  'zbiorka'          -- Zbiórka
);

ALTER TABLE point_rules
  DROP COLUMN label,
  ADD COLUMN service_type service_type_enum NOT NULL;

ALTER TABLE point_rules
  ADD CONSTRAINT point_rules_parish_service_unique UNIQUE (parish_id, service_type);
```

On parish creation: seed 4 default rows (msza_assigned=5, msza_extra=3, nabozenstwo=3, zbiorka=5). Migration for existing parishes: insert missing rows with the same defaults using `INSERT ... ON CONFLICT DO NOTHING`.

### `points` table — add `service_type` column

Current columns: `id, profile_id, amount, reason, schedule_id (nullable), awarded_by (nullable), created_at, parish_id`

Add: `service_type service_type_enum NULL` — NULL for manually awarded points, set for auto-awarded.

```sql
ALTER TABLE points ADD COLUMN service_type service_type_enum NULL;
```

Unique partial index to prevent duplicate auto-awards:
```sql
CREATE UNIQUE INDEX points_no_duplicate_auto
  ON points (profile_id, schedule_id)
  WHERE schedule_id IS NOT NULL AND awarded_by IS NULL;
```

### `schedules` table — no changes

Category enum (`msza | nabozenstwo | zbiorka`) already covers all cases. Sunday detection is done in the app via `new Date(schedule.date).getDay() === 0`.

### `extra_attendance` table — deprecated

Table stays in DB (historical data), but the UI flow that writes to it is removed.

---

## Check-in Flow

When a minister taps **"Obecny"** on any event tile:

```
1. Determine service_type:
   - schedules.category = 'msza' AND Sunday (getDay() === 0) → no points, abort
   - schedules.category = 'msza' AND has schedule_assignment → 'msza_assigned'
   - schedules.category = 'msza' AND no assignment          → 'msza_extra'
   - schedules.category = 'nabozenstwo'                     → 'nabozenstwo'
   - schedules.category = 'zbiorka'                         → 'zbiorka'

2. Check for duplicate: SELECT 1 FROM points
   WHERE profile_id = $me AND schedule_id = $id AND awarded_by IS NULL
   → if exists: show toast "Już zaznaczono obecność" and stop

3. Look up rule: SELECT points FROM point_rules
   WHERE parish_id = $parish AND service_type = $type
   → if missing: treat as 0 points (do not block check-in)

4. Record attendance:
   - If has assignment: UPDATE schedule_assignments SET status = 'present'
   - INSERT INTO attendance (schedule_id, profile_id, method='manual', parish_id)

5. Award points:
   INSERT INTO points (profile_id, amount, reason, schedule_id, parish_id, service_type)
   VALUES ($me, $rule.points, $label, $schedule_id, $parish, $type)
   → $label derived from service_type: 'Msza Święta z dyżurem' / etc.

6. Show toast: "+5 pkt — Msza Święta z dyżurem"
```

Steps 4 and 5 run inside a Supabase transaction (single RPC `check_in_and_award_points`).

---

## Schedule View — Unified (replaces 3 tabs)

The current `MemberScheduleView` has tabs: Służby / Zapisy / Historia. These are replaced with a single scrollable view: **week strip on top + event list below**.

### Week strip

Horizontal scroll of day pills showing the current week. Tapping a day scrolls the list to that day. Arrows to go to next/previous week. Current day auto-selected on mount.

```
← [Pn 12] [Wt 13] [Śr 14] [Cz 15] [Pt 16] [Sb 17] [Nd 18] →
```

### Event list

Grouped by date, chronological. Fetches all `schedules` for the visible week range where `parish_id = $parish`. For each schedule, also fetches whether the current minister has a `schedule_assignment`.

**Tile states:**

| Condition | Button | Border |
|---|---|---|
| Sunday (any category) | — (no action) | grey |
| msza · before window · no signup | Zapisz się | neutral |
| msza · before window · signed up | Wypisz się · badge DYŻUR | neutral |
| msza · window open · signed up | Obecny | green |
| msza · window open · no signup | Obecny | purple |
| nabozenstwo / zbiorka · before window | — (display only) | neutral |
| nabozenstwo / zbiorka · window open | Obecny | purple |
| any · already checked in | Obecny (disabled) · badge OBECNY | neutral |

Check-in window: 30 min before start → 90 min after start (matches existing logic).

Sign-up: available any time before the check-in window opens. Calls existing `sign_up_for_slot` RPC.

### What's preserved from the existing schedule.tsx

- Absence reporting ("Zgłoś nieobecność") — still available on assigned-service tiles before the check-in window opens
- Sign-up modal (jednorazowo / cyklicznie) — tapping "Zapisz się" opens the same choice, calls the same `sign_up_for_slot` RPC
- Unsigning ("Wypisz się") — still available on assigned tiles before the window
- Status badges (DYŻUR, OBECNY, excused, absent, etc.) — shown on each tile based on `schedule_assignment.status`
- Admin-visible history and status tracking — unchanged

### What's removed from schedule.tsx

- Tab: "Zapisy" (calendar-based)
- Tab: "Służby" (assigned-only list)
- "Służyłeś poza dyżurem?" banner
- `extra_attendance` modal and `record_extra_attendance` RPC call
- Tab: "Historia" — becomes a collapsible "Historia służb" section pinned at the bottom of the unified view, collapsed by default

---

## Admin — Point Rules Screen

File: `app/(admin)/point-rules.tsx` — rewritten.

Shows exactly 4 rows (fixed, not dynamic). Each row has the category label and an editable points value. Admin taps a value to edit it inline, then taps "Zapisz zmiany" to batch-update all 4 rules.

```
Ustawienia punktów za służby

[Msza z dyżurem         ]  [5] pkt
[Msza poza dyżurem      ]  [3] pkt
[Nabożeństwo            ]  [3] pkt
[Zbiórka                ]  [5] pkt

[    Zapisz zmiany    ]
```

On save: upsert all 4 rules by `(parish_id, service_type)`. If rules don't exist yet (new parish), create them.

---

## Out of Scope

- GPS / Bluetooth location verification for check-in (future)
- Badges / achievements system (next feature)
- Rank system (future feature)
- Recurring commitments / automatic assignment generation
- Push notifications on point award
