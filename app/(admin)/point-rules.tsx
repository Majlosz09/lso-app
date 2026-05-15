import { useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Platform
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { PointRule } from '../../types/database'
import { shadow } from '../../lib/shadows'

export default function PointRulesScreen() {
  const { profile } = useAuthStore()
  const insets = useSafeAreaInsets()
  const [rules, setRules] = useState<PointRule[]>([])
  const [loading, setLoading] = useState(true)
  const [labelInput, setLabelInput] = useState('')
  const [pointsInput, setPointsInput] = useState('')
  const [adding, setAdding] = useState(false)

  const fetchRules = async () => {
    const { data } = await supabase
      .from('point_rules')
      .select('*')
      .eq('parish_id', profile?.parish_id)
      .order('points', { ascending: false })
    setRules((data as PointRule[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchRules() }, [])

  const handleAdd = async () => {
    if (!labelInput.trim()) { Alert.alert('Błąd', 'Wpisz nazwę służby.'); return }
    const pts = parseInt(pointsInput)
    if (isNaN(pts) || pts <= 0) { Alert.alert('Błąd', 'Wpisz prawidłową liczbę punktów.'); return }
    setAdding(true)
    const { error } = await supabase.from('point_rules').insert({
      parish_id: profile?.parish_id,
      label: labelInput.trim(),
      points: pts,
    })
    setAdding(false)
    if (error) { Alert.alert('Błąd', error.message) }
    else { setLabelInput(''); setPointsInput(''); fetchRules() }
  }

  const doDelete = async (rule: PointRule) => {
    const { data, error } = await supabase
      .from('point_rules').delete().eq('id', rule.id).select('id')
    if (error) Alert.alert('Błąd', error.message)
    else if (!data?.length) Alert.alert('Błąd uprawnień', 'Brak polityki DELETE dla point_rules.')
    else fetchRules()
  }

  const handleDelete = (rule: PointRule) => {
    const msg = `Usunąć "${rule.label} (${rule.points} pkt)"?`
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) doDelete(rule)
    } else {
      Alert.alert('Usuń regułę', msg, [
        { text: 'Anuluj', style: 'cancel' },
        { text: 'Usuń', style: 'destructive', onPress: () => doDelete(rule) },
      ])
    }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#534AB7" /></View>
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {rules.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="trophy-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>Brak reguł punktowania</Text>
            <Text style={styles.emptySub}>Dodaj poniżej typy służb i ich wartości</Text>
          </View>
        ) : (
          rules.map(rule => (
            <View key={rule.id} style={styles.row}>
              <View style={styles.pointsBadge}>
                <Text style={styles.pointsText}>{rule.points}</Text>
                <Text style={styles.pointsUnit}>pkt</Text>
              </View>
              <Text style={styles.ruleLabel} numberOfLines={1}>{rule.label}</Text>
              <TouchableOpacity onPress={() => handleDelete(rule)} hitSlop={8}>
                <Ionicons name="trash-outline" size={20} color="#e74c3c" />
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>

      <View style={[styles.addBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Text style={styles.addBarTitle}>Dodaj regułę</Text>
        <View style={styles.addRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="Nazwa służby"
            placeholderTextColor="#aaa"
            value={labelInput}
            onChangeText={setLabelInput}
          />
          <TextInput
            style={[styles.input, styles.inputPoints]}
            placeholder="pkt"
            placeholderTextColor="#aaa"
            value={pointsInput}
            onChangeText={v => setPointsInput(v.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            maxLength={3}
          />
          <TouchableOpacity
            style={[styles.addBtn, (!labelInput.trim() || !pointsInput || adding) && { opacity: 0.4 }]}
            onPress={handleAdd}
            disabled={!labelInput.trim() || !pointsInput || adding}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, gap: 8 },

  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#aaa' },
  emptySub: { fontSize: 13, color: '#bbb', textAlign: 'center' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    ...shadow.xs,
  },
  pointsBadge: {
    backgroundColor: '#534AB711', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 6,
    minWidth: 54, alignItems: 'center',
  },
  pointsText: { fontSize: 17, fontWeight: '800', color: '#534AB7' },
  pointsUnit: { fontSize: 10, color: '#534AB7', marginTop: -2 },
  ruleLabel: { flex: 1, fontSize: 15, color: '#1a1a1a' },

  addBar: {
    backgroundColor: '#fff', padding: 16, gap: 10,
    borderTopWidth: 1, borderTopColor: '#f0f0f0',
  },
  addBarTitle: { fontSize: 13, fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.5 },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    backgroundColor: '#f5f5f5', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 15, color: '#1a1a1a', borderWidth: 1, borderColor: '#e8e8e8',
  },
  inputPoints: { width: 62, textAlign: 'center' },
  addBtn: {
    width: 44, height: 44, borderRadius: 10,
    backgroundColor: '#534AB7', justifyContent: 'center', alignItems: 'center',
  },
})
