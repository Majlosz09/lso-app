# Badge Management Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the admin badge-management screen with visual improvements and add a 3-step wizard (FAB → modal) for awarding manual badges to individual members.

**Architecture:** All changes are confined to `app/(admin)/badge-management.tsx`. The wizard is a React Native `Modal` with internal `wizardStep` state (1 | 2 | 3). Members are fetched from Supabase on modal open. Award is written via upsert to `member_badges` with `awarded_by = currentAdminId`.

**Tech Stack:** React Native, Expo, Supabase JS client, Ionicons, react-native-safe-area-context

**Spec:** `docs/superpowers/specs/2026-06-03-badge-management-redesign.md`

---

### Task 1: Add `type` field to AllBadge and update data fetching

**Files:**
- Modify: `app/(admin)/badge-management.tsx`

Adds `type` to the `AllBadge` type and its query (needed later to filter manual-only badges in the wizard). Also trims history from 30 to 10 records and renames it in state.

- [ ] **Step 1: Update `AllBadge` type and `fetchData`**

In `badge-management.tsx`, make these changes:

```typescript
// Change type (line ~31)
type AllBadge = {
  id: string; name: string; icon: string; criteria_key: string; parish_id: string | null; type: string
}
```

In `fetchData`, update the `allBadgesRes` query to select `type` and trim history limit:

```typescript
const [customRes, historyRes, allBadgesRes] = await Promise.all([
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
    .limit(10),                          // was 30
  supabase.from('badge_definitions')
    .select('id, name, icon, criteria_key, parish_id, type')   // added type
    .or(`parish_id.is.null,parish_id.eq.${parishId}`)
    .order('name'),
])
```

- [ ] **Step 2: Verify app compiles (no TS errors)**

Run: `npx tsc --noEmit` in `lso-app/`
Expected: no errors related to `AllBadge`

- [ ] **Step 3: Commit**

```bash
git add "app/(admin)/badge-management.tsx"
git commit -m "refactor(badges): add type to AllBadge, trim history to 10"
```

---

### Task 2: Redesign section headers and badge rows

**Files:**
- Modify: `app/(admin)/badge-management.tsx`

Replaces the plain uppercase label with an accented row, wraps badge emojis in rounded tiles, adds subtitle text, splits catalog into manual / system sections, and renames the history section.

- [ ] **Step 1: Add `SectionHeader` helper and new styles**

Add the helper just before `createStyles` (after the component closing brace):

```typescript
function SectionHeader({ label, color }: { label: string; color: string }) {
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
  return (
    <View style={styles.sectionHeaderRow}>
      <View style={[styles.sectionAccent, { backgroundColor: color }]} />
      <Text style={styles.sectionLabel}>{label}</Text>
    </View>
  )
}
```

In `createStyles`, replace the existing `sectionLabel` style block and add new ones:

```typescript
sectionHeaderRow: {
  flexDirection: 'row', alignItems: 'center', gap: 6,
  paddingHorizontal: 4, paddingBottom: 6,
},
sectionAccent: {
  width: 3, height: 13, borderRadius: 2,
},
sectionLabel: {
  fontSize: 12, fontWeight: '700', color: c.textTertiary,
  textTransform: 'uppercase', letterSpacing: 0.8,
},
```

- [ ] **Step 2: Replace JSX for "Odznaki parafii" section**

Replace the block that starts with `<Text style={styles.sectionLabel}>ODZNAKI PARAFII</Text>` through the closing `</View>` of that card, with:

