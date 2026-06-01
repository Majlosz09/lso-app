# Profile Ranks & Badges Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uzupełnić informacje o randze i odznakach w każdym widoku profilu: publiczny ekran profilu, widok rodzica, admin masowe przydzielanie rang, katalog odznak.

**Architecture:** FormationSection i BadgesSection wyekstrahowane do `components/FormationBadges.tsx` — używane w `profile.tsx` i nowym `member-profile.tsx`. BADGE_CATALOG to stała mapa opisów kryteriów w `lib/badges.ts`. Nowe ekrany w grupach `(tabs)` i `(admin)`.

**Tech Stack:** Expo Router (useLocalSearchParams), React Native, Supabase, TypeScript, useTheme, shadow, useSafeAreaInsets.

---

## File Map

| Plik | Zmiana |
|------|--------|
| `lib/badges.ts` | Dodać `BADGE_CATALOG` map |
| `components/FormationBadges.tsx` | Nowy — FormationSection + BadgesSection jako self-contained |
| `app/(tabs)/profile.tsx` | Importować z FormationBadges zamiast lokalnych funkcji; ParentProfile: rank+badges+nav; badge-catalog link |
| `app/(tabs)/badge-catalog.tsx` | Nowy ekran — lista odznak z kryteriami |
| `app/(tabs)/member-profile.tsx` | Nowy ekran — publiczny profil ministranta |
| `app/(tabs)/_layout.tsx` | Rejestracja badge-catalog + member-profile (href: null) |
| `app/(tabs)/points.tsx` | RankingRow: TouchableOpacity → member-profile |
| `app/(tabs)/index.tsx` | ParentHomeView: rank+badges na kartach dzieci + nawigacja |
| `app/(admin)/rank-assignment.tsx` | Nowy ekran — masowe przydzielanie rang |
| `app/(admin)/_layout.tsx` | Rejestracja rank-assignment |
| `app/(admin)/(admin-tabs)/index.tsx` | Tile "Przydziel rangi" |
| `app/(admin)/badge-management.tsx` | Sekcja katalogu odznak |

---

## Task 1: BADGE_CATALOG w lib/badges.ts

**Files:**
- Modify: `lib/badges.ts` (koniec pliku, po linii 188)
- Test: `__tests__/lib/badges.test.ts`

- [ ] **Step 1: Dodaj test weryfikujący BADGE_CATALOG**

Otwórz `__tests__/lib/badges.test.ts` i na końcu pliku dodaj:

```ts
import { BADGE_CATALOG } from '../../lib/badges'

describe('BADGE_CATALOG', () => {
  it('contains entry for every system criteria_key', () => {
    const systemKeys = [
      'regularny', 'seria_5', 'seria_10', 'seria_15', 'seria_20',
      'weteran_100', 'weteran_250', 'weteran_500',
      'rocznica_1', 'rocznica_2', 'rocznica_5',
      'top3', 'sumienny', 'animator', 'szczegolna',
    ]
    systemKeys.forEach(key => {
      expect(BADGE_CATALOG[key]).toBeDefined()
      expect(typeof BADGE_CATALOG[key]).toBe('string')
      expect(BADGE_CATALOG[key].length).toBeGreaterThan(0)
    })
  })
})
```

- [ ] **Step 2: Uruchom test — powinien FAIL**

```bash
npx jest --testPathPattern=badges --no-coverage
```

Expected: FAIL — `BADGE_CATALOG` is not exported from `../../lib/badges`

- [ ] **Step 3: Dodaj BADGE_CATALOG do lib/badges.ts**

Na końcu pliku `lib/badges.ts` (po linii 188, za ostatnią `}`):

```ts
export const BADGE_CATALOG: Record<string, string> = {
  regularny:   'Minimum 80% obecności w ostatnich 30 dniach',
  seria_5:     '5 dyżurów z rzędu bez nieobecności',
  seria_10:    '10 dyżurów z rzędu bez nieobecności',
  seria_15:    '15 dyżurów z rzędu bez nieobecności',
  seria_20:    '20 dyżurów z rzędu bez nieobecności',
  weteran_100: 'Łącznie 100 zaliczonych dyżurów',
  weteran_250: 'Łącznie 250 zaliczonych dyżurów',
  weteran_500: 'Łącznie 500 zaliczonych dyżurów',
  rocznica_1:  '1 rok w aplikacji',
  rocznica_2:  '2 lata w aplikacji',
  rocznica_5:  '5 lat w aplikacji',
  top3:        'Top 3 w rankingu parafii (przyznawana raz)',
  sumienny:    'Przyznawana ręcznie przez animatora',
  animator:    'Przyznawana ręcznie przez animatora',
  szczegolna:  'Przyznawana ręcznie przez animatora',
}
```

- [ ] **Step 4: Uruchom test — powinien PASS**

```bash
npx jest --testPathPattern=badges --no-coverage
```

Expected: PASS — all 66 tests pass (65 previous + 1 new)

- [ ] **Step 5: Commit**

```bash
git add lib/badges.ts __tests__/lib/badges.test.ts
git commit -m "feat: add BADGE_CATALOG descriptions map"
```

---

## Task 2: Ekstrakcja FormationSection + BadgesSection

