import { useEffect, useState, useMemo } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, ActivityIndicator, Alert
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'

type MemberRow = { id: string; full_name: string; rank_id: string | null; rank_name: string | null }
type RankOption = { id: string; name: string; order: number }
type RawMemberRow = {
  id: string
  full_name: string
  rank_id: string | null
  ranks: { name: string } | null
}

export default function RankAssignmentScreen() {
  const { profile } = useAuthStore()
  const parishId = profile?.parish_id
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
  const insets = useSafeAreaInsets()

  const [members, setMembers] = useState<MemberRow[]>([])
  const [ranks, setRanks] = useState<RankOption[]>([])
  const [loading, setLoading] = useState(true)
  const [pickerTarget, setPickerTarget] = useState<MemberRow | null>(null)

  const fetchData = async () => {
    const [membersRes, ranksRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, rank_id, ranks(name)')
        .eq('parish_id', parishId)
        .eq('role', 'member')
        .eq('is_active', true)
        .order('full_name'),
      supabase
        .from('ranks')
        .select('id, name, order')
        .or(`parish_id.is.null,parish_id.eq.${parishId}`)
        .order('order'),
    ])

    const raw = (membersRes.data ?? []) as RawMemberRow[]
    const unranked = raw.filter(m => m.rank_id === null).sort((a, b) => a.full_name.localeCompare(b.full_name, 'pl'))
    const ranked = raw.filter(m => m.rank_id !== null).sort((a, b) => a.full_name.localeCompare(b.full_name, 'pl'))
    const sorted: MemberRow[] = [...unranked, ...ranked].map(m => ({
      id: m.id,
      full_name: m.full_name,
      rank_id: m.rank_id,
      rank_name: m.ranks?.name ?? null,
    }))

    setMembers(sorted)
    setRanks(ranksRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => { if (parishId) fetchData() }, [parishId])

  const handleSetRank = async (memberId: string, rankId: string | null) => {
    const rankName = rankId ? ranks.find(r => r.id === rankId)?.name ?? null : null
    setMembers(prev =>
      prev.map(m => m.id === memberId ? { ...m, rank_id: rankId, rank_name: rankName } : m)
    )
    setPickerTarget(null)

    const { error } = await supabase
      .from('profiles')
      .update({ rank_id: rankId })
      .eq('id', memberId)

    if (error) {
      Alert.alert('Błąd', error.message)
      fetchData()
    }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={c.primary} /></View>
  }

  return (
    <>
      <FlatList
        style={styles.container}
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

      <Modal
        visible={pickerTarget !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerTarget(null)}
      >
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setPickerTarget(null)}>
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
        </TouchableOpacity>
      </Modal>
    </>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    content: { padding: 0 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
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

    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
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
