import { useEffect, useState } from 'react'
import {
  View, Text, TextInput, StyleSheet, ScrollView,
  TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { Profile, PointRule } from '../../types/database'

export default function AwardPoints() {
  const { profile: adminProfile } = useAuthStore()
  const insets = useSafeAreaInsets()
  const { preselect_id } = useLocalSearchParams<{ preselect_id?: string }>()
  const [members, setMembers] = useState<Profile[]>([])
  const [pointRules, setPointRules] = useState<PointRule[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Profile | null>(null)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loadingMembers, setLoadingMembers] = useState(true)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .eq('is_active', true)
      .neq('role', 'admin')
      .order('full_name')
      .then(({ data }) => {
        if (data) {
          setMembers(data)
          if (preselect_id) {
            const pre = data.find((m: Profile) => m.id === preselect_id)
            if (pre) setSelected(pre)
          }
        }
        setLoadingMembers(false)
      })
    supabase
      .from('point_rules')
      .select('*')
      .eq('parish_id', adminProfile?.parish_id)
      .order('points', { ascending: false })
      .then(({ data }) => { if (data) setPointRules(data as PointRule[]) })
  }, [])

  const filtered = members.filter(m =>
    m.full_name.toLowerCase().includes(search.toLowerCase())
  )

  const handleSubmit = async () => {
    if (!selected) { Alert.alert('Błąd', 'Wybierz ministranta.'); return }
    const amt = parseInt(amount)
    if (isNaN(amt) || amt === 0) { Alert.alert('Błąd', 'Wpisz prawidłową liczbę punktów (np. 1 lub -1).'); return }
    if (!reason.trim()) { Alert.alert('Błąd', 'Wpisz powód przyznania punktów.'); return }

    setSubmitting(true)
    const { error } = await supabase.from('points').insert({
      profile_id: selected.id,
      amount: amt,
      reason: reason.trim(),
      awarded_by: adminProfile?.id,
      parish_id: adminProfile?.parish_id,
    })
    setSubmitting(false)

    if (error) {
      Alert.alert('Błąd', 'Nie udało się przyznać punktów: ' + error.message)
    } else {
      const sign = amt > 0 ? '+' : ''
      Alert.alert('Sukces', `Przyznano ${sign}${amt} pkt dla ${selected.full_name}!`, [
        { text: 'OK', onPress: () => { setSelected(null); setAmount(''); setReason('') } },
      ])
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) }]} keyboardShouldPersistTaps="handled">

        {selected ? (
          <View style={styles.selectedCard}>
            <View style={styles.selectedInfo}>
              <Ionicons name="person-circle-outline" size={36} color="#534AB7" />
              <View>
                <Text style={styles.selectedName}>{selected.full_name}</Text>
                <Text style={styles.selectedRole}>{selected.role}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => setSelected(null)}>
              <Ionicons name="close-circle" size={24} color="#ccc" />
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <Text style={styles.label}>Wybierz ministranta *</Text>
            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={18} color="#aaa" />
              <TextInput
                style={styles.searchInput}
                placeholder="Szukaj po imieniu..."
                value={search}
                onChangeText={setSearch}
              />
            </View>
            {loadingMembers ? (
              <ActivityIndicator color="#534AB7" style={{ marginTop: 20 }} />
            ) : (
              <View style={styles.memberList}>
                {filtered.map(member => (
                  <TouchableOpacity
                    key={member.id}
                    style={styles.memberRow}
                    onPress={() => setSelected(member)}
                  >
                    <Ionicons name="person-outline" size={18} color="#666" />
                    <Text style={styles.memberName}>{member.full_name}</Text>
                    <Ionicons name="chevron-forward" size={16} color="#ddd" />
                  </TouchableOpacity>
                ))}
                {filtered.length === 0 && (
                  <View style={{ padding: 20, alignItems: 'center' }}>
                    <Text style={{ color: '#aaa' }}>Brak wyników</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {selected && (
          <>
            {pointRules.length > 0 && (
              <>
                <Text style={styles.label}>Typ służby</Text>
                <View style={styles.rulesRow}>
                  {pointRules.map(r => (
                    <TouchableOpacity
                      key={r.id}
                      style={[styles.ruleChip, amount === String(r.points) && reason === r.label && styles.ruleChipActive]}
                      onPress={() => { setAmount(String(r.points)); setReason(r.label) }}
                    >
                      <Text style={[styles.ruleChipLabel, amount === String(r.points) && reason === r.label && styles.ruleChipLabelActive]}>
                        {r.label}
                      </Text>
                      <Text style={[styles.ruleChipPts, amount === String(r.points) && reason === r.label && styles.ruleChipLabelActive]}>
                        {r.points} pkt
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
            <Text style={styles.label}>Liczba punktów *</Text>
            <TextInput
              style={styles.input}
              placeholder="np. 1 lub -1"
              value={amount}
              onChangeText={setAmount}
              keyboardType="numbers-and-punctuation"
            />

            <Text style={styles.label}>Powód *</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="np. Służba podczas Mszy Świętej"
              value={reason}
              onChangeText={setReason}
              multiline
              numberOfLines={3}
            />

            <TouchableOpacity
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.submitButtonText}>Przyznaj punkty</Text>
              }
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { padding: 16, gap: 8 },

  selectedCard: {
    backgroundColor: '#534AB711', borderRadius: 12, padding: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: '#534AB733', marginBottom: 8,
  },
  selectedInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  selectedName: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  selectedRole: { fontSize: 13, color: '#888', marginTop: 1 },

  label: { fontSize: 13, fontWeight: '600', color: '#555', marginTop: 8 },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', borderRadius: 10, padding: 11,
    borderWidth: 1, borderColor: '#e8e8e8', marginTop: 4,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#1a1a1a' },

  memberList: {
    backgroundColor: '#fff', borderRadius: 10, marginTop: 8,
    borderWidth: 1, borderColor: '#e8e8e8', overflow: 'hidden',
  },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  memberName: { flex: 1, fontSize: 15, color: '#1a1a1a' },

  input: {
    backgroundColor: '#fff', borderRadius: 10, padding: 13,
    fontSize: 15, color: '#1a1a1a', borderWidth: 1, borderColor: '#e8e8e8',
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },

  submitButton: {
    backgroundColor: '#534AB7', borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 16,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  rulesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  ruleChip: {
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e0e0',
    alignItems: 'center',
  },
  ruleChipActive: { backgroundColor: '#534AB7', borderColor: '#534AB7' },
  ruleChipLabel: { fontSize: 13, fontWeight: '600', color: '#555' },
  ruleChipPts: { fontSize: 11, color: '#aaa', marginTop: 1 },
  ruleChipLabelActive: { color: '#fff' },
})
