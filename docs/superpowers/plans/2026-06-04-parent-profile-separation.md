# Parent Profile Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract parent role into its own `(parent)/(parent-tabs)` area, mirroring how `(admin)` works, so there are no more `if (role === 'parent')` branches scattered across member screens.

**Architecture:** Create `app/(parent)/_layout.tsx` (Stack + guard) and `app/(parent)/(parent-tabs)/_layout.tsx` (Tabs with 5 tabs, home at center). Move all `ParentXxx` components out of `(tabs)` screens into dedicated parent screens. Add parent redirect in `(tabs)/_layout.tsx`. Register `(parent)` in root `_layout.tsx`.

**Tech Stack:** Expo Router, React Native, Supabase, CustomTabBar (existing component), Ionicons

---

## File Map

**Create:**
- `app/(parent)/_layout.tsx` — Stack + parent-role guard
- `app/(parent)/(parent-tabs)/_layout.tsx` — 5-tab layout (Dyżury | Punkty | Dom | Ogłoszenia | Czat)
- `app/(parent)/(parent-tabs)/index.tsx` — ParentHomeView
- `app/(parent)/(parent-tabs)/schedule.tsx` — ParentScheduleView
- `app/(parent)/(parent-tabs)/points.tsx` — ParentPointsView + RankingRow
- `app/(parent)/(parent-tabs)/announcements.tsx` — Announcements filtered for parent
- `app/(parent)/(parent-tabs)/chat.tsx` — Chat (no parent override needed)
- `app/(parent)/(parent-tabs)/profile.tsx` — ParentProfile + all shared helpers
- `app/(parent)/member-profile.tsx` — Member profile accessible from parent area

**Modify:**
- `app/_layout.tsx` — add `<Stack.Screen name="(parent)" />`
- `app/(tabs)/_layout.tsx` — add parent redirect + remove wiedza/chat for parent
- `app/(tabs)/index.tsx` — remove ParentHomeView, remove `if (role === 'parent')` guard
- `app/(tabs)/schedule.tsx` — remove ParentScheduleView, ChildScheduleCard, remove guard
- `app/(tabs)/points.tsx` — remove ParentPointsView, remove guard
- `app/(tabs)/profile.tsx` — remove ParentProfile, Child type, remove guard

---

## Task 1: Create `app/(parent)/_layout.tsx`

**Files:**
- Create: `app/(parent)/_layout.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useEffect } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { Stack, useRouter } from 'expo-router'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'

export default function ParentLayout() {
  const { profile, isLoading } = useAuthStore()
  const router = useRouter()
  const { colors } = useTheme()

  const hasAccess = profile?.role === 'parent'

  useEffect(() => {
    if (!isLoading && !hasAccess) {
      router.replace('/(tabs)')
    }
  }, [profile, isLoading])

  if (isLoading || !hasAccess) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.header },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen name="(parent-tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="member-profile" options={{ title: 'Profil ministranta' }} />
    </Stack>
  )
}
```

- [ ] **Step 2: Commit**
```bash
git add app/(parent)/_layout.tsx
git commit -m "feat: add (parent) Stack layout with access guard"
```

---

## Task 2: Create `app/(parent)/(parent-tabs)/_layout.tsx`

**Files:**
- Create: `app/(parent)/(parent-tabs)/_layout.tsx`

Parent tabs order: Dyżury (0) | Punkty (1) | **Dom** (2, center FAB) | Ogłoszenia (3) | Czat (4)
`CustomTabBar` sets center at `Math.floor(5/2) = 2` → Dom is at index 2.

- [ ] **Step 1: Create the file**

