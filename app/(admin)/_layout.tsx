import { useEffect } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { Stack, usePathname, useRouter } from 'expo-router'
import { equivalentRoute, navRoleFor } from '../../lib/navigation'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { useNavHeaderOptions } from '../../components/layout/navOptions'

export default function AdminLayout() {
  const { profile, parish, isLoading } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()
  const { colors } = useTheme()
  const headerOptions = useNavHeaderOptions()

  const hasAccess = profile?.role === 'admin' || (profile?.role === 'member' && profile?.is_admin)

  useEffect(() => {
    // profil wczytuje się chwilę po sesji — bez niego nie oceniamy dostępu (odświeżenie podstrony na webie)
    if (!isLoading && profile && !hasAccess) {
      router.replace(equivalentRoute(navRoleFor(profile, false), pathname) as any)
    }
    if (!isLoading && hasAccess && parish && parish.setup_done === false) {
      router.replace('/(admin)/onboarding')
    }
  }, [profile, parish, isLoading])

  if (isLoading || !profile || !hasAccess) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <Stack
      screenOptions={headerOptions}
    >
      <Stack.Screen name="(admin-tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="schedule-detail" options={{ title: 'Szczegóły służby' }} />
      <Stack.Screen name="schedule-form" options={{ title: 'Nowa służba' }} />
      <Stack.Screen name="award-points" options={{ title: 'Przyznaj punkty' }} />
      <Stack.Screen name="member-detail" options={{ title: 'Profil członka' }} />
      <Stack.Screen name="rank-management" options={{ title: 'Zarządzaj rangami' }} />
      <Stack.Screen name="parish-settings" options={{ title: 'Ustawienia parafii' }} />
      <Stack.Screen name="mass-schedule" options={{ title: 'Rozkład Mszy' }} />
      <Stack.Screen name="churches" options={{ title: 'Kościoły i kaplice' }} />
      <Stack.Screen name="kiosk" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="point-rules" options={{ title: 'Reguły punktowania' }} />
      <Stack.Screen name="schedule-series" options={{ title: 'Nowy cykl służb' }} />
      <Stack.Screen name="schedule-day" options={{ title: 'Służby w dniu' }} />
      <Stack.Screen name="badge-management" options={{ title: 'Odznaki' }} />
      <Stack.Screen name="rank-assignment" options={{ title: 'Przydziel rangi' }} />
      <Stack.Screen name="recurring-assignments" options={{ title: 'Stałe dyżury' }} />
      <Stack.Screen name="chat-reports" options={{ title: 'Zgłoszenia z czatu' }} />
    </Stack>
  )
}
