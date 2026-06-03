# Admin Role Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Umożliwić adminowi nadawanie i odbieranie uprawnień administratora innym kontom w parafii, bezpośrednio z zakładki Członkowie.

**Architecture:** Jeden plik `app/(admin)/(admin-tabs)/members.tsx` — nowy chip "Admini", osobny render wiersza dla adminów (ikona revoke), bottom sheet z wyszukiwarką kandydatów. Stan poprzedniej roli zapisywany w kolumnie `role_before_admin` w Supabase przy promocji, przywracany przy degradacji.

**Tech Stack:** React Native, Expo Router, Supabase JS client, Zustand (useAuthStore), react-native-toast-message

---

## File Structure

**Modify only:** `app/(admin)/(admin-tabs)/members.tsx`

Zmiany w pliku:
- `Filter` type: `'member' | 'parent'` → `'member' | 'parent' | 'admin'`
- `Member` type: dodanie `role_before_admin?: string | null`
- `fetchAll` query: `.in('role', ['member', 'parent', 'admin'])` + `role_before_admin` w select
- Nowe stany: `assignModalVisible`, `candidateSearch`, `candidates`, `assignLoading`
- Nowe handlery: `handleRevokeAdmin`, `handleOpenAssignModal`, `handleGrantAdmin`
- Render: warunkowy wiersz admina, `ListFooterComponent` z przyciskiem Przydziel, nowy Modal

---

### Task 1: Rozszerz typy i query fetchAll

**Files:**
- Modify: `app/(admin)/(admin-tabs)/members.tsx`

- [ ] **Krok 1: Zaktualizuj typy**

Zastąp obecne typy (linie 14–23):

```tsx
type Member = {
  id: string
  full_name: string
  role: 'member' | 'parent' | 'admin'
  phone: string | null
  rocznik: number | null
  total_points?: number
  role_before_admin?: string | null
}

type Filter = 'member' | 'parent' | 'admin'
```

- [ ] **Krok 2: Zaktualizuj query w fetchAll**

W `useEffect` znajdź linię z `.in('role', ['member', 'parent'])` i zmień cały blok `profilesRes`:

```tsx
supabase
  .from('profiles')
  .select('id, full_name, role, phone, rocznik, role_before_admin')
  .eq('parish_id', adminProfile!.parish_id)
  .in('role', ['member', 'parent', 'admin'])
  .eq('is_active', true)
  .order('full_name'),
```

- [ ] **Krok 3: Zaktualizuj chip row w JSX**

Znajdź `(['member', 'parent'] as Filter[])` i zmień na:

```tsx
(['member', 'parent', 'admin'] as Filter[]).map(f => (
  <TouchableOpacity
    key={f}
    style={[styles.chip, filter === f && styles.chipActive]}
    onPress={() => setFilter(f)}
  >
    <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
      {f === 'member' ? 'Ministranci' : f === 'parent' ? 'Rodzice' : 'Admini'}
    </Text>
  </TouchableOpacity>
))
```

- [ ] **Krok 4: Weryfikacja — uruchom aplikację**

Przejdź do zakładki Członkowie. Powinny być widoczne trzy chipy: Ministranci, Rodzice, Admini. Chip "Admini" powinien pokazywać konta z rolą admin (w tym Twoje). Lista adminów powinna działać — punkty nie są pokazywane (badge jest warunkowy `item.role === 'member'`).

- [ ] **Krok 5: Commit**

```bash
git add app/(admin)/\(admin-tabs\)/members.tsx
git commit -m "feat: add Admini filter chip to members tab"
```

---

### Task 2: Dodaj stan i handler handleRevokeAdmin

**Files:**
- Modify: `app/(admin)/(admin-tabs)/members.tsx`

- [ ] **Krok 1: Dodaj nowe stany**

Po linii `const [filter, setFilter] = useState<Filter>('member')` dodaj:

```tsx
const [assignModalVisible, setAssignModalVisible] = useState(false)
const [candidateSearch, setCandidateSearch] = useState('')
const [candidates, setCandidates] = useState<Member[]>([])
const [assignLoading, setAssignLoading] = useState(false)
```