```tsx
<SectionHeader label="Odznaki parafii" color="#FFC107" />
<View style={styles.card}>
  {customBadges.length === 0 ? (
    <View style={styles.emptyRow}>
      <Text style={styles.emptyText}>Brak własnych odznak. Dodaj pierwszą poniżej.</Text>
    </View>
  ) : (
    customBadges.map((b, i) => (
      <View key={b.id} style={[styles.badgeRow, i < customBadges.length - 1 && styles.rowBorder]}>
        <View style={styles.badgeIconTile}>
          <Text style={styles.badgeIcon}>{b.icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.badgeName}>{b.name}</Text>
          <Text style={styles.badgeSub}>Przyznawana ręcznie</Text>
        </View>
        <TouchableOpacity onPress={() => handleDelete(b)} hitSlop={8}>
          <Ionicons name="trash-outline" size={20} color="#DC2626" />
        </TouchableOpacity>
      </View>
    ))
  )}
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
```

Add to `createStyles`:
```typescript
badgeIconTile: {
  width: 32, height: 32, borderRadius: 8,
  backgroundColor: '#FFC10720',
  justifyContent: 'center', alignItems: 'center',
},
badgeSub: { fontSize: 11, color: c.textTertiary, marginTop: 1 },
```

- [ ] **Step 3: Replace "Historia przyznanych" section**

Replace `<Text style={[styles.sectionLabel, { marginTop: 8 }]}>HISTORIA PRZYZNANYCH</Text>` and its card with:

```tsx
<SectionHeader label="Ostatnio przyznane" color="#30d158" />
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
```

- [ ] **Step 4: Replace "Katalog odznak" section with two sub-sections**

Replace `<Text style={[styles.sectionLabel, { marginTop: 8 }]}>KATALOG ODZNAK</Text>` and its card with:

```tsx
<SectionHeader label="Katalog systemowy" color="#636366" />
<View style={styles.card}>
  {allBadges.filter(b => b.type === 'auto').map((b, i, arr) => (
    <View key={b.id} style={[styles.catalogRow, i < arr.length - 1 && styles.rowBorder]}>
      <View style={[styles.badgeIconTile, { backgroundColor: '#2c2c2e' }]}>
        <Text style={styles.badgeIcon}>{b.icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.badgeName}>{b.name}</Text>
        <Text style={styles.catalogDesc}>
          {BADGE_CATALOG[b.criteria_key] ?? '—'}
        </Text>
      </View>
      <View style={styles.autoChip}>
        <Text style={styles.autoChipText}>Auto</Text>
      </View>
    </View>
  ))}
</View>
```

Add to `createStyles`:
```typescript
autoChip: {
  backgroundColor: c.primarySurface, borderRadius: 5,
  paddingHorizontal: 6, paddingVertical: 2,
},
autoChipText: { fontSize: 10, color: c.textTertiary },
```

Also update `catalogRow` in `createStyles` to match `badgeRow` spacing:
```typescript
catalogRow: {
  flexDirection: 'row', alignItems: 'center', gap: 12,
  paddingHorizontal: 16, paddingVertical: 12,
},
```

- [ ] **Step 5: Remove old `content` padding gap that was between sections**

The `ScrollView` `contentContainerStyle` uses `gap: 12`. Keep it — the `SectionHeader` already has `paddingBottom: 6` so spacing is correct.

- [ ] **Step 6: Check on device/simulator that screen looks correct**

Open the admin panel → Odznaki. Verify:
- Gold accent bar next to "Odznaki parafii"
- Green accent bar next to "Ostatnio przyznane"
- Grey accent bar next to "Katalog systemowy"
- Badge icons appear in rounded tiles
- "Auto" chip visible on system badges

- [ ] **Step 7: Commit**

```bash
git add "app/(admin)/badge-management.tsx"
git commit -m "feat(badges): visual redesign — accent headers, icon tiles, split catalog"
```

---

### Task 3: Add FAB with tooltip

**Files:**
- Modify: `app/(admin)/badge-management.tsx`

Adds the floating action button in the bottom-right corner of the screen. The `ScrollView` must become a `View` wrapper so the FAB can be positioned absolutely.

- [ ] **Step 1: Wrap ScrollView in a View and add FAB**

Change the return statement wrapper from `<ScrollView ...>...</ScrollView>` to:

```tsx
return (
  <View style={styles.container}>
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom + 72, 80) }]}
    >
      {/* ... all existing sections ... */}
    </ScrollView>

    {/* FAB */}
    <View style={[styles.fabWrap, { bottom: Math.max(insets.bottom + 16, 24) }]}>
      <View style={styles.fabTip}>
        <Text style={styles.fabTipText}>Przyznaj odznakę</Text>
      </View>
      <TouchableOpacity style={styles.fab} onPress={() => setWizardVisible(true)} activeOpacity={0.85}>
        <Ionicons name="add" size={26} color="#fff" />
      </TouchableOpacity>
    </View>
  </View>
)
```

Note: `setWizardVisible` is added in Task 4. For Task 3 use `onPress={() => {}}` as a temporary placeholder — Task 4 will replace it.

- [ ] **Step 2: Add styles**

In `createStyles`, update `container` and add FAB styles:

```typescript
container: { flex: 1, backgroundColor: c.bg },
scroll: { flex: 1 },
// content stays the same but remove top-level gap if it was there
fabWrap: {
  position: 'absolute', right: 16,
  flexDirection: 'row', alignItems: 'center', gap: 8,
},
fabTip: {
  backgroundColor: c.surface, borderRadius: 8,
  paddingHorizontal: 10, paddingVertical: 6,
  ...shadow.xs,
},
fabTipText: { fontSize: 12, color: c.text, fontWeight: '500' },
fab: {
  width: 52, height: 52, borderRadius: 26,
  backgroundColor: '#FFC107',
  justifyContent: 'center', alignItems: 'center',
  ...shadow.xs,
},
```

- [ ] **Step 3: Verify FAB renders and is tappable**

Open admin → Odznaki. Verify:
- Gold "+" button visible in bottom-right, above safe area
- "Przyznaj odznakę" label to its left
- Tapping it does nothing yet (placeholder handler)

- [ ] **Step 4: Commit**

```bash
git add "app/(admin)/badge-management.tsx"
git commit -m "feat(badges): add FAB with tooltip for award action"
```

---

### Task 4: Add wizard state, member fetch, and Modal shell

**Files:**
- Modify: `app/(admin)/badge-management.tsx`

Adds all state for the wizard and the bare Modal that opens/closes. No step UI yet.

- [ ] **Step 1: Add `Member` type and wizard state**

Add the type near the top with other types:

```typescript
type Member = {
  id: string
  full_name: string
}
```

Add state variables inside `BadgeManagementScreen`, after existing state declarations:

```typescript
const [wizardVisible, setWizardVisible] = useState(false)
const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1)
const [members, setMembers] = useState<Member[]>([])
const [membersLoading, setMembersLoading] = useState(false)
const [memberSearch, setMemberSearch] = useState('')
const [selectedMember, setSelectedMember] = useState<Member | null>(null)
const [selectedBadge, setSelectedBadge] = useState<AllBadge | null>(null)
const [awardNote, setAwardNote] = useState('')
const [awarding, setAwarding] = useState(false)
```

- [ ] **Step 2: Add `fetchMembers` and `closeWizard` functions**

Add inside the component, after `handleDelete`:

```typescript
const fetchMembers = async () => {
  setMembersLoading(true)
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('parish_id', parishId)
    .eq('role', 'member')
    .order('full_name')
  if (error) console.error('[badge-management] members error:', error)
  setMembers(data ?? [])
  setMembersLoading(false)
}

const closeWizard = () => {
  setWizardVisible(false)
  setWizardStep(1)
  setSelectedMember(null)
  setSelectedBadge(null)
  setAwardNote('')
  setMemberSearch('')
}
```

- [ ] **Step 3: Add `Modal` import and Modal shell in JSX**

Add `Modal`, `FlatList`, `KeyboardAvoidingView`, `Platform` to the react-native import at the top:

```typescript
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Modal, FlatList,
  KeyboardAvoidingView, Platform,
} from 'react-native'
```

