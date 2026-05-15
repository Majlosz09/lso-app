# Usprawiedliwienia nieobecności — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin widzi wszystkie oczekujące zgłoszenia nieobecności w jednym ekranie, może zatwierdzić lub odrzucić każde z nich (lub wszystkie naraz), a ministrant widzi wynik decyzji na swojej karcie służby.

**Architecture:** Nowy ekran `/(admin)/absence-requests` pobiera `schedule_assignments` ze statusem `excused` i pozwala adminowi zmienić status na `confirmed` (zatwierdzone) lub `absent` (odrzucone, z `admin_note`). Panel admina pokazuje badge z liczbą oczekujących. Ministrant widzi `admin_note` na karcie służby w zakładce Dyżur.

**Tech Stack:** Expo Router, React Native, Supabase JS, Ionicons

---

## Task 1: Migracja bazy danych

**Files:**
- (brak pliku — SQL uruchamiany w panelu Supabase)

- [ ] **Step 1: Dodaj kolumnę `admin_note` do tabeli `schedule_assignments`**

Otwórz **Supabase Dashboard → SQL Editor** i uruchom:

```sql
ALTER TABLE schedule_assignments
  ADD COLUMN IF NOT EXISTS admin_note text;
```

- [ ] **Step 2: Dodaj politykę RLS pozwalającą ministranci aktualizować własny assignment**

W tym samym SQL Editor:

```sql
CREATE POLICY "member_update_own_assignment"
ON schedule_assignments FOR UPDATE
TO authenticated
USING (profile_id = auth.uid())
WITH CHECK (profile_id = auth.uid());
```

- [ ] **Step 3: Zweryfikuj w Table Editor**

W Supabase Dashboard → Table Editor → `schedule_assignments`: sprawdź że kolumna `admin_note` jest widoczna. W Authentication → Policies: sprawdź że polisa `member_update_own_assignment` istnieje.

---

## Task 2: Dodaj `admin_note` do fetchMine w schedule.tsx

**Files:**
- Modify: `app/(tabs)/schedule.tsx`

- [ ] **Step 1: Dodaj `admin_note` do selecta w `fetchMine`**

W `app/(tabs)/schedule.tsx`, znajdź (ok. linia 232):

```ts
const { data: assignments } = await supabase
  .from('schedule_assignments')
  .select('id, role, status, schedule_id, absence_reason')
  .eq('profile_id', profile.id)
```

Zamień na:

```ts
const { data: assignments } = await supabase
  .from('schedule_assignments')
  .select('id, role, status, schedule_id, absence_reason, admin_note')
  .eq('profile_id', profile.id)
```

- [ ] **Step 2: Dodaj `myAdminNote` do mapowania `allWithMeta`**

Znajdź obiekt budowany w `allWithMeta` (ok. linia 268):

```ts
const allWithMeta = (schedulesRes.data ?? []).map((s: any) => {
  const dow = new Date(s.date + 'T12:00:00').getDay()
  const timeKey = `${dow}_${s.time?.slice(0, 5)}`
  return {
    ...s,
    assignmentId: aMap.get(s.id)?.id,
    myRole: aMap.get(s.id)?.role,
    myStatus: aMap.get(s.id)?.status,
    myAbsenceReason: aMap.get(s.id)?.absence_reason ?? null,
    attendance: attMap.get(s.id) ?? null,
    recurringCommitment: recurMap.get(timeKey) ?? null,
  }
})
```

Zamień na:

```ts
const allWithMeta = (schedulesRes.data ?? []).map((s: any) => {
  const dow = new Date(s.date + 'T12:00:00').getDay()
  const timeKey = `${dow}_${s.time?.slice(0, 5)}`
  return {
    ...s,
    assignmentId: aMap.get(s.id)?.id,
    myRole: aMap.get(s.id)?.role,
    myStatus: aMap.get(s.id)?.status,
    myAbsenceReason: aMap.get(s.id)?.absence_reason ?? null,
    myAdminNote: aMap.get(s.id)?.admin_note ?? null,
    attendance: attMap.get(s.id) ?? null,
    recurringCommitment: recurMap.get(timeKey) ?? null,
  }
})
```

