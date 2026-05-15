# Gamification — Auto Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically award points when a minister checks in to a scheduled service, replacing the separate "poza dyżurem" form with a unified schedule view.

**Architecture:** DB migration adds `service_type` enum to `point_rules` and `points`. A new Supabase RPC `check_in_and_award_points` atomically records attendance and awards points. The member schedule view is rebuilt as a single unified screen (week strip + event list), replacing the current 3-tab layout. The admin point-rules screen is rewritten to show 4 fixed categories.

**Tech Stack:** React Native / Expo Router, Supabase JS v2, PostgreSQL 15, TypeScript.

---

## File Map

| File | Change |
|---|---|
| Supabase SQL Editor | Run migration SQL — enum, column changes, index, seed |
| Supabase SQL Editor | Create `check_in_and_award_points` RPC function |
| `types/database.ts` | Add `ServiceType`, update `PointRule` and `Point` interfaces |
| `app/(admin)/point-rules.tsx` | Complete rewrite — 4 fixed rows, editable points, batch save |
| `app/(tabs)/schedule.tsx` | Rewrite `MemberScheduleView` + remove `extra_attendance` code; keep `ParentScheduleView`, `ChildScheduleCard`, `MetaRow`, `MyScheduleCard` |

---

## Task 1: DB Migration

**Files:** Supabase SQL Editor (Dashboard → SQL Editor → New query)

- [ ] **Step 1: Run the migration SQL**

Open Supabase dashboard → SQL Editor → New query. Paste and run:

```sql
-- 1. Create enum
CREATE TYPE service_type_enum AS ENUM (
  'msza_assigned',
  'msza_extra',
  'nabozenstwo',
  'zbiorka'
);

-- 2. Migrate point_rules: drop label, add service_type
ALTER TABLE point_rules
  DROP COLUMN label,
  ADD COLUMN service_type service_type_enum;

-- Mark existing rows NULL for service_type — they'll be replaced by upsert below
UPDATE point_rules SET service_type = 'msza_assigned' WHERE service_type IS NULL LIMIT 0;

-- Add unique constraint
ALTER TABLE point_rules
  ADD CONSTRAINT point_rules_parish_service_unique UNIQUE (parish_id, service_type);

-- Set NOT NULL after constraint added
ALTER TABLE point_rules ALTER COLUMN service_type SET NOT NULL;

-- 3. Add service_type to points
ALTER TABLE points ADD COLUMN service_type service_type_enum NULL;

-- 4. Unique partial index on points to prevent duplicate auto-awards
CREATE UNIQUE INDEX points_no_duplicate_auto
  ON points (profile_id, schedule_id)
  WHERE schedule_id IS NOT NULL AND awarded_by IS NULL;

-- 5. Seed default rules for all existing parishes
INSERT INTO point_rules (parish_id, service_type, points)
SELECT p.id, s.service_type, s.points
FROM parishes p
CROSS JOIN (VALUES
  ('msza_assigned'::service_type_enum, 5),
  ('msza_extra'::service_type_enum,    3),
  ('nabozenstwo'::service_type_enum,   3),
  ('zbiorka'::service_type_enum,       5)
) AS s(service_type, points)
ON CONFLICT (parish_id, service_type) DO NOTHING;
```

- [ ] **Step 2: Verify the migration**

Run in SQL Editor:
```sql
SELECT * FROM point_rules ORDER BY parish_id, service_type;
SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'points' AND column_name = 'service_type';
```

Expected: 4 rows per parish in `point_rules`, each with a `service_type` value. The `points` table has a new `service_type` column.

- [ ] **Step 3: Commit marker**

```bash
git commit --allow-empty -m "chore: DB migration for auto-points applied in Supabase"
```

---

## Task 2: TypeScript Types

**Files:**
- Modify: `types/database.ts`

- [ ] **Step 1: Update `types/database.ts`**

Replace lines 24–30 (the `PointRule` interface) and add `ServiceType`. Find the existing `Point` interface (around line 131) and add `service_type`. Full changes:

```typescript
// Add after line 6 (after AssignmentStatus):
export type ServiceType = 'msza_assigned' | 'msza_extra' | 'nabozenstwo' | 'zbiorka'

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  msza_assigned: 'Msza Święta z dyżurem',
  msza_extra:    'Msza Święta poza dyżurem',
  nabozenstwo:   'Nabożeństwo',
  zbiorka:       'Zbiórka',
}
```

Replace the `PointRule` interface (currently lines 24–30):
```typescript
export interface PointRule {
  id: string
  parish_id: string
  service_type: ServiceType
  points: number
  created_at: string
}
```

Find the `Point` interface and add `service_type`:
```typescript
export interface Point {
  id: string
  profile_id: string
  amount: number
  reason: string
  schedule_id: string | null
  awarded_by: string | null
  service_type: ServiceType | null   // ← add this line
  parish_id: string
  created_at: string
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd C:/Users/brival/Desktop/Projekty/lso-app && npx tsc --noEmit
```

Expected: `point-rules.tsx` will have errors about `rule.label` — that's expected and fixed in Task 4. All other files should be clean or show only the point-rules error.

