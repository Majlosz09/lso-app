import { useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView, Share
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { shadow } from '../../lib/shadows'

export default function ParishSettingsScreen() {
  const { parish, fetchProfile } = useAuthStore()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [name, setName] = useState(parish?.name ?? '')
  const [city, setCity] = useState(parish?.city ?? '')
  const [saving, setSaving] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [inviteCode, setInviteCode] = useState(parish?.invite_code ?? '')

  useEffect(() => {
    if (parish) {
      setName(parish.name)
      setCity(parish.city ?? '')
      setInviteCode(parish.invite_code)
    }
  }, [parish])

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Błąd', 'Nazwa parafii nie może być pusta.'); return }
    setSaving(true)
    const { error } = await supabase
      .from('parishes')
      .update({ name: name.trim(), city: city.trim() || null })
      .eq('id', parish?.id)

    setSaving(false)
    if (error) {
      Alert.alert('Błąd', error.message)
    } else {
      await fetchProfile()
      Alert.alert('Zapisano', 'Dane parafii zostały zaktualizowane.')
    }
  }

  const handleRegenerate = () => {
    Alert.alert(
      'Regeneruj kod',
      'Stary kod zaproszenia przestanie działać. Czy na pewno chcesz wygenerować nowy kod?',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Regeneruj', style: 'destructive',
          onPress: async () => {
            setRegenerating(true)
            const newCode = Math.random().toString(36).substring(2, 8).toUpperCase()
            const { error } = await supabase
              .from('parishes')
              .update({ invite_code: newCode })
              .eq('id', parish?.id)

            setRegenerating(false)
            if (error) {
              Alert.alert('Błąd', error.message)
            } else {
              setInviteCode(newCode)
              await fetchProfile()
            }
          },
        },
      ]
    )
  }

  const handleCopy = () => {
    Share.share({ message: `Kod do dołączenia do parafii: ${inviteCode}` })
  }

  if (!parish) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#534AB7" />
      </View>
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Dane parafii</Text>

        <Text style={styles.label}>Nazwa parafii *</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Nazwa parafii"
          placeholderTextColor="#aaa"
        />

        <Text style={styles.label}>Miejscowość</Text>
        <TextInput
          style={styles.input}
          value={city}
          onChangeText={setCity}
          placeholder="np. Warszawa"
          placeholderTextColor="#aaa"
        />

        <TouchableOpacity
          style={[styles.saveButton, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.saveButtonText}>Zapisz zmiany</Text>
          }
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Kod zaproszenia</Text>
        <Text style={styles.sectionSub}>
          Podaj ten kod ministrantom i rodzicom, aby mogli dołączyć do Twojej parafii.
        </Text>

        <View style={styles.codeRow}>
          <Text style={styles.codeText}>{inviteCode}</Text>
          <TouchableOpacity style={styles.copyButton} onPress={handleCopy}>
            <Ionicons name="copy-outline" size={20} color="#534AB7" />
            <Text style={styles.copyButtonText}>Kopiuj</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.regenButton, regenerating && { opacity: 0.6 }]}
          onPress={handleRegenerate}
          disabled={regenerating}
        >
          {regenerating
            ? <ActivityIndicator color="#e74c3c" size="small" />
            : (
              <>
                <Ionicons name="refresh-outline" size={16} color="#e74c3c" />
                <Text style={styles.regenButtonText}>Regeneruj kod</Text>
              </>
            )
          }
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Konfiguracja</Text>
        <Text style={styles.sectionSub}>Zarządzaj rozkładem Mszy i regułami punktowania.</Text>

        <TouchableOpacity style={styles.navRow} onPress={() => router.push('/(admin)/mass-schedule')}>
          <View style={[styles.navIcon, { backgroundColor: '#8e44ad18' }]}>
            <Ionicons name="time-outline" size={20} color="#8e44ad" />
          </View>
          <View style={styles.navInfo}>
            <Text style={styles.navTitle}>Rozkład Mszy</Text>
            <Text style={styles.navSub}>Tygodniowy plan godzin</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#ccc" />
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity style={styles.navRow} onPress={() => router.push('/(admin)/point-rules')}>
          <View style={[styles.navIcon, { backgroundColor: '#f0a50018' }]}>
            <Ionicons name="trophy-outline" size={20} color="#f0a500" />
          </View>
          <View style={styles.navInfo}>
            <Text style={styles.navTitle}>Reguły punktowania</Text>
            <Text style={styles.navSub}>Typy służb i ich wartości</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#ccc" />
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { padding: 16, gap: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  section: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    ...shadow.md,
    gap: 6,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
  sectionSub: { fontSize: 13, color: '#888', lineHeight: 18, marginBottom: 8 },

  label: { fontSize: 13, fontWeight: '600', color: '#555', marginTop: 6 },
  input: {
    backgroundColor: '#f5f5f5', borderRadius: 10, padding: 13,
    fontSize: 15, color: '#1a1a1a', borderWidth: 1, borderColor: '#e8e8e8',
  },
  saveButton: {
    backgroundColor: '#534AB7', borderRadius: 10, padding: 14,
    alignItems: 'center', marginTop: 8,
  },
  saveButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  codeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#534AB711', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#534AB733',
  },
  codeText: {
    fontSize: 28, fontWeight: '800', color: '#534AB7',
    letterSpacing: 4, fontVariant: ['tabular-nums'],
  },
  copyButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: '#534AB733',
  },
  copyButtonText: { fontSize: 14, color: '#534AB7', fontWeight: '600' },

  regenButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12,
    borderRadius: 10, borderWidth: 1, borderColor: '#e74c3c33',
  },
  regenButtonText: { fontSize: 14, color: '#e74c3c', fontWeight: '500' },

  navRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10,
  },
  navIcon: {
    width: 40, height: 40, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  navInfo: { flex: 1 },
  navTitle: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  navSub: { fontSize: 12, color: '#aaa', marginTop: 1 },
  divider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 2 },
})
