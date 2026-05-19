import { useEffect, useState, useMemo } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, ScrollView, Platform
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { MassTemplate } from '../../types/database'
import { shadow } from '../../lib/shadows'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'

const DAYS = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So']
const DAYS_FULL = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota']
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export default function MassScheduleScreen() {
  const { profile } = useAuthStore()
  const insets = useSafeAreaInsets()
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
  const [templates, setTemplates] = useState<MassTemplate[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedDay, setSelectedDay] = useState(0)
  const [timeInput, setTimeInput] = useState('')
  const [labelInput, setLabelInput] = useState('')
  const [adding, setAdding] = useState(false)

  const fetch = async () => {
    const { data } = await supabase
      .from('mass_templates')
      .select('*')
      .eq('parish_id', profile?.parish_id)
      .order('day_of_week')
      .order('time')
    setTemplates((data as MassTemplate[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { fetch() }, [])

  const handleAdd = async () => {
    if (!TIME_RE.test(timeInput)) {
      Alert.alert('Błąd', 'Podaj godzinę w formacie GG:MM (np. 10:00)')
      return
    }
    setAdding(true)
    const { error } = await supabase.from('mass_templates').insert({
      parish_id: profile?.parish_id,
      day_of_week: selectedDay,
      time: timeInput + ':00',
      label: labelInput.trim() || null,
    })
    setAdding(false)
    if (error) {
      Alert.alert('Błąd', error.message)
    } else {
      setTimeInput('')
      setLabelInput('')
      fetch()
    }
  }

  const doDelete = async (item: MassTemplate) => {
    const { data, error } = await supabase
      .from('mass_templates').delete().eq('id', item.id).select('id')
    if (error) Alert.alert('Błąd', error.message)
    else if (!data?.length) Alert.alert('Błąd uprawnień', 'Brak polityki DELETE dla mass_templates.')
    else fetch()
  }

  const handleDelete = (item: MassTemplate) => {
    const msg = `Usunąć Mszę Świętą ${DAYS_FULL[item.day_of_week]} ${item.time.slice(0, 5)}${item.label ? ` (${item.label})` : ''}?`
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) doDelete(item)
    } else {
      Alert.alert('Usuń Mszę Świętą', msg, [
        { text: 'Anuluj', style: 'cancel' },
        { text: 'Usuń', style: 'destructive', onPress: () => doDelete(item) },
      ])
    }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={c.primary} /></View>
  }

  // Group by day_of_week, show only days that have entries
  const grouped = DAYS.map((_, dow) => ({
    dow,
    items: templates.filter(t => t.day_of_week === dow),
  })).filter(g => g.items.length > 0)

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {grouped.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="time-outline" size={48} color={c.iconMuted} />
            <Text style={styles.emptyText}>Brak godzin mszy</Text>
            <Text style={styles.emptySubText}>Dodaj poniżej stały plan tygodniowy</Text>
          </View>
        ) : (
          grouped.map(({ dow, items }) => (
            <View key={dow} style={styles.daySection}>
              <Text style={styles.dayHeader}>{DAYS_FULL[dow]}</Text>
              {items.map(item => (
                <View key={item.id} style={styles.row}>
                  <View style={styles.timeBadge}>
                    <Text style={styles.timeBadgeText}>{item.time.slice(0, 5)}</Text>
                  </View>
                  <Text style={styles.rowLabel} numberOfLines={1}>
                    {item.label ?? 'Msza Święta'}
                  </Text>
                  <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={20} color="#DC2626" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>

      {/* Sticky add bar */}
      <View style={[styles.addBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Text style={styles.addBarTitle}>Dodaj Mszę Świętą</Text>

        <View style={styles.dayChips}>
          {DAYS.map((d, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.dayChip, selectedDay === i && styles.dayChipActive]}
              onPress={() => setSelectedDay(i)}
            >
              <Text style={[styles.dayChipText, selectedDay === i && styles.dayChipTextActive]}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.addInputRow}>
          <TextInput
            style={[styles.input, styles.inputTime]}
            placeholder="GG:MM"
            placeholderTextColor={c.textTertiary}
            value={timeInput}
            onChangeText={setTimeInput}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
          />
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="Etykieta (opcjonalnie)"
            placeholderTextColor={c.textTertiary}
            value={labelInput}
            onChangeText={setLabelInput}
          />
          <TouchableOpacity
            style={[styles.addBtn, (!timeInput.trim() || adding) && { opacity: 0.4 }]}
            onPress={handleAdd}
            disabled={!timeInput.trim() || adding}
          >
            {adding
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="add" size={22} color="#fff" />
            }
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    content: { padding: 16, paddingBottom: 8, gap: 12 },

    empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
    emptyText: { fontSize: 16, fontWeight: '600', color: c.textTertiary },
    emptySubText: { fontSize: 13, color: c.textTertiary, textAlign: 'center' },

    daySection: {
      backgroundColor: c.surface, borderRadius: 14,
      overflow: 'hidden',
      ...shadow.md,
    },
    dayHeader: {
      fontSize: 12, fontWeight: '700', color: c.primary,
      textTransform: 'uppercase', letterSpacing: 0.8,
      paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6,
      backgroundColor: c.primaryAlpha08,
    },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 16, paddingVertical: 12,
      borderTopWidth: 1, borderTopColor: c.primarySurface,
    },
    timeBadge: {
      backgroundColor: c.primaryAlpha08, borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 4,
      minWidth: 58, alignItems: 'center',
    },
    timeBadgeText: { fontSize: 15, fontWeight: '700', color: c.primary },
    rowLabel: { flex: 1, fontSize: 14, color: c.subtext },

    addBar: {
      backgroundColor: c.surface, padding: 16, gap: 10,
      borderTopWidth: 1, borderTopColor: c.primarySurface,
    },
    addBarTitle: { fontSize: 13, fontWeight: '700', color: c.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
    dayChips: { flexDirection: 'row', gap: 6 },
    dayChip: {
      flex: 1, paddingVertical: 7, borderRadius: 8,
      backgroundColor: c.primarySurface, alignItems: 'center',
    },
    dayChipActive: { backgroundColor: c.primary },
    dayChipText: { fontSize: 12, fontWeight: '600', color: c.subtext },
    dayChipTextActive: { color: '#fff' },

    addInputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    input: {
      backgroundColor: c.bg, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 11,
      fontSize: 15, color: c.text, borderWidth: 1, borderColor: c.border,
    },
    inputTime: { width: 72 },
    addBtn: {
      width: 44, height: 44, borderRadius: 10,
      backgroundColor: c.primary, justifyContent: 'center', alignItems: 'center',
    },
  })
}