- [ ] **Step 3: Commit**

```bash
git add app/(tabs)/schedule.tsx
git commit -m "feat: fetch admin_note in member schedule assignments"
```

---

## Task 3: Pokaż informację zwrotną o decyzji admina w MyScheduleCard

**Files:**
- Modify: `app/(tabs)/schedule.tsx`

- [ ] **Step 1: Dodaj banner odrzucenia po istniejącym `absenceReasonBadge`**

W komponencie `MyScheduleCard`, znajdź (ok. linia 933):

```tsx
{(schedule.myStatus === 'excused' || schedule.myStatus === 'confirmed') && schedule.myAbsenceReason && (
  <View style={styles.absenceReasonBadge}>
    <Ionicons name="chatbubble-outline" size={13} color="#e67e22" />
    <Text style={styles.absenceReasonText}>{schedule.myAbsenceReason}</Text>
  </View>
)}
```

Zamień na:

```tsx
{(schedule.myStatus === 'excused') && schedule.myAbsenceReason && (
  <View style={styles.absenceReasonBadge}>
    <Ionicons name="chatbubble-outline" size={13} color="#e67e22" />
    <Text style={styles.absenceReasonText}>{schedule.myAbsenceReason}</Text>
  </View>
)}

{schedule.myStatus === 'confirmed' && (
  <View style={styles.confirmedBadge}>
    <Ionicons name="checkmark-circle" size={13} color="#2980b9" />
    <Text style={styles.confirmedText}>Nieobecność usprawiedliwiona</Text>
  </View>
)}

{schedule.myStatus === 'absent' && schedule.myAdminNote && (
  <View style={styles.rejectionBadge}>
    <Ionicons name="alert-circle-outline" size={13} color="#e74c3c" />
    <Text style={styles.rejectionText}>{schedule.myAdminNote}</Text>
  </View>
)}
```

- [ ] **Step 2: Dodaj nowe style na końcu `StyleSheet.create`**

```ts
confirmedBadge: {
  flexDirection: 'row', alignItems: 'center', gap: 6,
  backgroundColor: '#eaf4fb', borderRadius: 8,
  paddingHorizontal: 10, paddingVertical: 6, marginTop: 2,
},
confirmedText: { fontSize: 12, color: '#2980b9', fontWeight: '500' },

rejectionBadge: {
  flexDirection: 'row', alignItems: 'flex-start', gap: 6,
  backgroundColor: '#fff3f3', borderRadius: 8,
  paddingHorizontal: 10, paddingVertical: 7, marginTop: 2,
},
rejectionText: { fontSize: 12, color: '#e74c3c', flex: 1, lineHeight: 17 },
```

- [ ] **Step 3: Commit**

```bash
git add app/(tabs)/schedule.tsx
git commit -m "feat: show admin decision feedback on member schedule card"
```

---

## Task 4: Badge z licznikiem oczekujących w panelu admina

**Files:**
- Modify: `app/(admin)/(admin-tabs)/index.tsx`

- [ ] **Step 1: Dodaj `useFocusEffect` do importów**

Znajdź linię 1:

```ts
import { useEffect, useState, useCallback, useMemo } from 'react'
```

Zamień na (bez zmian — `useCallback` już jest):

```ts
import { useEffect, useState, useCallback, useMemo } from 'react'
```

Znajdź linię z importem expo-router:

```ts
import { useRouter } from 'expo-router'
```

Zamień na:

```ts
import { useRouter, useFocusEffect } from 'expo-router'
```

- [ ] **Step 2: Wyodrębnij fetchStats do useCallback i wywołaj przez useFocusEffect**

Znajdź istniejący `useEffect` ze statystykami (ok. linia 40):

```ts
useEffect(() => {
  const nextWeek = new Date()
  nextWeek.setDate(nextWeek.getDate() + 7)
  const nextWeekStr = localDateStr(nextWeek)
  Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('role', 'member'),
    supabase.from('schedule_assignments').select('id', { count: 'exact', head: true }).eq('status', 'excused'),
    supabase.from('schedules').select('id, schedule_assignments(id)').gte('date', today).lte('date', nextWeekStr),
  ]).then(([membersRes, absentRes, unstaffRes]) => {
    const unstaffCount = (unstaffRes.data ?? []).filter((s: any) => s.schedule_assignments.length === 0).length
    setStats({ members: membersRes.count ?? 0, absent: absentRes.count ?? 0, unstaff: unstaffCount })
    setStatsLoading(false)
  })
}, [])
```

