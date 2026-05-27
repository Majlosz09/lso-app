# Formation & Badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dodać progress bar stopni formacyjnych na profilu ministranta oraz system odznak automatycznych i ręcznych, zarządzany przez admina.

**Architecture:** Dwie nowe tabele Supabase (`badge_definitions`, `member_badges`) + nowa lib `lib/badges.ts` z czystymi funkcjami obliczeniowymi i funkcją synchronizacji fire-and-forget. UI: progress bar w `profile.tsx`, zakładka odznak w `member-detail.tsx`, nowy ekran `badge-management.tsx`.

**Tech Stack:** Supabase (PostgreSQL, RLS), React Native, Expo Router, TypeScript, Jest

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/20260527000000_badges.sql` | Create | Tabele badge_definitions + member_badges, RLS, seed danych systemowych |
| `types/database.ts` | Modify | Dodaj typy BadgeDefinition, MemberBadge |
| `lib/badges.ts` | Create | computeAutoStatusBadges, computeAutoPermanentBadges, computeAndSyncBadges |
| `__tests__/lib/badges.test.ts` | Create | Unit testy dla funkcji obliczeniowych |
| `app/(tabs)/profile.tsx` | Modify | FormationSection + BadgesSection w MemberProfile |
| `app/(admin)/member-detail.tsx` | Modify | Sekcja odznak + bottom sheet przyznawania |
| `app/(admin)/badge-management.tsx` | Create | Nowy ekran: custom odznaki + historia przyznanych |
| `app/(admin)/_layout.tsx` | Modify | Dodaj Stack.Screen dla badge-management |
| `app/(admin)/(admin-tabs)/index.tsx` | Modify | Dodaj kafelek Odznaki w sekcji Ustawienia |

---

### Task 1: Migracja bazy danych + typy TypeScript

**Files:**
- Create: `supabase/migrations/20260527000000_badges.sql`
- Modify: `types/database.ts`

- [ ] **Step 1: Utwórz plik migracji**

Plik: `supabase/migrations/20260527000000_badges.sql`

```sql
-- Definicje odznak (system: parish_id NULL, custom: parish_id ustawione)
create table badge_definitions (
  id           uuid primary key default gen_random_uuid(),
  parish_id    uuid references parishes(id) on delete cascade,
  name         text not null,
  icon         text not null,
  type         text not null check (type in ('auto', 'manual')),
  persistence  text not null check (persistence in ('status', 'permanent')),
  criteria_key text not null,
  created_at   timestamptz default now()
);

-- Odznaki przyznane członkom
create table member_badges (
  id                  uuid primary key default gen_random_uuid(),
  profile_id          uuid references profiles(id) on delete cascade not null,
  badge_definition_id uuid references badge_definitions(id) on delete cascade not null,
  awarded_at          timestamptz default now(),
  awarded_by          uuid references profiles(id),
  note                text,
  is_active           boolean default true,
  unique (profile_id, badge_definition_id)
);

-- RLS
alter table badge_definitions enable row level security;
alter table member_badges enable row level security;

-- badge_definitions: widoczne dla wszystkich z tej samej parafii (lub systemowe)
create policy "badge_definitions_select" on badge_definitions
  for select using (
    parish_id is null
    or parish_id in (
      select parish_id from profiles where id = auth.uid()
    )
  );

-- badge_definitions: admin może zarządzać własnymi odznakami parafii
create policy "badge_definitions_admin_write" on badge_definitions
  for all using (
    parish_id in (
      select parish_id from profiles
      where id = auth.uid() and (role = 'admin' or is_admin = true)
    )
  ) with check (
    parish_id in (
      select parish_id from profiles
      where id = auth.uid() and (role = 'admin' or is_admin = true)
    )
  );

-- member_badges: widoczne dla właściciela lub admina tej samej parafii
create policy "member_badges_select" on member_badges
  for select using (
    profile_id = auth.uid()
    or exists (
      select 1 from profiles a, profiles m
      where a.id = auth.uid()
        and (a.role = 'admin' or a.is_admin = true)
        and m.id = member_badges.profile_id
        and a.parish_id = m.parish_id
    )
  );

-- member_badges: członek może upsertować własne (auto-sync), admin może upsertować dla dowolnego w parafii
create policy "member_badges_write" on member_badges
  for all using (
    profile_id = auth.uid()
    or exists (
      select 1 from profiles a, profiles m
      where a.id = auth.uid()
        and (a.role = 'admin' or a.is_admin = true)
        and m.id = member_badges.profile_id
        and a.parish_id = m.parish_id
    )
  ) with check (
    profile_id = auth.uid()
    or exists (
      select 1 from profiles a, profiles m
      where a.id = auth.uid()
        and (a.role = 'admin' or a.is_admin = true)
        and m.id = profile_id
        and a.parish_id = m.parish_id
    )
  );

-- Systemowe definicje odznak (parish_id = NULL)
insert into badge_definitions (name, icon, type, persistence, criteria_key) values
  ('Regularny',          '🔥', 'auto',   'status',    'regularny'),
  ('Seria 5',            '⚡', 'auto',   'status',    'seria_5'),
  ('Seria 10',           '⚡', 'auto',   'status',    'seria_10'),
  ('Seria 15',           '⚡', 'auto',   'status',    'seria_15'),
  ('Seria 20',           '⚡', 'auto',   'status',    'seria_20'),
  ('Weteran 100',        '🎖️', 'auto',  'permanent', 'weteran_100'),
  ('Weteran 250',        '🎖️', 'auto',  'permanent', 'weteran_250'),
  ('Weteran 500',        '🎖️', 'auto',  'permanent', 'weteran_500'),
  ('Rocznik 1',          '🎂', 'auto',   'permanent', 'rocznica_1'),
  ('Rocznik 2',          '🎂', 'auto',   'permanent', 'rocznica_2'),
  ('Rocznik 5',          '🎂', 'auto',   'permanent', 'rocznica_5'),
  ('Top 3',              '🏆', 'auto',   'permanent', 'top3'),
  ('Sumienny',           '⭐', 'manual', 'permanent', 'sumienny'),
  ('Animator',           '👑', 'manual', 'permanent', 'animator'),
  ('Szczególna posługa', '✝️', 'manual', 'permanent', 'szczegolna');
