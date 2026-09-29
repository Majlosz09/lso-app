import { useEffect } from 'react'
import { Tabs, usePathname, useRouter } from 'expo-router'
import { equivalentRoute } from '../../lib/navigation'
import { useAuthStore } from '../../stores/authStore'
import { CustomTabBar } from '../../components/CustomTabBar'
import { Icon } from '../../components/ui'
import { HeaderAvatar, HeaderBack } from '../../components/layout/HeaderAvatar'
import { useNavHeaderOptions } from '../../components/layout/navOptions'

const tabIcon = (name: string) => ({ color, size, focused }: { color: string; size: number; focused: boolean }) =>
  <Icon name={name} size={size} color={color} filled={focused} />

export default function TabsLayout() {
  const { profile, parish } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()
  const headerOptions = useNavHeaderOptions()

  useEffect(() => {
    if (profile?.role === 'admin') {
      router.replace(equivalentRoute('admin', pathname) as any)
    }
    if (profile?.role === 'parent') {
      router.replace(equivalentRoute('parent', pathname) as any)
    }
  }, [profile])

  const headerRight = () => <HeaderAvatar href="/(tabs)/profile" />
  const headerLeft = () => <HeaderBack fallback="/(tabs)" />
  // Złoty przycisk „Obecność” tylko gdy ministrant sam może potwierdzić obecność
  const selfCheckIn = (parish?.attendance_mode ?? 'button') !== 'admin'

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} fabRouteName="attendance" />}
      screenOptions={{ ...headerOptions, headerRight }}
    >
      <Tabs.Screen name="index" options={{ title: 'Dom', headerShown: false, tabBarIcon: tabIcon('home') }} />
      <Tabs.Screen name="schedule" options={{ title: 'Grafik', headerShown: false, tabBarIcon: tabIcon('calendar-month') }} />
      <Tabs.Screen
        name="attendance"
        options={{ title: 'Obecność', headerShown: false, tabBarStyle: { display: 'none' }, href: selfCheckIn ? undefined : null, tabBarIcon: tabIcon('qrcode-scan') }}
      />
      <Tabs.Screen name="points" options={{ title: 'Punkty', headerShown: false, tabBarIcon: tabIcon('trophy') }} />
      <Tabs.Screen name="chat" options={{ title: 'Czat', headerShown: false, tabBarIcon: tabIcon('forum') }} />
      <Tabs.Screen name="service" options={{ href: null, title: 'Służba', headerShown: false }} />
      <Tabs.Screen name="wiedza" options={{ href: null, title: 'Wiedza', headerLeft }} />
      <Tabs.Screen name="announcements" options={{ href: null, title: 'Ogłoszenia', headerLeft }} />
      <Tabs.Screen name="profile" options={{ href: null, title: 'Profil', headerLeft, headerRight: undefined }} />
      <Tabs.Screen name="badge-catalog" options={{ href: null, title: 'Katalog odznak', headerShown: false }} />
      <Tabs.Screen name="member-profile" options={{ href: null, title: 'Profil ministranta', headerShown: false }} />
    </Tabs>
  )
}
