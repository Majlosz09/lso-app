import { useEffect, useState, useMemo } from 'react'
import {
  View, Text, FlatList, StyleSheet,
  RefreshControl, ActivityIndicator, TouchableOpacity
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { shadow } from '../../lib/shadows'
import { useAuthStore } from '../../stores/authStore'
import { PointsSummary } from '../../types/database'
import { useRealtimeTable } from '../../hooks/useRealtimeTable'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'

type PointWithSchedule = {
  id: string
  profile_id: string
  amount: number
  reason: string
  schedule_id: string | null
  awarded_by: string | null
  created_at: string
  schedule?: { title: string; date: string } | null
}

type RankingEntry = {
  profile_id: string
  full_name: string
  total_points: number
  services_count: number
}

export default function PointsScreen() {
  const { profile } = useAuthStore()
  const [summary, setSummary] = useState<PointsSummary | null>(null)
  const [points, setPoints] = useState<PointWithSchedule[]>([])
  const [ranking, setRanking] = useState<RankingEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<'history' | 'ranking'>('history')

  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  const fetchData = async () => {
    if (!profile?.id || !profile?.parish_id) return

    const [mySummaryRes, pointsRes, rankingRes, parishProfilesRes] = await Promise.all([
      supabase
        .from('points_summary')
        .select('profile_id, total_points, services_count')
        .eq('profile_id', profile.id)
        .maybeSingle(),
      supabase
        .from('points')
        .select('*, schedule:schedules(title, date)')
        .eq('profile_id', profile.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('points_summary')
        .select('profile_id, full_name, total_points, services_count')
        .eq('parish_id', profile.parish_id)
        .order('total_points', { ascending: false }),
      supabase
        .from('profiles')
        .select('id')
        .eq('parish_id', profile.parish_id)
        .eq('is_active', true),
    ])

    const parishIds = new Set((parishProfilesRes.data ?? []).map((p: any) => p.id))
    const parishRanking = (rankingRes.data ?? []).filter(r => parishIds.has(r.profile_id))

    if (mySummaryRes.data) {
      setSummary(mySummaryRes.data as any)
    } else {
      setSummary({ profile_id: profile.id, total_points: 0, services_count: 0 })
    }
    setPoints(pointsRes.data ?? [])
    setRanking(parishRanking)

    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => { fetchData() }, [profile?.id])

  useRealtimeTable('points', fetchData)

  const onRefresh = () => { setRefreshing(true); fetchData() }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    )
  }

  const myRank = ranking.findIndex(r => r.profile_id === profile?.id) + 1

  return (
    <View style={styles.container}>
      <View style={styles.summaryCard}>
        <View style={styles.summaryTop}>
          <Ionicons name="trophy" size={28} color={c.gold} />
          <Text style={styles.summaryTitle}>Twoje punkty</Text>
        </View>
        <Text style={styles.summaryPoints}>{summary?.total_points ?? 0}</Text>
        <View style={styles.summaryRow}>
          <Ionicons name="checkmark-circle-outline" size={14} color={c.white + 'AA'} />
          <Text style={styles.summaryMeta}>{summary?.services_count ?? 0} służb</Text>
          {myRank > 0 && (
            <>
              <Text style={styles.summaryDot}>·</Text>
              <Ionicons name="bar-chart-outline" size={14} color={c.white + 'AA'} />
              <Text style={styles.summaryMeta}>#{myRank} w rankingu</Text>
            </>
          )}
        </View>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'history' && styles.tabActive]}
          onPress={() => setActiveTab('history')}
        >
          <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>Historia</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'ranking' && styles.tabActive]}
          onPress={() => setActiveTab('ranking')}
        >
          <Text style={[styles.tabText, activeTab === 'ranking' && styles.tabTextActive]}>Ranking</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'history' ? (
        <FlatList
          data={points}
          keyExtractor={(item) => item.id}
          style={{ flex: 1, backgroundColor: c.bg }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="trophy-outline" size={48} color={c.iconMuted} />
              <Text style={styles.emptyTitle}>Brak historii punktów</Text>
              <Text style={styles.emptySubtitle}>
                Punkty zdobywasz za każdą potwierdzoną służbę przy ołtarzu.
              </Text>
            </View>
          }
          renderItem={({ item }) => <PointCard point={item} styles={styles} colors={c} />}
          contentContainerStyle={{ padding: 16, gap: 10 }}
        />
      ) : (
        <FlatList
          data={ranking}
          keyExtractor={(item) => item.profile_id}
          style={{ flex: 1, backgroundColor: c.bg }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="podium-outline" size={48} color={c.iconMuted} />
              <Text style={styles.emptyText}>Brak danych rankingowych</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <RankingRow
              entry={item}
              position={index + 1}
              isMe={item.profile_id === profile?.id}
              styles={styles}
              colors={c}
            />
          )}
          contentContainerStyle={{ padding: 16, gap: 8 }}
        />
      )}
    </View>
  )
}