```

- [ ] **Step 2: Zastosuj migrację w Supabase**

```bash
npx supabase db push
```

Jeśli `supabase` CLI nie jest dostępne lokalnie, wklej SQL z pliku `20260527000000_badges.sql` ręcznie w Supabase Dashboard → SQL Editor.

- [ ] **Step 3: Dodaj typy do types/database.ts**

Plik: `types/database.ts` — dodaj na końcu (przed ostatnim pustym wierszem):

```ts
export interface BadgeDefinition {
  id: string
  parish_id: string | null
  name: string
  icon: string
  type: 'auto' | 'manual'
  persistence: 'status' | 'permanent'
  criteria_key: string
  created_at: string
}

export interface MemberBadge {
  id: string
  profile_id: string
  badge_definition_id: string
  awarded_at: string
  awarded_by: string | null
  note: string | null
  is_active: boolean
  // Relacje (opcjonalne, ładowane z join)
  badge_definition?: BadgeDefinition
  awarder?: Profile
}
```

- [ ] **Step 4: Zatwierdź zmiany**

```bash
git add supabase/migrations/20260527000000_badges.sql types/database.ts
git commit -m "feat: add badge_definitions and member_badges tables + TS types"
```

---

### Task 2: Testy (TDD) dla lib/badges.ts

**Files:**
- Create: `__tests__/lib/badges.test.ts`

- [ ] **Step 1: Utwórz plik testowy**

Plik: `__tests__/lib/badges.test.ts`

```ts
import {
  computeAutoStatusBadges,
  computeAutoPermanentBadges,
} from '../../lib/badges'

// helper: tworzy assignment z datą N dni temu
function makeA(daysAgo: number, status: string) {
  const d = new Date('2026-05-27T00:00:00Z')
  d.setDate(d.getDate() - daysAgo)
  return { status, scheduleDate: d.toISOString().split('T')[0] }
}

const NOW = new Date('2026-05-27T00:00:00Z')

describe('computeAutoStatusBadges', () => {

  describe('regularny (≥80% w ostatnich 30 dniach)', () => {
    it('aktywna gdy ≥80% present', () => {
      const a = [
        ...Array(8).fill(0).map((_, i) => makeA(i + 1, 'present')),
        ...Array(2).fill(0).map((_, i) => makeA(i + 9, 'absent')),
      ]
      expect(computeAutoStatusBadges(a, NOW).has('regularny')).toBe(true)
    })

    it('nieaktywna gdy <80% present', () => {
      const a = [
        ...Array(7).fill(0).map((_, i) => makeA(i + 1, 'present')),
        ...Array(3).fill(0).map((_, i) => makeA(i + 8, 'absent')),
      ]
      expect(computeAutoStatusBadges(a, NOW).has('regularny')).toBe(false)
    })

    it('ignoruje assignments starsze niż 30 dni', () => {
      // 1 present + 1 absent w ostatnich 30 dniach = 50%, ale 10 present starszych
      const a = [
        makeA(5, 'present'),
        makeA(10, 'absent'),
        ...Array(10).fill(0).map((_, i) => makeA(35 + i, 'present')),
      ]
      expect(computeAutoStatusBadges(a, NOW).has('regularny')).toBe(false)
    })

    it('nieaktywna gdy brak assignments w oknie', () => {
      const a = [makeA(40, 'present'), makeA(50, 'present')]
      expect(computeAutoStatusBadges(a, NOW).has('regularny')).toBe(false)
    })
  })

  describe('seria (kolejne non-absent)', () => {
    it('seria_5 przy streak = 5', () => {
      const a = Array(5).fill(0).map((_, i) => makeA(i + 1, 'present'))
      const r = computeAutoStatusBadges(a, NOW)
      expect(r.has('seria_5')).toBe(true)
      expect(r.has('seria_10')).toBe(false)
    })

    it('wszystkie seria nieaktywne gdy 1 absent na początku', () => {
      const a = [
        makeA(1, 'absent'),
        ...Array(20).fill(0).map((_, i) => makeA(i + 2, 'present')),
      ]
      const r = computeAutoStatusBadges(a, NOW)
      expect(r.has('seria_5')).toBe(false)
      expect(r.has('seria_10')).toBe(false)
      expect(r.has('seria_15')).toBe(false)
      expect(r.has('seria_20')).toBe(false)
    })

    it('tylko seria_5 przy streak = 7', () => {
      const a = Array(7).fill(0).map((_, i) => makeA(i + 1, 'present'))
      const r = computeAutoStatusBadges(a, NOW)
      expect(r.has('seria_5')).toBe(true)
      expect(r.has('seria_10')).toBe(false)
    })

    it('seria_5 i seria_10 przy streak = 10', () => {
      const a = Array(10).fill(0).map((_, i) => makeA(i + 1, 'present'))
      const r = computeAutoStatusBadges(a, NOW)
      expect(r.has('seria_5')).toBe(true)
      expect(r.has('seria_10')).toBe(true)
      expect(r.has('seria_15')).toBe(false)
    })

    it('seria_5, seria_10, seria_15, seria_20 przy streak = 20', () => {
      const a = Array(20).fill(0).map((_, i) => makeA(i + 1, 'present'))
      const r = computeAutoStatusBadges(a, NOW)
      expect(r.has('seria_5')).toBe(true)
      expect(r.has('seria_10')).toBe(true)
      expect(r.has('seria_15')).toBe(true)
      expect(r.has('seria_20')).toBe(true)
    })

    it('liczy confirmed i assigned jako non-absent', () => {
      const a = [
        ...Array(3).fill(0).map((_, i) => makeA(i + 1, 'confirmed')),
        ...Array(2).fill(0).map((_, i) => makeA(i + 4, 'assigned')),
      ]
      expect(computeAutoStatusBadges(a, NOW).has('seria_5')).toBe(true)
    })
  })
})