Zamień na:

```ts
const fetchStats = useCallback(() => {
  const nextWeek = new Date()
  nextWeek.setDate(nextWeek.getDate() + 7)
  const nextWeekStr = localDateStr(nextWeek)
  Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('role', 'member'),
    supabase.from('schedule_assignments').select('id', { count: 'exact', head: true }).eq('status', 'excused'),
    supabase.from('schedules').select('id, schedule_assignments(id)').gte('date', today).lte('date', nextWeekStr),
  ]).then(([membersRes, absentRes, unstaffRes]) => {
    const unstaffCount = (unstaffRes.data ?? []).filter((s: any) => s.schedule_assignments.length === 0).length
    setStats({ members: membersRes.count ?? 0, absent: absentRes.count ?? 0, unstaff: unstaffCount })
    setStatsLoading(false)
  })
}, [today])

useFocusEffect(fetchStats)
```

- [ ] **Step 3: Dodaj banner oczekujących po sekcji statystyk**

Znajdź w JSX sekcję `{statsLoading ? ... : (<View style={styles.statsRow}>...</View>)}`.
Bezpośrednio **po** tej sekcji (po zamykającym nawiasie `)`) dodaj:

```tsx
{!statsLoading && stats.absent > 0 && (
  <TouchableOpacity
    style={styles.absenceBanner}
    onPress={() => router.push('/(admin)/absence-requests')}
    activeOpacity={0.8}
  >
    <View style={styles.absenceBannerBadge}>
      <Text style={styles.absenceBannerBadgeText}>{stats.absent}</Text>
    </View>
    <View style={{ flex: 1 }}>
      <Text style={styles.absenceBannerTitle}>Usprawiedliwienia nieobecności</Text>
      <Text style={styles.absenceBannerSub}>
        {stats.absent === 1 ? '1 oczekuje' : `${stats.absent} oczekują`} na decyzję
      </Text>
    </View>
    <Ionicons name="chevron-forward" size={16} color="#e67e22" />
  </TouchableOpacity>
)}
```

- [ ] **Step 4: Zaktualizuj nawigację istniejącego StatCard "Prośby o usprawiedliwienie"**

Znajdź:

```tsx
<StatCard icon="alert-circle" color="#e74c3c" value={stats.absent} label="Prośby o usprawiedliwienie"
  onPress={() => router.push('/(admin)/(admin-tabs)/schedules')} />
```

Zamień na:

```tsx
<StatCard icon="alert-circle" color="#e74c3c" value={stats.absent} label="Prośby o usprawiedliwienie"
  onPress={() => router.push('/(admin)/absence-requests')} />
```

- [ ] **Step 5: Dodaj nowe style na końcu `StyleSheet.create`**

```ts
absenceBanner: {
  flexDirection: 'row', alignItems: 'center', gap: 12,
  backgroundColor: '#fff3e0', borderRadius: 14, padding: 14,
  borderWidth: 1.5, borderColor: '#e67e22',
},
absenceBannerBadge: {
  width: 28, height: 28, borderRadius: 14,
  backgroundColor: '#e67e22', justifyContent: 'center', alignItems: 'center',
},
absenceBannerBadgeText: { fontSize: 13, fontWeight: '800', color: '#fff' },
absenceBannerTitle: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
absenceBannerSub: { fontSize: 12, color: '#888', marginTop: 1 },
```

- [ ] **Step 6: Commit**

```bash
git add "app/(admin)/(admin-tabs)/index.tsx"
git commit -m "feat: add absence requests badge to admin panel"
```

---

## Task 5: Nowy ekran zarządzania zgłoszeniami

**Files:**
- Create: `app/(admin)/absence-requests.tsx`

- [ ] **Step 1: Utwórz plik `app/(admin)/absence-requests.tsx`**