```tsx
import { Tabs, useRouter } from 'expo-router'
import { TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '../../../stores/authStore'
import { CustomTabBar } from '../../../components/CustomTabBar'
import { useTheme } from '../../../lib/ThemeContext'
import { AvatarImage } from '../../../components/AvatarImage'

export default function ParentTabsLayout() {
  const router = useRouter()
  const { profile } = useAuthStore()
  const { colors } = useTheme()
  const avatarUrl = profile?.avatar_url

  const avatarButton = () => (
    <TouchableOpacity
      onPress={() => router.push('/(parent)/(parent-tabs)/profile')}
      style={{ marginRight: 16 }}
      hitSlop={8}
    >
      {avatarUrl
        ? <AvatarImage avatarUrl={avatarUrl} size={32} borderColor="rgba(255,255,255,0.6)" borderWidth={2} />
        : <Ionicons name="person-circle-outline" size={30} color="#fff" />
      }
    </TouchableOpacity>
  )

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: colors.header },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Dyżury',
          headerRight: avatarButton,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="points"
        options={{
          title: 'Punkty',
          headerRight: avatarButton,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trophy-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dom',
          headerRight: avatarButton,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="announcements"
        options={{
          title: 'Ogłoszenia',
          headerRight: avatarButton,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="megaphone-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Czat',
          headerRight: avatarButton,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen name="profile" options={{ href: null, title: 'Profil' }} />
    </Tabs>
  )
}
```

- [ ] **Step 2: Commit**
```bash
git add "app/(parent)/(parent-tabs)/_layout.tsx"
git commit -m "feat: add (parent-tabs) layout with 5 tabs, home at center"
```

---

## Task 3: Create `app/(parent)/(parent-tabs)/index.tsx`

**Files:**
- Create: `app/(parent)/(parent-tabs)/index.tsx`
- Source: `app/(tabs)/index.tsx` — extract `ParentHomeView` and everything it uses

Note: Update navigation `/(tabs)/member-profile` → `/(parent)/member-profile`.
`ParentHomeView` uses: `useAuthStore`, `supabase`, `getLiturgicalDay/Accent/Bg`, `useTheme`, `shadow`, `useState`, `useEffect`, `Ionicons`, `ScrollView`, `TouchableOpacity`, `Text`, `View`, `ActivityIndicator`.

- [ ] **Step 1: Create the file**