**Files:**
- Create: `components/FormationBadges.tsx`
- Modify: `app/(tabs)/profile.tsx` (lines 825-931 — zamień lokalne funkcje na import)

- [ ] **Step 1: Utwórz components/FormationBadges.tsx**

```tsx
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../lib/theme'

export type BadgeWithDef = {
  id: string
  awarded_at: string
  badge_definition: { id?: string; name: string; icon: string; criteria_key?: string } | null
}

export function FormationSection({
  ranks, currentRankId, c,
}: {
  ranks: { id: string; name: string; order: number }[]
  currentRankId: string | null
  c: Colors
}) {
  const s = createFormationStyles(c)
  const currentIdx = currentRankId ? ranks.findIndex(r => r.id === currentRankId) : -1
  return (
    <View style={s.section}>
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>ŚCIEŻKA FORMACJI</Text>
      </View>
      <View style={s.formationCard}>
        <View style={s.formationCirclesRow}>
          {ranks.map((rank, idx) => {
            const isDone = currentIdx >= 0 && idx < currentIdx
            const isCurrent = idx === currentIdx
            return [
              idx > 0 ? (
                <View
                  key={`conn-${rank.id}`}
                  style={[s.formationConnector, idx <= currentIdx ? s.formationConnectorDone : null]}
                />
              ) : null,
              <View
                key={rank.id}
                style={[
                  s.formationCircle,
                  isDone ? s.formationCircleDone : isCurrent ? s.formationCircleCurrent : null,
                ]}
              >
                {isDone
                  ? <Ionicons name="checkmark" size={11} color="#fff" />
                  : isCurrent ? <View style={s.formationDot} /> : null
                }
              </View>,
            ]
          })}
        </View>
        <View style={s.formationLabelsRow}>
          {ranks.map((rank, idx) => {
            const isDone = currentIdx >= 0 && idx < currentIdx
            const isCurrent = idx === currentIdx
            return [
              idx > 0 ? <View key={`spacer-${idx}`} style={{ flex: 1 }} /> : null,
              <Text
                key={rank.id}
                style={[
                  s.formationLabel,
                  isDone ? s.formationLabelDone : isCurrent ? s.formationLabelCurrent : null,
                ]}
                numberOfLines={2}
              >
                {rank.name}
              </Text>,
            ]
          })}
        </View>
      </View>
    </View>
  )
}

export function BadgesSection({
  badges, onBadgePress, c,
}: {
  badges: BadgeWithDef[]
  onBadgePress: (badge: BadgeWithDef) => void
  c: Colors
}) {
  const s = createBadgesStyles(c)
  return (
    <View style={s.section}>
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>WYRÓŻNIENIA</Text>
      </View>
      <View style={s.badgesCard}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.badgesScroll}>
          {badges.map(b => (
            <TouchableOpacity
              key={b.id}
              style={s.badgeChip}
              onPress={() => onBadgePress(b)}
              activeOpacity={0.7}
            >
              <Text style={s.badgeChipIcon}>{b.badge_definition?.icon ?? '🏅'}</Text>
              <Text style={s.badgeChipName}>{b.badge_definition?.name ?? ''}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  )
}

function createFormationStyles(c: Colors) {
  return StyleSheet.create({
    section: { gap: 8 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionTitle: { fontSize: 13, fontWeight: '600', color: c.subtext, textTransform: 'uppercase', letterSpacing: 0.5 },
    formationCard: { backgroundColor: c.surface, borderRadius: 14, padding: 16 },
    formationCirclesRow: { flexDirection: 'row', alignItems: 'center' },
    formationConnector: { flex: 1, height: 2, backgroundColor: c.border },
    formationConnectorDone: { backgroundColor: c.success },
    formationCircle: {
      width: 24, height: 24, borderRadius: 12,
      justifyContent: 'center', alignItems: 'center',
      backgroundColor: c.surface, borderWidth: 2, borderColor: c.border,
    },
    formationCircleDone: { backgroundColor: c.success, borderColor: c.success },
    formationCircleCurrent: { backgroundColor: c.primary, borderColor: c.primary },
    formationDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
    formationLabelsRow: { flexDirection: 'row', marginTop: 8 },
    formationLabel: { width: 24, textAlign: 'center', fontSize: 9, lineHeight: 12, color: c.textTertiary, fontWeight: '400' },
    formationLabelDone: { color: c.success },
    formationLabelCurrent: { color: c.primary, fontWeight: '700' },
  })
}

function createBadgesStyles(c: Colors) {
  return StyleSheet.create({
    section: { gap: 8 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionTitle: { fontSize: 13, fontWeight: '600', color: c.subtext, textTransform: 'uppercase', letterSpacing: 0.5 },
    badgesCard: { backgroundColor: c.surface, borderRadius: 14 },
    badgesScroll: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
    badgeChip: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: c.primarySurface, borderRadius: 20,
      paddingHorizontal: 12, paddingVertical: 8,
      borderWidth: 1, borderColor: c.primaryAlpha12,
    },
    badgeChipIcon: { fontSize: 16 },
    badgeChipName: { fontSize: 12, fontWeight: '600', color: c.primary },
  })
}
```