```tsx
import { useEffect, useState } from 'react'
import {
  View, Text, FlatList, StyleSheet,
  TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native'
import { Stack } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { shadow } from '../../lib/shadows'

const REJECTION_NOTE =
  'Usprawiedliwienie nie zostało zatwierdzone. Skontaktuj się z księdzem, aby wyjaśnić sytuację.'

type AbsenceRequest = {
  id: string
  absence_reason: string
  profile: { full_name: string }
  schedule: { title: string; date: string; time: string }
}

export default function AbsenceRequestsScreen() {
  const { profile } = useAuthStore()
  const [requests, setRequests] = useState<AbsenceRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [processingAll, setProcessingAll] = useState(false)

  const fetchRequests = async () => {
    const { data } = await supabase
      .from('schedule_assignments')
      .select('id, absence_reason, profile:profiles(full_name), schedule:schedules(title, date, time)')
      .eq('status', 'excused')
    const sorted = ((data ?? []) as AbsenceRequest[]).sort((a, b) =>
      a.schedule.date.localeCompare(b.schedule.date)
    )
    setRequests(sorted)
    setLoading(false)
  }

  useEffect(() => { fetchRequests() }, [])

  const handleApprove = async (id: string) => {
    setProcessingId(id)
    const { error } = await supabase
      .from('schedule_assignments')
      .update({ status: 'confirmed', admin_note: null })
      .eq('id', id)
    setProcessingId(null)
    if (error) { Alert.alert('Błąd', error.message); return }
    setRequests(prev => prev.filter(r => r.id !== id))
  }

  const handleReject = async (id: string) => {
    setProcessingId(id)
    const { error } = await supabase
      .from('schedule_assignments')
      .update({ status: 'absent', admin_note: REJECTION_NOTE })
      .eq('id', id)
    setProcessingId(null)
    if (error) { Alert.alert('Błąd', error.message); return }
    setRequests(prev => prev.filter(r => r.id !== id))
  }

  const handleApproveAll = () => {
    Alert.alert(
      'Zatwierdź wszystkie',
      `Zatwierdzić ${requests.length} oczekujące zgłoszenia?`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Zatwierdź wszystkie',
          onPress: async () => {
            setProcessingAll(true)
            const ids = requests.map(r => r.id)
            const { error } = await supabase
              .from('schedule_assignments')
              .update({ status: 'confirmed', admin_note: null })
              .in('id', ids)
            setProcessingAll(false)
            if (error) { Alert.alert('Błąd', error.message); return }
            setRequests([])
          },
        },
      ]
    )
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#534AB7" /></View>
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Usprawiedliwienia nieobecności' }} />
      <FlatList
        data={requests}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListHeaderComponent={requests.length >= 2 ? (
          <TouchableOpacity
            style={[styles.bulkBtn, processingAll && { opacity: 0.6 }]}
            onPress={handleApproveAll}
            disabled={processingAll}
          >
            {processingAll
              ? <ActivityIndicator size="small" color="#534AB7" />
              : (
                <>
                  <Ionicons name="checkmark-done-outline" size={18} color="#534AB7" />
                  <Text style={styles.bulkBtnText}>Zatwierdź wszystkie ({requests.length})</Text>
                </>
              )
            }
          </TouchableOpacity>
        ) : null}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="checkmark-circle-outline" size={56} color="#ccc" />
            <Text style={styles.emptyTitle}>Brak oczekujących zgłoszeń</Text>
            <Text style={styles.emptyText}>Wszystkie nieobecności zostały rozpatrzone</Text>
          </View>
        }
        renderItem={({ item }) => (
          <AbsenceCard
            request={item}
            processing={processingId === item.id}
            onApprove={() => handleApprove(item.id)}
            onReject={() => handleReject(item.id)}
          />
        )}
      />
    </>
  )
}

function AbsenceCard({ request, processing, onApprove, onReject }: {
  request: AbsenceRequest
  processing: boolean
  onApprove: () => void
  onReject: () => void
}) {
  const dateStr = new Date(request.schedule.date + 'T12:00:00').toLocaleDateString('pl-PL', {
    weekday: 'short', day: 'numeric', month: 'long',
  })
  return (
    <View style={styles.card}>
      <View style={styles.cardBody}>
        <View style={styles.cardHeader}>
          <Text style={styles.name}>{request.profile.full_name}</Text>
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingText}>OCZEKUJE</Text>
          </View>
        </View>
        <Text style={styles.scheduleInfo}>
          {request.schedule.title} · {request.schedule.time?.slice(0, 5)} · {dateStr}
        </Text>
        <View style={styles.reasonBox}>
          <Text style={styles.reasonText}>"{request.absence_reason}"</Text>
        </View>
      </View>
      <View style={styles.actions}>
        {processing ? (
          <View style={styles.processingRow}>
            <ActivityIndicator size="small" color="#534AB7" />
          </View>
        ) : (
          <>
            <TouchableOpacity style={styles.rejectBtn} onPress={onReject}>
              <Text style={styles.rejectText}>Odrzuć</Text>
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.approveBtn} onPress={onApprove}>
              <Text style={styles.approveText}>Zatwierdź</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  bulkBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#534AB711', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#534AB733', marginBottom: 4,
  },
  bulkBtnText: { fontSize: 15, fontWeight: '700', color: '#534AB7' },

  card: {
    backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden',
    ...shadow.md,
  },
  cardBody: { padding: 14, gap: 5 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  pendingBadge: { backgroundColor: '#e67e2222', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  pendingText: { fontSize: 10, fontWeight: '700', color: '#e67e22', letterSpacing: 0.3 },
  scheduleInfo: { fontSize: 12, color: '#888' },
  reasonBox: { backgroundColor: '#fff5f5', borderRadius: 8, padding: 8, marginTop: 2 },
  reasonText: { fontSize: 13, color: '#e74c3c', fontStyle: 'italic' },

  actions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  processingRow: { flex: 1, padding: 14, alignItems: 'center' },
  rejectBtn: { flex: 1, padding: 14, alignItems: 'center', backgroundColor: '#fff5f5' },
  rejectText: { fontSize: 13, fontWeight: '600', color: '#e74c3c' },
  divider: { width: 1, backgroundColor: '#f0f0f0' },
  approveBtn: { flex: 1, padding: 14, alignItems: 'center', backgroundColor: '#f0fdf4' },
  approveText: { fontSize: 13, fontWeight: '600', color: '#27ae60' },

  empty: { alignItems: 'center', marginTop: 80, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#aaa' },
  emptyText: { fontSize: 14, color: '#ccc', textAlign: 'center' },
})
```

