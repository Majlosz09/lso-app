# Parish Data Isolation — RLS + Frontend Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zapewnić pełną izolację danych między parafiami — każdy admin/ministrant/rodzic widzi tylko dane swojej parafii, na dwóch poziomach: RLS w Supabase (serwer) i filtry parish_id w kodzie frontendowym (klient).

**Architecture:** Warstwa 1 — jedna migracja SQL włączająca Row Level Security na wszystkich tabelach bez RLS, z dwoma funkcjami pomocniczymi (`my_parish_id()`, `is_parish_admin()`). Warstwa 2 — minimalne zmiany w 5 plikach frontendowych uzupełniające brakujące filtry parish_id i pole parish_id w insertach.

**Tech Stack:** Supabase (PostgreSQL 15 + RLS), Expo/React Native, TypeScript, Zustand (`useAuthStore`)

---

## Mapa plików

| Akcja | Plik | Zmiana |
|-------|------|--------|
| Utwórz | `supabase/migrations/20260529000000_parish_rls.sql` | Pełna migracja RLS |
| Modyfikuj | `app/(admin)/schedule-day.tsx` | Import `useAuthStore` + filtr `parish_id` w zapytaniu |
| Modyfikuj | `app/(admin)/schedules.tsx` | Import `useAuthStore` + filtr `parish_id` w zapytaniu |
| Modyfikuj | `app/(admin)/schedule-detail.tsx` | Filtr `parish_id` w `openAddModal` (pobieranie listy ministranckich) |
| Modyfikuj | `app/(admin)/member-detail.tsx` | Filtr `parish_id` w zapytaniu do `points` |
| Modyfikuj | `app/(tabs)/announcements.tsx` | Dodanie pola `parish_id` do insertu ogłoszenia |

---

## Task 1: Utwórz migrację SQL z RLS

**Files:**
- Create: `supabase/migrations/20260529000000_parish_rls.sql`

- [ ] **Krok 1: Utwórz plik migracji**

Utwórz plik `supabase/migrations/20260529000000_parish_rls.sql` z poniższą zawartością:

```sql
-- Parish data isolation: Row Level Security dla wszystkich tabel danych

-- ============================================================
-- Funkcje pomocnicze (SECURITY DEFINER omija RLS — bezpieczne)
-- ============================================================

-- Zwraca parish_id zalogowanego użytkownika
CREATE OR REPLACE FUNCTION my_parish_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT parish_id FROM profiles WHERE id = auth.uid()
$$;

-- Sprawdza czy zalogowany user jest adminem swojej parafii
CREATE OR REPLACE FUNCTION is_parish_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS(
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND (role = 'admin' OR is_admin = true)
  )
$$;

-- ============================================================
-- profiles
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Własny profil ALBO inni z tej samej parafii
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (
    id = auth.uid() OR parish_id = my_parish_id()
  );

-- Tylko własny profil można inserować (rejestracja)
CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- Własny profil ALBO admin tej samej parafii
CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE USING (
    id = auth.uid()
    OR (is_parish_admin() AND parish_id = my_parish_id())
  ) WITH CHECK (
    id = auth.uid()
    OR (is_parish_admin() AND parish_id = my_parish_id())
  );

-- ============================================================
-- schedules
-- ============================================================
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedules_select" ON schedules
  FOR SELECT USING (parish_id = my_parish_id());

CREATE POLICY "schedules_insert" ON schedules
  FOR INSERT WITH CHECK (parish_id = my_parish_id() AND is_parish_admin());

CREATE POLICY "schedules_update" ON schedules
  FOR UPDATE USING (parish_id = my_parish_id() AND is_parish_admin())
  WITH CHECK (parish_id = my_parish_id() AND is_parish_admin());

CREATE POLICY "schedules_delete" ON schedules
  FOR DELETE USING (parish_id = my_parish_id() AND is_parish_admin());

-- ============================================================
-- schedule_assignments (brak parish_id — filtruj przez schedules)
-- ============================================================
ALTER TABLE schedule_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedule_assignments_select" ON schedule_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM schedules s
      WHERE s.id = schedule_assignments.schedule_id
        AND s.parish_id = my_parish_id()
    )
  );

CREATE POLICY "schedule_assignments_insert" ON schedule_assignments
  FOR INSERT WITH CHECK (
    is_parish_admin()
    AND EXISTS (
      SELECT 1 FROM schedules s
      WHERE s.id = schedule_assignments.schedule_id
        AND s.parish_id = my_parish_id()
    )
  );

-- Własny check-in (profile_id = auth.uid()) ALBO admin parafii
CREATE POLICY "schedule_assignments_update" ON schedule_assignments
  FOR UPDATE USING (
    profile_id = auth.uid()
    OR (
      is_parish_admin()
      AND EXISTS (
        SELECT 1 FROM schedules s
        WHERE s.id = schedule_assignments.schedule_id
          AND s.parish_id = my_parish_id()
      )
    )
  ) WITH CHECK (
    profile_id = auth.uid()
    OR (
      is_parish_admin()
      AND EXISTS (
        SELECT 1 FROM schedules s
        WHERE s.id = schedule_assignments.schedule_id
          AND s.parish_id = my_parish_id()
      )
    )
  );

CREATE POLICY "schedule_assignments_delete" ON schedule_assignments
  FOR DELETE USING (
    is_parish_admin()
    AND EXISTS (
      SELECT 1 FROM schedules s
      WHERE s.id = schedule_assignments.schedule_id
        AND s.parish_id = my_parish_id()
    )
  );

-- ============================================================
-- attendance
-- ============================================================
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attendance_select" ON attendance
  FOR SELECT USING (parish_id = my_parish_id());

-- Własna obecność (check-in) ALBO admin parafii
CREATE POLICY "attendance_insert" ON attendance
  FOR INSERT WITH CHECK (
    parish_id = my_parish_id()
    AND (profile_id = auth.uid() OR is_parish_admin())
  );

CREATE POLICY "attendance_update" ON attendance
  FOR UPDATE USING (parish_id = my_parish_id() AND is_parish_admin())
  WITH CHECK (parish_id = my_parish_id() AND is_parish_admin());

CREATE POLICY "attendance_delete" ON attendance
  FOR DELETE USING (parish_id = my_parish_id() AND is_parish_admin());

-- ============================================================
-- points
-- ============================================================
ALTER TABLE points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "points_select" ON points
  FOR SELECT USING (parish_id = my_parish_id());

CREATE POLICY "points_insert" ON points
  FOR INSERT WITH CHECK (parish_id = my_parish_id() AND is_parish_admin());

CREATE POLICY "points_update" ON points
  FOR UPDATE USING (parish_id = my_parish_id() AND is_parish_admin())
  WITH CHECK (parish_id = my_parish_id() AND is_parish_admin());

CREATE POLICY "points_delete" ON points
  FOR DELETE USING (parish_id = my_parish_id() AND is_parish_admin());

-- ============================================================
-- announcements
-- ============================================================
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "announcements_select" ON announcements
  FOR SELECT USING (parish_id = my_parish_id());

CREATE POLICY "announcements_insert" ON announcements
  FOR INSERT WITH CHECK (parish_id = my_parish_id() AND is_parish_admin());

CREATE POLICY "announcements_update" ON announcements
  FOR UPDATE USING (parish_id = my_parish_id() AND is_parish_admin())
  WITH CHECK (parish_id = my_parish_id() AND is_parish_admin());

CREATE POLICY "announcements_delete" ON announcements
  FOR DELETE USING (parish_id = my_parish_id() AND is_parish_admin());

-- ============================================================
-- point_rules
-- ============================================================
ALTER TABLE point_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "point_rules_select" ON point_rules
  FOR SELECT USING (parish_id = my_parish_id());

CREATE POLICY "point_rules_admin_write" ON point_rules
  FOR ALL USING (parish_id = my_parish_id() AND is_parish_admin())
  WITH CHECK (parish_id = my_parish_id() AND is_parish_admin());

-- ============================================================
-- mass_templates
-- ============================================================
ALTER TABLE mass_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mass_templates_select" ON mass_templates
  FOR SELECT USING (parish_id = my_parish_id());

CREATE POLICY "mass_templates_admin_write" ON mass_templates
  FOR ALL USING (parish_id = my_parish_id() AND is_parish_admin())
  WITH CHECK (parish_id = my_parish_id() AND is_parish_admin());

-- ============================================================
-- ranks (parish_id nullable — systemowe rangi mają NULL)
-- ============================================================
ALTER TABLE ranks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ranks_select" ON ranks
  FOR SELECT USING (
    parish_id IS NULL OR parish_id = my_parish_id()
  );

-- Admin może zarządzać tylko własnymi rangami parafii (nie systemowymi)
CREATE POLICY "ranks_admin_write" ON ranks
  FOR ALL USING (
    parish_id = my_parish_id() AND is_parish_admin()
  ) WITH CHECK (
    parish_id = my_parish_id() AND is_parish_admin()
  );
```