- [ ] **Step 2: Zaktualizuj profile.tsx — zastąp lokalne funkcje importem**

Na górze pliku `app/(tabs)/profile.tsx` dodaj import (po istniejących importach):

```ts
import { FormationSection, BadgesSection, BadgeWithDef } from '../../components/FormationBadges'
```

Usuń z `profile.tsx` funkcje `FormationSection` i `BadgesSection` (linie 823–931 w całości — od `// ─── Formation & Badges` do końca `BadgesSection`).

Usuń lokalny typ `BadgeWithDef` z `MemberProfile` (linie 301–305):
```ts
// USUŃ te linie z MemberProfile:
type BadgeWithDef = {
  id: string
  awarded_at: string
  badge_definition: { id: string; name: string; icon: string; criteria_key: string } | null
}
```

Zaktualizuj wywołania FormationSection i BadgesSection w `MemberProfile` — usuń parametr `styles={styles}` (teraz niewymagany):

```tsx
{allRanks.length > 0 && (
  <FormationSection ranks={allRanks} currentRankId={profile?.rank_id ?? null} c={c} />
)}

{activeBadges.length > 0 && (
  <BadgesSection badges={activeBadges} onBadgePress={setSelectedBadge} c={c} />
)}
```

- [ ] **Step 3: Sprawdź TypeScript**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add components/FormationBadges.tsx app/(tabs)/profile.tsx
git commit -m "refactor: extract FormationSection+BadgesSection to shared component"
```

---

## Task 3: Ekran katalogu odznak + rejestracja

**Files:**
- Create: `app/(tabs)/badge-catalog.tsx`
- Modify: `app/(tabs)/_layout.tsx`

- [ ] **Step 1: Utwórz app/(tabs)/badge-catalog.tsx**

```tsx
import { useEffect, useState, useMemo } from 'react'
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { BADGE_CATALOG } from '../../lib/badges'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'
import { shadow } from '../../lib/shadows'

type CatalogEntry = {
  id: string
  name: string
  icon: string
  criteria_key: string
  parish_id: string | null
}

export default function BadgeCatalogScreen() {
  const { profile } = useAuthStore()
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
  const insets = useSafeAreaInsets()
  const [badges, setBadges] = useState<CatalogEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.parish_id) return
    supabase
      .from('badge_definitions')
      .select('id, name, icon, criteria_key, parish_id')
      .or(`parish_id.is.null,parish_id.eq.${profile.parish_id}`)
      .order('name')
      .then(({ data }) => {
        setBadges(data ?? [])
        setLoading(false)
      })
  }, [profile?.parish_id])

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={c.primary} /></View>
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) }]}
      data={badges}
      keyExtractor={item => item.id}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Text style={styles.icon}>{item.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.desc}>
              {BADGE_CATALOG[item.criteria_key] ?? 'Przyznawana ręcznie przez animatora'}
            </Text>
          </View>
        </View>
      )}
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Brak odznak w katalogu.</Text>
        </View>
      }
    />
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    content: { padding: 16 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    row: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 14,
      backgroundColor: c.surface, borderRadius: 12, padding: 14,
      ...shadow.xs,
    },
    icon: { fontSize: 28, lineHeight: 34 },
    name: { fontSize: 15, fontWeight: '600', color: c.text },
    desc: { fontSize: 13, color: c.subtext, marginTop: 2 },
    empty: { alignItems: 'center', padding: 32 },
    emptyText: { fontSize: 14, color: c.textTertiary },
  })
}
```

- [ ] **Step 2: Zarejestruj ekran w app/(tabs)/_layout.tsx**

W `app/(tabs)/_layout.tsx` po istniejącej linii:
```tsx
<Tabs.Screen name="profile" options={{ href: null, title: 'Profil' }} />
```

Dodaj dwie linie:
```tsx
<Tabs.Screen name="badge-catalog" options={{ href: null, title: 'Katalog odznak' }} />
<Tabs.Screen name="member-profile" options={{ href: null, title: 'Profil ministranta' }} />
```

- [ ] **Step 3: Sprawdź TypeScript**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add app/(tabs)/badge-catalog.tsx app/(tabs)/_layout.tsx
git commit -m "feat: add badge catalog screen"
```

---

## Task 4: Publiczny ekran profilu ministranta

**Files:**
- Create: `app/(tabs)/member-profile.tsx`

- [ ] **Step 1: Utwórz app/(tabs)/member-profile.tsx**

