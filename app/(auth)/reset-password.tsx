import { useEffect, useMemo, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native'
import Toast from 'react-native-toast-message'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'

type Status = 'checking' | 'ready' | 'invalid' | 'done'

// Strona z linku „Zmiana hasła” (mail z Supabase). Link zawiera w adresie (#...) jednorazowy token
// sesji odzyskiwania — ustawiamy z niego sesję, zmieniamy hasło i wylogowujemy.
export default function ResetPasswordScreen() {
  const router = useRouter()
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
  const [status, setStatus] = useState<Status>('checking')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [show, setShow] = useState(false)
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

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name={status === 'done' ? 'checkmark-circle' : status === 'invalid' ? 'alert-circle' : 'key'} size={36} color={status === 'invalid' ? c.danger : c.primary} />
        </View>

        {status === 'checking' && <ActivityIndicator color={c.primary} />}

        {status === 'invalid' && (
          <>
            <Text style={styles.title}>Link wygasł lub jest nieprawidłowy</Text>
            <Text style={styles.text}>Link do zmiany hasła działa tylko raz i przez ograniczony czas. Poproś o nowy na ekranie logowania („Nie pamiętasz hasła?”).</Text>
            <TouchableOpacity style={styles.primary} onPress={() => router.replace('/(auth)/login')}>
              <Text style={styles.primaryText}>Przejdź do logowania</Text>
            </TouchableOpacity>
          </>
        )}

        {status === 'ready' && (
          <>
            <Text style={styles.title}>Ustaw nowe hasło</Text>
            <View style={styles.passwordRow}>
              <TextInput style={styles.passwordInput} placeholder="Nowe hasło (min. 8 znaków)" placeholderTextColor={c.textTertiary}
                secureTextEntry={!show} value={password} onChangeText={setPassword} autoComplete="new-password" />
              <TouchableOpacity onPress={() => setShow(v => !v)} hitSlop={8}>
                <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={c.textTertiary} />
              </TouchableOpacity>
            </View>
            <TextInput style={styles.input} placeholder="Powtórz hasło" placeholderTextColor={c.textTertiary}
              secureTextEntry={!show} value={repeat} onChangeText={setRepeat} autoComplete="new-password" />
            {error && <Text style={styles.error}>{error}</Text>}
            <TouchableOpacity style={styles.primary} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Zapisz hasło</Text>}
            </TouchableOpacity>
          </>
        )}

        {status === 'done' && (
          <>
            <Text style={styles.title}>Hasło zostało zmienione</Text>
            <Text style={styles.text}>Możesz zalogować się nowym hasłem — na tej stronie lub w aplikacji na telefonie.</Text>
            <TouchableOpacity style={styles.primary} onPress={() => router.replace('/(auth)/login')}>
              <Text style={styles.primaryText}>Zaloguj się</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg, justifyContent: 'center', padding: 24 },
    card: { backgroundColor: c.surface, borderRadius: 18, padding: 24, gap: 14, width: '100%', maxWidth: 420, alignSelf: 'center' },
    iconWrap: {
      width: 64, height: 64, borderRadius: 20, alignSelf: 'center',
      backgroundColor: c.primarySurface, justifyContent: 'center', alignItems: 'center',
    },
    title: { fontSize: 21, fontWeight: '800', color: c.text, textAlign: 'center' },
    text: { fontSize: 14, lineHeight: 21, color: c.subtext, textAlign: 'center' },
    input: {
      backgroundColor: c.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
      fontSize: 16, borderWidth: 1, borderColor: c.border, color: c.text,
    },
    passwordRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.bg, borderRadius: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: c.border,
    },
    passwordInput: { flex: 1, paddingVertical: 13, fontSize: 16, color: c.text },
    error: { fontSize: 13, color: c.danger, textAlign: 'center' },
    primary: { padding: 15, borderRadius: 12, backgroundColor: c.primary, alignItems: 'center' },
    primaryText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  })
}
