import { useEffect } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { Stack, usePathname, useRouter } from 'expo-router'
import { redirectForRole, navRoleFor } from '../../lib/navigation'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { useNavHeaderOptions } from '../../components/layout/navOptions'

export default function ParentLayout() {
  const { profile, isLoading } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()
  const { colors } = useTheme()
  const headerOptions = useNavHeaderOptions()

  const hasAccess = profile?.role === 'parent'

  useEffect(() => {
    // profil wczytuje się chwilę po sesji — bez niego nie oceniamy dostępu (odświeżenie podstrony na webie)
    if (!isLoading && profile && !hasAccess) {
      router.replace(redirectForRole(navRoleFor(profile, false), pathname) as any)
    }
  }, [profile, isLoading])

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
      <Stack.Screen name="(parent-tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="member-profile" options={{ title: 'Profil dziecka', headerShown: false }} />
    </Stack>
  )
}