```tsx
import { useEffect, useState, useMemo } from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  ActivityIndicator, Modal, TouchableOpacity
} from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'
import { shadow } from '../../lib/shadows'
import { FormationSection, BadgesSection, BadgeWithDef } from '../../components/FormationBadges'

type MemberData = {
  id: string
  full_name: string
  rank_id: string | null
  ranks: { name: string } | null
  member_badges: (BadgeWithDef & { is_active: boolean })[]
}

export default function MemberProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { profile } = useAuthStore()
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
  const insets = useSafeAreaInsets()

  const [member, setMember] = useState<MemberData | null>(null)
  const [allRanks, setAllRanks] = useState<{ id: string; name: string; order: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [selectedBadge, setSelectedBadge] = useState<BadgeWithDef | null>(null)

  useEffect(() => {
    if (!id || !profile?.parish_id) return
    Promise.all([
      supabase
        .from('profiles')
        .select(`
          id, full_name, rank_id,
          ranks(name),
          member_badges(
            id, awarded_at, is_active,
            badge_definition:badge_definitions(id, name, icon, criteria_key)
          )
        `)
        .eq('id', id)
        .single(),
      supabase
        .from('ranks')
        .select('id, name, order')
        .or(`parish_id.is.null,parish_id.eq.${profile.parish_id}`)
        .order('order'),
    ]).then(([memberRes, ranksRes]) => {
      if (memberRes.error || !memberRes.data) {
        setNotFound(true)
      } else {
        setMember(memberRes.data as unknown as MemberData)
      }
      setAllRanks(ranksRes.data ?? [])
      setLoading(false)
    }).catch(() => { setLoading(false); setNotFound(true) })
  }, [id, profile?.parish_id])

  const activeBadges = (member?.member_badges ?? [])
    .filter(b => b.is_active && b.badge_definition !== null)

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={c.primary} /></View>
  }

  if (notFound || !member) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFound}>Nie znaleziono profilu</Text>
      </View>
    )
  }

  const initials = member.full_name.split(' ').map(n => n[0]).slice(0, 2).join('')

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) }]}
    >
      <View style={styles.headerCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitials}>{initials}</Text>
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={styles.memberName}>{member.full_name}</Text>
          {member.ranks?.name ? (
            <View style={styles.rankChip}>
              <Text style={styles.rankChipText}>{member.ranks.name}</Text>
            </View>
          ) : (
            <Text style={styles.noRank}>Brak rangi</Text>
          )}
        </View>
      </View>

      {allRanks.length > 0 && (
        <FormationSection ranks={allRanks} currentRankId={member.rank_id} c={c} />
      )}

      {activeBadges.length > 0 && (
        <BadgesSection badges={activeBadges} onBadgePress={setSelectedBadge} c={c} />
      )}

      <Modal
        visible={selectedBadge !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedBadge(null)}
      >
        <TouchableOpacity
          style={styles.tooltipOverlay}
          activeOpacity={1}
          onPress={() => setSelectedBadge(null)}
        >
          <View style={styles.tooltip}>
            <Text style={styles.tooltipIcon}>{selectedBadge?.badge_definition?.icon ?? ''}</Text>
            <Text style={styles.tooltipName}>{selectedBadge?.badge_definition?.name ?? ''}</Text>
            <Text style={styles.tooltipDate}>
              {selectedBadge
                ? new Date(selectedBadge.awarded_at).toLocaleDateString('pl-PL', {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })
                : ''}
            </Text>
          </View>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    content: { padding: 16, gap: 16 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    notFound: { fontSize: 16, color: c.textTertiary },

    headerCard: {
      flexDirection: 'row', alignItems: 'center', gap: 16,
      backgroundColor: c.surface, borderRadius: 16, padding: 20,
      ...shadow.md,
    },
    avatar: {
      width: 56, height: 56, borderRadius: 28,
      backgroundColor: c.primaryAlpha08,
      justifyContent: 'center', alignItems: 'center',
    },
    avatarInitials: { fontSize: 20, fontWeight: '700', color: c.primary },
    memberName: { fontSize: 18, fontWeight: '700', color: c.text },
    rankChip: {
      alignSelf: 'flex-start',
      backgroundColor: c.primaryAlpha08, borderRadius: 12,
      paddingHorizontal: 10, paddingVertical: 4,
      borderWidth: 1, borderColor: c.primaryAlpha12,
    },
    rankChipText: { fontSize: 13, fontWeight: '600', color: c.primary },
    noRank: { fontSize: 13, color: c.textTertiary },

    tooltipOverlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'center', alignItems: 'center', padding: 40,
    },
    tooltip: {
      backgroundColor: c.surface, borderRadius: 16, padding: 24,
      alignItems: 'center', gap: 6, ...shadow.md, minWidth: 180,
    },
    tooltipIcon: { fontSize: 40 },
    tooltipName: { fontSize: 17, fontWeight: '700', color: c.text },
    tooltipDate: { fontSize: 13, color: c.subtext },
  })
}
```

- [ ] **Step 2: Sprawdź TypeScript**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add "app/(tabs)/member-profile.tsx"
git commit -m "feat: add public member profile screen"
```

---

## Task 5: Nawigacja z rankingu do profilu

**Files:**
- Modify: `app/(tabs)/points.tsx` (funkcja `RankingRow`, linie 214–231)

- [ ] **Step 1: Zaktualizuj RankingRow w points.tsx**

Dodaj `useRouter` do importów z `expo-router` (na początku pliku):
```ts
import { useRouter } from 'expo-router'
```

Zastąp funkcję `RankingRow` (linie 214–231) nową wersją z `onPress`:

```tsx
function RankingRow({ entry, position, isMe, styles, colors: c }: {
  entry: RankingEntry; position: number; isMe: boolean; styles: any; colors: Colors
}) {
  const router = useRouter()
  return (
    <TouchableOpacity
      style={[styles.rankRow, isMe && styles.rankRowMe]}
      onPress={() => !isMe && router.push(`/(tabs)/member-profile?id=${entry.profile_id}`)}
      activeOpacity={isMe ? 1 : 0.7}
    >
      <Text style={styles.rankPosition}>
        {position <= 3 ? MEDALS[position - 1] : `#${position}`}
      </Text>
      <View style={styles.rankInfo}>
        <Text style={[styles.rankName, isMe && styles.rankNameMe]}>
          {entry.full_name ?? '—'}{isMe ? ' (Ty)' : ''}
        </Text>
        <Text style={styles.rankMeta}>{entry.services_count} służb</Text>
      </View>
      <Text style={[styles.rankPoints, isMe && { color: c.primary }]}>
        {entry.total_points} pkt
      </Text>
    </TouchableOpacity>
  )
}
```

- [ ] **Step 2: Sprawdź TypeScript**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add "app/(tabs)/points.tsx"
git commit -m "feat: navigate to member profile from ranking row"
```

