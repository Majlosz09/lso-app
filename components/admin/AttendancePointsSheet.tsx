import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { supabase } from '../../lib/supabase'
import { AppText, Button, Chip, Sheet, TextField } from '../ui'

export type AttendancePointsTarget = {
  scheduleId: string
  profileId: string
  name: string
  /** np. „Msza Święta · 12.10 18:00” */
  service: string
  amount: number
}

const QUICK = [0, 1, 2, 3, 5, 10]

/** Opiekun poprawia liczbę punktów za już zaznaczoną obecność (0 = obecność bez punktów). */
export function AttendancePointsSheet({ target, onClose, onSaved }: {
  target: AttendancePointsTarget | null
  onClose: () => void
  onSaved: (amount: number) => void
}) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (target) setValue(String(target.amount)) }, [target])

  const parsed = /^-?\d{1,3}$/.test(value.trim()) ? Number(value.trim()) : null
  const save = async () => {
    if (!target || parsed === null) return
    setSaving(true)
    const { error } = await supabase.rpc('set_attendance_points', {
      p_schedule_id: target.scheduleId, p_profile_id: target.profileId, p_amount: parsed,
    })
    setSaving(false)
    if (error) { Toast.show({ type: 'error', text1: 'Nie zapisano', text2: error.message }); return }
    Toast.show({ type: 'success', text1: `Punkty za obecność: ${parsed}`, text2: target.name })
    onSaved(parsed)
  }

  return (
    <Sheet
      visible={!!target}
      onClose={onClose}
      eyebrow={target ? `${target.name} · ${target.service}` : undefined}
      title="Punkty za obecność"
      footer={
        <>
          <Button label="Zapisz" onPress={save} loading={saving} disabled={parsed === null || parsed === target?.amount} />
          <Button label="Anuluj" variant="secondary" onPress={onClose} />
        </>
      }
    >
      <AppText muted>
        Obecność zostaje zaznaczona — zmieniasz tylko liczbę punktów za tę służbę. 0 = obecność bez punktów.
      </AppText>
      <TextField
        label="Liczba punktów"
        value={value}
        onChangeText={setValue}
        keyboardType="numbers-and-punctuation"
        hint={parsed === null ? 'Wpisz liczbę od -100 do 500' : undefined}
        hintTone="danger"
      />
      <View style={styles.chips}>
        {QUICK.map(n => <Chip key={n} label={String(n)} selected={parsed === n} onPress={() => setValue(String(n))} />)}
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
})
