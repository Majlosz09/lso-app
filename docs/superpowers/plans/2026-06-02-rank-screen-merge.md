# Rank Screen Merge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scalić CRUD rang z ekranem przypisywania rang w jeden ekran z zwijlaną sekcją rang na górze.

**Architecture:** Ekran `rank-assignment.tsx` zostaje rozszerzony o zwinięty/rozwinięty panel rang (domyślnie zwinięty). Cały kod CRUD z `rank-management.tsx` jest przepisany inline. Przycisk ribbona w headerze zakładki Ministranci zostaje usunięty.

**Tech Stack:** React Native 0.81, Expo Router, Supabase JS v2, react-native-toast-message

---

## Files

| Plik | Zmiana |
|------|--------|
| `app/(admin)/rank-assignment.tsx` | Rozszerzenie — dodać sekcję rang, stan CRUD, funkcje, style |
| `app/(admin)/(admin-tabs)/_layout.tsx` | Usunąć przycisk ribbon z headerRight zakładki members |
| `app/(admin)/rank-management.tsx` | Brak zmian — staje się martwą trasą |

---

## Task 1: Rozszerzyć typ `RankOption` i zapytanie `fetchData`

**Files:**
- Modify: `app/(admin)/rank-assignment.tsx`

- [ ] **Krok 1: Dodać `TextInput` do importów react-native**

W pliku `app/(admin)/rank-assignment.tsx`, zmień wiersz 2–5:

```typescript
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, ActivityIndicator, TextInput
} from 'react-native'
```

- [ ] **Krok 2: Zaktualizować typ `RankOption`**

Zmień linię 15:
```typescript
// PRZED
type RankOption = { id: string; name: string; order: number }

// PO
type RankOption = { id: string; name: string; order: number; is_system: boolean; parish_id: string | null }
```

- [ ] **Krok 3: Zaktualizować zapytanie ranks w `fetchData`**

W funkcji `fetchData` (ok. linia 44–48), zmień zapytanie o rangi:

```typescript
// PRZED
supabase
  .from('ranks')
  .select('id, name, order')
  .or(`parish_id.is.null,parish_id.eq.${parishId}`)
  .order('order'),

// PO
supabase
  .from('ranks')
  .select('id, name, order, is_system, parish_id')
  .or(`parish_id.is.null,parish_id.eq.${parishId}`)
  .order('order'),
```

- [ ] **Krok 4: Uruchomić app i sprawdzić że ekran ładuje się bez błędów**

```bash
# W terminalu projektu
npx expo start --web
```
Otwórz `localhost:8081` i przejdź do ekranu „Przydziel rangi". Powinien działać identycznie jak przed zmianami.

- [ ] **Krok 5: Commit**

```bash
git add app/(admin)/rank-assignment.tsx
git commit -m "refactor(ranks): extend RankOption type with is_system and parish_id fields"
```

---

## Task 2: Dodać stan CRUD rang i funkcje obsługi

**Files:**
- Modify: `app/(admin)/rank-assignment.tsx`

- [ ] **Krok 1: Dodać nowe zmienne stanu po istniejącym `pickerTarget`**

Po linii `const [pickerTarget, setPickerTarget] = useState<MemberRow | null>(null)`:

```typescript
const [ranksExpanded, setRanksExpanded] = useState(false)
const [newRankName, setNewRankName] = useState('')
const [addingRank, setAddingRank] = useState(false)
const [editingRankId, setEditingRankId] = useState<string | null>(null)
const [editingRankName, setEditingRankName] = useState('')
const [renamingRank, setRenamingRank] = useState(false)
const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
```

- [ ] **Krok 2: Dodać funkcję `handleAddRank` po `handleSetRank`**

```typescript
const handleAddRank = async () => {
  if (!newRankName.trim()) return
  setAddingRank(true)
  const maxOrder = ranks.length > 0 ? Math.max(...ranks.map(r => r.order)) + 1 : 1
  const { error } = await supabase.from('ranks').insert({
    name: newRankName.trim(),
    order: maxOrder,
    is_system: false,
    parish_id: parishId,
  })
  setAddingRank(false)
  if (error) {
    Toast.show({ type: 'error', text1: 'Błąd', text2: error.message })
  } else {
    setNewRankName('')
    fetchData()
  }
}
```

- [ ] **Krok 3: Dodać funkcje edycji i usuwania rang**

Po `handleAddRank`:

```typescript
const handleStartEditRank = (rank: RankOption) => {
  setEditingRankId(rank.id)
  setEditingRankName(rank.name)
}

const handleRenameRank = async () => {
  if (!editingRankId || !editingRankName.trim()) return
  setRenamingRank(true)
  const { error } = await supabase
    .from('ranks')
    .update({ name: editingRankName.trim() })
    .eq('id', editingRankId)
  setRenamingRank(false)
  if (error) {
    Toast.show({ type: 'error', text1: 'Błąd', text2: error.message })
  } else {
    setEditingRankId(null)
    setEditingRankName('')
    fetchData()
  }
}

const handleCancelEditRank = () => {
  setEditingRankId(null)
  setEditingRankName('')
}

const handleDeleteRank = async (rankId: string) => {
  const { error } = await supabase.from('ranks').delete().eq('id', rankId)
  if (error) {
    Toast.show({ type: 'error', text1: 'Błąd', text2: error.message })
  } else {
    setConfirmDeleteId(null)
    fetchData()
  }
}
```

- [ ] **Krok 4: Commit**

```bash
git add app/(admin)/rank-assignment.tsx
git commit -m "feat(ranks): add rank CRUD state and handler functions to rank-assignment screen"
```

---

## Task 3: Zbudować sekcję zwinięcia rang w JSX i dodać style

**Files:**
- Modify: `app/(admin)/rank-assignment.tsx`

- [ ] **Krok 1: Zastąpić return JSX**

Znajdź blok `return (` (ok. linia 97 po zmianach z Task 1 i 2). Zastąp całość:

```tsx
if (loading) {
  return <View style={styles.center}><ActivityIndicator size="large" color={c.primary} /></View>
}

return (
  <View style={{ flex: 1, backgroundColor: c.bg }}>

    {/* ── Sekcja rang (zwijalna) ── */}
    <View style={styles.ranksSection}>
      <TouchableOpacity
        style={styles.ranksSectionHeader}
        onPress={() => setRanksExpanded(v => !v)}
        activeOpacity={0.7}
      >
        <View style={styles.ranksSectionHeaderLeft}>
          <Ionicons name="ribbon" size={16} color={c.primary} />
          <Text style={styles.ranksSectionTitle}>RANGI MINISTRANCKIE</Text>
          <View style={styles.ranksCountBadge}>
            <Text style={styles.ranksCountText}>{ranks.length}</Text>
          </View>
        </View>
        <Ionicons name={ranksExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={c.textTertiary} />
      </TouchableOpacity>

      {ranksExpanded && (
        <>
          {ranks.map(rank => (
            <View key={rank.id} style={styles.rankMgmtRow}>
              <View style={[styles.rankMgmtIcon, rank.is_system && styles.rankMgmtIconSystem]}>
                <Ionicons name="ribbon" size={14} color={rank.is_system ? c.primary : c.subtext} />
              </View>

              {editingRankId === rank.id ? (
                <>
                  <TextInput
                    style={styles.rankEditInput}
                    value={editingRankName}
                    onChangeText={setEditingRankName}
                    onSubmitEditing={handleRenameRank}
                    returnKeyType="done"
                    autoFocus
                  />
                  <TouchableOpacity onPress={handleRenameRank} hitSlop={8} disabled={renamingRank}>
                    <Ionicons name="checkmark" size={22} color="#16A34A" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleCancelEditRank} hitSlop={8}>
                    <Ionicons name="close" size={22} color={c.textTertiary} />
                  </TouchableOpacity>
                </>
              ) : confirmDeleteId === rank.id ? (
                <>
                  <Text style={[styles.rankMgmtName, { flex: 1 }]}>{rank.name}</Text>
                  <Text style={styles.deleteConfirmLabel}>Usuń?</Text>
                  <TouchableOpacity onPress={() => handleDeleteRank(rank.id)} hitSlop={8}>
                    <Ionicons name="checkmark" size={22} color="#DC2626" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setConfirmDeleteId(null)} hitSlop={8}>
                    <Ionicons name="close" size={22} color={c.textTertiary} />
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={[styles.rankMgmtName, { flex: 1 }]}>{rank.name}</Text>
                  {rank.is_system ? (
                    <View style={styles.systemBadge}>
                      <Text style={styles.systemBadgeText}>systemowa</Text>
                    </View>
                  ) : (
                    <View style={styles.rankMgmtActions}>
                      <TouchableOpacity onPress={() => handleStartEditRank(rank)} hitSlop={8}>
                        <Ionicons name="pencil-outline" size={20} color={c.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setConfirmDeleteId(rank.id)} hitSlop={8}>
                        <Ionicons name="trash-outline" size={20} color="#DC2626" />
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}
            </View>
          ))}

          <View style={styles.addRankRow}>
            <TextInput
              style={styles.addRankInput}
              placeholder="Nazwa nowej rangi..."
              placeholderTextColor={c.textTertiary}
              value={newRankName}
              onChangeText={setNewRankName}
              onSubmitEditing={handleAddRank}
              returnKeyType="done"
            />
            <TouchableOpacity
              style={[styles.addRankButton, (!newRankName.trim() || addingRank) && { opacity: 0.4 }]}
              onPress={handleAddRank}
              disabled={!newRankName.trim() || addingRank}
            >
              {addingRank
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="add" size={22} color="#fff" />
              }
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>

    {/* ── Lista ministrantów ── */}
    <FlatList
      style={styles.list}
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
              {item.full_name.split(' ').map(n => n[0]).slice(0, 2).join('')}
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

    {/* ── Picker rangi (modal) ── */}
    <Modal
      visible={pickerTarget !== null}
      transparent
      animationType="slide"
      onRequestClose={() => setPickerTarget(null)}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setPickerTarget(null)} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>{pickerTarget?.full_name}</Text>

          <TouchableOpacity
            style={styles.rankOption}
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
              style={styles.rankOption}
              onPress={() => handleSetRank(pickerTarget!.id, rank.id)}
            >
              <Text style={[styles.rankOptionText, pickerTarget?.rank_id === rank.id && styles.rankOptionTextActive]}>
                {rank.name}
              </Text>
              {pickerTarget?.rank_id === rank.id && <Ionicons name="checkmark" size={18} color={c.primary} />}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  </View>
)
```