- [ ] **Step 3: Commit**

```bash
git add types/database.ts
git commit -m "feat: add ServiceType and update PointRule/Point types"
```

---

## Task 3: Supabase RPC — `check_in_and_award_points`

**Files:** Supabase SQL Editor

- [ ] **Step 1: Create the RPC function**

Open Supabase dashboard → SQL Editor → New query. Paste and run:

```sql
CREATE OR REPLACE FUNCTION check_in_and_award_points(
  p_schedule_id   uuid,
  p_assignment_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid           uuid := auth.uid();
  v_schedule      record;
  v_service_type  service_type_enum;
  v_points_amount int := 0;
  v_reason        text;
  v_dow           int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Prevent duplicate check-in
  IF EXISTS (
    SELECT 1 FROM attendance
    WHERE schedule_id = p_schedule_id AND profile_id = v_uid
  ) THEN
    RETURN jsonb_build_object(
      'already_checked_in', true,
      'points_awarded', 0,
      'reason', NULL
    );
  END IF;

  SELECT id, category, date, parish_id INTO v_schedule
  FROM schedules WHERE id = p_schedule_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Schedule not found: %', p_schedule_id;
  END IF;

  v_dow := EXTRACT(DOW FROM v_schedule.date::date)::int;  -- 0 = Sunday

  -- Determine service_type
  IF v_schedule.category = 'msza' AND v_dow = 0 THEN
    -- Sunday mass: record attendance only, no points
    v_service_type := NULL;

  ELSIF v_schedule.category = 'msza' AND p_assignment_id IS NOT NULL THEN
    v_service_type := 'msza_assigned';
    v_reason := 'Msza Święta z dyżurem';

  ELSIF v_schedule.category = 'msza' THEN
    v_service_type := 'msza_extra';
    v_reason := 'Msza Święta poza dyżurem';

  ELSIF v_schedule.category = 'nabozenstwo' THEN
    v_service_type := 'nabozenstwo';
    v_reason := 'Nabożeństwo';

  ELSIF v_schedule.category = 'zbiorka' THEN
    v_service_type := 'zbiorka';
    v_reason := 'Zbiórka';
  END IF;

  -- Look up point value
  IF v_service_type IS NOT NULL THEN
    SELECT points INTO v_points_amount
    FROM point_rules
    WHERE parish_id = v_schedule.parish_id AND service_type = v_service_type;
    IF NOT FOUND THEN v_points_amount := 0; END IF;
  END IF;

  -- Record attendance
  INSERT INTO attendance (schedule_id, profile_id, method, parish_id)
  VALUES (p_schedule_id, v_uid, 'manual', v_schedule.parish_id);

  -- Update assignment status if provided
  IF p_assignment_id IS NOT NULL THEN
    UPDATE schedule_assignments
    SET status = 'present'
    WHERE id = p_assignment_id AND profile_id = v_uid;
  END IF;

  -- Award points
  IF v_service_type IS NOT NULL THEN
    INSERT INTO points (profile_id, amount, reason, schedule_id, parish_id, service_type)
    VALUES (v_uid, v_points_amount, v_reason, p_schedule_id, v_schedule.parish_id, v_service_type);
  END IF;

  RETURN jsonb_build_object(
    'already_checked_in', false,
    'points_awarded', v_points_amount,
    'service_type', v_service_type,
    'reason', v_reason
  );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION check_in_and_award_points(uuid, uuid) TO authenticated;
```

- [ ] **Step 2: Smoke-test the RPC**

In SQL Editor, set your user ID (find it in `auth.users`):
```sql
-- Test with a real schedule ID from your DB
SELECT check_in_and_award_points('YOUR-SCHEDULE-UUID-HERE', NULL);
```

Expected: JSON like `{"already_checked_in": false, "points_awarded": 3, "reason": "Msza Święta poza dyżurem"}`.
Call it again — expected: `{"already_checked_in": true, "points_awarded": 0, "reason": null}`.

- [ ] **Step 3: Commit marker**

```bash
git commit --allow-empty -m "feat: check_in_and_award_points RPC created in Supabase"
```

---

## Task 4: Admin Point Rules Screen

**Files:**
- Modify: `app/(admin)/point-rules.tsx` (complete rewrite — 172 lines replaced)

- [ ] **Step 1: Replace `app/(admin)/point-rules.tsx` entirely**

