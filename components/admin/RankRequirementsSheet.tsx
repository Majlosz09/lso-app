import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { AppText, Button, Sheet, TextField } from '../ui'

export type RankRequirement = {
  rank_id: string
  min_services: number
  min_months: number
  min_rate: number
  note: string | null
}

/** Skrót wymagań do listy rang: „10 służb · 3 mies. · 80% · notatka”. */
export function requirementSummary(r: RankRequirement | undefined): string {
  if (!r) return 'bez wymagań'
  const parts = [
    r.min_services ? `${r.min_services} służb` : '',
    r.min_months ? `${r.min_months} mies.` : '',
    r.min_rate ? `${r.min_rate}% frekw.` : '',
    r.note ? 'notatka' : '',
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'bez wymagań'
}

const num = (v: string, max: number) => Math.max(0, Math.min(max, parseInt(v.replace(/\D/g, '') || '0', 10)))

/** Wymagania do osiągnięcia stopnia (ścieżka formacji). */
export function RankRequirementsSheet({ rank, current, onClose, onSaved }: {
  rank: { id: string; name: string } | null
  current?: RankRequirement
  onClose: () => void
  onSaved: () => void
}) {
  const { colors: c } = useTheme()
  const parishId = useAuthStore(s => s.profile?.parish_id)
  const [services, setServices] = useState('0')
  const [months, setMonths] = useState('0')
  const [rate, setRate] = useState('0')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!rank) return
    setServices(String(current?.min_services ?? 0))
    setMonths(String(current?.min_months ?? 0))
    setRate(String(current?.min_rate ?? 0))
    setNote(current?.note ?? '')
  }, [rank?.id])

  const save = async (clear = false) => {
    if (!rank || !parishId) return
    setSaving(true)
    const { error } = clear
      ? await supabase.from('rank_requirements').delete().eq('parish_id', parishId).eq('rank_id', rank.id)
      : await supabase.from('rank_requirements').upsert({
          parish_id: parishId, rank_id: rank.id,
          min_services: num(services, 1000), min_months: num(months, 120), min_rate: num(rate, 100),
          wiedza_categories: [], wiedza_keys: [],
          note: note.trim() || null, updated_at: new Date().toISOString(),
        })
    setSaving(false)
    if (error) { Toast.show({ type: 'error', text1: 'Nie zapisano', text2: error.message }); return }
    Toast.show({ type: 'success', text1: clear ? 'Wymagania usunięte' : `Wymagania: ${rank.name}` })
    onSaved()
    onClose()
  }

  return (
    <Sheet
      visible={!!rank}
      onClose={onClose}
      eyebrow="Ścieżka formacji"
      title={rank ? `Żeby zostać: ${rank.name}` : ''}
      footer={
        <>
          <Button label="Zapisz wymagania" icon="check" onPress={() => save(false)} loading={saving} />
          {current && <Button label="Bez wymagań" variant="secondary" onPress={() => save(true)} />}
        </>
      }
    >
      <AppText variant="small" muted>
        Ministrant widzi postęp w profilu. Gdy spełni wszystko, pojawi się u Ciebie na Pulpicie w „Gotowi do awansu” — nadajesz stopień jednym kliknięciem.
      </AppText>
      <View style={styles.row}>
        <TextField label="Służby w obecnym stopniu" keyboardType="number-pad" value={services} onChangeText={setServices} containerStyle={styles.flex} />
        <TextField label="Miesięcy stażu" keyboardType="number-pad" value={months} onChangeText={setMonths} containerStyle={styles.flex} />
      </View>
      <TextField label="Frekwencja z ostatnich 3 miesięcy (%)" keyboardType="number-pad" value={rate} onChangeText={setRate} />
      <TextField label="Notatka (np. kurs lektorski, rozmowa z księdzem)" value={note} onChangeText={setNote} maxLength={200} />
      <AppText variant="small" muted>0 = bez tego wymagania.</AppText>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
})