Add the Modal shell just before the closing `</View>` of the wrapper (after the FAB `View`):

```tsx
<Modal
  visible={wizardVisible}
  transparent
  animationType="slide"
  onRequestClose={closeWizard}
>
  <KeyboardAvoidingView
    style={styles.modalOverlay}
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
  >
    <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeWizard} activeOpacity={1} />
    <View style={styles.sheet}>
      <View style={styles.sheetHandle} />
      <Text style={{ color: '#fff' }}>Wizard placeholder</Text>
    </View>
  </KeyboardAvoidingView>
</Modal>
```

- [ ] **Step 4: Add `StepDots` helper component**

Add before `SectionHeader` helper:

```typescript
function StepDots({ current }: { current: 1 | 2 | 3 }) {
  const dot = (n: number) => {
    const isActive = n === current
    const isDone = n < current
    return (
      <View
        key={n}
        style={{
          width: isActive ? 20 : 7, height: 7, borderRadius: 4,
          backgroundColor: isDone ? '#30d158' : isActive ? '#FFC107' : '#3a3a3c',
        }}
      />
    )
  }
  return (
    <View style={{ flexDirection: 'row', gap: 4, justifyContent: 'center', marginBottom: 8 }}>
      {[1, 2, 3].map(dot)}
    </View>
  )
}
```

- [ ] **Step 5: Wire FAB to open wizard and fetch members**

Replace `onPress={() => {}}` on the FAB with:

```tsx
onPress={() => { setWizardVisible(true); fetchMembers() }}
```

- [ ] **Step 6: Add Modal styles**

In `createStyles`:

```typescript
modalOverlay: {
  flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
  justifyContent: 'flex-end',
},
sheet: {
  backgroundColor: c.surface,
  borderTopLeftRadius: 20, borderTopRightRadius: 20,
  paddingHorizontal: 16, paddingBottom: Math.max(16, 0),
  paddingTop: 12,
  maxHeight: '85%',
},
sheetHandle: {
  width: 36, height: 4, borderRadius: 2,
  backgroundColor: c.border, alignSelf: 'center', marginBottom: 14,
},
```

Note: `paddingBottom` in `sheet` will be overridden per-step with `insets.bottom` in Task 5.

- [ ] **Step 7: Verify modal opens and closes**

Tap FAB → modal slides up with "Wizard placeholder" text. Tap backdrop → closes. Back button on Android → closes.

- [ ] **Step 8: Commit**

```bash
git add "app/(admin)/badge-management.tsx"
git commit -m "feat(badges): add wizard Modal shell, member fetch, wizard state"
```

---

### Task 5: Wizard — Step 1 (member selection)

**Files:**
- Modify: `app/(admin)/badge-management.tsx`

Replaces the placeholder content with step 1: step indicator dots + search bar + member list.

- [ ] **Step 1: Add `StepDots` helper component**

Add before `SectionHeader` helper:

```typescript
function StepDots({ current }: { current: 1 | 2 | 3 }) {
  const dot = (n: number) => {
    const isActive = n === current
    const isDone = n < current
    return (
      <View
        key={n}
        style={{
          width: isActive ? 20 : 7, height: 7, borderRadius: 4,
          backgroundColor: isDone ? '#30d158' : isActive ? '#FFC107' : '#3a3a3c',
        }}
      />
    )
  }
  return (
    <View style={{ flexDirection: 'row', gap: 4, justifyContent: 'center', marginBottom: 8 }}>
      {[1, 2, 3].map(dot)}
    </View>
  )
}
```

- [ ] **Step 2: Replace Modal content with step-switching renderer**

Replace the entire content inside `<View style={styles.sheet}>` (after `sheetHandle`) with:

```tsx
<View style={styles.sheetHandle} />
<StepDots current={wizardStep} />
{wizardStep === 1 && renderStep1()}
{wizardStep === 2 && renderStep2()}
{wizardStep === 3 && renderStep3()}
```