```tsx
import { useEffect, useMemo, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../../lib/supabase'
import { shadow } from '../../../lib/shadows'
import { useAuthStore } from '../../../stores/authStore'
import { getLiturgicalDay, getLiturgicalAccentColor, getLiturgicalBgColor } from '../../../lib/liturgy'
import { useTheme } from '../../../lib/ThemeContext'
import { Colors } from '../../../lib/theme'

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type ChildSummary = {
  id: string
  full_name: string
  rank_name: string | null
  services_count: number
  nextDuty: { title: string; date: string; time: string | null } | null
  badges: string[]
}

export default function HomeScreen() {
  const { profile } = useAuthStore()
  const router = useRouter()
  const firstName = profile?.full_name?.split(' ')[0] ?? '—'
  const today = localDateStr(new Date())
  const todayLiturgy = getLiturgicalDay(today)
  const litAccent = getLiturgicalAccentColor(todayLiturgy)
  const litBg = getLiturgicalBgColor(todayLiturgy)

  const [children, setChildren] = useState<ChildSummary[]>([])
  const [loading, setLoading] = useState(true)

  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  useEffect(() => {
    if (!profile?.id) return
    let cancelled = false
    const fetch = async () => {
      const { data: kids } = await supabase
        .from('profiles')
        .select('id, full_name, rank_id, ranks(name)')
        .eq('parent_id', profile.id)

      if (cancelled) return
      if (!kids || kids.length === 0) { setLoading(false); return }

      const results = await Promise.all(
        kids.map(async (k: any) => {
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
          const assignment = nextRes.data as any
          const nextDuty = assignment?.schedule ?? null
          return {
            id: k.id,
            full_name: k.full_name,
            rank_name: (k as any).ranks?.name ?? null,
            services_count: (summaryRes.data as any)?.services_count ?? 0,
            nextDuty,
            badges: ((badgesRes.data ?? []) as any[]).map((b: any) => b.badge_definition?.icon).filter(Boolean),
          }
        })
      )
      if (cancelled) return
      setChildren(results)
      setLoading(false)
    }
    fetch()
    return () => { cancelled = true }
  }, [profile?.id])

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.greetingCard}>
        <Text style={styles.greetingName}>Witaj, {firstName}!</Text>
        <View style={styles.greetingMeta}>
          <Text style={styles.greetingRole}>Rodzic</Text>
        </View>
      </View>

      {todayLiturgy && (
        <View style={[styles.liturgyRow, litBg && { backgroundColor: litBg + '18', borderColor: litBg + '40' }]}>
          {litAccent && <View style={[styles.liturgyDot, { backgroundColor: litAccent }]} />}
          <Text style={styles.liturgyTypeLabel}>{todayLiturgy.typeLabel}:</Text>
          <Text style={styles.liturgyName} numberOfLines={2}>{todayLiturgy.name}</Text>
        </View>
      )}

      <Text style={styles.sectionLabel}>Moje dzieci</Text>
      {loading ? (
        <ActivityIndicator color={c.primary} style={{ marginVertical: 8 }} />
      ) : children.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="people-outline" size={28} color={c.iconMuted} />
          <Text style={styles.emptyText}>Brak powiązanych kont dzieci</Text>
          <Text style={[styles.emptyText, { fontSize: 12, marginTop: 4 }]}>Poproś administratora o przypisanie konta</Text>
        </View>
      ) : (
        children.map(child => (
          <TouchableOpacity
            key={child.id}
            style={styles.childCard}
            onPress={() => router.push(`/(parent)/member-profile?id=${child.id}`)}
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
      )}

      <Text style={styles.sectionLabel}>Szybkie akcje</Text>
      <View style={styles.actionsRow}>
        <QuickAction icon="calendar-outline" color={c.primary} label="Dyżury dzieci" onPress={() => router.push('/(parent)/(parent-tabs)/schedule')} styles={styles} />
        <QuickAction icon="megaphone-outline" color={c.primary} label="Ogłoszenia" onPress={() => router.push('/(parent)/(parent-tabs)/announcements')} styles={styles} />
        <QuickAction icon="trophy-outline" color={c.gold} label="Punkty" onPress={() => router.push('/(parent)/(parent-tabs)/points')} styles={styles} />
      </View>
    </ScrollView>
  )
}

function QuickAction({ icon, color, label, onPress, styles }: { icon: any; color: string; label: string; onPress: () => void; styles: any }) {
  return (
    <TouchableOpacity style={styles.quickAction} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.quickIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </TouchableOpacity>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    content: { padding: 16, gap: 16 },
    greetingCard: {
      backgroundColor: c.primary, borderRadius: 16, padding: 20, gap: 8,
      ...shadow.brand,
    },
    greetingName: { fontSize: 24, fontWeight: '700', color: '#fff' },
    greetingMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    greetingRole: { fontSize: 13, color: '#ffffffCC', fontWeight: '500' },
    liturgyRow: {
      flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
      paddingHorizontal: 14, paddingVertical: 10, gap: 6,
      backgroundColor: c.goldSurface, borderRadius: 12,
      borderWidth: 1, borderColor: c.border,
    },
    liturgyDot: { width: 8, height: 8, borderRadius: 4 },
    liturgyTypeLabel: { fontSize: 12, color: c.gold, fontWeight: '600' },
    liturgyName: { fontSize: 13, color: c.text, flex: 1 },
    sectionLabel: {
      fontSize: 12, fontWeight: '700', color: c.textTertiary,
      textTransform: 'uppercase', letterSpacing: 0.8,
    },
    emptyCard: {
      backgroundColor: c.surface, borderRadius: 12, padding: 20,
      alignItems: 'center', gap: 6,
      ...shadow.xs,
    },
    emptyText: { fontSize: 13, color: c.textTertiary },
    childCard: {
      backgroundColor: c.surface, borderRadius: 12, padding: 14,
      gap: 8, ...shadow.xs,
    },
    childCardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    childAvatarSmall: {
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: c.primaryAlpha08, justifyContent: 'center', alignItems: 'center',
    },
    childCardName: { fontSize: 15, fontWeight: '700', color: c.text },
    childCardMeta: { fontSize: 12, color: c.subtext, marginTop: 1 },
    childNextDuty: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: c.bg },
    childNextDutyText: { flex: 1, fontSize: 12, color: c.primary, fontWeight: '500' },
    actionsRow: { flexDirection: 'row', gap: 10 },
    quickAction: {
      flex: 1, backgroundColor: c.surface, borderRadius: 14, padding: 14,
      alignItems: 'center', gap: 8,
      ...shadow.md,
    },
    quickIcon: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    quickLabel: { fontSize: 12, fontWeight: '600', color: c.text, textAlign: 'center' },
  })
}
```

- [ ] **Step 2: Commit**
```bash
git add "app/(parent)/(parent-tabs)/index.tsx"
git commit -m "feat: add parent home screen"
```

---

