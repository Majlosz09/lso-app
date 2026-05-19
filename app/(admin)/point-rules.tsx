import { useEffect, useState, useMemo } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { shadow } from '../../lib/shadows'
import { useAuthStore } from '../../stores/authStore'
import { ServiceType, SERVICE_TYPE_LABELS } from '../../types/database'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'

const SERVICE_TYPES: ServiceType[] = ['msza_assigned', 'msza_extra', 'nabozenstwo', 'zbiorka']

export default function PointRulesScreen() {
  const { profile } = useAuthStore()
  const insets = useSafeAreaInsets()
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
  const [values, setValues] = useState<Record<ServiceType, string>>({
    msza_assigned: '5', msza_extra: '3', nabozenstwo: '3', zbiorka: '5',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!profile?.parish_id) return
    supabase
      .from('point_rules')
      .select('service_type, points')
      .eq('parish_id', profile.parish_id)
      .then(({ data, error }) => {
        if (error) Alert.alert('Błąd', 'Nie udało się wczytać ustawień.')
        if (data) {
          const next = { ...values }
          for (const row of data as any[]) {
            if (row.service_type in next) next[row.service_type as ServiceType] = String(row.points)
          }
          setValues(next)
        }
        setLoading(false)
      })
  }, [profile?.parish_id])

  const handleSave = async () => {
    for (const type of SERVICE_TYPES) {
      const n = parseInt(values[type])
      if (isNaN(n) || n < 0) {
        Alert.alert('Błąd', `Nieprawidłowa wartość dla "${SERVICE_TYPE_LABELS[type]}".`)
        return
      }
    }
    setSaving(true)
    const upserts = SERVICE_TYPES.map(type => ({
      parish_id: profile!.parish_id,
      service_type: type,
      points: parseInt(values[type]),
    }))
    const { error } = await supabase
      .from('point_rules')
      .upsert(upserts, { onConflict: 'parish_id,service_type' })
    setSaving(false)
    if (error) Alert.alert('Błąd', error.message)
    else Alert.alert('Zapisano', 'Ustawienia punktów zostały zaktualizowane.')
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={c.primary} /></View>
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Text style={styles.sectionTitle}>Punkty za każdy rodzaj służby</Text>
        {SERVICE_TYPES.map(type => (
          <View key={type} style={styles.row}>
            <Text style={styles.label}>{SERVICE_TYPE_LABELS[type]}</Text>
            <View style={styles.inputGroup}>
              <TextInput
                style={styles.input}
                value={values[type]}
                onChangeText={v => setValues(prev => ({ ...prev, [type]: v.replace(/[^0-9]/g, '') }))}
                keyboardType="number-pad"
                maxLength={3}
              />
              <Text style={styles.unit}>pkt</Text>
            </View>
          </View>
        ))}
        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.saveBtnText}>Zapisz zmiany</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    content: { padding: 16, gap: 10 },
    sectionTitle: { fontSize: 12, fontWeight: '700', color: c.subtext, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
    row: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: c.surface, borderRadius: 12, padding: 14,
      ...shadow.xs,
    },
    label: { flex: 1, fontSize: 14, fontWeight: '600', color: c.text },
    inputGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    input: {
      backgroundColor: c.primarySurface, borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 7,
      fontSize: 18, fontWeight: '800', color: c.primary,
      minWidth: 48, textAlign: 'center',
    },
    unit: { fontSize: 12, color: c.subtext, fontWeight: '600' },
    saveBtn: {
      backgroundColor: c.primary, borderRadius: 12,
      padding: 14, alignItems: 'center', marginTop: 8,
    },
    saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  })
}
