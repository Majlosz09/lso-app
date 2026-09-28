import { useEffect, useMemo, useState } from 'react'
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/ThemeContext'
import { Colors } from '../lib/theme'

// Link z maila prowadzi do strony ustawiania hasła w wersji webowej (działa też dla użytkowników telefonu).
function resetRedirectUrl() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.origin}/reset-password`
  return 'https://app.lsoapp.com/reset-password'
}

export function ForgotPasswordModal({ visible, initialEmail, onClose }: {
  visible: boolean
  initialEmail: string
  onClose: () => void
}) {
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
  const [email, setEmail] = useState(initialEmail)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (visible) { setEmail(initialEmail); setSent(false); setError(null) }
  }, [visible, initialEmail])

  const send = async () => {
    if (!email.includes('@')) { setError('Podaj poprawny adres e-mail.'); return }
    setSending(true)
    setError(null)
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: resetRedirectUrl() })
    setSending(false)
    // Nie zdradzamy, czy konto istnieje — zawsze ten sam komunikat (poza limitem prób)
    if (err && /rate|too many/i.test(err.message)) { setError('Zbyt wiele prób. Spróbuj ponownie za kilka minut.'); return }
    setSent(true)
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Nie pamiętasz hasła?</Text>
          {sent ? (
            <>
              <Text style={styles.text}>
                Jeśli konto <Text style={{ fontWeight: '700' }}>{email.trim()}</Text> istnieje, wysłaliśmy na nie link do
                ustawienia nowego hasła. Sprawdź skrzynkę (także folder Spam).
              </Text>
              <TouchableOpacity style={styles.primary} onPress={onClose}>
                <Text style={styles.primaryText}>OK</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.text}>Podaj adres e-mail konta — wyślemy link do ustawienia nowego hasła.</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                placeholderTextColor={c.textTertiary}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />
              {error && <Text style={styles.error}>{error}</Text>}
              <View style={styles.actions}>
                <TouchableOpacity style={styles.cancel} onPress={onClose}>
                  <Text style={styles.cancelText}>Anuluj</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.primary, { flex: 1 }]} onPress={send} disabled={sending}>
                  {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Wyślij link</Text>}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
    sheet: { backgroundColor: c.surface, borderRadius: 16, padding: 22, gap: 12, width: '100%', maxWidth: 420, alignSelf: 'center' },
    title: { fontSize: 19, fontWeight: '700', color: c.text },
    text: { fontSize: 14, lineHeight: 21, color: c.subtext },
    input: {
      backgroundColor: c.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 16, borderWidth: 1, borderColor: c.border, color: c.text,
    },
    error: { fontSize: 13, color: c.danger },
    actions: { flexDirection: 'row', gap: 10 },
    cancel: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: c.primarySurface, alignItems: 'center' },
    cancelText: { fontSize: 15, fontWeight: '600', color: c.primary },
    primary: { padding: 14, borderRadius: 12, backgroundColor: c.primary, alignItems: 'center' },
    primaryText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  })
}