```typescript
import { useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { shadow } from '../../lib/shadows'
import { useAuthStore } from '../../stores/authStore'
import { ServiceType, SERVICE_TYPE_LABELS } from '../../types/database'

const SERVICE_TYPES: ServiceType[] = ['msza_assigned', 'msza_extra', 'nabozenstwo', 'zbiorka']
const DEFAULT_POINTS: Record<ServiceType, number> = {
  msza_assigned: 5, msza_extra: 3, nabozenstwo: 3, zbiorka: 5,
}

export default function PointRulesScreen() {
  const { profile } = useAuthStore()
  const insets = useSafeAreaInsets()
  const [values, setValues] = useState<Record<ServiceType, string>>({
    msza_assigned: '5', msza_extra: '3', nabozenstwo: '3', zbiorka: '5',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!profile?.parish_id) return
    supabase
      .from('point_rules')
      .select('service_type, points')
      .eq('parish_id', profile.parish_id)
      .then(({ data }) => {
        if (data) {
          const next = { ...values }
          for (const row of data as any[]) {
            if (row.service_type in next) next[row.service_type as ServiceType] = String(row.points)
          }
          setValues(next)
        }
        setLoading(false)
      })
  }, [profile?.parish_id])

  const handleSave = async () => {
    for (const type of SERVICE_TYPES) {
      const n = parseInt(values[type])
      if (isNaN(n) || n < 0) {
        Alert.alert('Błąd', `Nieprawidłowa wartość dla "${SERVICE_TYPE_LABELS[type]}".`)
        return
      }
    }
    setSaving(true)
    const upserts = SERVICE_TYPES.map(type => ({
      parish_id: profile!.parish_id,
      service_type: type,
      points: parseInt(values[type]),
    }))
    const { error } = await supabase
      .from('point_rules')
      .upsert(upserts, { onConflict: 'parish_id,service_type' })
    setSaving(false)
    if (error) Alert.alert('Błąd', error.message)
    else Alert.alert('Zapisano', 'Ustawienia punktów zostały zaktualizowane.')
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#534AB7" /></View>
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Text style={styles.sectionTitle}>Punkty za każdy rodzaj służby</Text>
        {SERVICE_TYPES.map(type => (
          <View key={type} style={styles.row}>
            <Text style={styles.label}>{SERVICE_TYPE_LABELS[type]}</Text>
            <View style={styles.inputGroup}>
              <TextInput
                style={styles.input}
                value={values[type]}
                onChangeText={v => setValues(prev => ({ ...prev, [type]: v.replace(/[^0-9]/g, '') }))}
                keyboardType="number-pad"
                maxLength={3}
              />
              <Text style={styles.unit}>pkt</Text>
            </View>
          </View>
        ))}
        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.saveBtnText}>Zapisz zmiany</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, gap: 10 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    ...shadow.xs,
  },
  label: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  inputGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: {
    backgroundColor: '#f0f0f0', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7,
    fontSize: 18, fontWeight: '800', color: '#534AB7',
    minWidth: 48, textAlign: 'center',
  },
  unit: { fontSize: 12, color: '#888', fontWeight: '600' },
  saveBtn: {
    backgroundColor: '#534AB7', borderRadius: 12,
    padding: 14, alignItems: 'center', marginTop: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
})
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors in `point-rules.tsx`.

- [ ] **Step 3: Manual test**

Run the app. Open Admin → Reguły punktów. Verify:
- 4 rows shown (Msza z dyżurem, Msza poza dyżurem, Nabożeństwo, Zbiórka)
- Tapping a value opens number keyboard
- Changing values and tapping "Zapisz zmiany" shows "Zapisano" alert
- Reopening the screen shows the saved values

- [ ] **Step 4: Commit**

```bash
git add app/(admin)/point-rules.tsx
git commit -m "feat: rewrite point-rules admin screen with 4 fixed categories"
```

---

## Task 5: Schedule View — Helpers and WeekStrip

**Files:**
- Modify: `app/(tabs)/schedule.tsx` — add new helpers and `WeekStrip` component, remove `extra_attendance` code

- [ ] **Step 1: Remove `extra_attendance` code from `schedule.tsx`**

Delete these items from `schedule.tsx` (they live in `MemberScheduleView` and top-level helpers):
- Type `ExtraSlot` (line 49)
- Functions `getNabożeństwoTime` (line 51), `getAvailableExtraSlots` (line 58)
- From `MemberScheduleView` state: `massTemplates`, `availableExtraSlots`, `showExtraModal`, `selectedSlot`, `submittingExtra`
- The `useEffect` that fetches mass_templates (lines 198–209) and the timer interval (lines 211–216)
- `handleExtraCheckIn` function (lines 471–487)
- The extra attendance banner (`TouchableOpacity` at lines 534–541) and modal (search for `showExtraModal` in the JSX, ~lines 785–838)

Also remove the `Calendar` import from `react-native-calendars` (line 7) if it's no longer used after this task.

- [ ] **Step 2: Add new helper functions**

Add these functions near the top of `schedule.tsx`, after `isCheckInWindowOpen`:

```typescript
const DAY_SHORT = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb']

function getWeekDays(weekOffset: number): string[] {
  const today = new Date()
  const dow = today.getDay()
  const daysToMonday = dow === 0 ? -6 : 1 - dow
  const monday = new Date(today)
  monday.setDate(today.getDate() + daysToMonday + weekOffset * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d.toISOString().split('T')[0]
  })
}

function isSunday(dateStr: string): boolean {
  return new Date(dateStr + 'T12:00:00').getDay() === 0
}

