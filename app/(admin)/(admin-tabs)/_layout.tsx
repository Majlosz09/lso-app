import type { ColorValue } from 'react-native'
import { Tabs } from 'expo-router'
import { CustomTabBar } from '../../../components/CustomTabBar'
import { Icon } from '../../../components/ui'
import { HeaderAvatar, HeaderBack } from '../../../components/layout/HeaderAvatar'
import { useNavHeaderOptions } from '../../../components/layout/navOptions'
import { useAuthStore } from '../../../stores/authStore'

const tabIcon = (name: string) => ({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) =>
  <Icon name={name} size={size} color={color as string} filled={focused} />

const PROFILE = '/(admin)/(admin-tabs)/profile'

export default function AdminTabsLayout() {
  const headerOptions = useNavHeaderOptions()
  const profile = useAuthStore(s => s.profile)
  const helper = profile?.role === 'member' && !profile.is_admin && !!profile.is_helper
  const only = (o: object) => (helper ? { ...o, href: null } : o)
  const headerRight = () => <HeaderAvatar href={helper ? '/(tabs)/profile' : PROFILE} />
  const headerLeft = () => <HeaderBack fallback="/(admin)/(admin-tabs)" />

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ ...headerOptions, headerRight }}
    >
      <Tabs.Screen name="index" options={only({ title: 'Pulpit', headerShown: false, tabBarIcon: tabIcon('view-dashboard') })} />
      <Tabs.Screen name="schedules" options={{ title: 'Grafik', headerShown: false, tabBarIcon: tabIcon('calendar-month') }} />
      <Tabs.Screen name="members" options={only({ title: 'Członkowie', headerShown: false, tabBarIcon: tabIcon('account-group') })} />
      <Tabs.Screen name="points" options={only({ title: 'Punkty', headerShown: false, tabBarIcon: tabIcon('trophy') })} />
      <Tabs.Screen name="chat" options={only({ title: 'Czat', headerShown: false, tabBarIcon: tabIcon('forum') })} />
      <Tabs.Screen name="announcements" options={{ href: null, title: 'Ogłoszenia', headerShown: false }} />
      <Tabs.Screen name="profile" options={{ href: null, title: 'Profil', headerShown: false }} />
    </Tabs>
  )
}