## Task 4: Create `app/(parent)/(parent-tabs)/schedule.tsx`

**Files:**
- Create: `app/(parent)/(parent-tabs)/schedule.tsx`
- Source: `app/(tabs)/schedule.tsx` — extract `ParentScheduleView`, `ChildScheduleCard`, `MetaRow`, and `createStyles` (only the styles those components use)

- [ ] **Step 1: Create the file**

```tsx
import { useEffect, useMemo, useState } from 'react'
import {
  View, Text, FlatList, StyleSheet,
  RefreshControl, ActivityIndicator, TouchableOpacity
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../../lib/supabase'
import { shadow } from '../../../lib/shadows'
import { useAuthStore } from '../../../stores/authStore'
import { STATUS_COLORS, STATUS_LABELS } from '../../../lib/status'
import { useTheme } from '../../../lib/ThemeContext'
import { Colors } from '../../../lib/theme'

export default function ScheduleScreen() {
  const { profile } = useAuthStore()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const today = new Date().toISOString().split('T')[0]

  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  const fetchData = async () => {
    if (!profile?.id) return
    const { data: children } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('parent_id', profile.id)

    if (!children || children.length === 0) {
      setItems([])
      setLoading(false)
      setRefreshing(false)
      return
    }

    const childMap = new Map(children.map((c: any) => [c.id, c.full_name]))
    const childIds = children.map((c: any) => c.id)

    const { data } = await supabase
      .from('schedule_assignments')
      .select(`
        id, status, profile_id,
        schedule:schedules(id, title, date, time, group:groups(name))
      `)
      .in('profile_id', childIds)

    if (data) {
      setItems(
        data
          .map((a: any) => ({
            ...a.schedule,
            assignmentId: a.id,
            childName: childMap.get(a.profile_id) ?? '?',
            myStatus: a.status,
          }))
          .filter((s: any) => s?.id && s.date >= today)
          .sort((a: any, b: any) => a.date.localeCompare(b.date))
      )
    }
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => { fetchData() }, [profile?.id])

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={c.primary} /></View>
  }

  return (
    <FlatList
      data={items}
      keyExtractor={item => item.assignmentId}
      style={{ flex: 1, backgroundColor: c.bg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData() }} />}
      ListHeaderComponent={
        <Text style={styles.parentHeader}>Nadchodzące dyżury dzieci</Text>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name="calendar-outline" size={48} color={c.iconMuted} />
          <Text style={styles.emptyText}>Brak nadchodzących dyżurów</Text>
        </View>
      }
      renderItem={({ item }) => <ChildScheduleCard schedule={item} styles={styles} colors={c} />}
      contentContainerStyle={{ padding: 16, gap: 12 }}
    />
  )
}

function ChildScheduleCard({ schedule, styles, colors: c }: { schedule: any; styles: any; colors: Colors }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{schedule.title}</Text>
        <View style={[styles.pill, { backgroundColor: (STATUS_COLORS[schedule.myStatus] ?? c.subtext) + '22' }]}>
          <Text style={[styles.pillText, { color: STATUS_COLORS[schedule.myStatus] ?? c.subtext }]}>
            {STATUS_LABELS[schedule.myStatus] ?? schedule.myStatus}
          </Text>
        </View>
      </View>
      <View style={[styles.row, { marginBottom: 2 }]}>
        <Ionicons name="person-outline" size={14} color={c.primary} />
        <Text style={[styles.cardMeta, { color: c.primary, fontWeight: '600' }]}>{schedule.childName}</Text>
      </View>
      <MetaRow icon="calendar-outline" text={
        new Date(schedule.date + 'T12:00:00').toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })
      } styles={styles} />
      <MetaRow icon="time-outline" text={schedule.time?.slice(0, 5)} styles={styles} />
      {schedule.group && <MetaRow icon="people-outline" text={schedule.group.name} color={c.primary} styles={styles} />}
    </View>
  )
}

function MetaRow({ icon, text, color, styles }: { icon: any; text: string; color?: string; styles: any }) {
  const { colors: c } = useTheme()
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={14} color={color ?? c.subtext} />
      <Text style={[styles.cardMeta, { color: color ?? c.subtext }]}>{text}</Text>
    </View>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    empty: { alignItems: 'center', marginTop: 60, gap: 10 },
    emptyText: { color: c.textTertiary, fontSize: 16 },
    parentHeader: { fontSize: 17, fontWeight: '700', color: c.text, marginBottom: 4 },
    card: {
      backgroundColor: c.surface, borderRadius: 12, padding: 12, gap: 4,
      ...shadow.md,
    },
    cardHeader: {
      flexDirection: 'row', justifyContent: 'space-between',
      alignItems: 'center', marginBottom: 2,
    },
    cardTitle: { fontSize: 16, fontWeight: '600', color: c.text, flex: 1 },
    pill: {
      flexDirection: 'row', alignItems: 'center', gap: 3,
      borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
    },
    pillText: { fontSize: 12, fontWeight: '500' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    cardMeta: { fontSize: 13 },
  })
}
```