describe('computeAutoPermanentBadges', () => {

  describe('weteran', () => {
    it('weteran_100 przy dokładnie 100 służbach', () => {
      const r = computeAutoPermanentBadges(100, 0, null)
      expect(r.has('weteran_100')).toBe(true)
      expect(r.has('weteran_250')).toBe(false)
    })

    it('brak weteran_100 przy 99 służbach', () => {
      expect(computeAutoPermanentBadges(99, 0, null).has('weteran_100')).toBe(false)
    })

    it('weteran_100 i weteran_250 przy 250 służbach', () => {
      const r = computeAutoPermanentBadges(250, 0, null)
      expect(r.has('weteran_100')).toBe(true)
      expect(r.has('weteran_250')).toBe(true)
      expect(r.has('weteran_500')).toBe(false)
    })

    it('wszystkie weteran przy 500 służbach', () => {
      const r = computeAutoPermanentBadges(500, 0, null)
      expect(r.has('weteran_100')).toBe(true)
      expect(r.has('weteran_250')).toBe(true)
      expect(r.has('weteran_500')).toBe(true)
    })
  })

  describe('rocznica', () => {
    it('rocznica_1 przy 13 miesiącach', () => {
      const r = computeAutoPermanentBadges(0, 13, null)
      expect(r.has('rocznica_1')).toBe(true)
      expect(r.has('rocznica_2')).toBe(false)
    })

    it('brak rocznica_1 przy 11 miesiącach', () => {
      expect(computeAutoPermanentBadges(0, 11, null).has('rocznica_1')).toBe(false)
    })

    it('rocznica_1 + rocznica_2 + rocznica_5 przy 60 miesiącach', () => {
      const r = computeAutoPermanentBadges(0, 60, null)
      expect(r.has('rocznica_1')).toBe(true)
      expect(r.has('rocznica_2')).toBe(true)
      expect(r.has('rocznica_5')).toBe(true)
    })
  })

  describe('top3', () => {
    it('top3 przy miejscu 1', () => {
      expect(computeAutoPermanentBadges(0, 0, 1).has('top3')).toBe(true)
    })

    it('top3 przy miejscu 3', () => {
      expect(computeAutoPermanentBadges(0, 0, 3).has('top3')).toBe(true)
    })

    it('brak top3 przy miejscu 4', () => {
      expect(computeAutoPermanentBadges(0, 0, 4).has('top3')).toBe(false)
    })

    it('brak top3 gdy nie w rankingu', () => {
      expect(computeAutoPermanentBadges(0, 0, null).has('top3')).toBe(false)
    })
  })
})
```

- [ ] **Step 2: Uruchom testy — sprawdź że FAIL**

```bash
cd lso-app
npx jest __tests__/lib/badges.test.ts --no-coverage
```

Oczekiwany wynik: błąd `Cannot find module '../../lib/badges'` lub podobny — to potwierdza że testy są poprawnie skonfigurowane.

---

### Task 3: Implementacja lib/badges.ts

**Files:**
- Create: `lib/badges.ts`

- [ ] **Step 1: Utwórz lib/badges.ts**

Plik: `lib/badges.ts`

```ts
import { SupabaseClient } from '@supabase/supabase-js'

export type AssignmentForBadge = {
  status: string
  scheduleDate: string  // 'YYYY-MM-DD'
}

/**
 * Oblicza aktywne klucze kryteriów dla odznak auto-statusowych.
 * Nie wykonuje żadnych zapytań — dane przekazywane z zewnątrz.
 */
export function computeAutoStatusBadges(
  assignments: AssignmentForBadge[],
  now: Date,
): Set<string> {
  const active = new Set<string>()

  // Regularny: ≥80% present/confirmed w ostatnich 30 dniach
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - 30)
  const recent = assignments.filter(a => new Date(a.scheduleDate) >= cutoff)
  if (recent.length > 0) {
    const presentCount = recent.filter(
      a => a.status === 'present' || a.status === 'confirmed'
    ).length
    if (presentCount / recent.length >= 0.8) {
      active.add('regularny')
    }
  }

  // Seria: liczymy kolejne non-absent od najnowszego
  const sorted = [...assignments].sort(
    (a, b) => new Date(b.scheduleDate).getTime() - new Date(a.scheduleDate).getTime()
  )
  let streak = 0
  for (const a of sorted) {
    if (a.status === 'absent') break
    streak++
  }
  if (streak >= 5)  active.add('seria_5')
  if (streak >= 10) active.add('seria_10')
  if (streak >= 15) active.add('seria_15')
  if (streak >= 20) active.add('seria_20')

  return active
}

/**
 * Oblicza zarobione klucze kryteriów dla odznak auto-trwałych.
 * Czysta funkcja — nie wykonuje zapytań.
 */
export function computeAutoPermanentBadges(
  totalServices: number,
  monthsSinceCreation: number,
  monthRank: number | null,
): Set<string> {
  const earned = new Set<string>()

  if (totalServices >= 100) earned.add('weteran_100')
  if (totalServices >= 250) earned.add('weteran_250')
  if (totalServices >= 500) earned.add('weteran_500')

  if (monthsSinceCreation >= 12) earned.add('rocznica_1')
  if (monthsSinceCreation >= 24) earned.add('rocznica_2')
  if (monthsSinceCreation >= 60) earned.add('rocznica_5')

  if (monthRank !== null && monthRank <= 3) earned.add('top3')

  return earned
}

/**
 * Pobiera dane z Supabase, oblicza odznaki i synchronizuje member_badges.
 * Wywoływana fire-and-forget: computeAndSyncBadges(...).catch(console.error)
 */
