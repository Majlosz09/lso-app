// app/(auth)/login.tsx
import { useRef, useState, useMemo } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Link } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'

function translateAuthError(msg: string): string {
  if (msg.includes('Invalid login credentials')) return 'Nieprawidłowy email lub hasło'
  if (msg.includes('Email not confirmed')) return 'Email nie został potwierdzony'
  if (msg.includes('Too many requests')) return 'Zbyt wiele prób. Spróbuj za chwilę.'
  if (msg.includes('User not found')) return 'Nie znaleziono użytkownika'
  return msg
}

// Wraps children in <form> on web for proper browser autofill support
function WebFormWrapper({ onSubmit, children }: { onSubmit: () => void; children: React.ReactNode }) {
  if (Platform.OS !== 'web') return <>{children}</>
  return (
    // @ts-ignore — form is valid HTML on web
    <form onSubmit={(e: any) => { e.preventDefault(); onSubmit() }} style={{ display: 'contents' }}>
      {children}
    </form>
  )
}

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const passwordRef = useRef<TextInput>(null)

  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>LSO</Text>
        <Text style={styles.subtitle}>Liturgiczna Służba Ołtarza</Text>

        <WebFormWrapper onSubmit={handleLogin}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={c.textTertiary}
            autoCapitalize="none"
            keyboardType="email-address"
            returnKeyType="next"
            value={email}
            onChangeText={v => { setEmail(v); setLoginError(null) }}
            onSubmitEditing={() => passwordRef.current?.focus()}
            blurOnSubmit={false}
          />
          <View style={styles.passwordRow}>
            <TextInput
              ref={passwordRef}
              style={styles.passwordInput}
              placeholder="Hasło"
              placeholderTextColor={c.textTertiary}
              secureTextEntry={!showPassword}
              returnKeyType="done"
              value={password}
              onChangeText={v => { setPassword(v); setLoginError(null) }}
              onSubmitEditing={handleLogin}
            />
            <TouchableOpacity onPress={() => setShowPassword(p => !p)} hitSlop={8}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={c.textTertiary} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>Zaloguj się</Text>
            }
          </TouchableOpacity>
        </WebFormWrapper>

        {loginError && <Text style={styles.errorText}>{loginError}</Text>}

        <Link href="/(auth)/register" style={styles.link}>
          Nie masz konta? Zarejestruj się
        </Link>
      </View>
    </KeyboardAvoidingView>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.bg,
    },
    inner: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    title: {
      fontSize: 48,
      fontWeight: 'bold',
      textAlign: 'center',
      color: c.text,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 16,
      textAlign: 'center',
      color: c.subtext,
      marginBottom: 48,
    },
    input: {
      backgroundColor: c.surface,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: c.border,
      color: c.text,
    },
    button: {
      backgroundColor: c.primary,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 8,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    buttonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    passwordRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 12,
    },
    passwordInput: {
      flex: 1,
      fontSize: 16,
      color: c.text,
    },
    link: {
      textAlign: 'center',
      marginTop: 24,
      color: c.primary,
      fontSize: 14,
    },
    errorText: {
      color: c.danger,
      fontSize: 14,
      textAlign: 'center',
      marginTop: 8,
    },
  })
}
