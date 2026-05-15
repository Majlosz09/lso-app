import { useEffect, useState, useMemo } from 'react'
import {
  View, Text, FlatList, StyleSheet,
  TouchableOpacity, TextInput, ActivityIndicator
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { shadow } from '../../lib/shadows'

type Member = {
  id: string
  full_name: string
  role: 'member' | 'parent'
  phone: string | null
  rocznik: number | null
  total_points?: number
  services_count?: number
}

type Filter = 'member' | 'parent'

export default function MembersScreen() {
  const router = useRouter()
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('member')

  useEffect(() => {
    const fetchAll = async () => {
      const [profilesRes, pointsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, role, phone, rocznik')
          .in('role', ['member', 'parent'])
          .eq('is_active', true)
          .order('full_name'),
        supabase
          .from('points_summary')
          .select('profile_id, total_points, services_count'),
      ])

      const pointsMap: Record<string, { total_points: number; services_count: number }> = {}
      for (const p of (pointsRes.data ?? [])) {
        pointsMap[p.profile_id] = { total_points: p.total_points, services_count: p.services_count }
      }

      const merged: Member[] = (profilesRes.data ?? []).map((p: any) => ({
        ...p,
        total_points: pointsMap[p.id]?.total_points ?? 0,
        services_count: pointsMap[p.id]?.services_count ?? 0,
      }))

      setMembers(merged)
      setLoading(false)
    }
    fetchAll()
  }, [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return members.filter(m =>
      m.role === filter &&
      (q === '' || m.full_name.toLowerCase().includes(q))
    )
  }, [members, filter, search])

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color="#aaa" />
          <TextInput
            style={styles.searchInput}
            placeholder="Szukaj po imieniu..."
            placeholderTextColor="#aaa"
            value={search}
            onChangeText={setSearch}
          />
          {search !== '' && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color="#ccc" />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.chipRow}>
          {(['member', 'parent'] as Filter[]).map(f => (
            <TouchableOpacity
              key={f}
              style={[styles.chip, filter === f && styles.chipActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
                {f === 'member' ? 'Ministranci' : 'Rodzice'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#534AB7" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>
                {search !== '' ? 'Brak wyników wyszukiwania' : 'Brak użytkowników'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push(`/(admin)/member-detail?id=${item.id}`)}
              activeOpacity={0.75}
            >
              <View style={styles.avatar}>
                <Ionicons name="person" size={18} color="#534AB7" />
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
                  <Ionicons name="trophy-outline" size={12} color="#f0a500" />
                  <Text style={styles.pointsText}>{item.total_points ?? 0}</Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={16} color="#ddd" />
            </TouchableOpacity>
          )}
          contentContainerStyle={{ padding: 16, gap: 8 }}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  topBar: { backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, gap: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#f5f5f5', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#1a1a1a' },

  chipRow: { flexDirection: 'row', gap: 8 },
  chip: {
    paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  chipActive: { backgroundColor: '#534AB7' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#666' },
  chipTextActive: { color: '#fff' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 12, padding: 12,
    ...shadow.xs,
  },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#534AB711', justifyContent: 'center', alignItems: 'center',
  },
  rowInfo: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  sub: { fontSize: 12, color: '#888', marginTop: 2 },

  pointsBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#f0a50018', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3,
  },
  pointsText: { fontSize: 12, fontWeight: '700', color: '#f0a500' },

  empty: { alignItems: 'center', marginTop: 60, gap: 12 },
  emptyText: { color: '#aaa', fontSize: 15 },
})