export async function computeAndSyncBadges(
  supabase: SupabaseClient,
  profileId: string,
  parishId: string,
): Promise<void> {
  const now = new Date()

  // 1. Pobierz auto-definicje odznak (systemowe + parafialne)
  const { data: defs } = await supabase
    .from('badge_definitions')
    .select('id, criteria_key, persistence')
    .or(`parish_id.is.null,parish_id.eq.${parishId}`)
    .eq('type', 'auto')

  if (!defs || defs.length === 0) return

  // 2. Pobierz wszystkie schedule_assignments tego profilu
  const { data: rawAssignments } = await supabase
    .from('schedule_assignments')
    .select('status, schedule:schedules(date)')
    .eq('profile_id', profileId)

  const assignments: AssignmentForBadge[] = (rawAssignments ?? [])
    .filter((a: any) => a.schedule !== null)
    .map((a: any) => ({ status: a.status, scheduleDate: a.schedule.date }))

  // 3. Pobierz created_at profilu (rocznice)
  const { data: profileData } = await supabase
    .from('profiles')
    .select('created_at')
    .eq('id', profileId)
    .single()

  const monthsSince = profileData
    ? Math.floor(
        (now.getTime() - new Date(profileData.created_at).getTime()) /
        (1000 * 60 * 60 * 24 * 30.44)
      )
    : 0

  // 4. Policz łączną liczbę służb (present + confirmed)
  const totalServices = assignments.filter(
    a => a.status === 'present' || a.status === 'confirmed'
  ).length

  // 5. Pobierz ranking bieżącego miesiąca (top3)
  const { data: rankingData } = await supabase
    .from('points_summary')
    .select('profile_id')
    .eq('parish_id', parishId)
    .order('total_points', { ascending: false })

  let monthRank: number | null = null
  if (rankingData) {
    const pos = (rankingData as any[]).findIndex(r => r.profile_id === profileId) + 1
    monthRank = pos > 0 ? pos : null
  }

  // 6. Oblicz aktywne/zarobione odznaki
  const activeStatusKeys = computeAutoStatusBadges(assignments, now)
  const earnedPermanentKeys = computeAutoPermanentBadges(totalServices, monthsSince, monthRank)

  const statusDefs = defs.filter((d: any) => d.persistence === 'status')
  const permanentDefs = defs.filter((d: any) => d.persistence === 'permanent')

  // 7. Sync: status-owe — upsert z aktualnym is_active
  for (const def of statusDefs) {
    const isActive = activeStatusKeys.has(def.criteria_key)
    await supabase.from('member_badges').upsert(
      {
        profile_id: profileId,
        badge_definition_id: def.id,
        is_active: isActive,
        awarded_by: null,
      },
      { onConflict: 'profile_id,badge_definition_id' }
    )
  }

  // 8. Sync: trwałe — insert tylko gdy próg osiągnięty, ignore conflicts
  for (const def of permanentDefs) {
    if (earnedPermanentKeys.has(def.criteria_key)) {
      await supabase.from('member_badges').upsert(
        {
          profile_id: profileId,
          badge_definition_id: def.id,
          is_active: true,
          awarded_by: null,
        },
        { onConflict: 'profile_id,badge_definition_id', ignoreDuplicates: true }
      )
    }
  }
}
```

- [ ] **Step 2: Uruchom testy — sprawdź że PASS**

```bash
npx jest __tests__/lib/badges.test.ts --no-coverage
```

Oczekiwany wynik: wszystkie testy PASS. Przykładowy output:
```
PASS __tests__/lib/badges.test.ts
  computeAutoStatusBadges
    regularny ✓
    seria ✓
  computeAutoPermanentBadges
    weteran ✓
    rocznica ✓
    top3 ✓

Tests: 16 passed, 16 total
```

- [ ] **Step 3: Zatwierdź**

```bash
git add lib/badges.ts __tests__/lib/badges.test.ts
git commit -m "feat: add badge computation logic with tests"
```

---

### Task 4: profile.tsx — Sekcja formacyjna (progress bar stopni)

**Files:**
- Modify: `app/(tabs)/profile.tsx`

Zmiana dotyczy wyłącznie funkcji `MemberProfile` i funkcji `createStyles`. Nie ruszaj `AdminProfile`, `ParentProfile`, `AvatarCard`, `EditProfileModal`, `SignOutButton`.

- [ ] **Step 1: Dodaj stan + import w MemberProfile**

W `app/(tabs)/profile.tsx`, w funkcji `MemberProfile` (linia ~289):

**Dodaj import na górze pliku** (obok istniejących importów z `'../../lib/supabase'`):
```ts
import { computeAndSyncBadges } from '../../lib/badges'
```

**W `MemberProfile`, dodaj nowe stany** po istniejących deklaracjach `useState` (po linii `const [editing, setEditing] = useState(false)`):
```ts
type RankItem = { id: string; name: string; order: number }
type BadgeWithDef = {
  id: string
  awarded_at: string
  badge_definition: { id: string; name: string; icon: string; criteria_key: string } | null
}