---

## Task 6: Aktualizacja ParentProfile (profile.tsx)

**Files:**
- Modify: `app/(tabs)/profile.tsx` (funkcja `ParentProfile`, linie 532–635)

- [ ] **Step 1: Zaktualizuj typ Child i query w ParentProfile**

Znajdź w `ParentProfile` definicję stanu `children`. Przed `function ParentProfile()` upewnij się, że lokalny typ `Child` zawiera nowe pola. Zamień istniejący `useEffect` (linie 541–558) na:

```tsx
type Child = {
  id: string
  full_name: string
  rank_name: string | null
  services_count: number
  badges: string[]  // ikony emoji aktywnych odznak
}

// W useEffect:
useEffect(() => {
  if (!profile?.id) return
  supabase.from('profiles')
    .select('id, full_name, rank_id, ranks(name)')
    .eq('parent_id', profile.id)
    .then(async ({ data }) => {
      if (!data || data.length === 0) { setLoading(false); return }

      const extras = await Promise.all(
        data.map((kid: any) => Promise.all([
          supabase.from('points_summary').select('services_count').eq('profile_id', kid.id).maybeSingle(),
          supabase.from('member_badges')
            .select('badge_definition:badge_definitions(icon)')
            .eq('profile_id', kid.id)
            .eq('is_active', true),
        ]))
      )
      setChildren(data.map((kid: any, i: number) => ({
        id: kid.id,
        full_name: kid.full_name,
        rank_name: (kid.ranks as any)?.name ?? null,
        services_count: (extras[i][0].data as any)?.services_count ?? 0,
        badges: ((extras[i][1].data ?? []) as any[])
          .map((b: any) => b.badge_definition?.icon)
          .filter(Boolean),
      })))
      setLoading(false)
    })
}, [profile?.id])
```

- [ ] **Step 2: Zaktualizuj renderowanie kart dzieci**

Dodaj `useRouter` do importów z `expo-router` (na początku profile.tsx jeśli jeszcze nie ma).

Zastąp fragment renderowania dziecka (`children.map(...)`, linie 573–584) nową wersją:

```tsx
children.map((child, i) => (
  <TouchableOpacity
    key={child.id}
    style={[styles.childRow, i < children.length - 1 && styles.childRowBorder]}
    onPress={() => router.push(`/(tabs)/member-profile?id=${child.id}`)}
    activeOpacity={0.75}
  >
    <View style={styles.childAvatar}>
      <Ionicons name="person" size={16} color={c.primary} />
    </View>
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={styles.childName}>{child.full_name}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={[styles.childRank, !child.rank_name && { color: c.textTertiary }]}>
          {child.rank_name ?? 'Brak rangi'}
        </Text>
        {child.badges.slice(0, 4).map((icon, idx) => (
          <Text key={idx} style={{ fontSize: 14 }}>{icon}</Text>
        ))}
        {child.badges.length > 4 && (
          <Text style={styles.moreBadges}>+{child.badges.length - 4}</Text>
        )}
      </View>
    </View>
    <Ionicons name="chevron-forward" size={16} color={c.textTertiary} />
  </TouchableOpacity>
))
```

Dodaj style do `createStyles(c)` w profile.tsx (po `childBadgeText`):

```ts
childRank: { fontSize: 12, color: c.primary, fontWeight: '500' },
moreBadges: { fontSize: 11, color: c.textTertiary },
```

- [ ] **Step 3: Dodaj link do katalogu odznak w MemberProfile**

W `MemberProfile`, po bloku `{activeBadges.length > 0 && ...}` (linia ~376), dodaj:

```tsx
<TouchableOpacity
  style={styles.catalogLink}
  onPress={() => router.push('/(tabs)/badge-catalog')}
  activeOpacity={0.75}
>
  <Ionicons name="ribbon-outline" size={16} color={c.primary} />
  <Text style={styles.catalogLinkText}>Zobacz dostępne odznaki →</Text>
</TouchableOpacity>
```

I analogicznie w `ParentProfile` przed `<InfoSection title="Informacje"...`:

```tsx
<TouchableOpacity
  style={styles.catalogLink}
  onPress={() => router.push('/(tabs)/badge-catalog')}
  activeOpacity={0.75}
>
  <Ionicons name="ribbon-outline" size={16} color={c.primary} />
  <Text style={styles.catalogLinkText}>Zobacz dostępne odznaki →</Text>
</TouchableOpacity>
```

