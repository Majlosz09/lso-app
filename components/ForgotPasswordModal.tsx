import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import { supabase } from '../lib/supabase'
import { AppText, Button, Sheet, TextField } from './ui'
import { FormError } from './auth/formParts'

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
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Nie pamiętasz hasła?"
      footer={sent
        ? <Button label="OK" onPress={onClose} />
        : (
          <>
            <Button label="Wyślij link" onPress={send} loading={sending} />
            <Button label="Anuluj" variant="secondary" onPress={onClose} />
          </>
        )}
    >
      {sent ? (
        <AppText muted>
          Jeśli konto <AppText variant="bodyStrong">{email.trim()}</AppText> istnieje, wysłaliśmy na nie link do
          ustawienia nowego hasła. Sprawdź skrzynkę (także folder Spam).
        </AppText>
      ) : (
        <>
          <AppText muted>Podaj adres e-mail konta — wyślemy link do ustawienia nowego hasła.</AppText>
          <TextField
            label="E-mail"
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            onSubmitEditing={send}
          />
          <FormError message={error} />
        </>
      )}
    </Sheet>
  )
}