const [allRanks, setAllRanks] = useState<RankItem[]>([])
const [activeBadges, setActiveBadges] = useState<BadgeWithDef[]>([])
const [selectedBadge, setSelectedBadge] = useState<BadgeWithDef | null>(null)
```

- [ ] **Step 2: Zastąp istniejącą logikę pobierania rankName**

W `MemberProfile`, **usuń** z istniejącego `useEffect` (linia ~307) fragmenty dotyczące `rankRes`:
- Usuń `const [rankName, setRankName] = useState<string | null>(null)` (state)
- Usuń `if (profile.rank_id) { queries.push(...) }` (conditional query)
- Usuń `if (rankRes?.data) setRankName(rankRes.data.name)` (setter)

**Zmień istniejący useEffect** aby nie pobierał rankName:

```ts
useEffect(() => {
  if (!profile?.id) return
  Promise.all([
    supabase.from('points_summary').select('total_points, services_count').eq('profile_id', profile.id).maybeSingle(),
    supabase.from('points_summary').select('profile_id').eq('parish_id', profile.parish_id).order('total_points', { ascending: false }),
  ]).then(([summaryRes, rankingRes]) => {
    if (summaryRes.data) setSummary(summaryRes.data as any)
    if (rankingRes.data) {
      const pos = (rankingRes.data as any[]).findIndex(r => r.profile_id === profile.id) + 1
      setRank(pos)
    }
    setLoading(false)
  })
}, [profile?.id, profile?.rank_id])
```

**Dodaj nowy useEffect** zaraz po poprzednim (ładuje rangi + odznaki, fire-and-forget sync):
```ts
useEffect(() => {
  if (!profile?.id || !profile.parish_id) return
  Promise.all([
    supabase.from('ranks')
      .select('id, name, order')
      .or(`parish_id.is.null,parish_id.eq.${profile.parish_id}`)
      .order('order'),
    supabase.from('member_badges')
      .select('id, awarded_at, badge_definition:badge_definitions(id, name, icon, criteria_key)')
      .eq('profile_id', profile.id)
      .eq('is_active', true),
  ]).then(([ranksRes, badgesRes]) => {
    setAllRanks(ranksRes.data ?? [])
    setActiveBadges((badgesRes.data ?? []).filter((b: any) => b.badge_definition !== null))
  })
  computeAndSyncBadges(supabase, profile.id, profile.parish_id).catch(console.error)
}, [profile?.id])
```

**Dodaj computed value** (zamiast usuniętego `rankName` state), przed `return`:
```ts
const rankName = allRanks.find(r => r.id === profile?.rank_id)?.name ?? null
```

- [ ] **Step 3: Dodaj FormationSection i BadgesSection do JSX w MemberProfile**

W `MemberProfile`, w sekcji JSX (`return (`) — **po bloku `<InfoSection title="Informacje" ...>`** a **przed sekcją `{/* Wygląd */}`**, wstaw:

```tsx
{/* Ścieżka formacji */}
{allRanks.length > 0 && (
  <FormationSection ranks={allRanks} currentRankId={profile?.rank_id ?? null} c={c} styles={styles} />
)}

{/* Wyróżnienia (odznaki) */}
{activeBadges.length > 0 && (
  <BadgesSection badges={activeBadges} onBadgePress={setSelectedBadge} c={c} styles={styles} />
)}

{/* Tooltip odznaki */}
<Modal
  visible={selectedBadge !== null}
  transparent
  animationType="fade"
  onRequestClose={() => setSelectedBadge(null)}
>
  <TouchableOpacity
    style={styles.badgeTooltipOverlay}
    activeOpacity={1}
    onPress={() => setSelectedBadge(null)}
  >
    <View style={styles.badgeTooltip}>
      <Text style={styles.badgeTooltipIcon}>{selectedBadge?.badge_definition?.icon ?? ''}</Text>
      <Text style={styles.badgeTooltipName}>{selectedBadge?.badge_definition?.name ?? ''}</Text>
      <Text style={styles.badgeTooltipDate}>
        {selectedBadge ? new Date(selectedBadge.awarded_at).toLocaleDateString('pl-PL', {
          day: 'numeric', month: 'long', year: 'numeric',
        }) : ''}
      </Text>
    </View>
  </TouchableOpacity>
</Modal>
```

- [ ] **Step 4: Dodaj komponenty FormationSection i BadgesSection**

Wstaw **przed funkcją `createStyles`** w `profile.tsx`:

```tsx
// ─── Formation & Badges ───────────────────────────────────────────────────────

function FormationSection({
  ranks, currentRankId, c, styles,
}: {
  ranks: { id: string; name: string; order: number }[]
  currentRankId: string | null
  c: Colors
  styles: any
}) {
  const currentIdx = currentRankId ? ranks.findIndex(r => r.id === currentRankId) : -1
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>ŚCIEŻKA FORMACJI</Text>
      </View>
      <View style={styles.formationCard}>
        {/* Circles + connectors row */}
        <View style={styles.formationCirclesRow}>
          {ranks.map((rank, idx) => {
            const isDone = currentIdx >= 0 && idx < currentIdx
            const isCurrent = idx === currentIdx
            return (
              <React.Fragment key={rank.id}>
                {idx > 0 && (
                  <View style={[
                    styles.formationConnector,
                    idx <= currentIdx ? styles.formationConnectorDone : null,
                  ]} />
                )}
                <View style={[
                  styles.formationCircle,
                  isDone ? styles.formationCircleDone
                    : isCurrent ? styles.formationCircleCurrent
                    : null,
                ]}>
                  {isDone
                    ? <Ionicons name="checkmark" size={11} color="#fff" />
                    : isCurrent
                      ? <View style={styles.formationDot} />
                      : null
                  }
                </View>
              </React.Fragment>
            )
          })}
        </View>
        {/* Labels row */}
        <View style={styles.formationLabelsRow}>
          {ranks.map((rank, idx) => {
            const isDone = currentIdx >= 0 && idx < currentIdx
            const isCurrent = idx === currentIdx
            return (
              <React.Fragment key={rank.id}>
                {idx > 0 && <View style={{ flex: 1 }} />}
                <Text
                  style={[
                    styles.formationLabel,
                    isDone ? styles.formationLabelDone
                      : isCurrent ? styles.formationLabelCurrent
                      : null,
                  ]}
                  numberOfLines={2}
                >
                  {rank.name}
                </Text>
              </React.Fragment>
            )
          })}
        </View>
      </View>
    </View>
  )
}

function BadgesSection({
  badges, onBadgePress, c, styles,
}: {
  badges: { id: string; awarded_at: string; badge_definition: { name: string; icon: string } | null }[]
  onBadgePress: (badge: any) => void
  c: Colors
  styles: any
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>WYRÓŻNIENIA</Text>
      </View>
      <View style={styles.badgesCard}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.badgesScroll}>
          {badges.map(b => (
            <TouchableOpacity
              key={b.id}
              style={styles.badgeChip}
              onPress={() => onBadgePress(b)}
              activeOpacity={0.7}
            >
              <Text style={styles.badgeChipIcon}>{b.badge_definition?.icon ?? '🏅'}</Text>
              <Text style={styles.badgeChipName}>{b.badge_definition?.name ?? ''}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  )
}
```

Pamiętaj dodać `import React from 'react'` jeśli brakuje (sprawdź czy React jest już importowany — plik używa JSX więc powinien być).

- [ ] **Step 5: Dodaj style do createStyles**

W `createStyles(c: Colors)`, **przed** ostatnim `})` zamykającym `StyleSheet.create`, dodaj:

```ts
// Formation
formationCard: {
  backgroundColor: c.surface, borderRadius: 14, padding: 16,
  ...shadow.xs,
},
formationCirclesRow: {
  flexDirection: 'row', alignItems: 'center', marginBottom: 0,
},
formationConnector: {
  flex: 1, height: 2, backgroundColor: c.border,
},
formationConnectorDone: { backgroundColor: '#16A34A' },
formationCircle: {
  width: 24, height: 24, borderRadius: 12,
  justifyContent: 'center', alignItems: 'center',
  backgroundColor: c.surface, borderWidth: 2, borderColor: c.border,
},
formationCircleDone: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
formationCircleCurrent: { backgroundColor: c.primary, borderColor: c.primary },
formationDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
formationLabelsRow: {
  flexDirection: 'row', marginTop: 8,
},
formationLabel: {
  width: 24, textAlign: 'center', fontSize: 9, lineHeight: 12,
  color: c.textTertiary, fontWeight: '400',
},
formationLabelDone: { color: '#16A34A' },
formationLabelCurrent: { color: c.primary, fontWeight: '700' },

// Badges
badgesCard: {
  backgroundColor: c.surface, borderRadius: 14,
  ...shadow.xs,
},
badgesScroll: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
badgeChip: {
  flexDirection: 'row', alignItems: 'center', gap: 6,
  backgroundColor: c.primarySurface, borderRadius: 20,
  paddingHorizontal: 12, paddingVertical: 8,
  borderWidth: 1, borderColor: c.primaryAlpha12,
},
badgeChipIcon: { fontSize: 16 },
badgeChipName: { fontSize: 12, fontWeight: '600', color: c.primary },

