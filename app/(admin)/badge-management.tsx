import { useEffect, useState, useMemo } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'
import { shadow } from '../../lib/shadows'

type CustomBadge = {
  id: string
  name: string
  icon: string
  criteria_key: string
}

type AwardHistoryRow = {
  id: string
  awarded_at: string
  note: string | null
  profile: { full_name: string } | null
  awarder: { full_name: string } | null
  badge_definition: { name: string; icon: string } | null
}

export default function BadgeManagementScreen() {
  const { profile } = useAuthStore()
  const parishId = profile?.parish_id!
  const insets = useSafeAreaInsets()
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  const [customBadges, setCustomBadges] = useState<CustomBadge[]>([])
  const [history, setHistory] = useState<AwardHistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('')
  const [adding, setAdding] = useState(false)

  const fetchData = async () => {
    const [customRes, historyRes] = await Promise.all([
      supabase.from('badge_definitions')
        .select('id, name, icon, criteria_key')
        .eq('parish_id', parishId)
        .eq('type', 'manual')
        .order('name'),
      supabase.from('member_badges')
        .select(`
          id, awarded_at, note,
          profile:profiles!profile_id(full_name),
          awarder:profiles!awarded_by(full_name),
          badge_definition:badge_definitions(name, icon)
        `)
        .not('awarded_by', 'is', null)
        .order('awarded_at', { ascending: false })
        .limit(30),
    ])
    if (customRes.error) console.error('[badge-management] custom badges error:', customRes.error)
    if (historyRes.error) console.error('[badge-management] history error:', historyRes.error)
    setCustomBadges(customRes.data ?? [])
    setHistory((historyRes.data ?? []).filter((h: any) => h.badge_definition !== null) as AwardHistoryRow[])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const handleAdd = async () => {
    const name = newName.trim()
    const icon = newIcon.trim()
    if (!name) return
    setAdding(true)
    const { error } = await supabase.from('badge_definitions').insert({
      parish_id: parishId,
      name,
      icon: icon || '🏅',
      type: 'manual',
      persistence: 'permanent',
      criteria_key: 'custom',
    })
    setAdding(false)
    if (error) {
      Alert.alert('Błąd', error.message)
      return
    }
    setNewName('')
    setNewIcon('')
    fetchData()
  }

  const handleDelete = (badge: CustomBadge) => {
    Alert.alert(
      'Usuń odznakę',
      `Usunąć odznakę "${badge.name}"? Zostanie usunięta ze wszystkich ministrantów.`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usuń', style: 'destructive', onPress: async () => {
            const { error } = await supabase.from('badge_definitions').delete().eq('id', badge.id)
            if (error) Alert.alert('Błąd', error.message)
            else fetchData()
          },
        },
      ]
    )
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={c.primary} /></View>
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) }]}
    >
      {/* Sekcja: Odznaki parafii */}
      <Text style={styles.sectionLabel}>ODZNAKI PARAFII</Text>
      <View style={styles.card}>
        {customBadges.length === 0 ? (
          <View style={styles.emptyRow}>
            <Text style={styles.emptyText}>Brak własnych odznak. Dodaj pierwszą poniżej.</Text>
          </View>
        ) : (
          customBadges.map((b, i) => (
            <View key={b.id} style={[styles.badgeRow, i < customBadges.length - 1 && styles.rowBorder]}>
              <Text style={styles.badgeIcon}>{b.icon}</Text>
              <Text style={styles.badgeName}>{b.name}</Text>
              <TouchableOpacity onPress={() => handleDelete(b)} hitSlop={8}>
                <Ionicons name="trash-outline" size={20} color="#DC2626" />
              </TouchableOpacity>
            </View>
          ))
        )}

        {/* Formularz dodawania */}
        <View style={[styles.addRow, customBadges.length > 0 && styles.rowBorder]}>
          <TextInput
            style={[styles.addInput, { width: 52 }]}
            placeholder="🏅"
            placeholderTextColor={c.textTertiary}
            value={newIcon}
            onChangeText={setNewIcon}
            maxLength={4}
          />
          <TextInput
            style={[styles.addInput, { flex: 1 }]}
            placeholder="Nazwa odznaki..."
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

      {/* Sekcja: Historia przyznanych */}
      <Text style={[styles.sectionLabel, { marginTop: 8 }]}>HISTORIA PRZYZNANYCH</Text>
      <View style={styles.card}>
        {history.length === 0 ? (
          <View style={styles.emptyRow}>
            <Text style={styles.emptyText}>Brak ręcznie przyznanych odznak.</Text>
          </View>
        ) : (
          history.map((h, i) => (
            <View key={h.id} style={[styles.historyRow, i < history.length - 1 && styles.rowBorder]}>
              <Text style={styles.historyIcon}>{h.badge_definition?.icon ?? '🏅'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.historyBadgeName}>{h.badge_definition?.name ?? ''}</Text>
                <Text style={styles.historyMeta}>
                  {h.profile?.full_name ?? '—'}
                  {' · '}
                  {new Date(h.awarded_at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Text>
                {h.awarder && (
                  <Text style={styles.historyAwarder}>przez {h.awarder.full_name}</Text>
                )}
                {h.note && <Text style={styles.historyNote}>{h.note}</Text>}
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    content: { padding: 16, gap: 12 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    sectionLabel: {
      fontSize: 12, fontWeight: '700', color: c.textTertiary,
      textTransform: 'uppercase', letterSpacing: 0.8,
      paddingHorizontal: 4, paddingBottom: 6,
    },
    card: {
      backgroundColor: c.surface, borderRadius: 14,
      overflow: 'hidden',
      ...shadow.xs,
    },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: c.primarySurface },
    emptyRow: { padding: 16, alignItems: 'center' },
    emptyText: { fontSize: 13, color: c.textTertiary, textAlign: 'center' },

    badgeRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 16, paddingVertical: 14,
    },
    badgeIcon: { fontSize: 22 },
    badgeName: { flex: 1, fontSize: 15, fontWeight: '500', color: c.text },

    addRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 12, paddingVertical: 10,
    },
    addInput: {
      backgroundColor: c.bg, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 10,
      fontSize: 15, color: c.text, borderWidth: 1, borderColor: c.border,
    },
    addButton: {
      width: 44, height: 44, borderRadius: 10,
      backgroundColor: c.primary, justifyContent: 'center', alignItems: 'center',
    },

    historyRow: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 10,
      paddingHorizontal: 16, paddingVertical: 12,
    },
    historyIcon: { fontSize: 22, lineHeight: 26 },
    historyBadgeName: { fontSize: 14, fontWeight: '600', color: c.text },
    historyMeta: { fontSize: 12, color: c.subtext, marginTop: 2 },
    historyAwarder: { fontSize: 11, color: c.textTertiary, marginTop: 1 },
    historyNote: { fontSize: 12, color: c.textTertiary, marginTop: 2, fontStyle: 'italic' },
  })
}
