import { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { ServiceType, SERVICE_TYPE_LABELS } from '../../types/database'
import { useTheme } from '../../lib/ThemeContext'
import { sans } from '../../lib/theme'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { AppText, Button, Card, Icon } from '../../components/ui'

const SERVICE_TYPES: ServiceType[] = ['msza_assigned', 'msza_extra', 'nabozenstwo', 'zbiorka']
const SERVICE_ICONS: Record<ServiceType, string> = {
  msza_assigned: 'church', msza_extra: 'plus-circle', nabozenstwo: 'candle', zbiorka: 'account-group',
}
const DEFAULT_PENALTY = 2

function PointsInput({ value, onChange, negative }: { value: string; onChange: (v: string) => void; negative?: boolean }) {
  const { colors: c } = useTheme()
  const tone = negative ? c.danger : c.primary
  return (
    <View style={styles.inputGroup}>
      {negative && <AppText style={[styles.sign, { color: tone }]}>−</AppText>}
      <TextInput
        style={[styles.input, { backgroundColor: negative ? c.dangerSurface : c.primarySurface, color: tone }]}
        value={value}
        onChangeText={v => onChange(v.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
        maxLength={3}
        selectTextOnFocus
      />
      <AppText variant="small" muted>pkt</AppText>
    </View>
  )
}

export default function PointRulesScreen() {
  const { profile, parish, fetchProfile } = useAuthStore()
  const { colors: c } = useTheme()
  const isDesktop = useIsDesktop()
  const [values, setValues] = useState<Record<ServiceType, string>>({
    msza_assigned: '5', msza_extra: '3', nabozenstwo: '3', zbiorka: '5',
  })
  const [penalty, setPenalty] = useState(String(parish?.rejected_excuse_penalty ?? DEFAULT_PENALTY))
  // przed migracją 20261001000000 kolumny kary nie ma — pole ukryte
  const penaltySupported = parish ? parish.rejected_excuse_penalty !== undefined : false
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!profile?.parish_id) return
    supabase
      .from('point_rules')
      .select('service_type, points')
      .eq('parish_id', profile.parish_id)
      .then(({ data, error }) => {
        if (error) Toast.show({ type: 'error', text1: 'Nie udało się wczytać reguł' })
        if (data) {
          setValues(prev => {
            const next = { ...prev }
            for (const row of data as { service_type: string; points: number }[]) {
              if (row.service_type in next) next[row.service_type as ServiceType] = String(row.points)
            }
            return next
          })
        }
        setLoading(false)
      })
  }, [profile?.parish_id])

  useEffect(() => {
    if (parish?.rejected_excuse_penalty != null) setPenalty(String(parish.rejected_excuse_penalty))
  }, [parish?.rejected_excuse_penalty])

  const handleSave = async () => {
    for (const type of SERVICE_TYPES) {
      if (values[type] === '' || isNaN(parseInt(values[type]))) {
        Toast.show({ type: 'error', text1: `Wpisz liczbę punktów: ${SERVICE_TYPE_LABELS[type]}` })
        return
      }
    }
    const pen = parseInt(penalty)
    if (penaltySupported && (isNaN(pen) || pen > 100)) {
      Toast.show({ type: 'error', text1: 'Kara: wpisz liczbę od 0 do 100' })
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase
        .from('point_rules')
        .upsert(SERVICE_TYPES.map(type => ({
          parish_id: profile!.parish_id,
          service_type: type,
          points: parseInt(values[type]),
        })), { onConflict: 'parish_id,service_type' })
      if (error) { Toast.show({ type: 'error', text1: 'Błąd', text2: error.message }); return }
      if (penaltySupported && pen !== parish?.rejected_excuse_penalty) {
        const { error: pe } = await supabase.from('parishes').update({ rejected_excuse_penalty: pen }).eq('id', parish!.id)
        if (pe) { Toast.show({ type: 'error', text1: 'Błąd', text2: pe.message }); return }
        await fetchProfile()
      }
      Toast.show({ type: 'success', text1: 'Reguły punktów zapisane' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <View style={[styles.center, { backgroundColor: c.bg }]}><ActivityIndicator size="large" color={c.primary} /></View>
  }

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={[styles.body, isDesktop && styles.desktop]}>
      <Card large style={styles.card}>
        <AppText variant="eyebrow" color={c.goldInk}>Punkty za służbę</AppText>
        <AppText variant="small" muted>
          Przyznawane automatycznie po potwierdzeniu obecności albo po przyjęciu zgłoszenia obecności.
          „Bez zapisu” = ministrant przyszedł, choć nie był zapisany. Służby w trybie „Bez punktów” nie są punktowane (Rozkład Mszy).
        </AppText>
        {SERVICE_TYPES.map((type, i) => (
          <View key={type} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]}>
            <View style={[styles.iconTile, { backgroundColor: c.goldSurface }]}>
              <Icon name={SERVICE_ICONS[type]} size={20} color={c.goldInk} />
            </View>
            <AppText variant="bodyStrong" style={styles.flex}>{SERVICE_TYPE_LABELS[type]}</AppText>
            <PointsInput value={values[type]} onChange={v => setValues(prev => ({ ...prev, [type]: v }))} />
          </View>
        ))}
      </Card>

      {penaltySupported && (
        <Card large style={styles.card}>
          <AppText variant="eyebrow" color={c.goldInk}>Kary</AppText>
          <View style={styles.row}>
            <View style={[styles.iconTile, { backgroundColor: c.dangerSurface }]}>
              <Icon name="file-cancel" size={20} color={c.danger} />
            </View>
            <View style={styles.flex}>
              <AppText variant="bodyStrong">Odrzucone usprawiedliwienie</AppText>
              <AppText variant="small" muted>Odejmowane, gdy opiekun odrzuci zgłoszenie nieobecności. Wpisz 0, żeby nie karać.</AppText>
            </View>
            <PointsInput value={penalty} onChange={setPenalty} negative />
          </View>
        </Card>
      )}

      <Button label="Zapisz reguły" onPress={handleSave} loading={saving} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  body: { padding: 16, gap: 14, paddingBottom: 32 },
  desktop: { padding: 28, paddingHorizontal: 32, maxWidth: 720, width: '100%' },
  card: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  iconTile: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  inputGroup: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  sign: { ...sans(800), fontSize: 18 },
  input: { ...sans(800), borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, fontSize: 18, width: 60, textAlign: 'center' },
})