// Badge tooltip
badgeTooltipOverlay: {
  flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
  justifyContent: 'center', alignItems: 'center', padding: 40,
},
badgeTooltip: {
  backgroundColor: c.surface, borderRadius: 16, padding: 24,
  alignItems: 'center', gap: 6,
  ...shadow.md,
  minWidth: 180,
},
badgeTooltipIcon: { fontSize: 40 },
badgeTooltipName: { fontSize: 17, fontWeight: '700', color: c.text },
badgeTooltipDate: { fontSize: 13, color: c.subtext },
```

- [ ] **Step 6: Uruchom istniejące testy**

```bash
npx jest --no-coverage
```

Oczekiwany wynik: wszystkie testy PASS (nie zmieniliśmy logiki export/liturgy/checkin/login).

- [ ] **Step 7: Zatwierdź**

```bash
git add app/(tabs)/profile.tsx lib/badges.ts
git commit -m "feat: add formation progress bar and badges section to member profile"
```

---

### Task 5: member-detail.tsx — Sekcja odznak i przyznawanie

**Files:**
- Modify: `app/(admin)/member-detail.tsx`

- [ ] **Step 1: Dodaj typy lokalne i stany**

W `app/(admin)/member-detail.tsx`, po istniejących deklaracjach typów lokalnych (po `type PointRow`), dodaj:

```ts
type BadgeRow = {
  id: string
  awarded_at: string
  awarded_by: string | null
  note: string | null
  badge_definition: { id: string; name: string; icon: string; type: string } | null
  awarder: { full_name: string } | null
}

type ManualBadgeDef = {
  id: string
  name: string
  icon: string
  criteria_key: string
  parish_id: string | null
}
```

W funkcji `MemberDetailScreen`, po istniejących deklaracjach `useState`, dodaj:

```ts
const [badges, setBadges] = useState<BadgeRow[]>([])
const [awardSheetVisible, setAwardSheetVisible] = useState(false)
const [manualBadgeDefs, setManualBadgeDefs] = useState<ManualBadgeDef[]>([])
const [selectedBadgeDef, setSelectedBadgeDef] = useState<ManualBadgeDef | null>(null)
const [awardNote, setAwardNote] = useState('')
const [awarding, setAwarding] = useState(false)
```

- [ ] **Step 2: Dodaj import TextInput do existing imports**

W `app/(admin)/member-detail.tsx`, w imporcie z `react-native`, dodaj `TextInput`:

```ts
import {
  View, Text, StyleSheet, ScrollView,
  ActivityIndicator, TouchableOpacity, Modal, Alert, TextInput
} from 'react-native'
```

- [ ] **Step 3: Dodaj ładowanie odznak**

Po bloku `useEffect` ładującym `parentName` (linia ~130), dodaj nowy useEffect:

```ts
const loadBadges = async () => {
  const { data } = await supabase
    .from('member_badges')
    .select(`
      id, awarded_at, awarded_by, note,
      badge_definition:badge_definitions(id, name, icon, type),
      awarder:profiles!awarded_by(full_name)
    `)
    .eq('profile_id', id)
    .eq('is_active', true)
    .order('awarded_at', { ascending: false })
  setBadges((data ?? []).filter((b: any) => b.badge_definition !== null))
}

useEffect(() => {
  if (!id) return
  loadBadges()
}, [id])
```

- [ ] **Step 4: Dodaj handlery dla przyznawania odznak**

Po `handleChangeParent`, dodaj:

```ts
const openAwardSheet = async () => {
  if (manualBadgeDefs.length === 0) {
    const { data } = await supabase
      .from('badge_definitions')
      .select('id, name, icon, criteria_key, parish_id')
      .eq('type', 'manual')
      .or(`parish_id.is.null,parish_id.eq.${adminProfile!.parish_id}`)
      .order('name')
    setManualBadgeDefs(data ?? [])
  }
  setAwardSheetVisible(true)
}

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

- [ ] **Step 5: Dodaj sekcję odznak do JSX**

W `MemberDetailScreen`, po sekcji `{/* Akcja: przyznaj punkty */}` (linia ~343, po `TouchableOpacity` z `award-points`) a przed `{/* Nadchodzące dyżury */}`, wstaw:

```tsx
{/* Odznaki */}
{isMember && (
  <Section title="Odznaki" styles={styles}>
    {badges.length === 0 ? (
      <EmptyRow text="Brak przyznanych odznak" styles={styles} />
    ) : (
      badges.map((b, i) => (
        <View key={b.id} style={[styles.badgeRow, i < badges.length - 1 && styles.rowBorder]}>
          <Text style={styles.badgeRowIcon}>{b.badge_definition?.icon ?? '🏅'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.badgeRowName}>{b.badge_definition?.name ?? ''}</Text>
            <Text style={styles.badgeRowMeta}>
              {new Date(b.awarded_at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' })}
              {b.awarder ? ` · ${b.awarder.full_name}` : ' · System'}
            </Text>
            {b.note ? <Text style={styles.badgeRowNote}>{b.note}</Text> : null}
          </View>
        </View>
      ))
    )}
    <TouchableOpacity style={styles.awardBadgeBtn} onPress={openAwardSheet}>
      <Ionicons name="ribbon-outline" size={16} color={c.primary} />
      <Text style={styles.awardBadgeBtnText}>Przyznaj odznakę</Text>
    </TouchableOpacity>
  </Section>
)}
```

- [ ] **Step 6: Dodaj bottom sheet przyznawania**

W `MemberDetailScreen`, przed ostatnim `</ScrollView>` (po sekcji odznak w JSX), **przed** `return`'em, dodaj Modal bottom sheet. Wstaw obok istniejących Modali (po `rankModalVisible` Modal):

