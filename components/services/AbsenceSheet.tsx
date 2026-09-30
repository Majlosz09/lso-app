import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { useAuthStore } from '../../stores/authStore'
import { AppText, Button, Chip, Sheet, TextField } from '../ui'

export const ABSENCE_REASONS = ['Choroba', 'Szkoła', 'Wyjazd', 'Sprawy rodzinne', 'Inne'] as const

/** Treść powodu zapisywana w absence_reason: „Choroba” albo „Choroba — angina”. */
export function absenceReasonText(reason: string, details: string): string {
  const d = details.trim()
  if (reason === 'Inne') return d
  return d ? `${reason} — ${d}` : reason
}

/** Zgłoszenie nieobecności z powodem (Z3) — ministrant za siebie albo rodzic za dziecko (N14). */
export function AbsenceSheet({ visible, title = 'Nie mogę być', eyebrow, busy, onClose, onSubmit }: {
  visible: boolean
  title?: string
  eyebrow?: string
  busy?: boolean
  onClose: () => void
  onSubmit: (reasonText: string) => void
}) {
  const penalty = useAuthStore(s => s.parish?.rejected_excuse_penalty)
  const [reason, setReason] = useState<string>('Choroba')
  const [details, setDetails] = useState('')

  useEffect(() => {
    if (visible) { setReason('Choroba'); setDetails('') }
  }, [visible])

  const submit = () => {
    const text = absenceReasonText(reason, details)
    if (!text) { Toast.show({ type: 'error', text1: 'Opisz powód nieobecności' }); return }
    onSubmit(text)
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      eyebrow={eyebrow}
      footer={
        <>
          <Button label="Wyślij do opiekuna" variant="danger" onPress={submit} loading={busy} />
          <Button label="Anuluj" variant="secondary" onPress={onClose} />
        </>
      }
    >
      <AppText variant="label" muted>Powód</AppText>
      <View style={styles.chips}>
        {ABSENCE_REASONS.map(r => <Chip key={r} label={r} selected={reason === r} onPress={() => setReason(r)} />)}
      </View>
      <TextField
        label={reason === 'Inne' ? 'Opisz powód' : 'Szczegóły (opcjonalnie)'}
        placeholder="np. wyjazd na zawody"
        value={details}
        onChangeText={setDetails}
        multiline
      />
      <AppText variant="small" muted>
        {`Opiekun zobaczy zgłoszenie w usprawiedliwieniach i je przyjmie albo odrzuci.${penalty ? ` Odrzucone zgłoszenie to −${penalty} pkt.` : ''}`}
      </AppText>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
})