- [ ] **Krok 2: Zweryfikuj plik**

Sprawdź że plik istnieje i ma oczekiwaną liczbę linii:

```bash
wc -l supabase/migrations/20260529000000_parish_rls.sql
```

Oczekiwany wynik: ok. 180 linii

---

## Task 2: Zastosuj migrację w Supabase

**Files:**
- (brak zmian w plikach — operacja na bazie danych)

- [ ] **Krok 1: Zaloguj się do Supabase i zastosuj migrację**

```bash
cd lso-app
npx supabase db push
```

Jeśli pojawi się błąd `supabase not found` — użyj:
```bash
npx supabase login
npx supabase link --project-ref <TWOJE_PROJECT_REF>
npx supabase db push
```

Project ref znajdziesz na dashboardzie Supabase w Settings > General.

Oczekiwany wynik: `Applying migration 20260529000000_parish_rls.sql...` bez błędów.

- [ ] **Krok 2: Zweryfikuj przez SQL Editor w Supabase Dashboard**

W Supabase Dashboard > SQL Editor uruchom:

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'profiles', 'schedules', 'schedule_assignments',
    'attendance', 'points', 'announcements',
    'point_rules', 'mass_templates', 'ranks'
  );
```

Oczekiwany wynik: `rowsecurity = true` dla wszystkich 9 tabel.

---

## Task 3: Napraw `schedule-day.tsx` — dodaj filtr parish_id

**Files:**
- Modify: `app/(admin)/schedule-day.tsx:1-11` (importy) i `:30-41` (useEffect z zapytaniem)

- [ ] **Krok 1: Dodaj import `useAuthStore` i odczyt profilu**

Plik: `app/(admin)/schedule-day.tsx`

Zmień linię 10 (import `useTheme`):
```typescript
// PRZED:
import { useTheme } from '../../lib/ThemeContext'

// PO:
import { useTheme } from '../../lib/ThemeContext'
import { useAuthStore } from '../../stores/authStore'
```

- [ ] **Krok 2: Dodaj `profile` z authStore i filtr parish_id do zapytania**

W funkcji `ScheduleDayScreen()`, po linii `const { colors: c, isDark } = useTheme()`:

```typescript
// PRZED — brak useAuthStore, brak parish_id
export default function ScheduleDayScreen() {
  const { date } = useLocalSearchParams<{ date: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { colors: c, isDark } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
  const [schedules, setSchedules] = useState<DaySchedule[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!date) return
    supabase
      .from('schedules')
      .select('id, title, time, category, schedule_assignments(profile:profiles(full_name))')
      .eq('date', date)
      .order('time')
      .then(({ data }) => {
        setSchedules((data ?? []) as unknown as DaySchedule[])
        setLoading(false)
      })
  }, [date])
