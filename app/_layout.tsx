import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
import Toast from 'react-native-toast-message'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as Notifications from 'expo-notifications'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { ThemeProvider } from '../lib/ThemeContext'
import { OnboardingModal } from '../components/OnboardingModal'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

if (Platform.OS === 'web') {
  const originalWarn = console.warn
  console.warn = (...args) => {
    const msg = args[0]?.toString() ?? ''
    if (msg.includes('pointerEvents') || msg.includes('tintColor')) return
    originalWarn(...args)
  }
}

const queryClient = new QueryClient()

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthGate />
      </ThemeProvider>
    </QueryClientProvider>
  )
}

function AuthGate() {
  const { session, profile, isLoading, setSession } = useAuthStore()
  const router = useRouter()
  const segments = useSegments()
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
      }
    )
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (isLoading) return
    const inAuth = segments[0] === '(auth)'
    const inParishSetup = segments[1] === 'parish-setup'
    const inRegister = segments[1] === 'register'

    if (!session && !inAuth) {
      router.replace('/(auth)/welcome')
      return
    }
    if (session && profile === null) return

    if (session && inRegister) {
      // During registration: only redirect when parish is fully set up
      if (profile?.parish_id) router.replace('/(tabs)')
      // Don't redirect to parish-setup — user is still completing registration
    } else if (session && inAuth && !inParishSetup) {
      if (!profile?.parish_id) {
        router.replace('/(auth)/parish-setup')
      } else {
        router.replace('/(tabs)')
      }
    } else if (session && !inAuth && !inParishSetup) {
      if (!profile?.parish_id) {
        router.replace('/(auth)/parish-setup')
      }
    }
  }, [session, isLoading, profile, segments])

  useEffect(() => {
    if (profile && profile.parish_id && profile.onboarding_completed === false) {
      setShowOnboarding(true)
    }
  }, [profile?.id, profile?.onboarding_completed])

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)/welcome" />
        <Stack.Screen name="(auth)/login" />
        <Stack.Screen name="(auth)/register" />
        <Stack.Screen name="(auth)/parish-setup" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(admin)" />
        <Stack.Screen name="wiedza" options={{ headerShown: false }} />
      </Stack>
      <Toast />
      <OnboardingModal
        visible={showOnboarding}
        onClose={() => setShowOnboarding(false)}
      />
    </>
  )
}
