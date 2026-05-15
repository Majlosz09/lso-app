import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Alert, ActivityIndicator
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'

type RankRow = { id: string; name: string; order: number; is_system: boolean; parish_id: string | null }

export default function RankManagementScreen() {
  const { profile } = useAuthStore()
  const insets = useSafeAreaInsets()
  const [ranks, setRanks] = useState<RankRow[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)

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
    return <View style={styles.center}><ActivityIndicator size="large" color="#534AB7" /></View>
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
              <Ionicons name="ribbon" size={16} color={item.is_system ? '#534AB7' : '#888'} />
            </View>
            <Text style={styles.rankName}>{item.name}</Text>
            {item.is_system ? (
              <View style={styles.systemBadge}>
                <Text style={styles.systemBadgeText}>systemowa</Text>
              </View>
            ) : (
              <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={8}>
                <Ionicons name="trash-outline" size={20} color="#e74c3c" />
              </TouchableOpacity>
            )}
          </View>
        )}
        contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom, 16) }]}
      />

      <View style={styles.addRow}>
        <TextInput
          style={styles.addInput}
          placeholder="Nazwa nowej rangi..."
          placeholderTextColor="#aaa"
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: '#aaa',
    textTransform: 'uppercase', letterSpacing: 0.8,
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8,
  },
  listContent: { paddingBottom: 100 },

  rankRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  rankIcon: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: '#88888818', justifyContent: 'center', alignItems: 'center',
  },
  rankIconSystem: { backgroundColor: '#534AB711' },
  rankName: { flex: 1, fontSize: 15, fontWeight: '500', color: '#1a1a1a' },
  systemBadge: {
    backgroundColor: '#534AB711', borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  systemBadgeText: { fontSize: 10, color: '#534AB7', fontWeight: '600' },

  addRow: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', padding: 16,
    borderTopWidth: 1, borderTopColor: '#f0f0f0',
  },
  addInput: {
    flex: 1, backgroundColor: '#f5f5f5', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#1a1a1a',
  },
  addButton: {
    width: 46, height: 46, borderRadius: 12,
    backgroundColor: '#534AB7', justifyContent: 'center', alignItems: 'center',
  },
})