- [ ] **Step 2: Commit**

```bash
git add "app/(admin)/absence-requests.tsx"
git commit -m "feat: add absence requests management screen for admin"
```

---

## Task 6: Weryfikacja manualna

- [ ] **Step 1: Zaloguj się jako ministrant (milosz.jakubczak@outlook.com)**
  - Przejdź do Dyżur → Służby
  - Na służbie ze statusem `assigned` sprawdź że przycisk "Zgłoś nieobecność" działa
  - Wpisz powód i wyślij — status powinien zmienić się na "Nieobecność zgłoszona" (pomarańczowy)

- [ ] **Step 2: Zaloguj się jako admin (michal.krawczyk@outlook.com)**
  - Panel powinien pokazać pomarańczowy banner "Usprawiedliwienia nieobecności" z licznikiem
  - Tapnij banner — powinien otworzyć się nowy ekran z kartą zgłoszenia
  - Zatwierdź jedno zgłoszenie — karta znika z listy
  - Wróć do panelu — licznik zmniejszył się o 1

- [ ] **Step 3: Zaloguj się z powrotem jako ministrant**
  - Sprawdź kartę zatwierdzonej służby: niebieski badge "Nieobecność usprawiedliwiona"
  - Sprawdź kartę odrzuconej służby (jeśli była): czerwony banner "Usprawiedliwienie nie zostało zatwierdzone..."

- [ ] **Step 4: Przetestuj bulk approve**
  - Jako ministrant zgłoś 2+ nieobecności
  - Jako admin otwórz ekran zgłoszeń
  - Sprawdź że pojawia się przycisk "Zatwierdź wszystkie (N)"
  - Potwierdź — lista powinna stać się pusta
