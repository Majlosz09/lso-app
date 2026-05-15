# Realtime Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dodanie automatycznego odświeżania UI przez Supabase Realtime na czterech głównych ekranach ministranta (Ogłoszenia, Dyżur, Dom, Punkty).

**Architecture:** Reużywalny hook `useRealtimeTable(table, onUpdate)` subskrybuje postgres_changes na konkretnej tabeli Supabase. Każdy ekran wywołuje hook ze swoją tabelą i funkcją fetch. Gdy baza danych zmienia się, Supabase wysyła zdarzenie przez WebSocket, hook wywołuje re-fetch. Brak parsowania payloadu — zawsze pełny re-fetch.

**Tech Stack:** Supabase JS v2 Realtime channels (`.channel().on('postgres_changes',...)`), React hooks (`useEffect`, `useRef`), Expo Router / React Native

---

## File Structure

- **Create:** `hooks/useRealtimeTable.ts` — wielokrotnego użytku hook Realtime
- **Modify:** `app/(tabs)/announcements.tsx` — dodać import + 1 linia hooka
- **Modify:** `app/(tabs)/points.tsx` — dodać import + 1 linia hooka
- **Modify:** `app/(tabs)/schedule.tsx` — dodać import + 1 linia hooka (w `MemberScheduleView`)
- **Modify:** `app/(tabs)/index.tsx` — wyekstrahować fetch do named function + import + 1 linia hooka (w `MemberHomeView`)

---

## Prerequisite: Włącz Realtime w Supabase Dashboard

Zanim zaczniesz kodować, włącz Realtime dla tabel w Supabase Dashboard:

1. Otwórz Supabase Dashboard → **Database** → **Replication**
2. W sekcji "supabase_realtime" upewnij się że tabele `announcements`, `schedule_assignments`, `points` są włączone (toggle ON)
3. Alternatywnie: Table Editor → wybierz tabelę → górny pasek → **Realtime** toggle ON

Bez tego krok `postgres_changes` nie będzie dostarczać zdarzeń.

---

### Task 1: Hook `useRealtimeTable`

**Files:**
- Create: `hooks/useRealtimeTable.ts`

- [ ] **Step 1: Utwórz plik hooka**

Utwórz plik `hooks/useRealtimeTable.ts` z następującą zawartością:

```ts
import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

export function useRealtimeTable(table: string, onUpdate: () => void) {
  const ref = useRef(onUpdate)
  ref.current = onUpdate

  useEffect(() => {
    const channel = supabase
      .channel(`realtime-${table}-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        ref.current()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [table])
}
```

**Dlaczego `useRef`:** `onUpdate` to nowy obiekt przy każdym renderze (closures). Gdybyśmy podali go do deps tablicy `useEffect`, kanał byłby rekreowany przy każdym renderze. `useRef` zapamiętuje aktualną referencję bez triggerowania efektu.

**Dlaczego `Date.now()` w nazwie kanału:** Supabase wymaga unikalnych nazw kanałów. `Date.now()` przy montowaniu komponentu zapewnia unikalność gdy ten sam hook jest używany na wielu ekranach jednocześnie.

- [ ] **Step 2: Zweryfikuj że plik istnieje**

Sprawdź w eksploratorze plików lub uruchom:
```
ls hooks/
```
Oczekiwane: `useRealtimeTable.ts`

- [ ] **Step 3: Commit**

```bash
git add hooks/useRealtimeTable.ts
git commit -m "feat: add useRealtimeTable hook for Supabase Realtime"
```

---

### Task 2: Realtime — Ogłoszenia (`app/(tabs)/announcements.tsx`)

**Files:**
- Modify: `app/(tabs)/announcements.tsx`

`fetchAnnouncements` jest już zdefiniowany jako named `const` w `AnnouncementsScreen` (linia ~27). Wystarczy dodać import i jedną linię hooka.

- [ ] **Step 1: Dodaj import**

W `app/(tabs)/announcements.tsx`, na końcu bloku importów, dodaj:

```ts
import { useRealtimeTable } from '../../hooks/useRealtimeTable'
```

- [ ] **Step 2: Dodaj wywołanie hooka**

W `AnnouncementsScreen`, bezpośrednio po linii:
```ts
useEffect(() => { fetchAnnouncements() }, [])
```
dodaj:
```ts
useRealtimeTable('announcements', fetchAnnouncements)
```

- [ ] **Step 3: Zweryfikuj manualnie**

Uruchom aplikację: `npx expo start`
- Zaloguj się jako ministrant, otwórz zakładkę **Ogłoszenia**
- W Supabase Dashboard → Table Editor → `announcements` → Insert row (wypełnij `title`, `content`, `author_id`, `target_audience: 'all'`)
- Ogłoszenie powinno pojawić się na ekranie automatycznie w ciągu 1–2 sekund, bez pull-to-refresh

- [ ] **Step 4: Commit**

```bash
git add "app/(tabs)/announcements.tsx"
git commit -m "feat: add realtime updates to announcements screen"
```

---

### Task 3: Realtime — Punkty (`app/(tabs)/points.tsx`)

**Files:**
- Modify: `app/(tabs)/points.tsx`

Funkcja fetch w `PointsScreen` nazywa się `fetchData` (linia ~39) i pobiera `points`, `points_summary` i ranking.

- [ ] **Step 1: Dodaj import**

W `app/(tabs)/points.tsx`, na końcu bloku importów, dodaj:

```ts
import { useRealtimeTable } from '../../hooks/useRealtimeTable'
```

- [ ] **Step 2: Dodaj wywołanie hooka**

W `PointsScreen`, bezpośrednio po linii:
```ts
useEffect(() => { fetchData() }, [profile?.id])
```
dodaj:
```ts
useRealtimeTable('points', fetchData)
```

- [ ] **Step 3: Zweryfikuj manualnie**

- Otwórz zakładkę **Punkty**
- W Supabase Dashboard → Table Editor → `points` → Insert row (`profile_id` zalogowanego ministranta, `amount: 5`, `reason: 'Test'`)
- Historia punktów i ranking powinny zaktualizować się automatycznie

- [ ] **Step 4: Commit**

```bash
git add "app/(tabs)/points.tsx"
git commit -m "feat: add realtime updates to points screen"
```

---

### Task 4: Realtime — Dyżur (`app/(tabs)/schedule.tsx`)

**Files:**
- Modify: `app/(tabs)/schedule.tsx`

`MemberScheduleView` ma dwie funkcje fetch: `fetchMine` (linia ~227) i `fetchSignup` (linia ~289). Obie subskrybują tę samą tabelę `schedule_assignments`. Przekazujemy wrapper callback który wywołuje obie.

- [ ] **Step 1: Dodaj import**

W `app/(tabs)/schedule.tsx`, na końcu bloku importów, dodaj:

```ts
import { useRealtimeTable } from '../../hooks/useRealtimeTable'
```

- [ ] **Step 2: Zlokalizuj właściwe miejsce w `MemberScheduleView`**

W pliku znajdź funkcję `MemberScheduleView`. Wewnątrz niej są dwa `useEffect` — jeden wywołuje `fetchMine()`, drugi `fetchSignup()`. Bezpośrednio po tych `useEffect`-ach dodaj:

```ts
useRealtimeTable('schedule_assignments', () => { fetchMine(); fetchSignup() })
```

- [ ] **Step 3: Zweryfikuj manualnie**

- Otwórz zakładkę **Dyżur** → podzakładka **Moje służby**
- W Supabase Dashboard → Table Editor → `schedule_assignments` → znajdź wiersz zalogowanego ministranta i zmień status
- Karta służby powinna zaktualizować status automatycznie

- [ ] **Step 4: Commit**

```bash
git add "app/(tabs)/schedule.tsx"
git commit -m "feat: add realtime updates to schedule screen"
```

---

### Task 5: Realtime — Dom (`app/(tabs)/index.tsx`)

**Files:**
- Modify: `app/(tabs)/index.tsx`

`MemberHomeView` ma fetch inline w `useEffect` (linie 58–91) — brak named function. Należy wyekstrahować go do `const fetchData = async () => {...}` i potem wywołać zarówno w `useEffect`, jak i przez `useRealtimeTable`.

- [ ] **Step 1: Wyekstrahuj fetch do named function**

W `app/(tabs)/index.tsx`, w komponencie `MemberHomeView`, znajdź obecny `useEffect` (linie 58–91):

```ts
useEffect(() => {
  if (!profile?.id || !profile?.parish_id) return
  Promise.all([
    supabase.from('points_summary').select('total_points, services_count').eq('profile_id', profile.id).maybeSingle(),
    supabase.from('points_summary').select('profile_id').order('total_points', { ascending: false }),
    supabase.from('schedule_assignments')
      .select('id, status, schedule:schedules(id, title, date, time, category)')
      .eq('profile_id', profile.id)
      .gte('schedule.date', today)
      .order('schedule(date)', { ascending: true })
      .order('schedule(time)', { ascending: true })
      .limit(5),
    supabase.from('mass_templates')
      .select('*')
      .eq('parish_id', profile.parish_id)
      .order('day_of_week').order('time'),
    supabase.from('schedules')
      .select('*, group:groups(name)')
      .gte('date', today)
      .lte('date', days[days.length - 1])
      .order('date').order('time'),
  ]).then(([summaryRes, rankingRes, nextRes, templatesRes, schedulesRes]) => {
    if (summaryRes.data) setSummary(summaryRes.data as any)
    if (rankingRes.data) {
      const pos = (rankingRes.data as any[]).findIndex(r => r.profile_id === profile.id) + 1
      setRankPos(pos)
    }
    const valid = (nextRes.data ?? []).filter((a: any) => a.schedule !== null)
    setNextDuties(valid.slice(0, 3))
    setMassTemplates((templatesRes.data as MassTemplate[]) ?? [])
    setUpcomingSchedules(schedulesRes.data ?? [])
    setLoading(false)
  })
}, [profile?.id])
```

Zastąp go następującym kodem (ta sama logika, wyekstrahowana do `fetchData`):

```ts
const fetchData = async () => {
  if (!profile?.id || !profile?.parish_id) return
  const [summaryRes, rankingRes, nextRes, templatesRes, schedulesRes] = await Promise.all([
    supabase.from('points_summary').select('total_points, services_count').eq('profile_id', profile.id).maybeSingle(),
    supabase.from('points_summary').select('profile_id').order('total_points', { ascending: false }),
    supabase.from('schedule_assignments')
      .select('id, status, schedule:schedules(id, title, date, time, category)')
      .eq('profile_id', profile.id)
      .gte('schedule.date', today)
      .order('schedule(date)', { ascending: true })
      .order('schedule(time)', { ascending: true })
      .limit(5),
    supabase.from('mass_templates')
      .select('*')
      .eq('parish_id', profile.parish_id)
      .order('day_of_week').order('time'),
    supabase.from('schedules')
      .select('*, group:groups(name)')
      .gte('date', today)
      .lte('date', days[days.length - 1])
      .order('date').order('time'),
  ])
  if (summaryRes.data) setSummary(summaryRes.data as any)
  if (rankingRes.data) {
    const pos = (rankingRes.data as any[]).findIndex(r => r.profile_id === profile.id) + 1
    setRankPos(pos)
  }
  const valid = (nextRes.data ?? []).filter((a: any) => a.schedule !== null)
  setNextDuties(valid.slice(0, 3))
  setMassTemplates((templatesRes.data as MassTemplate[]) ?? [])
  setUpcomingSchedules(schedulesRes.data ?? [])
  setLoading(false)
}

useEffect(() => { fetchData() }, [profile?.id])
```

- [ ] **Step 2: Dodaj import i wywołanie hooka**

Na końcu bloku importów dodaj:

```ts
import { useRealtimeTable } from '../../hooks/useRealtimeTable'
```

Po `useEffect(() => { fetchData() }, [profile?.id])` dodaj:

```ts
useRealtimeTable('schedule_assignments', fetchData)
```

- [ ] **Step 3: Zweryfikuj manualnie**

- Otwórz zakładkę **Dom**
- W Supabase Dashboard → `schedule_assignments` → zmień status wiersza należącego do zalogowanego ministranta
- Sekcja "Nadchodzące służby" powinna zaktualizować się automatycznie

- [ ] **Step 4: Commit**

```bash
git add "app/(tabs)/index.tsx"
git commit -m "feat: add realtime updates to home screen"
```