Dodaj style:

```ts
catalogLink: {
  flexDirection: 'row', alignItems: 'center', gap: 8,
  padding: 14, backgroundColor: c.surface, borderRadius: 12,
  borderWidth: 1, borderColor: c.primaryAlpha12,
},
catalogLinkText: { fontSize: 14, color: c.primary, fontWeight: '500' },
```

- [ ] **Step 4: Sprawdź TypeScript**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add "app/(tabs)/profile.tsx"
git commit -m "feat: ParentProfile shows rank and badges per child with navigation"
```

---

## Task 7: Aktualizacja ParentHomeView (index.tsx)

**Files:**
- Modify: `app/(tabs)/index.tsx` (typ `ChildSummary`, `useEffect` fetch, renderowanie kart)

- [ ] **Step 1: Zaktualizuj typ ChildSummary i query**

Na początku `index.tsx` znajdź typ `ChildSummary` (lub tam gdzie jest zdefiniowany). Zaktualizuj go:

```ts
type ChildSummary = {
  id: string
  full_name: string
  rank_name: string | null
  services_count: number
  nextDuty: { title: string; date: string; time: string | null } | null
  badges: string[]
}
```

W `ParentHomeView` znajdź `useEffect` z `fetch` (linia ~349). Zaktualizuj zapytanie i mapowanie:

```ts
const { data: kids } = await supabase
  .from('profiles')
  .select('id, full_name, rank_id, ranks(name)')
  .eq('parent_id', profile.id)
