// app/(auth)/login.tsx
import { useRef, useState } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../lib/ThemeContext'
import { sans } from '../../lib/theme'
import { ForgotPasswordModal } from '../../components/ForgotPasswordModal'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { FormError, PasswordField, WebFormWrapper } from '../../components/auth/formParts'
import { AppText, Button, TextField } from '../../components/ui'

function translateAuthError(msg: string): string {
  if (msg.includes('Invalid login credentials')) return 'Nieprawidłowy email lub hasło'
  if (msg.includes('Email not confirmed')) return 'Email nie został potwierdzony'
  if (msg.includes('Too many requests')) return 'Zbyt wiele prób. Spróbuj za chwilę.'
  if (msg.includes('User not found')) return 'Nie znaleziono użytkownika'
  return msg
}

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [forgotOpen, setForgotOpen] = useState(false)
  const passwordRef = useRef<TextInput>(null)
  const router = useRouter()
  const { colors: c } = useTheme()

  const handleLogin = async () => {
    if (!email || !password) {
      setLoginError('Wypełnij email i hasło')
      return
    }

    setLoginError(null)
    setLoading(true)
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)

    if (authError) {
      setLoginError(translateAuthError(authError.message))
    }
    // Nie wywołujemy router.replace — _layout.tsx zadecyduje na podstawie profile.parish_id
  }

  return (
    <AuthLayout
      title="Króluj nam Chryste!"
      subtitle="Zaloguj się do swojej parafii."
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/(auth)/welcome'))}
    >
      <WebFormWrapper onSubmit={handleLogin}>
        <TextField
          label="E-mail"
          placeholder="Email"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          returnKeyType="next"
          value={email}
          onChangeText={v => { setEmail(v); setLoginError(null) }}
          onSubmitEditing={() => passwordRef.current?.focus()}
          blurOnSubmit={false}
        />
        <PasswordField
          ref={passwordRef}
          label="Hasło"
          placeholder="Hasło"
          autoComplete="current-password"
          returnKeyType="done"
          value={password}
          onChangeText={v => { setPassword(v); setLoginError(null) }}
          onSubmitEditing={handleLogin}
        />
        <Pressable onPress={() => setForgotOpen(true)} style={styles.forgot} accessibilityRole="button">
          <AppText style={[styles.forgotText, { color: c.primary }]}>Nie pamiętasz hasła?</AppText>
        </Pressable>
        <FormError message={loginError} />
        <Button label="Zaloguj się" onPress={handleLogin} loading={loading} />
      </WebFormWrapper>

      <View style={styles.registerRow}>
        <AppText muted style={styles.registerText}>Nie masz konta? </AppText>
        <Pressable onPress={() => router.push('/(auth)/register')} accessibilityRole="link">
          <AppText style={[styles.registerLink, { color: c.primary }]}>Zarejestruj się</AppText>
        </Pressable>
      </View>

      <ForgotPasswordModal visible={forgotOpen} initialEmail={email} onClose={() => setForgotOpen(false)} />
    </AuthLayout>
  )
}

const styles = StyleSheet.create({
  forgot: { alignSelf: 'flex-end', paddingVertical: 2, cursor: 'pointer' } as any,
  forgotText: { ...sans(700), fontSize: 13 },
  registerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  registerText: { fontSize: 13, fontFamily: 'Manrope_500Medium' },
  registerLink: { ...sans(800), fontSize: 13 },
})
