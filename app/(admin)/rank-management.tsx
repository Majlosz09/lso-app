import { useEffect, useState, useMemo } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Alert, ActivityIndicator
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'

type RankRow = { id: string; name: string; order: number; is_system: boolean; parish_id: string | null }

export default function RankManagementScreen() {
  const { profile } = useAuthStore()
  const insets = useSafeAreaInsets()
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
  const [ranks, setRanks] = useState<RankRow[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [renaming, setRenaming] = useState(false)

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

  useEffect(() => { fetchRanks() }, [])

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
      setEditingId(null)
      setEditingName('')
      fetchRanks()
    }
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditingName('')
  }

  const handleDelete = (rank: RankRow) => {
    Alert.alert('Usuń rangę', `Usunąć rangę "${rank.name}"?`, [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń', style: 'destructive', onPress: async () => {
          const { error } = await supabase.from('ranks').delete().eq('id', rank.id)
          if (error) Alert.alert('Błąd', error.message)
          else fetchRanks()
        },
      },
    ])
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={c.primary} /></View>
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={ranks}
        keyExtractor={item => item.id}
        ListHeaderComponent={
          <Text style={styles.sectionLabel}>Rangi ministranckie</Text>
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
                  <Ionicons name="checkmark" size={22} color="#16A34A" />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleCancelEdit} hitSlop={8}>
                  <Ionicons name="close" size={22} color={c.textTertiary} />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.rankName}>{item.name}</Text>
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
                      <Ionicons name="trash-outline" size={20} color="#DC2626" />
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </View>
        )}
        contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom, 16) }]}
      />

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
    </View>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    sectionLabel: {
      fontSize: 12, fontWeight: '700', color: c.textTertiary,
      textTransform: 'uppercase', letterSpacing: 0.8,
      paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8,
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
    rankName: { flex: 1, fontSize: 15, fontWeight: '500', color: c.text },
    editInput: {
      flex: 1, fontSize: 15, color: c.text,
      backgroundColor: c.bg, borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 6,
      borderWidth: 1, borderColor: c.primary,
    },
    rowActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    systemBadge: {
      backgroundColor: c.primaryAlpha08, borderRadius: 6,
      paddingHorizontal: 7, paddingVertical: 3,
    },
    systemBadgeText: { fontSize: 10, color: c.primary, fontWeight: '600' },

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
    },
    addButton: {
      width: 46, height: 46, borderRadius: 12,
      backgroundColor: c.primary, justifyContent: 'center', alignItems: 'center',
    },
  })
}
