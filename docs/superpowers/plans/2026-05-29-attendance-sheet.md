# Attendance Sheet (Zbiórka) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Naprawić brak przyznawania punktów gdy admin zaznacza obecność oraz dodać przycisk "Zaznacz obecność" w widoku zbiórki otwierający bottom sheet z checklistą uczestników.

**Architecture:** Dwie zmiany w jednym pliku — `app/(admin)/schedule-detail.tsx`. Task 1 to bug fix (zastąpienie ręcznego INSERT wywołaniem RPC). Task 2 to nowy state + button + Modal + handleSaveAttendance. Brak nowych plików, brak migracji.

**Tech Stack:** React Native (Modal, ScrollView, TouchableOpacity), Expo Router, Supabase RPC `check_in_and_award_points`, TypeScript, useTheme, useSafeAreaInsets.

---

## File Map

| Plik | Zmiana |
|------|--------|
| `app/(admin)/schedule-detail.tsx` | Bug fix handleToggleAttendance + nowy state + przycisk + Modal + handleSaveAttendance + style |

---

## Task 1: Bug fix — handleToggleAttendance używa RPC

**Files:**
- Modify: `app/(admin)/schedule-detail.tsx` (linie 109–119)

Aktualnie `handleToggleAttendance` przy zaznaczaniu obecności wstawia ręcznie rekord do `attendance` ale **nie przyznaje punktów**. Naprawa: zastąpić ręczne `supabase.from('attendance').insert(...)` wywołaniem RPC `check_in_and_award_points`, które atomowo zapisuje obecność i przyznaje punkty.

- [ ] **Step 1: Znajdź i zastąp INSERT w handleToggleAttendance**

W `app/(admin)/schedule-detail.tsx` znajdź blok `else` w `handleToggleAttendance` (linie 109–120). Zastąp go:

```ts
} else {
  const { error } = await supabase.rpc('check_in_and_award_points', {
    p_schedule_id: id,
    p_profile_id: profileId,
    p_parish_id: adminProfile?.parish_id,
  })
  if (error) { Alert.alert('Błąd', error.message); setTogglingAttendance(null); return }
  setAttendanceIds(prev => new Set([...prev, profileId]))
  if (assignment && assignment.status !== 'present') {
    await handleChangeStatus(assignment.id, 'present')
  }
}
```

Cały `handleToggleAttendance` po zmianie wygląda tak:

```ts
const handleToggleAttendance = async (profileId: string) => {
  setTogglingAttendance(profileId)
  const assignment = schedule?.assignments.find(a => a.profile_id === profileId)
  if (attendanceIds.has(profileId)) {
    const { error } = await supabase.from('attendance').delete().eq('schedule_id', id).eq('profile_id', profileId)
    if (error) { Alert.alert('Błąd', error.message); setTogglingAttendance(null); return }
    setAttendanceIds(prev => { const s = new Set(prev); s.delete(profileId); return s })
    if (assignment && ['assigned', 'present'].includes(assignment.status)) {
      await handleChangeStatus(assignment.id, 'absent')
    }
  } else {
    const { error } = await supabase.rpc('check_in_and_award_points', {
      p_schedule_id: id,
      p_profile_id: profileId,
      p_parish_id: adminProfile?.parish_id,
    })
    if (error) { Alert.alert('Błąd', error.message); setTogglingAttendance(null); return }
    setAttendanceIds(prev => new Set([...prev, profileId]))
    if (assignment && assignment.status !== 'present') {
      await handleChangeStatus(assignment.id, 'present')
    }
  }
  setTogglingAttendance(null)
}
```

- [ ] **Step 2: Sprawdź TypeScript**

```
cd "c:\Users\brival\Desktop\Projekty\lso-app"
npx tsc --noEmit 2>&1 | findstr "schedule-detail"
```

Expected: brak błędów w schedule-detail.tsx

- [ ] **Step 3: Commit**

```
git add "app/(admin)/schedule-detail.tsx"
git commit -m "fix: use check_in_and_award_points RPC in admin toggle attendance"
```

---

## Task 2: Przycisk "Zaznacz obecność" + bottom sheet z checklistą

**Files:**
- Modify: `app/(admin)/schedule-detail.tsx`

### Co dodajemy

1. Trzy nowe state vars
2. Funkcja `handleSaveAttendance`
3. Przycisk pod kartą statystyk (tylko dla `category === 'zbiorka'`)
4. Modal bottom sheet z listą uczestników + checkboxami + licznikiem + przyciskiem Zapisz
5. Nowe style w `createStyles`

- [ ] **Step 1: Dodaj state vars**

W `ScheduleDetailScreen`, po linii `const [deleteSheetVisible, setDeleteSheetVisible] = useState(false)` (linia 59), dodaj:

```ts
const [attendanceSheetVisible, setAttendanceSheetVisible] = useState(false)
const [draftIds, setDraftIds] = useState<Set<string>>(new Set())
const [saving, setSaving] = useState(false)
```

- [ ] **Step 2: Dodaj handleSaveAttendance**

Po funkcji `handleToggleAttendance` (po linii 122), dodaj nową funkcję:

```ts
const handleSaveAttendance = async () => {
  if (!schedule || !adminProfile?.parish_id) return
  setSaving(true)

  for (const profileId of draftIds) {
    if (!attendanceIds.has(profileId)) {
      const { error } = await supabase.rpc('check_in_and_award_points', {
        p_schedule_id: id,
        p_profile_id: profileId,
        p_parish_id: adminProfile.parish_id,
      })
      if (error) { Alert.alert('Błąd', error.message); setSaving(false); fetchSchedule(); return }
      await supabase.from('schedule_assignments')
        .update({ status: 'present' })
        .eq('profile_id', profileId)
        .eq('schedule_id', id)
    }
  }

  for (const profileId of attendanceIds) {
    if (!draftIds.has(profileId)) {
      const { error } = await supabase.from('attendance').delete()
        .eq('schedule_id', id).eq('profile_id', profileId)
      if (error) { Alert.alert('Błąd', error.message); setSaving(false); fetchSchedule(); return }
      await supabase.from('schedule_assignments')
        .update({ status: 'absent' })
        .eq('profile_id', profileId)
        .eq('schedule_id', id)
    }
  }

  setAttendanceIds(new Set(draftIds))
  setSaving(false)
  setAttendanceSheetVisible(false)
  fetchSchedule()
}
```

- [ ] **Step 3: Dodaj przycisk "Zaznacz obecność"**

W JSX, po bloku `{/* Attendance summary */}` (po `</View>` zamykającym `attendanceCard`, linia ~281), dodaj:

```tsx
{schedule.category === 'zbiorka' && (
  <TouchableOpacity
    style={styles.attendanceBtn}
    onPress={() => {
      setDraftIds(new Set(attendanceIds))
      setAttendanceSheetVisible(true)
    }}
    activeOpacity={0.8}
  >
    <Ionicons name="checkmark-done-outline" size={18} color="#fff" />
    <Text style={styles.attendanceBtnText}>Zaznacz obecność</Text>
  </TouchableOpacity>
)}
```

- [ ] **Step 4: Dodaj Modal attendance sheet**

Na końcu JSX, przed ostatnim `</>` (po `{/* Delete sheet */}` modalu, linia ~468), dodaj:

```tsx
{/* Attendance sheet */}
<Modal
  visible={attendanceSheetVisible}
  transparent
  animationType="slide"
  onRequestClose={() => { if (!saving) setAttendanceSheetVisible(false) }}
>
  <TouchableOpacity
    style={styles.modalOverlay}
    activeOpacity={1}
    onPress={() => { if (!saving) setAttendanceSheetVisible(false) }}
  >
    <TouchableOpacity style={styles.attendanceSheet} activeOpacity={1}>
      <View style={styles.deleteSheetHandle} />
      <Text style={styles.modalTitle}>Lista obecności</Text>
      <Text style={[styles.modalSubtitle, { marginBottom: 12 }]}>{schedule?.title}</Text>

      <ScrollView style={styles.attendanceList} showsVerticalScrollIndicator={false}>
        {(schedule?.assignments ?? []).map((a, i) => (
          <TouchableOpacity
            key={a.id}
            style={[styles.attendanceRow, i < (schedule?.assignments.length ?? 0) - 1 && styles.rowBorder]}
            onPress={() => setDraftIds(prev => {
              const s = new Set(prev)
              if (s.has(a.profile_id)) s.delete(a.profile_id)
              else s.add(a.profile_id)
              return s
            })}
            activeOpacity={0.7}
          >
            <View style={styles.memberAvatar}>
              <Ionicons name="person" size={15} color={c.primary} />
            </View>
            <Text style={styles.memberName}>{a.profile.full_name}</Text>
            <Ionicons
              name={draftIds.has(a.profile_id) ? 'checkmark-circle' : 'ellipse-outline'}
              size={26}
              color={draftIds.has(a.profile_id) ? '#16A34A' : '#D1D5DB'}
            />
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.attendanceFooter}>
        <Text style={styles.attendanceCount}>
          {draftIds.size} z {schedule?.assignments.length ?? 0} obecnych
        </Text>
        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={handleSaveAttendance}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.saveBtnText}>Zapisz</Text>
          }
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  </TouchableOpacity>
</Modal>
```

- [ ] **Step 5: Dodaj style**

W funkcji `createStyles(c: Colors)`, na końcu obiektu `StyleSheet.create({...})` (przed ostatnim `})` ), dodaj:

```ts
attendanceBtn: {
  backgroundColor: c.primary, borderRadius: 12, padding: 14,
  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  ...shadow.md,
},
attendanceBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
attendanceSheet: {
  backgroundColor: c.surface,
  borderTopLeftRadius: 20, borderTopRightRadius: 20,
  padding: 20, paddingBottom: 32, maxHeight: '80%',
},
attendanceList: { flexGrow: 0 },
attendanceRow: {
  flexDirection: 'row', alignItems: 'center', gap: 12,
  paddingVertical: 12,
},
rowBorder: { borderBottomWidth: 1, borderBottomColor: c.primarySurface },
attendanceFooter: {
  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: c.primarySurface,
},
attendanceCount: { fontSize: 14, color: c.subtext },
saveBtn: {
  backgroundColor: c.primary, borderRadius: 10,
  paddingHorizontal: 24, paddingVertical: 12,
  alignItems: 'center', justifyContent: 'center', minWidth: 80,
},
saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
```

- [ ] **Step 6: Sprawdź TypeScript**

```
cd "c:\Users\brival\Desktop\Projekty\lso-app"
npx tsc --noEmit 2>&1 | findstr "schedule-detail"
```

Expected: brak błędów w schedule-detail.tsx

- [ ] **Step 7: Uruchom testy**

```
cd "c:\Users\brival\Desktop\Projekty\lso-app"
npx jest --no-coverage
```

Expected: wszystkie 66 testów PASS

- [ ] **Step 8: Commit**

```
git add "app/(admin)/schedule-detail.tsx"
git commit -m "feat: attendance sheet for zbiorka events with bulk check-in"
```