```

I w `Promise.all` dla każdego dziecka dodaj trzecie zapytanie o odznaki:

```ts
const [summaryRes, nextRes, badgesRes] = await Promise.all([
  supabase.from('points_summary').select('services_count').eq('profile_id', k.id).maybeSingle(),
  supabase.from('schedule_assignments')
    .select('schedule:schedules(title, date, time)')
    .eq('profile_id', k.id)
    .gte('schedule.date', today)
    .order('schedule(date)', { ascending: true })
    .order('schedule(time)', { ascending: true })
    .limit(1)
    .maybeSingle(),
  supabase.from('member_badges')
    .select('badge_definition:badge_definitions(icon)')
    .eq('profile_id', k.id)
    .eq('is_active', true),
])
return {
  id: k.id,
  full_name: k.full_name,
  rank_name: (k as any).ranks?.name ?? null,
  services_count: (summaryRes.data as any)?.services_count ?? 0,
  nextDuty: (nextRes.data as any)?.schedule ?? null,
  badges: ((badgesRes.data ?? []) as any[]).map((b: any) => b.badge_definition?.icon).filter(Boolean),
}
```

- [ ] **Step 2: Zaktualizuj renderowanie kart dzieci**

Znajdź blok `children.map(child => ...)` (linia ~415). Zamień zawartość `childCardTop` na:

```tsx
children.map(child => (
  <TouchableOpacity
    key={child.id}
    style={styles.childCard}
    onPress={() => router.push(`/(tabs)/member-profile?id=${child.id}`)}
    activeOpacity={0.8}
  >
    <View style={styles.childCardTop}>
      <View style={styles.childAvatarSmall}>
        <Ionicons name="person" size={16} color={c.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.childCardName}>{child.full_name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <Text style={[styles.childCardMeta, child.rank_name ? { color: c.primary, fontWeight: '500' } : {}]}>
            {child.rank_name ?? 'Brak rangi'}
          </Text>
          {child.badges.slice(0, 3).map((icon: string, idx: number) => (
            <Text key={idx} style={{ fontSize: 13 }}>{icon}</Text>
          ))}
          {child.badges.length > 3 && (
            <Text style={styles.childCardMeta}>+{child.badges.length - 3}</Text>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={c.textTertiary} />
    </View>
    {child.nextDuty ? (
      <View style={styles.childNextDuty}>
        <Ionicons name="calendar-outline" size={13} color={c.primary} />
        <Text style={styles.childNextDutyText} numberOfLines={1}>
          Najbliższy dyżur: {child.nextDuty.title} ·{' '}
          {new Date(child.nextDuty.date + 'T12:00:00').toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' })}
          {' '}{child.nextDuty.time?.slice(0, 5)}
        </Text>
      </View>
    ) : (
      <View style={styles.childNextDuty}>
        <Ionicons name="calendar-outline" size={13} color={c.textTertiary} />
        <Text style={[styles.childNextDutyText, { color: c.textTertiary }]}>Brak nadchodzących dyżurów</Text>
      </View>
    )}
  </TouchableOpacity>
))
```

- [ ] **Step 3: Sprawdź TypeScript**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add "app/(tabs)/index.tsx"
git commit -m "feat: ParentHomeView shows rank and badges on child cards"
```

---

## Task 8: Admin — masowe przydzielanie rang

**Files:**
- Create: `app/(admin)/rank-assignment.tsx`
- Modify: `app/(admin)/_layout.tsx`
- Modify: `app/(admin)/(admin-tabs)/index.tsx`

- [ ] **Step 1: Utwórz app/(admin)/rank-assignment.tsx**

```tsx
import { useEffect, useState, useMemo } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, ActivityIndicator, Alert
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'
import { shadow } from '../../lib/shadows'

type MemberRow = { id: string; full_name: string; rank_id: string | null; rank_name: string | null }
type RankOption = { id: string; name: string; order: number }

export default function RankAssignmentScreen() {
  const { profile } = useAuthStore()
  const parishId = profile?.parish_id!
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
  const insets = useSafeAreaInsets()

  const [members, setMembers] = useState<MemberRow[]>([])
  const [ranks, setRanks] = useState<RankOption[]>([])
  const [loading, setLoading] = useState(true)
  const [pickerTarget, setPickerTarget] = useState<MemberRow | null>(null)

  const fetchData = async () => {
    const [membersRes, ranksRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, rank_id, ranks(name)')
        .eq('parish_id', parishId)
        .eq('role', 'member')
        .eq('is_active', true)
        .order('full_name'),
      supabase
        .from('ranks')
        .select('id, name, order')
        .or(`parish_id.is.null,parish_id.eq.${parishId}`)
        .order('order'),
    ])

    const raw = (membersRes.data ?? []) as any[]
    const sorted: MemberRow[] = [
      ...raw.filter(m => m.rank_id === null),
      ...raw.filter(m => m.rank_id !== null),
    ].map(m => ({
      id: m.id,
      full_name: m.full_name,
      rank_id: m.rank_id,
      rank_name: (m.ranks as any)?.name ?? null,
    }))

    setMembers(sorted)
    setRanks(ranksRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [parishId])

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

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={c.primary} /></View>
  }

  return (
    <>
      <FlatList
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) }]}
        data={members}
        keyExtractor={item => item.id}
        ListHeaderComponent={
          members.some(m => m.rank_id === null)
            ? <Text style={styles.hint}>Ministranci bez rangi są na górze listy.</Text>
            : null
        }
        renderItem={({ item }) => (
          <View style={styles.memberRow}>
            <View style={styles.memberAvatar}>
              <Text style={styles.memberInitials}>
                {item.full_name.split(' ').map((n: string) => n[0]).slice(0, 2).join('')}
              </Text>
            </View>
            <Text style={styles.memberName} numberOfLines={1}>{item.full_name}</Text>
            <TouchableOpacity
              style={[styles.rankChip, !item.rank_id && styles.rankChipEmpty]}
              onPress={() => setPickerTarget(item)}
              activeOpacity={0.75}
            >
              <Text style={[styles.rankChipText, !item.rank_id && styles.rankChipTextEmpty]}>
                {item.rank_name ?? 'Brak rangi'}
              </Text>
              <Ionicons name="chevron-down" size={12} color={item.rank_id ? c.primary : c.textTertiary} />
            </TouchableOpacity>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Brak aktywnych ministrantów.</Text>
          </View>
        }
      />

      <Modal
        visible={pickerTarget !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerTarget(null)}
      >
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setPickerTarget(null)}>
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>{pickerTarget?.full_name}</Text>

            <TouchableOpacity
              style={[styles.rankOption, pickerTarget?.rank_id === null && styles.rankOptionActive]}
              onPress={() => handleSetRank(pickerTarget!.id, null)}
            >
              <Text style={[styles.rankOptionText, pickerTarget?.rank_id === null && styles.rankOptionTextActive]}>
                Brak rangi
              </Text>
              {pickerTarget?.rank_id === null && <Ionicons name="checkmark" size={18} color={c.primary} />}
            </TouchableOpacity>

            {ranks.map(rank => (
              <TouchableOpacity
                key={rank.id}
                style={[styles.rankOption, pickerTarget?.rank_id === rank.id && styles.rankOptionActive]}
                onPress={() => handleSetRank(pickerTarget!.id, rank.id)}
              >
                <Text style={[styles.rankOptionText, pickerTarget?.rank_id === rank.id && styles.rankOptionTextActive]}>
                  {rank.name}
                </Text>
                {pickerTarget?.rank_id === rank.id && <Ionicons name="checkmark" size={18} color={c.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    content: { padding: 0 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    hint: { fontSize: 13, color: c.textTertiary, padding: 16, paddingBottom: 8 },
    empty: { alignItems: 'center', padding: 32 },
    emptyText: { fontSize: 14, color: c.textTertiary },

    memberRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: c.surface, paddingHorizontal: 16, paddingVertical: 14,
    },
    memberAvatar: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: c.primaryAlpha08,
      justifyContent: 'center', alignItems: 'center',
    },
    memberInitials: { fontSize: 13, fontWeight: '700', color: c.primary },
    memberName: { flex: 1, fontSize: 15, fontWeight: '500', color: c.text },
    rankChip: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: c.primaryAlpha08, borderRadius: 20,
      paddingHorizontal: 10, paddingVertical: 6,
      borderWidth: 1, borderColor: c.primaryAlpha12,
    },
    rankChipEmpty: { backgroundColor: c.bg, borderColor: c.border },
    rankChipText: { fontSize: 12, fontWeight: '600', color: c.primary },
    rankChipTextEmpty: { color: c.textTertiary },
    separator: { height: 1, backgroundColor: c.primarySurface, marginLeft: 64 },

    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      paddingHorizontal: 16, paddingTop: 8,
    },
    handle: {
      width: 36, height: 4, borderRadius: 2, backgroundColor: c.border,
      alignSelf: 'center', marginBottom: 16,
    },
    sheetTitle: { fontSize: 16, fontWeight: '700', color: c.text, marginBottom: 12, paddingHorizontal: 4 },
    rankOption: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: 14, paddingHorizontal: 4,
      borderBottomWidth: 1, borderBottomColor: c.primarySurface,
    },
    rankOptionActive: {},
    rankOptionText: { fontSize: 16, color: c.text },
    rankOptionTextActive: { color: c.primary, fontWeight: '600' },
  })
}
```

- [ ] **Step 2: Zarejestruj w app/(admin)/_layout.tsx**

Po linii:
```tsx
<Stack.Screen name="badge-management" options={{ title: 'Odznaki' }} />
```

Dodaj:
```tsx
<Stack.Screen name="rank-assignment" options={{ title: 'Przydziel rangi' }} />
```

- [ ] **Step 3: Dodaj tile w app/(admin)/(admin-tabs)/index.tsx**

Po bloku tile "Odznaki" (linia ~248), przed `{profile?.role === 'member'...}`:

```tsx
<TouchableOpacity style={styles.parishRow} onPress={() => router.push('/(admin)/rank-assignment')} activeOpacity={0.75}>
  <View style={[styles.parishIcon, { backgroundColor: c.primaryAlpha08 }]}>
    <Ionicons name="ribbon" size={22} color={c.primary} />
  </View>
  <View style={styles.parishInfo}>
    <Text style={styles.parishTitle}>Przydziel rangi</Text>
    <Text style={styles.parishSub}>Masowe przypisywanie rang formacyjnych</Text>
  </View>
  <Ionicons name="chevron-forward" size={16} color={c.iconMuted} />
</TouchableOpacity>
```

- [ ] **Step 4: Sprawdź TypeScript**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/rank-assignment.tsx" "app/(admin)/_layout.tsx" "app/(admin)/(admin-tabs)/index.tsx"
git commit -m "feat: admin bulk rank assignment screen"
```

---

## Task 9: Katalog odznak w badge-management.tsx

**Files:**
- Modify: `app/(admin)/badge-management.tsx`

- [ ] **Step 1: Dodaj import BADGE_CATALOG**

Na początku `badge-management.tsx` po istniejących importach dodaj:

```ts
import { BADGE_CATALOG } from '../../lib/badges'
```

- [ ] **Step 2: Dodaj typ AllBadge i stan**

Po istniejących typach (`CustomBadge`, `AwardHistoryRow`) dodaj:

```ts
type AllBadge = {
  id: string; name: string; icon: string; criteria_key: string; parish_id: string | null
}
```

W `BadgeManagementScreen` dodaj stan po `const [adding, setAdding] = useState(false)`:

```ts
const [allBadges, setAllBadges] = useState<AllBadge[]>([])
```

- [ ] **Step 3: Rozszerz fetchData o all badges**

W funkcji `fetchData` rozszerz `Promise.all` o trzecie zapytanie:

```ts
const [customRes, historyRes, allBadgesRes] = await Promise.all([
  // ... istniejące dwa zapytania bez zmian ...
  supabase.from('badge_definitions')
    .select('id, name, icon, criteria_key, parish_id')
    .or(`parish_id.is.null,parish_id.eq.${parishId}`)
    .order('name'),
])
// po istniejących setCustomBadges i setHistory dodaj:
setAllBadges(allBadgesRes.data ?? [])
```

- [ ] **Step 4: Dodaj sekcję katalogu w JSX**

Na końcu `<ScrollView>`, po istniejącej sekcji HISTORIA PRZYZNANYCH, przed zamykającym `</ScrollView>` dodaj:

```tsx
{/* Sekcja: Katalog odznak */}
<Text style={[styles.sectionLabel, { marginTop: 8 }]}>KATALOG ODZNAK</Text>
<View style={styles.card}>
  {allBadges.map((b, i) => (
    <View key={b.id} style={[styles.catalogRow, i < allBadges.length - 1 && styles.rowBorder]}>
      <Text style={styles.badgeIcon}>{b.icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.badgeName}>{b.name}</Text>
        <Text style={styles.catalogDesc}>
          {BADGE_CATALOG[b.criteria_key] ?? 'Przyznawana ręcznie przez animatora'}
        </Text>
      </View>
    </View>
  ))}
</View>
```

- [ ] **Step 5: Dodaj style**

W funkcji `createStyles(c: Colors)` w `badge-management.tsx` dodaj:

```ts
catalogRow: {
  flexDirection: 'row', alignItems: 'flex-start', gap: 12,
  paddingHorizontal: 16, paddingVertical: 12,
},
catalogDesc: { fontSize: 12, color: c.subtext, marginTop: 2 },
```

- [ ] **Step 6: Sprawdź TypeScript**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 7: Uruchom wszystkie testy**

```bash
npx jest --no-coverage
```

Expected: wszystkie 66 testów PASS

- [ ] **Step 8: Commit**

```bash
git add "app/(admin)/badge-management.tsx"
git commit -m "feat: add badge catalog section to admin badge management"
```