- [ ] **Step 3: Add `renderStep1` function inside the component**

```typescript
const filteredMembers = members.filter(m =>
  m.full_name.toLowerCase().includes(memberSearch.toLowerCase())
)

const renderStep1 = () => (
  <View style={{ flex: 1 }}>
    <Text style={styles.stepTitle}>KROK 1 / 3 — Wybierz ministranta</Text>
    <View style={styles.searchBox}>
      <Ionicons name="search-outline" size={16} color={c.textTertiary} />
      <TextInput
        style={styles.searchInput}
        placeholder="Szukaj po imieniu..."
        placeholderTextColor={c.textTertiary}
        value={memberSearch}
        onChangeText={setMemberSearch}
        autoFocus
      />
    </View>
    {membersLoading ? (
      <ActivityIndicator style={{ marginTop: 20 }} color={c.primary} />
    ) : (
      <FlatList
        data={filteredMembers}
        keyExtractor={m => m.id}
        style={styles.pickerList}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const isSelected = selectedMember?.id === item.id
          return (
            <TouchableOpacity
              style={[styles.pickerRow, isSelected && styles.pickerRowSelected]}
              onPress={() => setSelectedMember(item)}
              activeOpacity={0.7}
            >
              <View style={styles.memberAvatar}>
                <Text style={styles.memberAvatarText}>
                  {item.full_name.split(' ').map((w: string) => w[0]).slice(0, 2).join('')}
                </Text>
              </View>
              <Text style={[styles.pickerRowName, isSelected && { color: '#FFC107' }]}>
                {item.full_name}
              </Text>
              {isSelected && <Ionicons name="checkmark" size={18} color="#FFC107" />}
            </TouchableOpacity>
          )
        }}
      />
    )}
    <View style={styles.btnRow}>
      <TouchableOpacity style={styles.btnBack} onPress={closeWizard}>
        <Text style={styles.btnBackText}>Anuluj</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.btnNext, !selectedMember && { opacity: 0.4 }]}
        onPress={() => setWizardStep(2)}
        disabled={!selectedMember}
      >
        <Text style={styles.btnNextText}>Dalej →</Text>
      </TouchableOpacity>
    </View>
  </View>
)
```

- [ ] **Step 4: Add step 1 styles**

In `createStyles`:

```typescript
stepTitle: {
  fontSize: 11, fontWeight: '700', color: '#FFC107',
  textTransform: 'uppercase', letterSpacing: 0.5,
  textAlign: 'center', marginBottom: 12,
},
searchBox: {
  flexDirection: 'row', alignItems: 'center', gap: 8,
  backgroundColor: c.bg, borderRadius: 10,
  paddingHorizontal: 12, paddingVertical: 8,
  marginBottom: 10, borderWidth: 1, borderColor: c.border,
},
searchInput: { flex: 1, fontSize: 14, color: c.text },
pickerList: { maxHeight: 240 },
pickerRow: {
  flexDirection: 'row', alignItems: 'center', gap: 10,
  paddingVertical: 10, paddingHorizontal: 4,
  borderBottomWidth: 1, borderBottomColor: c.primarySurface,
},
pickerRowSelected: { backgroundColor: '#FFC10710', borderRadius: 8 },
pickerRowName: { flex: 1, fontSize: 14, color: c.text },
memberAvatar: {
  width: 30, height: 30, borderRadius: 15,
  backgroundColor: c.primarySurface,
  justifyContent: 'center', alignItems: 'center',
},
memberAvatarText: { fontSize: 11, fontWeight: '700', color: c.textTertiary },
btnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
btnBack: {
  flex: 1, backgroundColor: c.bg, borderRadius: 12,
  paddingVertical: 12, alignItems: 'center',
  borderWidth: 1, borderColor: c.border,
},
btnBackText: { fontSize: 14, color: c.subtext, fontWeight: '600' },
btnNext: {
  flex: 1.5, borderRadius: 12,
  paddingVertical: 12, alignItems: 'center',
  backgroundColor: '#FFC107',
},
btnNextText: { fontSize: 14, color: '#000', fontWeight: '700' },
```

