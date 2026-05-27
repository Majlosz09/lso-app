import { useEffect } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { Stack, useRouter } from 'expo-router'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'

export default function AdminLayout() {
  const { profile, parish, isLoading } = useAuthStore()
  const router = useRouter()
  const { colors } = useTheme()

  const hasAccess = profile?.role === 'admin' || (profile?.role === 'member' && profile?.is_admin)

  useEffect(() => {
    if (!isLoading && !hasAccess) {
      router.replace('/(tabs)')
    }
    if (!isLoading && hasAccess && parish && parish.setup_done === false) {
      router.replace('/(admin)/onboarding')
    }
  }, [profile, parish, isLoading])

  if (isLoading || !hasAccess) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.header },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen name="(admin-tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="schedule-detail" options={{ title: 'Szczegóły służby' }} />
      <Stack.Screen name="schedule-form" options={{ title: 'Nowa służba' }} />
      <Stack.Screen name="award-points" options={{ title: 'Przyznaj punkty' }} />
      <Stack.Screen name="member-detail" options={{ title: 'Profil członka' }} />
      <Stack.Screen name="rank-management" options={{ title: 'Zarządzaj rangami' }} />
      <Stack.Screen name="parish-settings" options={{ title: 'Ustawienia parafii' }} />
      <Stack.Screen name="mass-schedule" options={{ title: 'Rozkład Mszy' }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="point-rules" options={{ title: 'Reguły punktowania' }} />
      <Stack.Screen name="schedule-series" options={{ title: 'Nowy cykl służb' }} />
      <Stack.Screen name="schedule-day" options={{ title: 'Służby w dniu' }} />
      <Stack.Screen name="badge-management" options={{ title: 'Odznaki' }} />
    </Stack>
  )
}