```

```typescript
// PO — z useAuthStore i filtrem parish_id
export default function ScheduleDayScreen() {
  const { date } = useLocalSearchParams<{ date: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { colors: c, isDark } = useTheme()
  const { profile } = useAuthStore()
  const styles = useMemo(() => createStyles(c), [c])
  const [schedules, setSchedules] = useState<DaySchedule[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!date || !profile?.parish_id) return
    supabase
      .from('schedules')
      .select('id, title, time, category, schedule_assignments(profile:profiles(full_name))')
      .eq('date', date)
      .eq('parish_id', profile.parish_id)
      .order('time')
      .then(({ data }) => {
        setSchedules((data ?? []) as unknown as DaySchedule[])
        setLoading(false)
      })
  }, [date, profile?.parish_id])
```

- [ ] **Krok 3: Sprawdź TypeScript**

```bash
cd lso-app && npx tsc --noEmit 2>&1 | grep "schedule-day"
```

Oczekiwany wynik: brak błędów.

---

## Task 4: Napraw `schedules.tsx` — dodaj filtr parish_id

**Files:**
- Modify: `app/(admin)/schedules.tsx:1-13` (importy) i `:25-33` (fetchSchedules)

- [ ] **Krok 1: Dodaj import `useAuthStore` i odczyt profilu**

Plik: `app/(admin)/schedules.tsx`

Po linii `import { useTheme } from '../../lib/ThemeContext'` dodaj:
```typescript
import { useAuthStore } from '../../stores/authStore'
```

- [ ] **Krok 2: Dodaj `profile` i filtr parish_id**

W `AdminSchedules()`, po `const { colors: c } = useTheme()` dodaj:
```typescript
const { profile } = useAuthStore()
```

Zmień funkcję `fetchSchedules`:
```typescript
// PRZED:
const fetchSchedules = async () => {
  const { data, error } = await supabase
    .from('schedules')
    .select('*, group:groups(name)')
    .order('date', { ascending: false })

  if (!error && data) setSchedules(data)
  setLoading(false)
  setRefreshing(false)
}
```

```typescript
// PO:
const fetchSchedules = async () => {
  if (!profile?.parish_id) return
  const { data, error } = await supabase
    .from('schedules')
    .select('*, group:groups(name)')
    .eq('parish_id', profile.parish_id)
    .order('date', { ascending: false })

  if (!error && data) setSchedules(data)
  setLoading(false)
  setRefreshing(false)
}
```

Zmień też `useEffect` żeby reloadował gdy zmieni się `profile?.parish_id`:
```typescript
// PRZED:
useEffect(() => { fetchSchedules() }, [])

