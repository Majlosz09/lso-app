import { useEffect } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { Stack, useRouter } from 'expo-router'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'

export default function ParentLayout() {
  const { profile, isLoading } = useAuthStore()
  const router = useRouter()
  const { colors } = useTheme()

  const hasAccess = profile?.role === 'parent'

  useEffect(() => {
    if (!isLoading && !hasAccess) {
      router.replace('/(tabs)')
    }
  }, [profile, isLoading])

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
      <Stack.Screen name="(parent-tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="member-profile" options={{ title: 'Profil ministranta' }} />
    </Stack>
  )
}