- [ ] **Step 5: Add stub functions for steps 2 and 3 so the app compiles**

```typescript
const renderStep2 = () => <View />
const renderStep3 = () => <View />
```

- [ ] **Step 6: Verify step 1 works**

Tap FAB → modal opens on step 1 with member list. Type in search → list filters. Tap a member → highlighted with checkmark. "Dalej →" is disabled until a member is selected. After selecting, "Dalej →" goes to step 2 (empty view for now).

- [ ] **Step 7: Commit**

```bash
git add "app/(admin)/badge-management.tsx"
git commit -m "feat(badges): wizard step 1 — member search and selection"
```

---

### Task 6: Wizard — Step 2 (badge selection)

**Files:**
- Modify: `app/(admin)/badge-management.tsx`

Replaces the `renderStep2` stub with the badge picker (manual badges only).

- [ ] **Step 1: Replace `renderStep2` stub**

```typescript
const manualBadges = allBadges.filter(b => b.type === 'manual')

const renderStep2 = () => (
  <View style={{ flex: 1 }}>
    <Text style={styles.stepTitle}>KROK 2 / 3 — Wybierz odznakę</Text>
    <Text style={styles.stepSub}>
      Dla: <Text style={{ color: c.text, fontWeight: '700' }}>{selectedMember?.full_name}</Text>
    </Text>
    <FlatList
      data={manualBadges}
      keyExtractor={b => b.id}
      style={styles.pickerList}
      renderItem={({ item }) => {
        const isSelected = selectedBadge?.id === item.id
        return (
          <TouchableOpacity
            style={[styles.pickerRow, isSelected && styles.pickerRowSelected]}
            onPress={() => setSelectedBadge(item)}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 22 }}>{item.icon}</Text>
            <Text style={[styles.pickerRowName, isSelected && { color: '#FFC107' }]}>
              {item.name}
            </Text>
            {isSelected && <Ionicons name="checkmark" size={18} color="#FFC107" />}
          </TouchableOpacity>
        )
      }}
    />
    <View style={styles.btnRow}>
      <TouchableOpacity style={styles.btnBack} onPress={() => setWizardStep(1)}>
        <Text style={styles.btnBackText}>← Wstecz</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.btnNext, !selectedBadge && { opacity: 0.4 }]}
        onPress={() => setWizardStep(3)}
        disabled={!selectedBadge}
      >
        <Text style={styles.btnNextText}>Dalej →</Text>
      </TouchableOpacity>
    </View>
  </View>
)
```

- [ ] **Step 2: Add `stepSub` style**

In `createStyles`:

```typescript
stepSub: { fontSize: 12, color: c.textTertiary, textAlign: 'center', marginBottom: 12 },
```

- [ ] **Step 3: Verify step 2 works**

Complete step 1 (select member) → step 2 shows list of manual badges. Tap badge → highlighted. "← Wstecz" returns to step 1 with member still selected. "Dalej →" advances to step 3 (empty).

- [ ] **Step 4: Commit**

```bash
git add "app/(admin)/badge-management.tsx"
git commit -m "feat(badges): wizard step 2 — manual badge selection"
```

---

### Task 7: Wizard — Step 3 (confirm, note, and award)

**Files:**
- Modify: `app/(admin)/badge-management.tsx`

Replaces the `renderStep3` stub with the confirmation screen and implements `handleAward`.

- [ ] **Step 1: Add `handleAward` function**

```typescript
const handleAward = async () => {
  if (!selectedMember || !selectedBadge) return
  setAwarding(true)
  const { error } = await supabase.from('member_badges').upsert({
    profile_id: selectedMember.id,
    badge_definition_id: selectedBadge.id,
    awarded_by: profile?.id,
    note: awardNote.trim() || null,
    is_active: true,
  }, { onConflict: 'profile_id,badge_definition_id' })
  setAwarding(false)
  if (error) {
    Alert.alert('Błąd', error.message)
    return
  }
  closeWizard()
  fetchData()
}
```