- [ ] **Step 2: Commit**
```bash
git add "app/(parent)/(parent-tabs)/schedule.tsx"
git commit -m "feat: add parent schedule screen"
```

---

## Task 5: Create `app/(parent)/(parent-tabs)/points.tsx`

**Files:**
- Create: `app/(parent)/(parent-tabs)/points.tsx`
- Source: `app/(tabs)/points.tsx` — extract `ParentPointsView`, `RankingRow`

- [ ] **Step 1: Create the file**

```tsx
import { useEffect, useState, useMemo } from 'react'
import {
  View, Text, FlatList, StyleSheet,
  RefreshControl, ActivityIndicator, TouchableOpacity
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../../lib/supabase'
import { shadow } from '../../../lib/shadows'
import { useAuthStore } from '../../../stores/authStore'
import { useTheme } from '../../../lib/ThemeContext'
import { Colors } from '../../../lib/theme'

type RankingEntry = {
  profile_id: string
  full_name: string
  total_points: number
  services_count: number
}

type ChildPoints = { id: string; full_name: string; total_points: number; services_count: number }

export default function PointsScreen() {
  const { profile } = useAuthStore()
  const [children, setChildren] = useState<ChildPoints[]>([])
  const [ranking, setRanking] = useState<RankingEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<'children' | 'ranking'>('children')

  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  const fetchData = async () => {
    if (!profile?.id || !profile?.parish_id) return

    const [kidsRes, rankingRes, parishProfilesRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name').eq('parent_id', profile.id),
      supabase.from('points_summary').select('profile_id, full_name, total_points, services_count').eq('parish_id', profile.parish_id).order('total_points', { ascending: false }),
      supabase.from('profiles').select('id').eq('parish_id', profile.parish_id).eq('is_active', true),
    ])

    const parishIds = new Set((parishProfilesRes.data ?? []).map((p: any) => p.id))
    setRanking((rankingRes.data ?? []).filter(r => parishIds.has(r.profile_id)))

    const kids = kidsRes.data ?? []
    if (kids.length > 0) {
      const summaries = await Promise.all(
        kids.map((k: any) =>
          supabase.from('points_summary').select('total_points, services_count').eq('profile_id', k.id).maybeSingle()
        )
      )
      setChildren(kids.map((k: any, i: number) => ({
        id: k.id,
        full_name: k.full_name,
        total_points: (summaries[i].data as any)?.total_points ?? 0,
        services_count: (summaries[i].data as any)?.services_count ?? 0,
      })))
    } else {
      setChildren([])
    }

    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => { fetchData() }, [profile?.id])

  const onRefresh = () => { setRefreshing(true); fetchData() }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={c.primary} /></View>

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'children' && styles.tabActive]}
          onPress={() => setActiveTab('children')}
        >
          <Text style={[styles.tabText, activeTab === 'children' && styles.tabTextActive]}>Moje dzieci</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'ranking' && styles.tabActive]}
          onPress={() => setActiveTab('ranking')}
        >
          <Text style={[styles.tabText, activeTab === 'ranking' && styles.tabTextActive]}>Ranking</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'children' ? (
        <FlatList
          data={children}
          keyExtractor={item => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={48} color={c.iconMuted} />
              <Text style={styles.emptyText}>Brak powiązanych kont dzieci</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.primaryAlpha08, justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name="person" size={20} color={c.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: c.text }}>{item.full_name}</Text>
                <Text style={{ fontSize: 12, color: c.subtext, marginTop: 2 }}>{item.services_count} służb</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 20, fontWeight: '700', color: c.primary }}>{item.total_points}</Text>
                <Text style={{ fontSize: 11, color: c.textTertiary }}>pkt</Text>
              </View>
            </View>
          )}
          contentContainerStyle={{ padding: 16, gap: 10 }}
        />
      ) : (
        <FlatList
          data={ranking}
          keyExtractor={item => item.profile_id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="podium-outline" size={48} color={c.iconMuted} />
              <Text style={styles.emptyText}>Brak danych rankingowych</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <RankingRow entry={item} position={index + 1} styles={styles} colors={c} />
          )}
          contentContainerStyle={{ padding: 16, gap: 8 }}
        />
      )}
    </View>
  )
}

const MEDALS = ['🥇', '🥈', '🥉']

function RankingRow({ entry, position, styles, colors: c }: {
  entry: RankingEntry; position: number; styles: any; colors: Colors
}) {
  return (
    <View style={styles.rankRow}>
      <Text style={styles.rankPosition}>
        {position <= 3 ? MEDALS[position - 1] : `#${position}`}
      </Text>
      <View style={styles.rankInfo}>
        <Text style={styles.rankName}>{entry.full_name ?? '—'}</Text>
        <Text style={styles.rankMeta}>{entry.services_count} służb</Text>
      </View>
      <Text style={styles.rankPoints}>{entry.total_points} pkt</Text>
    </View>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    tabs: {
      flexDirection: 'row', margin: 16, marginBottom: 0,
      backgroundColor: c.border, borderRadius: 10, padding: 3,
    },
    tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
    tabActive: { backgroundColor: c.surface, ...shadow.md },
    tabText: { fontSize: 14, fontWeight: '500', color: c.subtext },
    tabTextActive: { color: c.text },
    card: {
      backgroundColor: c.surface, borderRadius: 12, padding: 14, gap: 5, ...shadow.xs,
    },
    rankRow: {
      backgroundColor: c.surface, borderRadius: 12, padding: 14,
      flexDirection: 'row', alignItems: 'center', gap: 12, ...shadow.xs,
    },
    rankPosition: { fontSize: 18, width: 36, textAlign: 'center' },
    rankInfo: { flex: 1 },
    rankName: { fontSize: 14, fontWeight: '500', color: c.text },
    rankMeta: { fontSize: 12, color: c.textTertiary, marginTop: 1 },
    rankPoints: { fontSize: 15, fontWeight: '700', color: c.text },
    empty: { alignItems: 'center', marginTop: 60, gap: 12 },
    emptyText: { color: c.textTertiary, fontSize: 15 },
  })
}
```

- [ ] **Step 2: Commit**
```bash
git add "app/(parent)/(parent-tabs)/points.tsx"
git commit -m "feat: add parent points screen"
```

---

## Task 6: Create `app/(parent)/(parent-tabs)/announcements.tsx`

**Files:**
- Create: `app/(parent)/(parent-tabs)/announcements.tsx`
- Source: `app/(tabs)/announcements.tsx` — copy the full file, update import paths from `../../` to `../../../`

- [ ] **Step 1: Copy with updated imports**

Open `app/(tabs)/announcements.tsx`. Copy the entire file to `app/(parent)/(parent-tabs)/announcements.tsx`.
Change every `'../../` import prefix to `'../../../`:
- `'../../lib/supabase'` → `'../../../lib/supabase'`
- `'../../lib/shadows'` → `'../../../lib/shadows'`
- `'../../stores/authStore'` → `'../../../stores/authStore'`
- `'../../types/database'` → `'../../../types/database'`
- `'../../hooks/useRealtimeTable'` → `'../../../hooks/useRealtimeTable'`
- `'../../lib/ThemeContext'` → `'../../../lib/ThemeContext'`
- `'../../lib/theme'` → `'../../../lib/theme'`

The parent role already filters `target_audience` to `['all', 'parents']` inside `fetchAnnouncements`. No other changes needed.

- [ ] **Step 2: Commit**
```bash
git add "app/(parent)/(parent-tabs)/announcements.tsx"
git commit -m "feat: add parent announcements screen"
```

---

## Task 7: Create `app/(parent)/(parent-tabs)/chat.tsx`

**Files:**
- Create: `app/(parent)/(parent-tabs)/chat.tsx`
- Source: `app/(tabs)/chat.tsx` — copy full file, update import paths

- [ ] **Step 1: Copy with updated imports**

Copy `app/(tabs)/chat.tsx` to `app/(parent)/(parent-tabs)/chat.tsx`.
Change every `'../../` import prefix to `'../../../`:
- `'../../lib/supabase'` → `'../../../lib/supabase'`
- `'../../stores/authStore'` → `'../../../stores/authStore'`
- `'../../lib/ThemeContext'` → `'../../../lib/ThemeContext'`
- `'../../lib/theme'` → `'../../../lib/theme'`
- `'../../types/chat'` → `'../../../types/chat'`
- `'../../hooks/useRealtimeTable'` → `'../../../hooks/useRealtimeTable'`

Also update any `router.push` calls that reference `/(tabs)/` routes to use the appropriate parent routes if needed (e.g. chat detail screens that use `/chat/` are under the root stack so they stay as-is).

- [ ] **Step 2: Commit**
```bash
git add "app/(parent)/(parent-tabs)/chat.tsx"
git commit -m "feat: add parent chat screen"
```

---

## Task 8: Create `app/(parent)/(parent-tabs)/profile.tsx`

**Files:**
- Create: `app/(parent)/(parent-tabs)/profile.tsx`
- Source: `app/(tabs)/profile.tsx` — extract `ParentProfile` and all shared helpers it depends on

The new file needs: `ParentProfile`, `Child` type, `AvatarCard`, `EditProfileModal`, `InfoSection`, `InfoRow`, `SignOutButton`, `createStyles`, and all their imports.

- [ ] **Step 1: Create the file**

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator, Platform,
  Modal, TextInput, KeyboardAvoidingView
} from 'react-native'
import Toast from 'react-native-toast-message'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../../../lib/supabase'
import { shadow } from '../../../lib/shadows'
import { useAuthStore } from '../../../stores/authStore'
import { useTheme } from '../../../lib/ThemeContext'
import { Colors } from '../../../lib/theme'
import { useThemeStore, ThemeOverride } from '../../../stores/themeStore'
import { AvatarImage } from '../../../components/AvatarImage'
import {
  PRESET_ICONS, PRESET_COLORS, buildPresetUrl, parsePresetUrl, isPresetUrl,
} from '../../../lib/presetAvatar'
import { OnboardingModal } from '../../../components/OnboardingModal'
```

