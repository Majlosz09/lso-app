import { useMemo, useState } from 'react'
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import Toast from 'react-native-toast-message'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'
import { ChatMessageWithSender } from '../../types/chat'
import { ModalKeyboardAvoider } from '../ui/ModalKeyboardAvoider'

const REASONS = ['Wulgarne lub obraźliwe', 'Nękanie / zastraszanie', 'Niestosowne wobec dziecka', 'Spam', 'Inne']

interface Props {
  message: ChatMessageWithSender | null
  reporterId: string
  onClose: () => void
}

// Zgłoszenie wiadomości do administratora parafii (Regulamin §4). Admin dostaje powiadomienie.
export function ReportMessageModal({ message, reporterId, onClose }: Props) {
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
  const [reason, setReason] = useState<string | null>(null)
  const [details, setDetails] = useState('')
  const [sending, setSending] = useState(false)

  const close = () => { setReason(null); setDetails(''); onClose() }

  const send = async () => {
    if (!message || !reason) return
    setSending(true)
    const text = details.trim() ? `${reason}: ${details.trim()}` : reason
    const { error } = await supabase.from('chat_reports')
      .insert({ message_id: message.id, reporter_id: reporterId, reason: text.slice(0, 500) })
    setSending(false)
    if (error) {
      const dup = error.code === '23505'
      Toast.show({ type: dup ? 'info' : 'error', text1: dup ? 'Już zgłoszono tę wiadomość' : 'Nie udało się zgłosić', text2: dup ? undefined : error.message })
      if (dup) close()
      return
    }
    Toast.show({ type: 'success', text1: 'Dziękujemy za zgłoszenie', text2: 'Administrator parafii zajmie się tą wiadomością.' })
    close()
  }

  return (
    <Modal visible={!!message} transparent animationType="fade" onRequestClose={close}>
<ModalKeyboardAvoider>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Zgłoś wiadomość</Text>
          <Text style={styles.quote} numberOfLines={3}>„{message?.content}”</Text>
          {REASONS.map(r => (
            <TouchableOpacity key={r} style={[styles.reason, reason === r && styles.reasonActive]} onPress={() => setReason(r)}>
              <Text style={[styles.reasonText, reason === r && styles.reasonTextActive]}>{r}</Text>
            </TouchableOpacity>
          ))}
          <TextInput
            style={styles.input}
            placeholder="Szczegóły (opcjonalnie)"
            placeholderTextColor={c.textTertiary}
            value={details}
            onChangeText={setDetails}
            maxLength={300}
            multiline
          />
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancel} onPress={close}>
              <Text style={styles.cancelText}>Anuluj</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.send, !reason && { opacity: 0.4 }]} onPress={send} disabled={!reason || sending}>
              {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendText}>Zgłoś</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ModalKeyboardAvoider>
</Modal>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
    sheet: { backgroundColor: c.surface, borderRadius: 16, padding: 20, gap: 8, maxWidth: 420, width: '100%', alignSelf: 'center' },
    title: { fontSize: 18, color: c.text, fontFamily: 'Manrope_700Bold' },
    quote: { fontSize: 14, color: c.subtext, fontStyle: 'italic', marginBottom: 4, fontFamily: 'Manrope_500Medium' },
    reason: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: c.border },
    reasonActive: { borderColor: c.danger, backgroundColor: c.danger + '12' },
    reasonText: { fontSize: 14, color: c.text, fontFamily: 'Manrope_500Medium' },
    reasonTextActive: { color: c.danger, fontWeight: '600' },
    input: { borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 10, minHeight: 60, color: c.text, fontSize: 14, fontFamily: 'Manrope_500Medium' },
    actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
    cancel: { flex: 1, padding: 13, borderRadius: 10, backgroundColor: c.primarySurface, alignItems: 'center' },
    cancelText: { fontSize: 15, color: c.primary, fontFamily: 'Manrope_600SemiBold' },
    send: { flex: 1, padding: 13, borderRadius: 10, backgroundColor: c.danger, alignItems: 'center' },
    sendText: { fontSize: 15, color: '#fff', fontFamily: 'Manrope_700Bold' },
  })
}
