import { useEffect } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

const queryClient = new QueryClient()

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate />
    </QueryClientProvider>
  )
}

function AuthGate() {
  const { session, profile, isLoading, setSession } = useAuthStore()
  const router = useRouter()
  const segments = useSegments()

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
      router.replace('/(auth)/login')
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

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)/login" />
      <Stack.Screen name="(auth)/register" />
      <Stack.Screen name="(auth)/parish-setup" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(admin)" />
    </Stack>
  )
}