Then copy the following functions verbatim from `app/(tabs)/profile.tsx`, with no changes to logic:
- `AvatarCard` (lines ~41–300)
- `EditProfileModal` (lines ~781–890)
- `InfoSection` (lines ~906–918)
- `InfoRow` (lines ~920–932)
- `SignOutButton` (lines ~934–964)
- `createStyles` (lines ~968–1237)

Then add the `ParentProfile` component (lines ~610–777) and `Child` type (lines ~602–608) verbatim from `app/(tabs)/profile.tsx`, updating the two `router.push` calls:
- `router.push(\`/(tabs)/member-profile?id=${child.id}\`)` → `router.push(\`/(parent)/member-profile?id=${child.id}\`)`
- `router.push('/(tabs)/badge-catalog')` → keep as `'/(tabs)/badge-catalog'` (badge catalog remains in the (tabs) area)

Default export:
```tsx
export default function ProfileScreen() {
  return <ParentProfile />
}
```

- [ ] **Step 2: Commit**
```bash
git add "app/(parent)/(parent-tabs)/profile.tsx"
git commit -m "feat: add parent profile screen"
```

---

## Task 9: Create `app/(parent)/member-profile.tsx`

**Files:**
- Create: `app/(parent)/member-profile.tsx`
- Source: `app/(tabs)/member-profile.tsx` — copy full file, update import paths from `../../` to `../../../` (one extra level up because this is in `(parent)/` not `(parent)/(parent-tabs)/`)