function formatDateHeader(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })
}
```

- [ ] **Step 3: Add `WeekStrip` component**

Add this component to `schedule.tsx`, just before `MemberScheduleView`:

```typescript
interface WeekStripProps {
  weekDays: string[]
  selectedDate: string
  onSelect: (date: string) => void
  onPrev: () => void
  onNext: () => void
  eventDates: Set<string>
}

function WeekStrip({ weekDays, selectedDate, onSelect, onPrev, onNext, eventDates }: WeekStripProps) {
  const today = new Date().toISOString().split('T')[0]
  return (
    <View style={styles.weekStripContainer}>
      <TouchableOpacity onPress={onPrev} style={styles.weekArrow} hitSlop={8}>
        <Ionicons name="chevron-back" size={20} color="#534AB7" />
      </TouchableOpacity>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.weekDaysScroll}>
        {weekDays.map(date => {
          const d = new Date(date + 'T12:00:00')
          const isSelected = date === selectedDate
          const isToday = date === today
          const hasEvents = eventDates.has(date)
          return (
            <TouchableOpacity key={date} onPress={() => onSelect(date)}
              style={styles.dayPill} activeOpacity={0.7}>
              <Text style={[styles.dayPillLabel, isSelected && { color: '#534AB7' }]}>
                {DAY_SHORT[d.getDay()]}
              </Text>
              <View style={[
                styles.dayPillCircle,
                isSelected && styles.dayPillSelected,
                isToday && !isSelected && styles.dayPillToday,
              ]}>
                <Text style={[
                  styles.dayPillNum,
                  isSelected && { color: '#fff', fontWeight: '800' },
                  isToday && !isSelected && { color: '#534AB7', fontWeight: '700' },
                ]}>
                  {d.getDate()}
                </Text>
              </View>
              {hasEvents
                ? <View style={[styles.dayPillDot, isSelected && { backgroundColor: '#fff' }]} />
                : <View style={styles.dayPillDotEmpty} />
              }
            </TouchableOpacity>
          )
        })}
      </ScrollView>
      <TouchableOpacity onPress={onNext} style={styles.weekArrow} hitSlop={8}>
        <Ionicons name="chevron-forward" size={20} color="#534AB7" />
      </TouchableOpacity>
    </View>
  )
}
```

- [ ] **Step 4: Add WeekStrip styles**

Append these to the `StyleSheet.create({...})` at the bottom of `schedule.tsx`:

```typescript
  weekStripContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  weekArrow: { paddingHorizontal: 8 },
  weekDaysScroll: { paddingHorizontal: 4, gap: 2 },
  dayPill: { alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2, minWidth: 38 },
  dayPillLabel: { fontSize: 10, fontWeight: '700', color: '#aaa', marginBottom: 2 },
  dayPillCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dayPillSelected: { backgroundColor: '#534AB7' },
  dayPillToday: { backgroundColor: '#534AB714' },
  dayPillNum: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  dayPillDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#534AB7', marginTop: 2 },
  dayPillDotEmpty: { width: 4, height: 4, marginTop: 2 },
```

- [ ] **Step 5: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: 0 new errors from the helper and WeekStrip additions.

- [ ] **Step 6: Commit**

```bash
git add app/(tabs)/schedule.tsx
git commit -m "feat: add WeekStrip component and schedule helpers"
```

---

## Task 6: Schedule View — ScheduleTile Component

**Files:**
- Modify: `app/(tabs)/schedule.tsx` — add `ScheduleTile` component

- [ ] **Step 1: Add `ScheduleTile` component**

Add this component to `schedule.tsx` just before `MemberScheduleView`. It handles all tile states from the spec:

```typescript
interface ScheduleTileProps {
  schedule: any
  checkingIn: boolean
  signingUp: boolean
  unsigning: boolean
  reporting: boolean
  onCheckIn: () => void
  onSignUp: () => void
  onUnsign: () => void
  onReportAbsence: () => void
}