```tsx
{/* Bottom sheet: przyznaj odznakę */}
<Modal
  visible={awardSheetVisible}
  transparent
  animationType="slide"
  onRequestClose={() => { setAwardSheetVisible(false); setSelectedBadgeDef(null); setAwardNote('') }}
>
  <TouchableOpacity
    style={styles.modalOverlay}
    activeOpacity={1}
    onPress={() => { setAwardSheetVisible(false); setSelectedBadgeDef(null); setAwardNote('') }}
  >
    <View style={styles.modalSheet}>
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>Przyznaj odznakę</Text>
        <TouchableOpacity
          onPress={() => { setAwardSheetVisible(false); setSelectedBadgeDef(null); setAwardNote('') }}
          hitSlop={8}
        >
          <Ionicons name="close" size={24} color={c.subtext} />
        </TouchableOpacity>
      </View>

      {manualBadgeDefs.length === 0 ? (
        <ActivityIndicator color={c.primary} style={{ padding: 16 }} />
      ) : (
        manualBadgeDefs.map(def => (
          <TouchableOpacity
            key={def.id}
            style={[styles.rankOption, selectedBadgeDef?.id === def.id && { backgroundColor: c.primarySurface }]}
            onPress={() => setSelectedBadgeDef(def)}
          >
            <Text style={{ fontSize: 20 }}>{def.icon}</Text>
            <Text style={[styles.rankOptionText, selectedBadgeDef?.id === def.id && { color: c.primary, fontWeight: '700' }]}>
              {def.name}
            </Text>
            {selectedBadgeDef?.id === def.id && <Ionicons name="checkmark" size={18} color={c.primary} />}
          </TouchableOpacity>
        ))
      )}

      <TextInput
        style={styles.awardNoteInput}
        placeholder="Notatka (opcjonalnie)..."
        placeholderTextColor={c.textTertiary}
        value={awardNote}
        onChangeText={setAwardNote}
        multiline
        numberOfLines={2}
      />

      <TouchableOpacity
        style={[styles.awardButton, (!selectedBadgeDef || awarding) && { opacity: 0.4 }]}
        onPress={handleAwardBadge}
        disabled={!selectedBadgeDef || awarding}
      >
        {awarding
          ? <ActivityIndicator size="small" color="#fff" />
          : <Text style={styles.awardButtonText}>Przyznaj</Text>
        }
      </TouchableOpacity>
    </View>
  </TouchableOpacity>
</Modal>
```

- [ ] **Step 7: Dodaj brakujące style**

W `createStyles(c: Colors)` w `member-detail.tsx`, **przed** ostatnim `})`, dodaj:

```ts
badgeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12 },
badgeRowIcon: { fontSize: 22, lineHeight: 26 },
badgeRowName: { fontSize: 14, fontWeight: '600', color: c.text },
badgeRowMeta: { fontSize: 12, color: c.subtext, marginTop: 2 },
badgeRowNote: { fontSize: 12, color: c.textTertiary, marginTop: 2, fontStyle: 'italic' },
awardBadgeBtn: {
  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: 12, borderTopWidth: 1, borderTopColor: c.primarySurface,
},
awardBadgeBtnText: { fontSize: 14, fontWeight: '600', color: c.primary },
awardNoteInput: {
  backgroundColor: c.bg, borderRadius: 10,
  paddingHorizontal: 12, paddingVertical: 10,
  fontSize: 14, color: c.text, borderWidth: 1, borderColor: c.border,
  marginTop: 12, marginBottom: 4, minHeight: 60, textAlignVertical: 'top',
},
```

- [ ] **Step 8: Zatwierdź**

```bash
git add app/(admin)/member-detail.tsx
git commit -m "feat: add badges section and award sheet to member detail"
```

---

### Task 6: Nowy ekran badge-management.tsx

**Files:**
- Create: `app/(admin)/badge-management.tsx`

- [ ] **Step 1: Utwórz plik**

Plik: `app/(admin)/badge-management.tsx`

```tsx
import { useEffect, useState, useMemo } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'
import { shadow } from '../../lib/shadows'

type CustomBadge = {
  id: string
  name: string
  icon: string
  criteria_key: string
}

type AwardHistoryRow = {
  id: string
  awarded_at: string
  note: string | null
  profile: { full_name: string } | null
  awarder: { full_name: string } | null
  badge_definition: { name: string; icon: string } | null
}

export default function BadgeManagementScreen() {
  const { profile } = useAuthStore()
  const parishId = profile?.parish_id!
  const insets = useSafeAreaInsets()
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  const [customBadges, setCustomBadges] = useState<CustomBadge[]>([])
  const [history, setHistory] = useState<AwardHistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('')
  const [adding, setAdding] = useState(false)

  const fetchData = async () => {
    const [customRes, historyRes] = await Promise.all([
      supabase.from('badge_definitions')
        .select('id, name, icon, criteria_key')
        .eq('parish_id', parishId)
        .eq('type', 'manual')
        .order('name'),
      supabase.from('member_badges')
        .select(`
          id, awarded_at, note,
          profile:profiles!profile_id(full_name),
          awarder:profiles!awarded_by(full_name),
          badge_definition:badge_definitions(name, icon)
        `)
        .not('awarded_by', 'is', null)
        .order('awarded_at', { ascending: false })
        .limit(30),
    ])
    setCustomBadges(customRes.data ?? [])
    setHistory((historyRes.data ?? []).filter((h: any) => h.badge_definition !== null))
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const handleAdd = async () => {
    const name = newName.trim()
    const icon = newIcon.trim()
    if (!name) return
    setAdding(true)
    const { error } = await supabase.from('badge_definitions').insert({
      parish_id: parishId,
      name,
      icon: icon || '🏅',
      type: 'manual',
      persistence: 'permanent',
      criteria_key: 'custom',
    })
    setAdding(false)
    if (error) {
      Alert.alert('Błąd', error.message)
      return
    }
    setNewName('')
    setNewIcon('')
    fetchData()
  }

  const handleDelete = (badge: CustomBadge) => {
    Alert.alert(
      'Usuń odznakę',
      `Usunąć odznakę "${badge.name}"? Zostanie usunięta ze wszystkich ministrantów.`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usuń', style: 'destructive', onPress: async () => {
            const { error } = await supabase.from('badge_definitions').delete().eq('id', badge.id)
            if (error) Alert.alert('Błąd', error.message)
            else fetchData()
          },
        },
      ]
    )
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={c.primary} /></View>
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) }]}
    >
      {/* Sekcja: Odznaki parafii */}
      <Text style={styles.sectionLabel}>ODZNAKI PARAFII</Text>
      <View style={styles.card}>
        {customBadges.length === 0 ? (
          <View style={styles.emptyRow}>
            <Text style={styles.emptyText}>Brak własnych odznak. Dodaj pierwszą poniżej.</Text>
          </View>
        ) : (
          customBadges.map((b, i) => (
            <View key={b.id} style={[styles.badgeRow, i < customBadges.length - 1 && styles.rowBorder]}>
              <Text style={styles.badgeIcon}>{b.icon}</Text>
              <Text style={styles.badgeName}>{b.name}</Text>
              <TouchableOpacity onPress={() => handleDelete(b)} hitSlop={8}>
                <Ionicons name="trash-outline" size={20} color="#DC2626" />
              </TouchableOpacity>
            </View>
          ))
        )}

        {/* Formularz dodawania */}
        <View style={[styles.addRow, customBadges.length > 0 && styles.rowBorder]}>
          <TextInput
            style={[styles.addInput, { width: 52 }]}
            placeholder="🏅"
            placeholderTextColor={c.textTertiary}
            value={newIcon}
            onChangeText={setNewIcon}
            maxLength={4}
          />
          <TextInput
            style={[styles.addInput, { flex: 1 }]}
            placeholder="Nazwa odznaki..."
            placeholderTextColor={c.textTertiary}
            value={newName}
            onChangeText={setNewName}
            onSubmitEditing={handleAdd}
            returnKeyType="done"
          />
          <TouchableOpacity
            style={[styles.addButton, (!newName.trim() || adding) && { opacity: 0.4 }]}
            onPress={handleAdd}
            disabled={!newName.trim() || adding}
          >
            {adding
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="add" size={22} color="#fff" />
            }
          </TouchableOpacity>
        </View>
      </View>

      {/* Sekcja: Historia przyznanych */}
      <Text style={[styles.sectionLabel, { marginTop: 8 }]}>HISTORIA PRZYZNANYCH</Text>
      <View style={styles.card}>
        {history.length === 0 ? (
          <View style={styles.emptyRow}>
            <Text style={styles.emptyText}>Brak ręcznie przyznanych odznak.</Text>
          </View>
        ) : (
          history.map((h, i) => (
            <View key={h.id} style={[styles.historyRow, i < history.length - 1 && styles.rowBorder]}>
              <Text style={styles.historyIcon}>{h.badge_definition?.icon ?? '🏅'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.historyBadgeName}>{h.badge_definition?.name ?? ''}</Text>
                <Text style={styles.historyMeta}>
                  {h.profile?.full_name ?? '—'}
                  {' · '}
                  {new Date(h.awarded_at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Text>
                {h.awarder && (
                  <Text style={styles.historyAwarder}>przez {h.awarder.full_name}</Text>
                )}
                {h.note && <Text style={styles.historyNote}>{h.note}</Text>}
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    content: { padding: 16, gap: 12 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    sectionLabel: {
      fontSize: 12, fontWeight: '700', color: c.textTertiary,
      textTransform: 'uppercase', letterSpacing: 0.8,
      paddingHorizontal: 4, paddingBottom: 6,
    },
    card: {
      backgroundColor: c.surface, borderRadius: 14,
      overflow: 'hidden',
      ...shadow.xs,
    },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: c.primarySurface },
    emptyRow: { padding: 16, alignItems: 'center' },
    emptyText: { fontSize: 13, color: c.textTertiary, textAlign: 'center' },

    badgeRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 16, paddingVertical: 14,
    },
    badgeIcon: { fontSize: 22 },
    badgeName: { flex: 1, fontSize: 15, fontWeight: '500', color: c.text },

    addRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 12, paddingVertical: 10,
    },
    addInput: {
      backgroundColor: c.bg, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 10,
      fontSize: 15, color: c.text, borderWidth: 1, borderColor: c.border,
    },
    addButton: {
      width: 44, height: 44, borderRadius: 10,
      backgroundColor: c.primary, justifyContent: 'center', alignItems: 'center',
    },

    historyRow: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 10,
      paddingHorizontal: 16, paddingVertical: 12,
    },
    historyIcon: { fontSize: 22, lineHeight: 26 },
    historyBadgeName: { fontSize: 14, fontWeight: '600', color: c.text },
    historyMeta: { fontSize: 12, color: c.subtext, marginTop: 2 },
    historyAwarder: { fontSize: 11, color: c.textTertiary, marginTop: 1 },
    historyNote: { fontSize: 12, color: c.textTertiary, marginTop: 2, fontStyle: 'italic' },
  })
}
```