- [ ] **Krok 2: Dodaj handleRevokeAdmin**

Po bloku `useEffect` (przed `return`), dodaj:

```tsx
const handleRevokeAdmin = (item: Member) => {
  Alert.alert(
    'Usuń uprawnienia admina',
    `Czy na pewno chcesz usunąć uprawnienia administratora dla ${item.full_name}?`,
    [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: async () => {
          const { count } = await supabase
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('parish_id', adminProfile!.parish_id)
            .eq('role', 'admin')

          if ((count ?? 0) <= 1) {
            Alert.alert('Błąd', 'Nie można usunąć jedynego administratora parafii.')
            return
          }

          const restoredRole = item.role_before_admin ?? 'member'
          const { error } = await supabase
            .from('profiles')
            .update({ role: restoredRole, role_before_admin: null })
            .eq('id', item.id)

          if (error) {
            Toast.show({ type: 'error', text1: 'Błąd', text2: error.message })
          } else {
            setMembers(prev => prev.filter(m => m.id !== item.id))
            Toast.show({ type: 'success', text1: 'Uprawnienia usunięte', text2: `${item.full_name} jest teraz ${restoredRole === 'parent' ? 'rodzicem' : 'ministrantem'}` })
          }
        },
      },
    ]
  )
}
```

- [ ] **Krok 3: Weryfikacja — sprawdź import Toast**

Upewnij się że w pliku jest import `Toast`:

```tsx
import Toast from 'react-native-toast-message'
```

Jeśli go nie ma, dodaj po istniejących importach.

- [ ] **Krok 4: Commit**

```bash
git add app/(admin)/\(admin-tabs\)/members.tsx
git commit -m "feat: add handleRevokeAdmin with last-admin safeguard"
```

---

### Task 3: Warunkowy render wiersza admina

**Files:**
- Modify: `app/(admin)/(admin-tabs)/members.tsx`

- [ ] **Krok 1: Zamień renderItem na wersję warunkową**

Znajdź blok `renderItem={({ item }) => (` i zastąp całą zawartość `TouchableOpacity`:

```tsx
renderItem={({ item }) => (
  filter === 'admin' ? (
    <View style={styles.row}>
      <View style={styles.avatar}>
        <Ionicons name="shield-checkmark" size={18} color={c.primary} />
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.name}>{item.full_name}</Text>
        <Text style={styles.sub}>{item.phone ?? 'Brak telefonu'}</Text>
      </View>
      <TouchableOpacity
        onPress={() => handleRevokeAdmin(item)}
        hitSlop={8}
        style={styles.revokeBtn}
      >
        <Ionicons name="person-remove-outline" size={20} color="#DC2626" />
      </TouchableOpacity>
    </View>
  ) : (
    <TouchableOpacity
      style={styles.row}
      onPress={() => router.push(`/(admin)/member-detail?id=${item.id}`)}
      activeOpacity={0.75}
    >
      <View style={styles.avatar}>
        <Ionicons name="person" size={18} color={c.primary} />
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.name}>{item.full_name}</Text>
        <Text style={styles.sub}>
          {item.phone ?? 'Brak telefonu'}
          {item.role === 'member' && item.rocznik ? ` · rocznik ${item.rocznik}` : ''}
        </Text>
      </View>
      {item.role === 'member' && (
        <View style={styles.pointsBadge}>
          <Ionicons name="trophy-outline" size={12} color={c.gold} />
          <Text style={styles.pointsText}>{item.total_points ?? 0}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={16} color={c.border} />
    </TouchableOpacity>
  )
)}
```

- [ ] **Krok 2: Dodaj styl revokeBtn do createStyles**

W funkcji `createStyles`, po `pointsText`, dodaj:

```tsx
revokeBtn: {
  padding: 6,
},
```

- [ ] **Krok 3: Weryfikacja**

Wejdź w chip "Admini". Każdy wiersz powinien mieć czerwoną ikonę `person-remove-outline` po prawej. Chip "Ministranci" i "Rodzice" działają jak wcześniej (nawigacja do member-detail, odznaka punktów).