function ScheduleTile({
  schedule, checkingIn, signingUp, unsigning, reporting,
  onCheckIn, onSignUp, onUnsign, onReportAbsence,
}: ScheduleTileProps) {
  const assignment = schedule.assignment
  const alreadyCheckedIn = schedule.hasAttendance || assignment?.status === 'present'
  const windowOpen = isCheckInWindowOpen(schedule)
  const isSun = isSunday(schedule.date)
  const cat = schedule.category as ScheduleCategory
  const cfg = CATEGORY_CONFIG[cat]
  const status: AssignmentStatus | undefined = assignment?.status

  // Border color: colored border only when window is open and not yet checked in
  let borderColor = '#eee'
  if (!isSun && windowOpen && !alreadyCheckedIn) {
    borderColor = (cat === 'msza' && assignment) ? '#27ae60' : '#534AB7'
  }

  // Determine the primary action button
  let actionButton: React.ReactElement | null = null

  if (alreadyCheckedIn) {
    // No button — badge OBECNY shown in badges section below
  } else if (isSun) {
    // No action for Sunday masses
  } else if (cat === 'msza') {
    if (windowOpen) {
      const isAssigned = !!assignment
      actionButton = (
        <TouchableOpacity
          style={[styles.tileBtn, { backgroundColor: isAssigned ? '#27ae60' : '#534AB7' }]}
          onPress={onCheckIn}
          disabled={checkingIn}
        >
          {checkingIn
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.tileBtnText}>Obecny</Text>
          }
        </TouchableOpacity>
      )
    } else if (!status || status === 'assigned') {
      if (assignment) {
        actionButton = (
          <TouchableOpacity
            style={[styles.tileBtn, styles.tileBtnOutline]}
            onPress={onUnsign}
            disabled={unsigning}
          >
            {unsigning
              ? <ActivityIndicator size="small" color="#e67e22" />
              : <Text style={[styles.tileBtnText, { color: '#e67e22' }]}>Wypisz się</Text>
            }
          </TouchableOpacity>
        )
      } else {
        actionButton = (
          <TouchableOpacity
            style={[styles.tileBtn, styles.tileBtnSecondary]}
            onPress={onSignUp}
            disabled={signingUp}
          >
            {signingUp
              ? <ActivityIndicator size="small" color="#534AB7" />
              : <Text style={[styles.tileBtnText, { color: '#534AB7' }]}>Zapisz się</Text>
            }
          </TouchableOpacity>
        )
      }
    }
  } else {
    // nabozenstwo or zbiorka
    if (windowOpen) {
      actionButton = (
        <TouchableOpacity
          style={[styles.tileBtn, { backgroundColor: '#534AB7' }]}
          onPress={onCheckIn}
          disabled={checkingIn}
        >
          {checkingIn
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.tileBtnText}>Obecny</Text>
          }
        </TouchableOpacity>
      )
    }
  }

  return (
    <View style={[styles.schedTile, { borderColor }]}>
      <View style={styles.schedTileTop}>
        <View style={styles.schedTileLeft}>
          <View style={styles.schedTileTitleRow}>
            <Text style={styles.schedTileTitle}>{schedule.title}</Text>
            <View style={[styles.catBadge, { backgroundColor: cfg.bg }]}>
              <Text style={[styles.catBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
          </View>
          <View style={styles.schedTileMeta}>
            {schedule.time && (
              <MetaRow icon="time-outline" text={schedule.time.slice(0, 5)} />
            )}
            {schedule.group?.name && (
              <MetaRow icon="people-outline" text={schedule.group.name} color="#534AB7" />
            )}
          </View>
          {/* Status badges */}
          <View style={styles.badgeRow}>
            {alreadyCheckedIn && (
              <View style={[styles.pill, { backgroundColor: '#27ae6022' }]}>
                <Text style={[styles.pillText, { color: '#27ae60' }]}>OBECNY</Text>
              </View>
            )}
            {!alreadyCheckedIn && assignment && (
              <View style={[styles.pill, { backgroundColor: '#27ae6022' }]}>
                <Text style={[styles.pillText, { color: '#27ae60' }]}>DYŻUR</Text>
              </View>
            )}
            {status && !['assigned', 'present'].includes(status) && (
              <View style={[styles.pill, { backgroundColor: (STATUS_COLORS[status] ?? '#888') + '22' }]}>
                <Text style={[styles.pillText, { color: STATUS_COLORS[status] ?? '#888' }]}>
                  {STATUS_LABELS[status] ?? status}
                </Text>
              </View>
            )}
            {assignment?.admin_note && (
              <View style={[styles.pill, { backgroundColor: '#e74c3c22' }]}>
                <Text style={[styles.pillText, { color: '#e74c3c' }]}>
                  {assignment.admin_note}
                </Text>
              </View>
            )}
          </View>
        </View>
        {actionButton && <View style={styles.schedTileAction}>{actionButton}</View>}
      </View>
      {/* Absence reporting for assigned tiles */}
      {assignment && !alreadyCheckedIn && !windowOpen && !['excused', 'absent', 'confirmed'].includes(status ?? '') && (
        <TouchableOpacity style={styles.absenceLink} onPress={onReportAbsence} disabled={reporting}>
          <Text style={styles.absenceLinkText}>Zgłoś nieobecność</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}
```

- [ ] **Step 2: Add ScheduleTile styles**

Append to the `StyleSheet.create`:

```typescript
  schedTile: {
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5,
    padding: 12, ...shadow.xs,
  },
  schedTileTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  schedTileLeft: { flex: 1 },
  schedTileAction: { justifyContent: 'center' },
  schedTileTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  schedTileTitle: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  schedTileMeta: { gap: 1, marginBottom: 4 },
  catBadge: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  catBadgeText: { fontSize: 9, fontWeight: '700' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  tileBtn: {
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7,
    minWidth: 80, alignItems: 'center',
  },
  tileBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  tileBtnOutline: { backgroundColor: '#fff3e0', borderWidth: 1, borderColor: '#e67e22' },
  tileBtnSecondary: { backgroundColor: '#f0f0f0' },
  absenceLink: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f5f5f5' },
  absenceLinkText: { fontSize: 12, color: '#e74c3c', fontWeight: '600' },
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: 0 errors (all referenced types and functions are defined).

- [ ] **Step 4: Commit**

```bash
git add app/(tabs)/schedule.tsx
git commit -m "feat: add ScheduleTile component with all tile states"
```

---

## Task 7: Schedule View — Unified MemberScheduleView

**Files:**
- Modify: `app/(tabs)/schedule.tsx` — replace `MemberScheduleView` implementation

- [ ] **Step 1: Replace `MemberScheduleView` state and fetch logic**

Remove the entire body of the `MemberScheduleView` function (everything from the opening `{` to the closing `}`) and replace with this:

```typescript
function MemberScheduleView() {
  const { profile } = useAuthStore()
  const today = new Date().toISOString().split('T')[0]

  // Week navigation
  const [weekOffset, setWeekOffset] = useState(0)
  const [weekDays, setWeekDays] = useState<string[]>(() => getWeekDays(0))
  const [selectedDate, setSelectedDate] = useState<string>(today)

  // Unified schedule data
  const [weekSchedules, setWeekSchedules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Action states
  const [checkingInId, setCheckingInId] = useState<string | null>(null)
  const [signingUpId, setSigningUpId] = useState<string | null>(null)
  const [unsigningId, setUnsigningId] = useState<string | null>(null)
  const [reportingAbsenceId, setReportingAbsenceId] = useState<string | null>(null)
  const [absenceModal, setAbsenceModal] = useState<{
    visible: boolean; assignmentId: string; title: string; reason: string
  }>({ visible: false, assignmentId: '', title: '', reason: '' })

  // History
  const [pastAssignments, setPastAssignments] = useState<any[]>([])
  const [historyExpanded, setHistoryExpanded] = useState(false)

  useEffect(() => {
    const days = getWeekDays(weekOffset)
    setWeekDays(days)
    // Keep selectedDate in the new week if possible, else pick Monday
    if (!days.includes(selectedDate)) setSelectedDate(days[0])
  }, [weekOffset])

  const fetchWeekSchedules = async (days: string[] = weekDays) => {
    if (!profile?.id || !profile?.parish_id || days.length === 0) return
    const [weekStart, weekEnd] = [days[0], days[days.length - 1]]

    const [schedulesRes, assignmentsRes] = await Promise.all([
      supabase
        .from('schedules')
        .select('*, group:groups(name)')
        .eq('parish_id', profile.parish_id)
        .gte('date', weekStart)
        .lte('date', weekEnd)
        .order('date').order('time'),
      supabase
        .from('schedule_assignments')
        .select('id, schedule_id, status, absence_reason, admin_note')
        .eq('profile_id', profile.id),
    ])

    const scheduleIds = (schedulesRes.data ?? []).map((s: any) => s.id)
    let attendanceSet = new Set<string>()
    if (scheduleIds.length > 0) {
      const { data: attData } = await supabase
        .from('attendance')
        .select('schedule_id')
        .eq('profile_id', profile.id)
        .in('schedule_id', scheduleIds)
      attendanceSet = new Set((attData ?? []).map((a: any) => a.schedule_id))
    }

    const assignmentMap = new Map(
      (assignmentsRes.data ?? []).map((a: any) => [a.schedule_id, a])
    )

    setWeekSchedules(
      (schedulesRes.data ?? []).map((s: any) => ({
        ...s,
        assignment: assignmentMap.get(s.id) ?? null,
        hasAttendance: attendanceSet.has(s.id),
      }))
    )
    setLoading(false)
    setRefreshing(false)
  }

  const fetchPastAssignments = async () => {
    if (!profile?.id) return
    const { data: assignments } = await supabase
      .from('schedule_assignments')
      .select('id, status, schedule_id, absence_reason, admin_note')
      .eq('profile_id', profile.id)
    if (!assignments?.length) { setPastAssignments([]); return }

    const { data: schedules } = await supabase
      .from('schedules')
      .select('id, title, date, time, category, group:groups(name)')
      .in('id', assignments.map((a: any) => a.schedule_id))
      .lt('date', today)
      .order('date', { ascending: false })
      .limit(30)

    const aMap = new Map(assignments.map((a: any) => [a.schedule_id, a]))
    setPastAssignments(
      (schedules ?? []).map((s: any) => ({
        ...s,
        assignment: aMap.get(s.id) ?? null,
        hasAttendance: false,
      }))
    )
  }

  useEffect(() => {
    fetchWeekSchedules(weekDays)
    fetchPastAssignments()
  }, [profile?.id, weekDays])

  useRealtimeTable('schedule_assignments', () => {
    fetchWeekSchedules(weekDays)
    fetchPastAssignments()
  })

  // --- Handlers ---

  const handleCheckIn = async (schedule: any) => {
    setCheckingInId(schedule.id)
    const assignmentId = schedule.assignment?.id ?? null
    const { data, error } = await supabase.rpc('check_in_and_award_points', {
      p_schedule_id: schedule.id,
      p_assignment_id: assignmentId,
    })
    setCheckingInId(null)
    if (error) { Alert.alert('Błąd', error.message); return }
    const result = data as any
    if (result.already_checked_in) {
      Alert.alert('', 'Obecność już zaznaczona.')
    } else if (result.points_awarded > 0) {
      Alert.alert('', `+${result.points_awarded} pkt — ${result.reason}`)
    } else {
      Alert.alert('', 'Obecność zaznaczona.')
    }
    fetchWeekSchedules(weekDays)
  }

  const handleSignUp = (schedule: any) => {
    Alert.alert(
      'Zapisz się',
      `${schedule.title}\n${formatDateHeader(schedule.date)}, ${schedule.time?.slice(0, 5)}`,
      [
        { text: 'Anuluj', style: 'cancel' },
        { text: 'Jednorazowo', onPress: () => doSignUp(schedule.date, schedule.time?.slice(0, 5), 'once') },
        { text: 'Cyklicznie', onPress: () => doSignUp(schedule.date, schedule.time?.slice(0, 5), 'recurring') },
      ]
    )
  }

  const doSignUp = async (date: string, timeSlot: string, mode: 'once' | 'recurring') => {
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
      Alert.alert('Cykl aktywny',
        `Zapisano cyklicznie na każdą ${DAY_FULL[dow]} o ${timeSlot}. Objęto ${(data as any)?.count ?? 1} służb.`
      )
    }
    fetchWeekSchedules(weekDays)
  }

  const unsignOne = async (assignmentId: string) => {
    setUnsigningId(assignmentId)
    await supabase.from('schedule_assignments').delete().eq('id', assignmentId)
    setUnsigningId(null)
    fetchWeekSchedules(weekDays)
  }

  const unsignCycle = async (assignmentId: string, commitmentId: string) => {
    setUnsigningId(assignmentId)
    await Promise.all([
      supabase.from('schedule_assignments').delete().eq('id', assignmentId),
      supabase.from('recurring_commitments').delete().eq('id', commitmentId),
    ])
    setUnsigningId(null)
    fetchWeekSchedules(weekDays)
  }

  const handleUnsign = async (schedule: any) => {
    const a = schedule.assignment
    if (!a) return
    const dow = new Date(schedule.date + 'T12:00:00').getDay()
    const timeSlot = schedule.time?.slice(0, 5)
    const { data: commitment } = await supabase
      .from('recurring_commitments')
      .select('id')
      .eq('profile_id', profile!.id)
      .eq('day_of_week', dow)
      .eq('time_slot', timeSlot)
      .maybeSingle()
    if (commitment) {
      Alert.alert('Wypisz się', `Ten dyżur jest częścią cyklu. Co chcesz zrobić?`, [
        { text: 'Anuluj', style: 'cancel' },
        { text: 'Tylko tę służbę', onPress: () => unsignOne(a.id) },
        { text: 'Cały cykl', style: 'destructive', onPress: () => unsignCycle(a.id, commitment.id) },
      ])
    } else {
      Alert.alert('Wypisz się', `Wypisać się ze służby "${schedule.title}"?`, [
        { text: 'Anuluj', style: 'cancel' },
        { text: 'Wypisz', style: 'destructive', onPress: () => unsignOne(a.id) },
      ])
    }
  }

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

  // --- Derived data ---

  const eventDates = useMemo(
    () => new Set(weekSchedules.map((s: any) => s.date)),
    [weekSchedules]
  )

  const daySchedules = useMemo(
    () => weekSchedules.filter((s: any) => s.date === selectedDate),
    [weekSchedules, selectedDate]
  )

  // --- Render ---

  if (loading) {
    return (
      <View style={styles.container}>
        <WeekStrip
          weekDays={weekDays} selectedDate={selectedDate}
          onSelect={setSelectedDate}
          onPrev={() => setWeekOffset(o => o - 1)}
          onNext={() => setWeekOffset(o => o + 1)}
          eventDates={eventDates}
        />
        <View style={styles.center}><ActivityIndicator size="large" color="#534AB7" /></View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <WeekStrip
        weekDays={weekDays} selectedDate={selectedDate}
        onSelect={setSelectedDate}
        onPrev={() => setWeekOffset(o => o - 1)}
        onNext={() => setWeekOffset(o => o + 1)}
        eventDates={eventDates}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchWeekSchedules(weekDays) }}
          />
        }
      >
        <Text style={styles.dayHeader}>{formatDateHeader(selectedDate)}</Text>

        {daySchedules.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={40} color="#ccc" />
            <Text style={styles.emptyText}>Brak służb w tym dniu</Text>
          </View>
        ) : (
          daySchedules.map((schedule: any) => (
            <ScheduleTile
              key={schedule.id}
              schedule={schedule}
              checkingIn={checkingInId === schedule.id}
              signingUp={signingUpId === `${schedule.date}_${schedule.time?.slice(0, 5)}`}
              unsigning={unsigningId === schedule.assignment?.id}
              reporting={reportingAbsenceId === schedule.assignment?.id}
              onCheckIn={() => handleCheckIn(schedule)}
              onSignUp={() => handleSignUp(schedule)}
              onUnsign={() => handleUnsign(schedule)}
              onReportAbsence={() => setAbsenceModal({
                visible: true,
                assignmentId: schedule.assignment?.id ?? '',
                title: schedule.title,
                reason: '',
              })}
            />
          ))
        )}

        {/* Historia służb */}
        <TouchableOpacity
          style={styles.historiaToggle}
          onPress={() => setHistoryExpanded(e => !e)}
        >
          <Text style={styles.historiaTitleText}>Historia służb</Text>
          <Ionicons
            name={historyExpanded ? 'chevron-up' : 'chevron-down'}
            size={16} color="#888"
          />
        </TouchableOpacity>

        {historyExpanded && pastAssignments.map((schedule: any) => (
          <ScheduleTile
            key={schedule.id}
            schedule={schedule}
            checkingIn={false}
            signingUp={false}
            unsigning={false}
            reporting={false}
            onCheckIn={() => {}}
            onSignUp={() => {}}
            onUnsign={() => {}}
            onReportAbsence={() => {}}
          />
        ))}
      </ScrollView>

      {/* Absence modal */}
      <Modal visible={absenceModal.visible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Zgłoś nieobecność</Text>
            <Text style={styles.modalSubtitle}>{absenceModal.title}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Powód nieobecności..."
              placeholderTextColor="#aaa"
              multiline
              value={absenceModal.reason}
              onChangeText={r => setAbsenceModal(m => ({ ...m, reason: r }))}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setAbsenceModal({ visible: false, assignmentId: '', title: '', reason: '' })}
              >
                <Text style={styles.modalBtnCancelText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnSubmit]}
                onPress={() => reportAbsence(absenceModal.assignmentId, absenceModal.reason)}
                disabled={!absenceModal.reason.trim() || !!reportingAbsenceId}
              >
                {reportingAbsenceId
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.modalBtnSubmitText}>Zgłoś</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}
```

- [ ] **Step 2: Add remaining styles**

Append to `StyleSheet.create`:

```typescript
  dayHeader: { fontSize: 16, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
  historiaToggle: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 8, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 10,
  },
  historiaTitleText: { fontSize: 13, fontWeight: '700', color: '#888' },
  modalOverlay: {
    flex: 1, backgroundColor: '#00000044', justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, gap: 12,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#1a1a1a' },
  modalSubtitle: { fontSize: 14, color: '#888' },
  modalInput: {
    backgroundColor: '#f5f5f5', borderRadius: 10, padding: 12,
    fontSize: 14, color: '#1a1a1a', minHeight: 80, textAlignVertical: 'top',
  },
  modalBtns: { flexDirection: 'row', gap: 10 },
  modalBtn: { flex: 1, borderRadius: 10, padding: 13, alignItems: 'center' },
  modalBtnCancel: { backgroundColor: '#f0f0f0' },
  modalBtnCancelText: { fontSize: 14, fontWeight: '600', color: '#888' },
  modalBtnSubmit: { backgroundColor: '#e74c3c' },
  modalBtnSubmitText: { fontSize: 14, fontWeight: '700', color: '#fff' },
```

- [ ] **Step 3: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Manual test — unified view**

Run the app. Open the Grafik (schedule) tab as a member.

Verify:
1. Week strip renders with 7 days, today highlighted
2. Tapping a different day shows that day's events
3. Week navigation arrows change the week
4. A scheduled mass shows correctly (title, time, category badge)
5. A mass you're signed up for shows DYŻUR badge + "Wypisz się" button
6. A mass you're not signed up for shows "Zapisz się" button
7. Tapping "Zapisz się" shows jednorazowo/cyklicznie alert
8. Signing up shows DYŻUR badge after refresh
9. During a check-in window, an assigned mass shows green "Obecny" button
10. Tapping "Obecny" triggers the RPC, shows "+N pkt" alert, tile shows OBECNY badge
11. Historia section expands/collapses

- [ ] **Step 5: Commit**

```bash
git add app/(tabs)/schedule.tsx
git commit -m "feat: unified schedule view with week strip and auto check-in points"
```

---

## Task 8: Final Polish and Cleanup

**Files:**
- Modify: `app/(tabs)/schedule.tsx` — verify no dead imports remain

- [ ] **Step 1: Fix imports at top of `schedule.tsx`**

After the rewrites, update the imports block:
- Remove: `Calendar, LocaleConfig` from `react-native-calendars` (calendar tab removed)
- Remove: `MassTemplate` import (mass_templates fetch removed)
- Add `AssignmentStatus` to the `types/database` import line:

```typescript
import { CATEGORY_CONFIG, ScheduleCategory, AssignmentStatus } from '../../types/database'
```

```bash
npx tsc --noEmit
```

Fix any "declared but never read" warnings.

- [ ] **Step 2: Smoke test all member screens**

Run the app. Check that realtime updates still work:
1. Admin marks a member present → member's tile updates without refresh
2. Admin awards points manually → member's Points tab updates

- [ ] **Step 3: Final commit**

```bash
git add app/(tabs)/schedule.tsx
git commit -m "chore: remove unused imports from schedule after auto-points refactor"
```