- [ ] **Step 2: Zatwierdź**

```bash
git add app/(admin)/badge-management.tsx
git commit -m "feat: add badge-management admin screen"
```

---

### Task 7: Podpięcie nawigacji

**Files:**
- Modify: `app/(admin)/_layout.tsx`
- Modify: `app/(admin)/(admin-tabs)/index.tsx`

- [ ] **Step 1: Dodaj screen do _layout.tsx**

W `app/(admin)/_layout.tsx`, w bloku `<Stack>`, po ostatnim `<Stack.Screen>` (po `schedule-day`), dodaj:

```tsx
<Stack.Screen name="badge-management" options={{ title: 'Odznaki' }} />
```

- [ ] **Step 2: Dodaj kafelek Odznaki w admin home**

W `app/(admin)/(admin-tabs)/index.tsx`, po istniejącym kafelku "Parafia" (linia ~228-237, `TouchableOpacity` z `parish-settings`), dodaj:

```tsx
<TouchableOpacity style={styles.parishRow} onPress={() => router.push('/(admin)/badge-management')} activeOpacity={0.75}>
  <View style={[styles.parishIcon, { backgroundColor: '#FFC10718' }]}>
    <Ionicons name="ribbon-outline" size={22} color="#FFC107" />
  </View>
  <View style={styles.parishInfo}>
    <Text style={styles.parishTitle}>Odznaki</Text>
    <Text style={styles.parishSub}>Wyróżnienia ministrantów</Text>
  </View>
  <Ionicons name="chevron-forward" size={16} color={c.iconMuted} />
</TouchableOpacity>
```

- [ ] **Step 3: Uruchom wszystkie testy**

```bash
npx jest --no-coverage
```

Oczekiwany wynik: wszystkie testy PASS.

- [ ] **Step 4: Zatwierdź**

```bash
git add app/(admin)/_layout.tsx app/(admin)/(admin-tabs)/index.tsx
git commit -m "feat: wire badge-management to admin navigation"
```

---

## Weryfikacja po implementacji

Checklist ręczny (nie może zastąpić testów, ale warto sprawdzić):

- [ ] Profil ministranta: sekcja "ŚCIEŻKA FORMACJI" widoczna z kółkami i liniami
- [ ] Profil ministranta: sekcja "WYRÓŻNIENIA" widoczna gdy są aktywne odznaki (po ręcznym przyznaniu przez admina)
- [ ] Tap na odznakę w profilu pokazuje tooltip z nazwą i datą
- [ ] Admin: member-detail ma sekcję "Odznaki" z przyciskiem "Przyznaj odznakę"
- [ ] Bottom sheet pokazuje listę odznak ręcznych; po wyborze i kliknięciu Przyznaj → odznaka pojawia się na liście
- [ ] Admin Home → Ustawienia → "Odznaki" kafelek otwiera badge-management screen
- [ ] badge-management: można dodać custom odznakę (pole emoji + nazwa) → pojawia się na liście
- [ ] badge-management: Historia przyznanych pokazuje ręcznie przyznane odznaki
