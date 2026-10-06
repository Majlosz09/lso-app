import { useEffect, useState, useMemo } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Switch, KeyboardAvoidingView, Platform
} from 'react-native'
import { useHeaderHeight } from 'expo-router/react-navigation'
import Toast from 'react-native-toast-message'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { RankRequirement, RankRequirementsSheet, requirementSummary } from '../../components/admin/RankRequirementsSheet'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'
import { ConfirmDialog } from '../../components/ConfirmDialog'

type RankRow = { id: string; name: string; order: number; is_system: boolean; parish_id: string | null }

export default function RankManagementScreen() {
  const { profile, parish, fetchProfile } = useAuthStore()
  // rangi systemowe (Kandydat…Ceremoniarz) — parafia sama decyduje, czy z nich korzysta
  const systemOn = !!parish?.system_ranks_enabled
  const [savingSystem, setSavingSystem] = useState(false)
  const [toDelete, setToDelete] = useState<RankRow | null>(null)
  const insets = useSafeAreaInsets()
  // pole „Nazwa nowej rangi” jest przyklejone na dole — podnosimy je nad klawiaturę (offset = nagłówek ekranu)
  let headerHeight = 0
  try { headerHeight = useHeaderHeight() } catch { /* bez nagłówka */ }
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
  const [ranks, setRanks] = useState<RankRow[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [renaming, setRenaming] = useState(false)
  // ścieżka formacji: wymagania do stopni
  const [reqs, setReqs] = useState<Record<string, RankRequirement>>({})
  const [reqFor, setReqFor] = useState<{ id: string; name: string } | null>(null)
  const loadReqs = async () => {
    if (!profile?.parish_id) return
    const { data } = await supabase.from('rank_requirements').select('rank_id, min_services, min_months, min_rate, wiedza_categories, note').eq('parish_id', profile.parish_id)
    setReqs(Object.fromEntries(((data ?? []) as RankRequirement[]).map(r => [r.rank_id, r])))
  }
  useEffect(() => { loadReqs() }, [profile?.parish_id])

  const fetchRanks = async () => {
    const parishId = profile?.parish_id
    let query = supabase.from('ranks').select('*').order('order')
    if (parishId) {
      query = query.or(`parish_id.is.null,parish_id.eq.${parishId}`)
    } else {
      query = query.is('parish_id', null)
    }
    const { data } = await query
    setRanks(data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchRanks() }, [systemOn])

  const toggleSystem = async (v: boolean) => {
    if (!parish) return
    setSavingSystem(true)
    const { error } = await supabase.from('parishes').update({ system_ranks_enabled: v }).eq('id', parish.id)
    if (error) { setSavingSystem(false); Toast.show({ type: 'error', text1: 'Błąd', text2: error.message }); return }
    await fetchProfile()
    setSavingSystem(false)
    Toast.show({ type: 'success', text1: v ? 'Rangi systemowe włączone' : 'Rangi systemowe wyłączone', text2: v ? undefined : 'Nadane rangi wrócą po ponownym włączeniu.' })
  }

  const handleAdd = async () => {
    if (!newName.trim()) return
    setAdding(true)
    const maxOrder = ranks.length > 0 ? Math.max(...ranks.map(r => r.order)) + 1 : 1
    const { error } = await supabase.from('ranks').insert({
      name: newName.trim(),
      order: maxOrder,
      is_system: false,
      parish_id: profile?.parish_id,
    })
    setAdding(false)
    if (error) {
      Alert.alert('Błąd', error.message)
    } else {
      Toast.show({ type: 'success', text1: 'Ranga dodana', text2: newName.trim() })
      setNewName('')
      fetchRanks()
    }
  }

  const handleStartEdit = (rank: RankRow) => {
    setEditingId(rank.id)
    setEditingName(rank.name)
  }

  const handleRename = async () => {
    if (!editingId || !editingName.trim()) return
    setRenaming(true)
    const { error } = await supabase
      .from('ranks')
      .update({ name: editingName.trim() })
      .eq('id', editingId)
    setRenaming(false)
    if (error) {
      Alert.alert('Błąd', error.message)
    } else {
      Toast.show({ type: 'success', text1: 'Nazwa zmieniona', text2: editingName.trim() })
      setEditingId(null)
      setEditingName('')
      fetchRanks()
    }
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditingName('')
  }

  // ConfirmDialog zamiast Alert.alert z przyciskami (na webie Alert z przyciskami nic nie robi)
  const handleDelete = (rank: RankRow) => setToDelete(rank)
  const confirmDelete = async () => {
    const rank = toDelete
    setToDelete(null)
    if (!rank) return
    const { error } = await supabase.from('ranks').delete().eq('id', rank.id)
    if (error) Toast.show({ type: 'error', text1: 'Błąd', text2: error.message })
    else fetchRanks()
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={c.primary} /></View>
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding" enabled={Platform.OS !== 'web'} keyboardVerticalOffset={headerHeight}>
      <FlatList
        data={ranks}
        keyExtractor={item => item.id}
        ListHeaderComponent={
          <>
            <View style={styles.systemCard}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.rankName}>Rangi systemowe</Text>
                <Text style={styles.systemHint}>
                  Gotowa ścieżka: Kandydat, Ministrant, Lektor Młodszy, Lektor Starszy, Ceremoniarz. Włącz, jeśli parafia z niej korzysta — albo dodaj poniżej własne rangi.
                </Text>
              </View>
              <Switch value={systemOn} onValueChange={toggleSystem} disabled={savingSystem || !parish}
                trackColor={{ true: c.primary, false: c.inputBorder }} thumbColor="#FFFFFF" />
            </View>
            <Text style={styles.sectionLabel}>Rangi ministranckie</Text>
          </>
        }
        ListEmptyComponent={
          <Text style={styles.systemHint}>Brak rang. Dodaj własną rangę poniżej albo włącz rangi systemowe.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.rankRow}>
            <View style={[styles.rankIcon, item.is_system && styles.rankIconSystem]}>
              <Ionicons name="ribbon" size={16} color={item.is_system ? c.primary : c.subtext} />
            </View>
            {editingId === item.id ? (
              <>
                <TextInput
                  style={styles.editInput}
                  value={editingName}
                  onChangeText={setEditingName}
                  onSubmitEditing={handleRename}
                  returnKeyType="done"
                  autoFocus
                />
                <TouchableOpacity onPress={handleRename} hitSlop={8} disabled={renaming}>
                  <Ionicons name="checkmark" size={22} color="#2F7D4F" />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleCancelEdit} hitSlop={8}>
                  <Ionicons name="close" size={22} color={c.textTertiary} />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity style={{ flex: 1 }} onPress={() => setReqFor({ id: item.id, name: item.name })} accessibilityLabel={`Wymagania: ${item.name}`}>
                  <Text style={[styles.rankName, { flex: 0 }]}>{item.name}</Text>
                  <Text style={{ fontSize: 12, color: reqs[item.id] ? c.primary : c.textTertiary, fontFamily: 'Manrope_600SemiBold' }}>
                    {`Wymagania: ${requirementSummary(reqs[item.id])}`}
                  </Text>
                </TouchableOpacity>
                {item.is_system ? (
                  <View style={styles.systemBadge}>
                    <Text style={styles.systemBadgeText}>systemowa</Text>
                  </View>
                ) : (
                  <View style={styles.rowActions}>
                    <TouchableOpacity onPress={() => handleStartEdit(item)} hitSlop={8}>
                      <Ionicons name="pencil-outline" size={20} color={c.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={20} color="#B3261E" />
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </View>
        )}
        contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom, 16) }]}
      />

      <ConfirmDialog visible={!!toDelete} title="Usunąć rangę?" message={toDelete ? `„${toDelete.name}” zniknie z profili ministrantów, którzy ją mają.` : ''}
        confirmText="Usuń" destructive onCancel={() => setToDelete(null)} onConfirm={confirmDelete} />
      <RankRequirementsSheet rank={reqFor} current={reqFor ? reqs[reqFor.id] : undefined} onClose={() => setReqFor(null)} onSaved={loadReqs} />

      <View style={styles.addRow}>
        <TextInput
          style={styles.addInput}
          placeholder="Nazwa nowej rangi..."
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
    </KeyboardAvoidingView>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    systemCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, marginBottom: 12 },
  systemHint: { fontSize: 13, lineHeight: 18, color: c.subtext, fontFamily: 'Manrope_500Medium' },
  sectionLabel: {
      fontSize: 12, color: c.textTertiary,
      textTransform: 'uppercase', letterSpacing: 0.8,
      paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8,
      fontFamily: 'Manrope_700Bold',
    },
    listContent: { paddingBottom: 100 },

    rankRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: c.surface, paddingHorizontal: 16, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: c.primarySurface,
    },
    rankIcon: {
      width: 32, height: 32, borderRadius: 10,
      backgroundColor: c.primarySurface, justifyContent: 'center', alignItems: 'center',
    },
    rankIconSystem: { backgroundColor: c.primaryAlpha08 },
    rankName: { flex: 1, fontSize: 15, color: c.text, fontFamily: 'Manrope_500Medium' },
    editInput: {
      flex: 1, fontSize: 15, color: c.text,
      backgroundColor: c.bg, borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 6,
      borderWidth: 1, borderColor: c.primary,
      fontFamily: 'Manrope_500Medium',
    },
    rowActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    systemBadge: {
      backgroundColor: c.primaryAlpha08, borderRadius: 6,
      paddingHorizontal: 7, paddingVertical: 3,
    },
    systemBadgeText: { fontSize: 10, color: c.primary, fontFamily: 'Manrope_600SemiBold' },

    addRow: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: c.surface, padding: 16,
      borderTopWidth: 1, borderTopColor: c.primarySurface,
    },
    addInput: {
      flex: 1, backgroundColor: c.bg, borderRadius: 10,
      paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 15, color: c.text,
      fontFamily: 'Manrope_500Medium',
    },
    addButton: {
      width: 46, height: 46, borderRadius: 12,
      backgroundColor: c.primary, justifyContent: 'center', alignItems: 'center',
    },
  })
}