- [ ] **Step 2: Replace `renderStep3` stub**

```typescript
const renderStep3 = () => (
  <View>
    <Text style={styles.stepTitle}>KROK 3 / 3 — Potwierdź</Text>

    <View style={styles.summaryCard}>
      <Text style={{ fontSize: 32 }}>{selectedBadge?.icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.summaryBadgeName}>{selectedBadge?.name}</Text>
        <Text style={styles.summaryFor}>
          dla: <Text style={{ color: c.text, fontWeight: '700' }}>{selectedMember?.full_name}</Text>
        </Text>
      </View>
    </View>

    <Text style={styles.noteLabel}>Notatka (opcjonalna)</Text>
    <TextInput
      style={styles.noteInput}
      placeholder="Powód wyróżnienia..."
      placeholderTextColor={c.textTertiary}
      value={awardNote}
      onChangeText={setAwardNote}
      multiline
      maxLength={200}
      returnKeyType="done"
      blurOnSubmit
    />

    <View style={styles.btnRow}>
      <TouchableOpacity style={styles.btnBack} onPress={() => setWizardStep(2)}>
        <Text style={styles.btnBackText}>← Wstecz</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.btnNext, awarding && { opacity: 0.6 }]}
        onPress={handleAward}
        disabled={awarding}
      >
        {awarding
          ? <ActivityIndicator size="small" color="#000" />
          : <Text style={styles.btnNextText}>🏅 Przyznaj</Text>
        }
      </TouchableOpacity>
    </View>
  </View>
)
```

- [ ] **Step 3: Add step 3 styles**

In `createStyles`:

```typescript
summaryCard: {
  flexDirection: 'row', alignItems: 'center', gap: 14,
  backgroundColor: c.bg, borderRadius: 12,
  padding: 14, marginBottom: 14,
  borderWidth: 1, borderColor: '#FFC10740',
},
summaryBadgeName: { fontSize: 16, fontWeight: '700', color: c.text },
summaryFor: { fontSize: 12, color: c.textTertiary, marginTop: 3 },
noteLabel: {
  fontSize: 11, fontWeight: '700', color: c.textTertiary,
  textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
},
noteInput: {
  backgroundColor: c.bg, borderRadius: 10,
  paddingHorizontal: 12, paddingVertical: 10,
  fontSize: 14, color: c.text,
  borderWidth: 1, borderColor: c.border,
  minHeight: 72, textAlignVertical: 'top',
  marginBottom: 4,
},
```

- [ ] **Step 4: Full end-to-end test**

1. Tap FAB → step 1 opens
2. Select a member → "Dalej →" enabled
3. Tap "Dalej →" → step 2 (badge list)
4. Select a badge → "Dalej →" enabled
5. Tap "Dalej →" → step 3 (summary card + note field)
6. Add an optional note
7. Tap "🏅 Przyznaj" → spinner shows → modal closes → "Ostatnio przyznane" list updates with new entry
8. Open Supabase dashboard → confirm `member_badges` row with `awarded_by` set

- [ ] **Step 5: Test error case**

In Supabase dashboard, temporarily add an RLS policy violation or break the connection, tap Przyznaj → verify Alert with error message appears. Restore connection.

- [ ] **Step 6: Commit**

```bash
git add "app/(admin)/badge-management.tsx"
git commit -m "feat(badges): wizard step 3 — confirm, note, and award action"
```

---

## Done

All 7 tasks produce a fully working badge management screen with:
- Redesigned visual hierarchy (accent headers, icon tiles, auto chips)
- FAB with tooltip
- 3-step award wizard: member search → badge pick → confirm + note → upsert to `member_badges`
