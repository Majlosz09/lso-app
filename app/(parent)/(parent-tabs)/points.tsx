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
