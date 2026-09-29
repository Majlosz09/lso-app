import { useEffect, useState } from 'react'
import { ActivityIndicator, Platform } from 'react-native'
import Toast from 'react-native-toast-message'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../lib/ThemeContext'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { FormError, PasswordField, WebFormWrapper } from '../../components/auth/formParts'
import { AppText, Button } from '../../components/ui'

type Status = 'checking' | 'ready' | 'invalid' | 'done'

// Strona z linku „Zmiana hasła” (mail z Supabase). Link zawiera w adresie (#...) jednorazowy token
// sesji odzyskiwania — ustawiamy z niego sesję, zmieniamy hasło i wylogowujemy.
export default function ResetPasswordScreen() {
  const router = useRouter()
  const { colors: c } = useTheme()
  const [status, setStatus] = useState<Status>('checking')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') { setStatus('invalid'); return }
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const access_token = params.get('access_token')
    const refresh_token = params.get('refresh_token')
    if (params.get('error') || !access_token || !refresh_token || params.get('type') !== 'recovery') {
      setStatus('invalid')
      return
    }
    supabase.auth.setSession({ access_token, refresh_token }).then(({ error: err }) => {
      // usuń token z paska adresu
      window.history.replaceState(null, '', window.location.pathname)
      setStatus(err ? 'invalid' : 'ready')
    })
  }, [])

  const save = async () => {
    if (password.length < 8) { setError('Hasło musi mieć minimum 8 znaków.'); return }
    if (password !== repeat) { setError('Hasła nie są takie same.'); return }
    setError(null)
    setSaving(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (err) { setError(err.message); return }
    await supabase.auth.signOut({ scope: 'local' })
    setStatus('done')
    Toast.show({ type: 'success', text1: 'Hasło zmienione', text2: 'Zaloguj się nowym hasłem.' })
  }

  const toLogin = () => router.replace('/(auth)/login')

  if (status === 'checking') {
    return (
      <AuthLayout title="Nowe hasło" subtitle="Sprawdzamy link…">
        <ActivityIndicator color={c.primary} />
      </AuthLayout>
    )
  }

  if (status === 'invalid') {
    return (
      <AuthLayout title="Link wygasł" subtitle="Link do zmiany hasła działa tylko raz i przez ograniczony czas.">
        <AppText muted>Poproś o nowy na ekranie logowania („Nie pamiętasz hasła?”).</AppText>
        <Button label="Przejdź do logowania" onPress={toLogin} />
      </AuthLayout>
    )
  }

  if (status === 'done') {
    return (
      <AuthLayout title="Hasło zmienione" subtitle="Możesz zalogować się nowym hasłem — na tej stronie lub w aplikacji na telefonie.">
        <Button label="Zaloguj się" onPress={toLogin} />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Nowe hasło" subtitle="Ustaw hasło do swojego konta LSO.">
      <WebFormWrapper onSubmit={save}>
        <PasswordField
          label="Nowe hasło"
          placeholder="Min. 8 znaków"
          value={password}
          onChangeText={setPassword}
          autoComplete="new-password"
        />
        <PasswordField
          label="Powtórz hasło"
          placeholder="Powtórz hasło"
          value={repeat}
          onChangeText={setRepeat}
          autoComplete="new-password"
          onSubmitEditing={save}
        />
        <FormError message={error} />
        <Button label="Zapisz hasło" onPress={save} loading={saving} />
      </WebFormWrapper>
    </AuthLayout>
  )
}
