import { useCallback, useEffect, useState, useMemo } from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  ActivityIndicator, Modal, TouchableOpacity
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useRealtimeTable } from '../../hooks/useRealtimeTable'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'
import { shadow } from '../../lib/shadows'
import { FormationSection, BadgesSection, BadgeWithDef } from '../../components/FormationBadges'

type MemberData = {
  id: string
  full_name: string
  rank_id: string | null
  ranks: { name: string } | null
  member_badges: (BadgeWithDef & { is_active: boolean })[]
}

export default function MemberProfileScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { profile } = useAuthStore()
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
  const insets = useSafeAreaInsets()

  const [member, setMember] = useState<MemberData | null>(null)
  const [allRanks, setAllRanks] = useState<{ id: string; name: string; order: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [selectedBadge, setSelectedBadge] = useState<BadgeWithDef | null>(null)

  const fetchData = useCallback(() => {
    if (!id || !profile?.parish_id) return
    Promise.all([
      supabase
        .from('profiles')
        .select(`
          id, full_name, rank_id,
          ranks(name),
          member_badges(
            id, awarded_at, is_active,
            badge_definition:badge_definitions(id, name, icon, criteria_key)
          )
        `)
        .eq('id', id)
        .single(),
      supabase
        .from('ranks')
        .select('id, name, order')
        .or(`parish_id.is.null,parish_id.eq.${profile.parish_id}`)
        .order('order'),
    ]).then(([memberRes, ranksRes]) => {
      if (memberRes.error || !memberRes.data) {
        setNotFound(true)
      } else {
        setMember(memberRes.data as unknown as MemberData)
      }
      setAllRanks(ranksRes.data ?? [])
      setLoading(false)
    }).catch(() => { setLoading(false); setNotFound(true) })
  }, [id, profile?.parish_id])

  useEffect(() => { fetchData() }, [fetchData])

  useRealtimeTable('profiles', fetchData, id ? `id=eq.${id}` : undefined)
  useRealtimeTable('member_badges', fetchData, id ? `profile_id=eq.${id}` : undefined)

  const seen = new Set<string>()
  const activeBadges = (member?.member_badges ?? [])
    .filter(b => b.is_active && b.badge_definition !== null)
    .filter(b => {
      const key = b.badge_definition?.criteria_key ?? b.id
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={c.primary} /></View>
  }

  if (notFound || !member) {
    return (
      <View style={styles.center}>
        <Ionicons name="person-outline" size={48} color={c.iconMuted} />
        <Text style={styles.notFound}>Nie znaleziono profilu</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={16} color={c.primary} />
          <Text style={styles.backBtnText}>Wróć</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const initials = member.full_name.split(' ').map(n => n[0]).slice(0, 2).join('')

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) }]}
    >
      <TouchableOpacity style={styles.backRow} onPress={() => router.back()} activeOpacity={0.7}>
        <Ionicons name="arrow-back" size={20} color={c.primary} />
        <Text style={styles.backRowText}>Wróć</Text>
      </TouchableOpacity>
      <View style={styles.headerCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitials}>{initials}</Text>
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={styles.memberName}>{member.full_name}</Text>
          {member.ranks?.name ? (
            <View style={styles.rankChip}>
              <Text style={styles.rankChipText}>{member.ranks.name}</Text>
            </View>
          ) : (
            <Text style={styles.noRank}>Brak rangi</Text>
          )}
        </View>
      </View>

      {allRanks.length > 0 && (
        <FormationSection ranks={allRanks} currentRankId={member.rank_id} c={c} />
      )}

      {activeBadges.length > 0 && (
        <BadgesSection badges={activeBadges} onBadgePress={setSelectedBadge} c={c} />
      )}

      <Modal
        visible={selectedBadge !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedBadge(null)}
      >
        <TouchableOpacity
          style={styles.tooltipOverlay}
          activeOpacity={1}
          onPress={() => setSelectedBadge(null)}
        >
          <View style={styles.tooltip}>
            <Text style={styles.tooltipIcon}>{selectedBadge?.badge_definition?.icon ?? ''}</Text>
            <Text style={styles.tooltipName}>{selectedBadge?.badge_definition?.name ?? ''}</Text>
            <Text style={styles.tooltipDate}>
              {selectedBadge
                ? new Date(selectedBadge.awarded_at).toLocaleDateString('pl-PL', {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })
                : ''}
            </Text>
          </View>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    content: { padding: 16, gap: 16 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    notFound: { fontSize: 16, color: c.textTertiary, marginTop: 12 },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: c.surface, borderRadius: 10 },
    backBtnText: { fontSize: 15, color: c.primary, fontWeight: '500' },
    backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 8 },
    backRowText: { fontSize: 15, color: c.primary, fontWeight: '500' },

    headerCard: {
      flexDirection: 'row', alignItems: 'center', gap: 16,
      backgroundColor: c.surface, borderRadius: 16, padding: 20,
      ...shadow.md,
    },
    avatar: {
      width: 56, height: 56, borderRadius: 28,
      backgroundColor: c.primaryAlpha08,
      justifyContent: 'center', alignItems: 'center',
    },
    avatarInitials: { fontSize: 20, fontWeight: '700', color: c.primary },
    memberName: { fontSize: 18, fontWeight: '700', color: c.text },
    rankChip: {
      alignSelf: 'flex-start',
      backgroundColor: c.primaryAlpha08, borderRadius: 12,
      paddingHorizontal: 10, paddingVertical: 4,
      borderWidth: 1, borderColor: c.primaryAlpha12,
    },
    rankChipText: { fontSize: 13, fontWeight: '600', color: c.primary },
    noRank: { fontSize: 13, color: c.textTertiary },

    tooltipOverlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'center', alignItems: 'center', padding: 40,
    },
    tooltip: {
      backgroundColor: c.surface, borderRadius: 16, padding: 24,
      alignItems: 'center', gap: 6, ...shadow.md, minWidth: 180,
    },
    tooltipIcon: { fontSize: 40 },
    tooltipName: { fontSize: 17, fontWeight: '700', color: c.text },
    tooltipDate: { fontSize: 13, color: c.subtext },
  })
}