- [ ] **Krok 2: Zastąpić `createStyles` nowymi stylami**

Usuń całą funkcję `createStyles` i zastąp:

```typescript
function createStyles(c: Colors) {
  return StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    // ── Sekcja rang ──
    ranksSection: {
      backgroundColor: c.surface,
      borderBottomWidth: 1,
      borderBottomColor: c.primarySurface,
    },
    ranksSectionHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12,
    },
    ranksSectionHeaderLeft: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
    },
    ranksSectionTitle: {
      fontSize: 11, fontWeight: '700', color: c.textTertiary,
      textTransform: 'uppercase', letterSpacing: 0.8,
    },
    ranksCountBadge: {
      backgroundColor: c.primaryAlpha08, borderRadius: 10,
      paddingHorizontal: 6, paddingVertical: 2,
    },
    ranksCountText: { fontSize: 11, fontWeight: '700', color: c.primary },

    rankMgmtRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 16, paddingVertical: 12,
      borderTopWidth: 1, borderTopColor: c.primarySurface,
    },
    rankMgmtIcon: {
      width: 28, height: 28, borderRadius: 8,
      backgroundColor: c.primarySurface, justifyContent: 'center', alignItems: 'center',
    },
    rankMgmtIconSystem: { backgroundColor: c.primaryAlpha08 },
    rankMgmtName: { fontSize: 14, fontWeight: '500', color: c.text },
    rankMgmtActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    rankEditInput: {
      flex: 1, fontSize: 14, color: c.text,
      backgroundColor: c.bg, borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 5,
      borderWidth: 1, borderColor: c.primary,
    },
    systemBadge: {
      backgroundColor: c.primaryAlpha08, borderRadius: 6,
      paddingHorizontal: 7, paddingVertical: 3,
    },
    systemBadgeText: { fontSize: 10, color: c.primary, fontWeight: '600' },
    deleteConfirmLabel: { fontSize: 13, color: '#DC2626', fontWeight: '600', marginRight: 4 },
    addRankRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: 16, paddingVertical: 10,
      borderTopWidth: 1, borderTopColor: c.primarySurface,
    },
    addRankInput: {
      flex: 1, backgroundColor: c.bg, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 9,
      fontSize: 14, color: c.text,
    },
    addRankButton: {
      width: 40, height: 40, borderRadius: 10,
      backgroundColor: c.primary, justifyContent: 'center', alignItems: 'center',
    },

    // ── Lista ministrantów ──
    list: { flex: 1, backgroundColor: c.bg },
    content: { padding: 0 },
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

    // ── Picker modal ──
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
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
    rankOptionText: { fontSize: 16, color: c.text },
    rankOptionTextActive: { color: c.primary, fontWeight: '600' },
  })
}
```

