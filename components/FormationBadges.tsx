import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../lib/theme'
import { shadow } from '../lib/shadows'

export type BadgeWithDef = {
  id: string
  awarded_at: string
  badge_definition: { id?: string; name: string; icon: string; criteria_key?: string } | null
}

export function FormationSection({
  ranks, currentRankId, c,
}: {
  ranks: { id: string; name: string; order: number }[]
  currentRankId: string | null
  c: Colors
}) {
  const s = createFormationStyles(c)
  const currentIdx = currentRankId ? ranks.findIndex(r => r.id === currentRankId) : -1
  return (
    <View style={s.section}>
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>ŚCIEŻKA FORMACJI</Text>
      </View>
      <View style={s.formationCard}>
        <View style={s.formationRow}>
          {ranks.flatMap((rank, idx) => {
            const isDone = currentIdx >= 0 && idx < currentIdx
            const isCurrent = idx === currentIdx
            const items = []
            if (idx > 0) {
              items.push(
                <View
                  key={`conn-${rank.id}`}
                  style={[s.formationConnector, idx <= currentIdx ? s.formationConnectorDone : null]}
                />
              )
            }
            items.push(
              <View key={rank.id} style={s.formationStep}>
                <View
                  style={[
                    s.formationCircle,
                    isDone ? s.formationCircleDone : isCurrent ? s.formationCircleCurrent : null,
                  ]}
                >
                  {isDone
                    ? <Ionicons name="checkmark" size={11} color="#fff" />
                    : isCurrent ? <View style={s.formationDot} /> : null
                  }
                </View>
                <Text
                  style={[
                    s.formationLabel,
                    isDone ? s.formationLabelDone : isCurrent ? s.formationLabelCurrent : null,
                  ]}
                  numberOfLines={2}
                >
                  {rank.name}
                </Text>
              </View>
            )
            return items
          })}
        </View>
      </View>
    </View>
  )
}

export function BadgesSection({
  badges, onBadgePress, c,
}: {
  badges: BadgeWithDef[]
  onBadgePress: (badge: BadgeWithDef) => void
  c: Colors
}) {
  const s = createBadgesStyles(c)
  return (
    <View style={s.section}>
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>WYRÓŻNIENIA</Text>
      </View>
      <View style={s.badgesCard}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.badgesScroll}>
          {badges.map(b => (
            <TouchableOpacity
              key={b.id}
              style={s.badgeChip}
              onPress={() => onBadgePress(b)}
              activeOpacity={0.7}
            >
              <Text style={s.badgeChipIcon}>{b.badge_definition?.icon ?? '🏅'}</Text>
              <Text style={s.badgeChipName}>{b.badge_definition?.name ?? ''}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  )
}

function createFormationStyles(c: Colors) {
  return StyleSheet.create({
    section: { gap: 8 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionTitle: { fontSize: 13, fontWeight: '600', color: c.subtext, textTransform: 'uppercase', letterSpacing: 0.5 },
    formationCard: { backgroundColor: c.surface, borderRadius: 14, padding: 16, ...shadow.xs },
    formationRow: { flexDirection: 'row', alignItems: 'flex-start' },
    formationConnector: { flex: 1, height: 2, backgroundColor: c.border, marginTop: 11 },
    formationConnectorDone: { backgroundColor: c.success },
    formationStep: { alignItems: 'center', width: 44 },
    formationCircle: {
      width: 24, height: 24, borderRadius: 12,
      justifyContent: 'center', alignItems: 'center',
      backgroundColor: c.surface, borderWidth: 2, borderColor: c.border,
    },
    formationCircleDone: { backgroundColor: c.success, borderColor: c.success },
    formationCircleCurrent: { backgroundColor: c.primary, borderColor: c.primary },
    formationDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
    formationLabel: { textAlign: 'center', fontSize: 9, lineHeight: 12, color: c.textTertiary, fontWeight: '400', marginTop: 4 },
    formationLabelDone: { color: c.success },
    formationLabelCurrent: { color: c.primary, fontWeight: '700' },
  })
}

function createBadgesStyles(c: Colors) {
  return StyleSheet.create({
    section: { gap: 8 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionTitle: { fontSize: 13, fontWeight: '600', color: c.subtext, textTransform: 'uppercase', letterSpacing: 0.5 },
    badgesCard: { backgroundColor: c.surface, borderRadius: 14, ...shadow.xs },
    badgesScroll: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
    badgeChip: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: c.primarySurface, borderRadius: 20,
      paddingHorizontal: 12, paddingVertical: 8,
      borderWidth: 1, borderColor: c.primaryAlpha12,
    },
    badgeChipIcon: { fontSize: 16 },
    badgeChipName: { fontSize: 12, fontWeight: '600', color: c.primary },
  })
}
