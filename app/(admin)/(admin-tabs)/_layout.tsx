import { Tabs } from 'expo-router'
import { CustomTabBar } from '../../../components/CustomTabBar'
import { Icon } from '../../../components/ui'
import { HeaderAvatar, HeaderBack } from '../../../components/layout/HeaderAvatar'
import { useNavHeaderOptions } from '../../../components/layout/navOptions'

const tabIcon = (name: string) => ({ color, size, focused }: { color: string; size: number; focused: boolean }) =>
  <Icon name={name} size={size} color={color} filled={focused} />

const PROFILE = '/(admin)/(admin-tabs)/profile'

export default function AdminTabsLayout() {
  const headerOptions = useNavHeaderOptions()
  const headerRight = () => <HeaderAvatar href={PROFILE} />
  const headerLeft = () => <HeaderBack fallback="/(admin)/(admin-tabs)" />

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ ...headerOptions, headerRight }}
    >
      <Tabs.Screen name="index" options={{ title: 'Pulpit', headerShown: false, tabBarIcon: tabIcon('view-dashboard') }} />
      <Tabs.Screen name="schedules" options={{ title: 'Grafik', headerShown: false, tabBarIcon: tabIcon('calendar-month') }} />
      <Tabs.Screen name="members" options={{ title: 'Członkowie', headerShown: false, tabBarIcon: tabIcon('account-group') }} />
      <Tabs.Screen name="points" options={{ title: 'Punkty', headerShown: false, tabBarIcon: tabIcon('trophy') }} />
      <Tabs.Screen name="chat" options={{ title: 'Czat', headerShown: false, tabBarIcon: tabIcon('forum') }} />
      <Tabs.Screen name="announcements" options={{ href: null, title: 'Ogłoszenia', headerShown: false }} />
      <Tabs.Screen name="profile" options={{ href: null, title: 'Profil', headerShown: false }} />
    </Tabs>
  )
}