- [ ] **Krok 4: Commit**

```bash
git add app/(admin)/\(admin-tabs\)/members.tsx
git commit -m "feat: render admin rows with revoke icon"
```

---

### Task 4: Przycisk "Przydziel prawa admina" + handler handleGrantAdmin

**Files:**
- Modify: `app/(admin)/(admin-tabs)/members.tsx`

- [ ] **Krok 1: Dodaj handleOpenAssignModal i handleGrantAdmin**

Po `handleRevokeAdmin`, dodaj:

```tsx
const handleOpenAssignModal = async () => {
  setAssignLoading(true)
  setAssignModalVisible(true)
  setCandidateSearch('')
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, role, phone, rocznik, role_before_admin')
    .eq('parish_id', adminProfile!.parish_id)
    .in('role', ['member', 'parent'])
    .eq('is_active', true)
    .order('full_name')
  setCandidates(data ?? [])
  setAssignLoading(false)
}

const handleGrantAdmin = (candidate: Member) => {
  Alert.alert(
    'Nadaj uprawnienia admina',
    `Nadać uprawnienia administratora dla ${candidate.full_name}?`,
    [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Nadaj',
        onPress: async () => {
          const { error } = await supabase
            .from('profiles')
            .update({ role: 'admin', role_before_admin: candidate.role })
            .eq('id', candidate.id)

          if (error) {
            Toast.show({ type: 'error', text1: 'Błąd', text2: error.message })
          } else {
            setAssignModalVisible(false)
            setCandidates([])
            setMembers(prev => [...prev, { ...candidate, role: 'admin', role_before_admin: candidate.role }])
            Toast.show({ type: 'success', text1: 'Uprawnienia nadane', text2: `${candidate.full_name} jest teraz administratorem` })
          }
        },
      },
    ]
  )
}
```

- [ ] **Krok 2: Dodaj ListFooterComponent do FlatList**

Znajdź `contentContainerStyle={{ padding: 16, gap: 8 }}` na FlatList i dodaj `ListFooterComponent`:

```tsx
ListFooterComponent={
  filter === 'admin' ? (
    <TouchableOpacity style={styles.assignBtn} onPress={handleOpenAssignModal}>
      <Ionicons name="person-add-outline" size={18} color="#fff" />
      <Text style={styles.assignBtnText}>Przydziel prawa admina</Text>
    </TouchableOpacity>
  ) : null
}
```

- [ ] **Krok 3: Dodaj styl assignBtn do createStyles**

Po `revokeBtn`, dodaj:

```tsx
assignBtn: {
  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  backgroundColor: c.primary, borderRadius: 12, padding: 14, marginTop: 8,
},
assignBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
```

- [ ] **Krok 4: Weryfikacja**

W chipu "Admini" na dole listy powinien pojawić się fioletowy przycisk "Przydziel prawa admina". Tapnięcie powinno... (modal jeszcze nie istnieje — nic się nie otworzy, ale nie powinno być błędu).

- [ ] **Krok 5: Commit**

```bash
git add app/(admin)/\(admin-tabs\)/members.tsx
git commit -m "feat: add assign admin button and handleGrantAdmin handler"
```

---

### Task 5: Bottom sheet modal "Przydziel prawa admina"

**Files:**
- Modify: `app/(admin)/(admin-tabs)/members.tsx`

- [ ] **Krok 1: Dodaj import Modal**

Znajdź linię z importami z `react-native` i dodaj `Modal` jeśli go tam nie ma:

```tsx
import {
  View, Text, FlatList, StyleSheet,
  TouchableOpacity, TextInput, ActivityIndicator, Modal,
} from 'react-native'
```

- [ ] **Krok 2: Dodaj modal przed zamknięciem głównego View**

Przed `</View>` kończącym główny kontener (za FlatList), dodaj:

```tsx
<Modal
  visible={assignModalVisible}
  transparent
  animationType="slide"
  onRequestClose={() => setAssignModalVisible(false)}
>
  <View style={styles.modalOverlay}>
    <TouchableOpacity
      style={{ flex: 1 }}
      activeOpacity={1}
      onPress={() => setAssignModalVisible(false)}
    />
    <View style={styles.modalSheet}>
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>Przydziel prawa admina</Text>
        <TouchableOpacity onPress={() => setAssignModalVisible(false)} hitSlop={8}>
          <Ionicons name="close" size={24} color={c.subtext} />
        </TouchableOpacity>
      </View>

      <View style={styles.modalSearchBox}>
        <Ionicons name="search-outline" size={16} color={c.textTertiary} />
        <TextInput
          style={styles.modalSearchInput}
          placeholder="Szukaj po imieniu..."
          placeholderTextColor={c.textTertiary}
          value={candidateSearch}
          onChangeText={setCandidateSearch}
        />
      </View>

      {assignLoading ? (
        <ActivityIndicator color={c.primary} style={{ padding: 24 }} />
      ) : (() => {
        const q = candidateSearch.toLowerCase()
        const filtered = candidates.filter(p =>
          q === '' || p.full_name.toLowerCase().includes(q)
        )
        return filtered.length === 0 ? (
          <View style={styles.modalEmpty}>
            <Text style={styles.modalEmptyText}>
              {candidates.length === 0
                ? 'Brak ministrantów ani rodziców do promowania'
                : 'Brak wyników wyszukiwania'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.candidateOption}
                onPress={() => handleGrantAdmin(item)}
              >
                <Ionicons
                  name={item.role === 'parent' ? 'people-outline' : 'person-outline'}
                  size={20}
                  color={c.primary}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.candidateName}>{item.full_name}</Text>
                  <Text style={styles.candidateRole}>
                    {item.role === 'parent' ? 'Rodzic' : 'Ministrant'}
                  </Text>
                </View>
                <Ionicons name="shield-outline" size={16} color={c.textTertiary} />
              </TouchableOpacity>
            )}
            style={{ maxHeight: 360 }}
          />
        )
      })()}
    </View>
  </View>
</Modal>
```

- [ ] **Krok 3: Dodaj style modala do createStyles**

Po `assignBtnText`, dodaj:

```tsx
modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
modalSheet: {
  backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
  padding: 20, paddingBottom: 36,
},
modalHeader: {
  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12,
},
modalTitle: { fontSize: 17, fontWeight: '700', color: c.text },
modalSearchBox: {
  flexDirection: 'row', alignItems: 'center', gap: 8,
  backgroundColor: c.bg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9,
  marginBottom: 8,
},
modalSearchInput: { flex: 1, fontSize: 15, color: c.text },
candidateOption: {
  flexDirection: 'row', alignItems: 'center', gap: 12,
  paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.primarySurface,
},
candidateName: { fontSize: 15, color: c.text, fontWeight: '500' },
candidateRole: { fontSize: 12, color: c.subtext, marginTop: 1 },
modalEmpty: { padding: 24, alignItems: 'center' },
modalEmptyText: { fontSize: 14, color: c.textTertiary, textAlign: 'center' },
```

- [ ] **Krok 4: Weryfikacja pełnego flow**

**Nadanie uprawnień:**
1. Wejdź w chip "Admini"
2. Tapnij "Przydziel prawa admina"
3. Modal otwiera się z listą ministrantów/rodziców
4. Wpisz fragment imienia — lista filtruje
5. Tapnij osobę — pojawia się Alert z potwierdzeniem
6. Potwierdź — modal zamknięty, osoba pojawia się na liście adminów, Toast sukcesu

**Odebranie uprawnień:**
1. Tapnij ikonę `person-remove-outline` przy adminie
2. Alert z potwierdzeniem
3. Potwierdź — osoba znika z listy adminów, Toast z informacją o przywróconej roli

**Zabezpieczenie:**
1. Zostaw tylko jedno konto admina na liście
2. Tapnij ikonę revoke → Alert z błędem "Nie można usunąć jedynego administratora"

- [ ] **Krok 5: Commit końcowy**

```bash
git add app/(admin)/\(admin-tabs\)/members.tsx
git commit -m "feat: complete admin role management - assign/revoke with modal and safeguards"
```