function PointCard({ point, styles, colors: c }: { point: PointWithSchedule; styles: any; colors: Colors }) {
  const isPositive = point.amount > 0
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardReason} numberOfLines={1}>{point.reason}</Text>
        <View style={[styles.amountBadge, { backgroundColor: isPositive ? c.success + '33' : c.subtext + '22' }]}>
          <Text style={[styles.amountText, { color: isPositive ? c.success : c.subtext }]}>
            {isPositive ? '+' : ''}{point.amount} pkt
          </Text>
        </View>
      </View>
      {point.schedule && (
        <View style={styles.row}>
          <Ionicons name="calendar-outline" size={13} color={c.textTertiary} />
          <Text style={styles.cardMeta}>
            {point.schedule.title} · {new Date(point.schedule.date).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })}
          </Text>
        </View>
      )}
      <View style={styles.row}>
        <Ionicons name="time-outline" size={13} color={c.textTertiary} />
        <Text style={styles.cardMeta}>
          {new Date(point.created_at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })}
        </Text>
      </View>
    </View>
  )
}

const MEDALS = ['🥇', '🥈', '🥉']

function RankingRow({ entry, position, isMe, styles, colors: c }: {
  entry: RankingEntry; position: number; isMe: boolean; styles: any; colors: Colors
}) {
  const router = useRouter()
  return (
    <TouchableOpacity
      style={[styles.rankRow, isMe && styles.rankRowMe]}
      onPress={() => !isMe && router.push(`/(tabs)/member-profile?id=${entry.profile_id}`)}
      activeOpacity={isMe ? 1 : 0.7}
    >
      <Text style={styles.rankPosition}>
        {position <= 3 ? MEDALS[position - 1] : `#${position}`}
      </Text>
      <View style={styles.rankInfo}>
        <Text style={[styles.rankName, isMe && styles.rankNameMe]}>
          {entry.full_name ?? '—'}{isMe ? ' (Ty)' : ''}
        </Text>
        <Text style={styles.rankMeta}>{entry.services_count} służb</Text>
      </View>
      <Text style={[styles.rankPoints, isMe && { color: c.primary }]}>
        {entry.total_points} pkt
      </Text>
    </TouchableOpacity>
  )
}


function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    summaryCard: {
      backgroundColor: c.primary,
      margin: 16,
      marginBottom: 0,
      borderRadius: 16,
      padding: 20,
      gap: 6,
    },
    summaryTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    summaryTitle: { color: c.white + 'CC', fontSize: 14, fontWeight: '500' },
    summaryPoints: { color: c.white, fontSize: 48, fontWeight: '700', lineHeight: 56 },
    summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    summaryMeta: { color: c.white + 'AA', fontSize: 13 },
    summaryDot: { color: c.white + '55', marginHorizontal: 2 },

    tabs: {
      flexDirection: 'row',
      margin: 16,
      marginBottom: 0,
      backgroundColor: c.border,
      borderRadius: 10,
      padding: 3,
    },
    tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
    tabActive: { backgroundColor: c.surface, ...shadow.md },
    tabText: { fontSize: 14, fontWeight: '500', color: c.subtext },
    tabTextActive: { color: c.text },

    card: {
      backgroundColor: c.surface,
      borderRadius: 12,
      padding: 14,
      gap: 5,
      ...shadow.xs,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
    cardReason: { fontSize: 14, fontWeight: '500', color: c.text, flex: 1 },
    amountBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    amountText: { fontSize: 13, fontWeight: '600' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    cardMeta: { fontSize: 12, color: c.textTertiary },

    rankRow: {
      backgroundColor: c.surface,
      borderRadius: 12,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      ...shadow.xs,
    },
    rankRowMe: { backgroundColor: c.primaryAlpha08, borderWidth: 1, borderColor: c.primaryAlpha20 },
    rankPosition: { fontSize: 18, width: 36, textAlign: 'center' },
    rankInfo: { flex: 1 },
    rankName: { fontSize: 14, fontWeight: '500', color: c.text },
    rankNameMe: { fontWeight: '700' },
    rankMeta: { fontSize: 12, color: c.textTertiary, marginTop: 1 },
    rankPoints: { fontSize: 15, fontWeight: '700', color: c.text },

    empty: { alignItems: 'center', marginTop: 60, gap: 12 },
    emptyText: { color: c.textTertiary, fontSize: 15 },
    emptyTitle: { color: c.text, fontSize: 16, fontWeight: '600' },
    emptySubtitle: { color: c.textTertiary, fontSize: 14, textAlign: 'center', maxWidth: 260, lineHeight: 20 },
  })
}