Wait — `app/(parent)/member-profile.tsx` is at the same depth as `app/(tabs)/member-profile.tsx` relative to `app/`, so paths stay `../../` (both are two levels deep). No changes to imports needed. Just copy verbatim.

- [ ] **Step 1: Copy the file**

Copy `app/(tabs)/member-profile.tsx` to `app/(parent)/member-profile.tsx` with no changes. The `../../lib/`, `../../stores/`, etc. paths are identical at this depth.

- [ ] **Step 2: Commit**
```bash
git add "app/(parent)/member-profile.tsx"
git commit -m "feat: add member-profile screen for parent area"
```

---

## Task 10: Wire routing in root and tabs layouts

**Files:**
- Modify: `app/_layout.tsx` — add `<Stack.Screen name="(parent)" />`
- Modify: `app/(tabs)/_layout.tsx` — add parent redirect

### `app/_layout.tsx`

- [ ] **Step 1: Add Stack.Screen for (parent)**

In `app/_layout.tsx`, inside the `<Stack>` block, add after `<Stack.Screen name="(admin)" />`:
```tsx
<Stack.Screen name="(parent)" />
```

### `app/(tabs)/_layout.tsx`

- [ ] **Step 2: Add parent redirect**

In `app/(tabs)/_layout.tsx`, in the `useEffect` that currently checks `profile?.role === 'admin'`, add the parent redirect:

```tsx
useEffect(() => {
  if (profile?.role === 'admin') {
    router.replace('/(admin)/(admin-tabs)')
  }
  if (profile?.role === 'parent') {
    router.replace('/(parent)/(parent-tabs)')
  }
}, [profile])
```

- [ ] **Step 3: Commit**
```bash
git add app/_layout.tsx "app/(tabs)/_layout.tsx"
git commit -m "feat: wire parent routing — redirect parent role to (parent) area"
```

---

## Task 11: Clean up `(tabs)` screens

Remove all `ParentXxx` components and their `if (role === 'parent')` guards from the member screens. Parents will never reach these screens anymore.

**Files:**
- Modify: `app/(tabs)/index.tsx`
- Modify: `app/(tabs)/schedule.tsx`
- Modify: `app/(tabs)/points.tsx`
- Modify: `app/(tabs)/profile.tsx`

### `app/(tabs)/index.tsx`

- [ ] **Step 1: Remove ParentHomeView**

Delete the `ParentHomeView` function and the `ChildSummary` type entirely (lines ~327–481 in the original).

Update `HomeScreen` to remove the parent guard:
```tsx
export default function HomeScreen() {
  return <MemberHomeView />
}
```

### `app/(tabs)/schedule.tsx`

- [ ] **Step 2: Remove ParentScheduleView**

Delete `ParentScheduleView` (lines ~58–135) and `ChildScheduleCard` (lines ~137–159).

Update `ScheduleScreen`:
```tsx
export default function ScheduleScreen() {
  return <MemberScheduleView />
}
```

Remove the `if (profile?.role === 'parent') return <ParentScheduleView />` line and the `useAuthStore` import if it's no longer used at the top level. (It's still used inside `MemberScheduleView` so keep it.)

### `app/(tabs)/points.tsx`

- [ ] **Step 3: Remove ParentPointsView**

Delete the `ParentPointsView` function (lines ~246–360) and `ChildPoints` type (line ~244).

Remove the two lines at the top of `PointsScreen`:
```tsx
// Delete these two lines:
const { profile } = useAuthStore()
if (profile?.role === 'parent') return <ParentPointsView />
```

(The `profile` from `useAuthStore` is still used in `fetchData` so keep that usage inside the function.)

### `app/(tabs)/profile.tsx`

- [ ] **Step 4: Remove ParentProfile**

Delete the `ParentProfile` function (lines ~610–777) and the `Child` type (lines ~602–608).

Update `ProfileScreen`:
```tsx
export default function ProfileScreen() {
  const { profile } = useAuthStore()
  if (profile?.role === 'admin') return <AdminProfile />
  return <MemberProfile />
}
```

- [ ] **Step 5: Commit**
```bash
git add "app/(tabs)/index.tsx" "app/(tabs)/schedule.tsx" "app/(tabs)/points.tsx" "app/(tabs)/profile.tsx"
git commit -m "refactor: remove parent-specific code from member (tabs) screens"
```

---

## Verification

- [ ] **Run app as parent** — app should route to `/(parent)/(parent-tabs)` with 5 tabs, home/domek at center position with FAB
- [ ] **Run app as member** — `(tabs)` works unchanged, no regressions
- [ ] **Run app as admin** — `(admin)` works unchanged
- [ ] **Navigate from parent home → child profile** — should push `/(parent)/member-profile`
- [ ] **Parent profile screen** — accessible via header avatar button
- [ ] **Announcements tab** — shows only 'all' and 'parents' targeted announcements
