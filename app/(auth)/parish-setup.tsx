import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { shadow } from '../../lib/shadows'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'

type Tab = 'join' | 'create'

export default function ParishSetupScreen() {
  const router = useRouter()
  const { profile, fetchProfile } = useAuthStore()
  const [tab, setTab] = useState<Tab>('join')

  const [inviteCode, setInviteCode] = useState('')
  const [parishName, setParishName] = useState('')
  const [parishCity, setParishCity] = useState('')
  const [loading, setLoading] = useState(false)

  const handleJoin = async () => {
    if (!inviteCode.trim() || inviteCode.trim().length !== 6) {
      Alert.alert('Błąd', 'Wpisz 6-znakowy kod parafii.')
      return
    }
    setLoading(true)
    const { data: foundId, error } = await supabase
      .rpc('get_parish_by_invite_code', { code: inviteCode.trim().toUpperCase() })

    if (error || !foundId) {
      Alert.alert('Błąd', 'Nieznany kod parafii. Sprawdź kod i spróbuj ponownie.')
      setLoading(false)
      return
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ parish_id: foundId })
      .eq('id', profile?.id)

    setLoading(false)
    if (updateError) {
      Alert.alert('Błąd', updateError.message)
      return
    }
    await fetchProfile()
    router.replace('/(tabs)')
  }

  const handleCreate = async () => {
    if (!parishName.trim()) {
      Alert.alert('Błąd', 'Wpisz nazwę parafii.')
      return
    }
    setLoading(true)
    const { data: parishData, error: parishError } = await supabase
      .from('parishes')
      .insert({
        name: parishName.trim(),
        city: parishCity.trim() || null,
        created_by: profile?.id,
      })
      .select('id')
      .single()

    if (parishError || !parishData) {
      Alert.alert('Błąd', 'Nie udało się utworzyć parafii: ' + (parishError?.message ?? 'Nieznany błąd'))
      setLoading(false)
      return
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ parish_id: parishData.id })
      .eq('id', profile?.id)

    setLoading(false)
    if (updateError) {
      Alert.alert('Błąd', updateError.message)
      return
    }
    await fetchProfile()
    router.replace('/(tabs)')
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView style={styles.container} contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <View style={styles.iconWrapper}>
          <Ionicons name="business-outline" size={48} color="#534AB7" />
        </View>
        <Text style={styles.title}>Dołącz do parafii</Text>
        <Text style={styles.subtitle}>Twoje konto nie jest jeszcze przypisane do żadnej parafii.</Text>

        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, tab === 'join' && styles.tabActive]}
            onPress={() => setTab('join')}
          >
            <Text style={[styles.tabText, tab === 'join' && styles.tabTextActive]}>Dołącz z kodem</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === 'create' && styles.tabActive]}
            onPress={() => setTab('create')}
          >
            <Text style={[styles.tabText, tab === 'create' && styles.tabTextActive]}>Utwórz parafię</Text>
          </TouchableOpacity>
        </View>

        {tab === 'join' ? (
          <>
            <Text style={styles.label}>Kod parafii</Text>
            <TextInput
              style={styles.input}
              placeholder="6-znakowy kod (np. AB12CD)"
              placeholderTextColor="#999"
              autoCapitalize="characters"
              value={inviteCode}
              onChangeText={t => setInviteCode(t.toUpperCase())}
              maxLength={6}
            />
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleJoin}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>Dołącz do parafii</Text>
              }
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.label}>Nazwa parafii *</Text>
            <TextInput
              style={styles.input}
              placeholder="np. Parafia pw. św. Jana"
              placeholderTextColor="#999"
              value={parishName}
              onChangeText={setParishName}
            />
            <Text style={styles.label}>Miejscowość (opcjonalnie)</Text>
            <TextInput
              style={styles.input}
              placeholder="np. Warszawa"
              placeholderTextColor="#999"
              value={parishCity}
              onChangeText={setParishCity}
            />
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleCreate}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>Utwórz parafię</Text>
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
  inner: { justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 48 },

  iconWrapper: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: '#534AB711', justifyContent: 'center', alignItems: 'center',
    alignSelf: 'center', marginBottom: 20,
  },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center', color: '#1a1a2e', marginBottom: 8 },
  subtitle: { fontSize: 14, textAlign: 'center', color: '#666', marginBottom: 28, lineHeight: 20 },

  tabRow: {
    flexDirection: 'row', backgroundColor: '#e8e8e8',
    borderRadius: 10, padding: 3, marginBottom: 20,
  },
  tab: {
    flex: 1, paddingVertical: 10, borderRadius: 8,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#fff',
    ...shadow.md,
  },
  tabText: { fontSize: 14, fontWeight: '500', color: '#888' },
  tabTextActive: { color: '#534AB7', fontWeight: '600' },

  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6, marginTop: 4 },
  input: {
    backgroundColor: '#fff', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#e0e0e0', color: '#1a1a1a',
  },
  button: {
    backgroundColor: '#534AB7', borderRadius: 12,
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
})
