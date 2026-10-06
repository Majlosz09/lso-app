import { useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
import Toast from 'react-native-toast-message'
import * as SplashScreen from 'expo-splash-screen'
import { preloadLiturgy } from '../lib/liturgy'
import { usePushTapRouting } from '../hooks/usePushTapRouting'
import { useCheckinQueueSync } from '../stores/checkinQueueStore'
import { useFonts } from 'expo-font'
import {
  InstrumentSerif_400Regular,
  InstrumentSerif_400Regular_Italic,
} from '@expo-google-fonts/instrument-serif'
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as Notifications from 'expo-notifications'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { ThemeProvider } from '../lib/ThemeContext'
import { TourOverlay } from '../components/tour/TourOverlay'
import { useTour } from '../stores/tourStore'
import { tourRoleFor } from '../lib/tour'
import { EnvBanner } from '../components/EnvBanner'
import { WhatsNewModal } from '../components/WhatsNewModal'
import { toastConfig } from '../components/ui/toastConfig'
import { AppShell } from '../components/layout/AppShell'
import '../lib/webAlert' // Alert.alert na webie (react-native-web go nie wyświetla)

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  })
}

if (Platform.OS === 'web') {
  const originalWarn = console.warn
  console.warn = (...args) => {
    const msg = args[0]?.toString() ?? ''
    if (msg.includes('pointerEvents') || msg.includes('tintColor')) return
    originalWarn(...args)
  }
}

const queryClient = new QueryClient()

SplashScreen.preventAutoHideAsync().catch(() => {})

export default function RootLayout() {
  // Fonty redesignu v2 — splash zostaje, dopóki się nie wczytają (albo nie padną)
  const [fontsLoaded, fontError] = useFonts({
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  })
  const fontsReady = fontsLoaded || !!fontError

  // Kalendarz liturgiczny bieżącego roku (liczony na bieżąco) — maks. 2,5 s, potem start mimo wszystko
  const [liturgyReady, setLiturgyReady] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setLiturgyReady(true), 2500)
    preloadLiturgy().finally(() => { clearTimeout(t); setLiturgyReady(true) })
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (fontsReady && liturgyReady) SplashScreen.hideAsync().catch(() => {})
  }, [fontsReady, liturgyReady])

  // Web: HTML jest renderowany statycznie — wstrzymanie renderu psuje hydratację (React #418),
  // więc tam fonty po prostu podmieniają się po wczytaniu.
  if (!fontsReady && Platform.OS !== 'web') return null
  if (!liturgyReady) return null

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
  usePushTapRouting()
  useCheckinQueueSync()
  const segments = useSegments()
  // interaktywny przewodnik przy pierwszym wejściu (profiles.onboarding_completed = false)
  const tourActive = useTour(s => s.active)
  const tourShown = useRef<string | null>(null)

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
    const inPending = segments[1] === 'pending'
    // strona z linku „Zmiana hasła” sama zarządza sesją odzyskiwania — bez przekierowań
    if (segments[1] === 'reset-password') return
    // publiczny grafik (link od księdza) — bez logowania, bez przekierowań
    if ((segments[0] as string) === 'g') return
    const isPending = !!profile?.parish_id && profile?.approved === false

    // bez sesji: ekrany wymagające konta (oczekiwanie, wybór parafii) → powitanie (np. po „Wyloguj”)
    if (!session && (!inAuth || inPending || inParishSetup)) {
      router.replace('/(auth)/welcome')
      return
    }
    if (session && profile === null) return

    // Dołączył kodem — czeka na zatwierdzenie przez admina parafii
    if (session && isPending) {
      if (!inPending) router.replace('/(auth)/pending')
      return
    }
    if (session && inPending) {
      router.replace(profile?.parish_id ? '/(tabs)' : '/(auth)/parish-setup')
      return
    }

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
    if (!profile || !profile.parish_id || profile.approved === false || profile.onboarding_completed !== false) return
    if (segments[0] === '(auth)' || (segments[0] as string) === 'g' || tourShown.current === profile.id) return
    tourShown.current = profile.id
    const t = setTimeout(() => useTour.getState().start(tourRoleFor(profile)), 900)
    return () => clearTimeout(t)
  }, [profile?.id, profile?.onboarding_completed, segments[0]])

  return (
    <>
      <AppShell>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)/welcome" />
          <Stack.Screen name="(auth)/login" />
          <Stack.Screen name="(auth)/register" />
          <Stack.Screen name="(auth)/parish-setup" />
          <Stack.Screen name="(auth)/pending" />
          <Stack.Screen name="(auth)/reset-password" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(admin)" />
          <Stack.Screen name="(parent)" />
          <Stack.Screen name="wiedza" options={{ headerShown: false }} />
          <Stack.Screen name="g/[token]" options={{ headerShown: false }} />
        </Stack>
      </AppShell>
      <TourOverlay />
      <Toast config={toastConfig} />
      <EnvBanner />
      {/* „Co nowego” — nie w trakcie samouczka ani na ekranach logowania/rejestracji */}
      <WhatsNewModal suppressed={tourActive || segments[0] === '(auth)'} />
    </>
  )
}