- [ ] **Krok 3: Zweryfikować w przeglądarce**

```bash
npx expo start --web
```

Sprawdź:
1. Ekran „Przydziel rangi" ładuje się — widać pasek „RANGI MINISTRANCKIE [5] ▾" na górze i listę ministrantów poniżej
2. Kliknięcie paska rozwija listę rang
3. Rangi systemowe mają badge „systemowa", brak przycisków edycji
4. Kliknięcie ołówka przy niestandardowej randze włącza edycję inline
5. Kliknięcie kosza pokazuje pytanie „Usuń? ✓ ✗" w wierszu
6. Pole „Nazwa nowej rangi..." na dole sekcji działa — dodaje rangę i odświeża listę
7. Przypisywanie rang ministrantom nadal działa (klik chipsa → modal → wybór)

- [ ] **Krok 4: Commit**

```bash
git add app/(admin)/rank-assignment.tsx
git commit -m "feat(ranks): merge rank management into rank-assignment screen as collapsible section"
```

---

## Task 4: Usunąć przycisk ribbon z headera zakładki Ministranci

**Files:**
- Modify: `app/(admin)/(admin-tabs)/_layout.tsx`

- [ ] **Krok 1: Uprościć `headerRight` zakładki members**

W pliku `app/(admin)/(admin-tabs)/_layout.tsx`, znajdź `<Tabs.Screen name="members"` (ok. linia 37).

Zastąp:
```tsx
headerRight: () => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 16 }}>
    <TouchableOpacity onPress={() => router.push('/(admin)/rank-management')} hitSlop={8}>
      <Ionicons name="ribbon-outline" size={22} color="#fff" />
    </TouchableOpacity>
    <TouchableOpacity onPress={() => router.push('/(admin)/(admin-tabs)/profile')} hitSlop={8}>
      {avatarUrl
        ? <AvatarImage avatarUrl={avatarUrl} size={32} borderColor="rgba(255,255,255,0.6)" borderWidth={2} />
        : <Ionicons name="person-circle-outline" size={30} color="#fff" />
      }
    </TouchableOpacity>
  </View>
),
```

Na:
```tsx
headerRight: avatarButton,
```

- [ ] **Krok 2: Sprawdzić że `View` import nie jest teraz nieużywany**

W tym samym pliku, patrz na wiersz 2:
```typescript
import { Tabs, useRouter } from 'expo-router'
import { TouchableOpacity, View } from 'react-native'
```

`View` jest teraz potrzebny tylko w zakładce `members` — po usunięciu może być nieużywany. Sprawdź czy `View` jest gdziekolwiek indziej w pliku. Jeśli nie — usuń `View` z importu:
```typescript
import { TouchableOpacity } from 'react-native'
```

- [ ] **Krok 3: Zweryfikować w przeglądarce**

Otwórz zakładkę „Ministranci". Header powinien zawierać tylko przycisk awatara (bez ikony ribbona).

- [ ] **Krok 4: Commit końcowy**

```bash
git add app/(admin)/(admin-tabs)/_layout.tsx
git commit -m "feat(ranks): remove ribbon nav button from members tab header"
```

---

## Self-Review

**Spec coverage:**
- ✅ Sekcja rang zwijalna, domyślnie zwinięta (`ranksExpanded = false`)
- ✅ CRUD: dodaj, edytuj inline, usuń z potwierdzeniem inline (web-safe, bez Alert.alert)
- ✅ Fetch rang rozszerzony o `is_system` i `parish_id`
- ✅ Rangi systemowe: badge „systemowa", brak przycisków edycji/usuwania
- ✅ Błędy przez `Toast.show` zamiast `Alert.alert`
- ✅ Przycisk ribbon usunięty z headera zakładki Ministranci
- ✅ `rank-management.tsx` niezmieniony — martwa trasa, brak linku

**Placeholder scan:** Brak TBD, brak niekompletnych kroków.

**Type consistency:** `RankOption` z `is_system: boolean` i `parish_id: string | null` użyty konsekwentnie w `handleStartEditRank(rank: RankOption)`, `rank.is_system` w renderowaniu, `rank.parish_id` nigdzie nie potrzebny w JSX (używany tylko w fetch do filtrowania przez Supabase).