// PO:
useEffect(() => { fetchSchedules() }, [profile?.parish_id])
```

- [ ] **Krok 3: Sprawdź TypeScript**

```bash
cd lso-app && npx tsc --noEmit 2>&1 | grep "schedules"
```

Oczekiwany wynik: brak błędów.

---

## Task 5: Napraw `schedule-detail.tsx` — filtr parish_id w liście ministranckich

**Files:**
- Modify: `app/(admin)/schedule-detail.tsx:124-130` (funkcja `openAddModal`)

Obecny kod (linia 124-130):
```typescript
const openAddModal = async () => {
  const { data } = await supabase
    .from('profiles').select('id, full_name')
    .eq('role', 'member').eq('is_active', true).order('full_name')
  setAllMembers(data ?? [])
  setAddSearch('')
  setAddModalVisible(true)
}
```

- [ ] **Krok 1: Dodaj filtr `parish_id` do pobierania listy ministranckich**

`adminProfile` jest już dostępny w tym komponencie (linia 43: `const { profile: adminProfile } = useAuthStore()`).

```typescript
// PO:
const openAddModal = async () => {
  const { data } = await supabase
    .from('profiles').select('id, full_name')
    .eq('parish_id', adminProfile!.parish_id)
    .eq('role', 'member').eq('is_active', true).order('full_name')
  setAllMembers(data ?? [])
  setAddSearch('')
  setAddModalVisible(true)
}
```

- [ ] **Krok 2: Sprawdź TypeScript**

```bash
cd lso-app && npx tsc --noEmit 2>&1 | grep "schedule-detail"
```

Oczekiwany wynik: brak błędów.

---

## Task 6: Napraw `app/(tabs)/announcements.tsx` — dodaj parish_id do insertu

**Files:**
- Modify: `app/(tabs)/announcements.tsx:62-80` (funkcja `handleCreate`)

Obecny insert (linia 66-70):
```typescript
const { error } = await supabase.from('announcements').insert({
  title: newTitle.trim(),
  content: newContent.trim(),
  author_id: profile?.id,
  is_pinned: isPinned,
})
```

Brakuje `parish_id` — po włączeniu RLS ten insert zwróci błąd policy violation.

- [ ] **Krok 1: Dodaj `parish_id` do insertu ogłoszenia**

```typescript
// PO:
const { error } = await supabase.from('announcements').insert({
  title: newTitle.trim(),
  content: newContent.trim(),
  author_id: profile?.id,
  is_pinned: isPinned,
  parish_id: profile?.parish_id,
})
```

- [ ] **Krok 2: Sprawdź TypeScript**

```bash
cd lso-app && npx tsc --noEmit 2>&1 | grep "announcements"
```

Oczekiwany wynik: brak błędów.

---

## Task 7: Napraw `member-detail.tsx` — dodaj filtr parish_id do punktów

**Files:**
- Modify: `app/(admin)/member-detail.tsx:119-123` (zapytanie do `points`)

Obecny kod:
```typescript
supabase.from('points')
  .select('id, amount, reason, created_at')
  .eq('profile_id', id)
  .order('created_at', { ascending: false })
  .limit(10),
```

`adminProfile` jest dostępny (linia 44: `const { profile: adminProfile } = useAuthStore()`).

- [ ] **Krok 1: Dodaj filtr `parish_id` do zapytania punktów**

```typescript
// PO:
supabase.from('points')
  .select('id, amount, reason, created_at')
  .eq('profile_id', id)
  .eq('parish_id', adminProfile!.parish_id)
  .order('created_at', { ascending: false })
  .limit(10),
```

- [ ] **Krok 2: Sprawdź TypeScript**

```bash
cd lso-app && npx tsc --noEmit 2>&1 | grep "member-detail"
```

Oczekiwany wynik: brak błędów.

---

## Task 8: Finalna weryfikacja TypeScript i uruchomienie

**Files:**
- (brak zmian — tylko weryfikacja)

- [ ] **Krok 1: Pełny TypeScript check**

```bash
cd lso-app && npx tsc --noEmit 2>&1
```

Oczekiwany wynik: 0 błędów.

- [ ] **Krok 2: Uruchom testy jednostkowe**

```bash
cd lso-app && npx jest --passWithNoTests 2>&1 | tail -20
```

Oczekiwany wynik: wszystkie testy przechodzą (lub brak testów).

- [ ] **Krok 3: Ręczna weryfikacja izolacji w Supabase SQL Editor**

W Supabase Dashboard > SQL Editor przetestuj polityki jako konkretny user:

```sql
-- Podstaw UUID prawdziwego usera z parafii A
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claim.sub TO '<UUID_USER_Z_PARAFII_A>';

-- Powinno zwrócić TYLKO służby parafii A
SELECT id, title, parish_id FROM schedules LIMIT 5;

-- Powinno zwrócić TYLKO punkty parafii A
SELECT id, amount, parish_id FROM points LIMIT 5;
```

Oczekiwany wynik: wszystkie rekordy mają ten sam `parish_id` co testowany user.

- [ ] **Krok 4: Sprawdź czy aplikacja uruchamia się bez błędów**

```bash
cd lso-app && npx expo start --no-dev 2>&1 | head -30
```

Oczekiwany wynik: brak runtime errors, metro bundler startuje poprawnie.
