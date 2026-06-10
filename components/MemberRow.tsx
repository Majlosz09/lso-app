import { memo, useMemo } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../lib/ThemeContext'
import { Colors } from '../lib/theme'

export interface MemberRowData {
  id: string
  full_name: string
  role: 'member' | 'parent' | 'admin'
  phone: string | null
  rocznik: number | null
  total_points?: number
}

interface Props {
  member: MemberRowData
  onPress: () => void
}

function MemberRowComponent({ member, onPress }: Props) {
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={styles.avatar}>
        <Ionicons name="person" size={18} color={c.primary} />
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.name}>{member.full_name}</Text>
        <Text style={styles.sub}>
          {member.phone ?? 'Brak telefonu'}
          {member.role === 'member' && member.rocznik ? ` · rocznik ${member.rocznik}` : ''}
        </Text>
      </View>
      {member.role === 'member' && (
        <View style={styles.pointsBadge}>
          <Ionicons name="trophy-outline" size={12} color={c.gold} />
          <Text style={styles.pointsText}>{member.total_points ?? 0}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={16} color={c.border} />
    </TouchableOpacity>
  )
}

export const MemberRow = memo(MemberRowComponent)

function createStyles(c: Colors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: c.surface, borderRadius: 12, padding: 12,
    },
    avatar: {
      width: 38, height: 38, borderRadius: 19,
      backgroundColor: c.primaryAlpha08, justifyContent: 'center', alignItems: 'center',
    },
    rowInfo: { flex: 1 },
    name: { fontSize: 15, fontWeight: '600', color: c.text },
    sub: { fontSize: 12, color: c.subtext, marginTop: 2 },
    pointsBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 3,
      backgroundColor: c.gold + '15', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3,
    },
    pointsText: { fontSize: 12, fontWeight: '700', color: c.gold },
  })
}
