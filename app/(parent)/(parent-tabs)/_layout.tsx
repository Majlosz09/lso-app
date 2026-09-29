import { Tabs } from 'expo-router'
import { CustomTabBar } from '../../../components/CustomTabBar'
import { Icon } from '../../../components/ui'
import { HeaderAvatar, HeaderBack } from '../../../components/layout/HeaderAvatar'
import { useNavHeaderOptions } from '../../../components/layout/navOptions'

const tabIcon = (name: string) => ({ color, size, focused }: { color: string; size: number; focused: boolean }) =>
  <Icon name={name} size={size} color={color} filled={focused} />

export default function ParentTabsLayout() {
  const headerOptions = useNavHeaderOptions()
  const headerRight = () => <HeaderAvatar href="/(parent)/(parent-tabs)/profile" />
  const headerLeft = () => <HeaderBack fallback="/(parent)/(parent-tabs)" />

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ ...headerOptions, headerRight }}
    >
      <Tabs.Screen name="index" options={{ title: 'Dom', tabBarIcon: tabIcon('home') }} />
      <Tabs.Screen name="schedule" options={{ title: 'Dyżury', headerTitle: 'Dyżury dzieci', tabBarIcon: tabIcon('calendar-month') }} />
      <Tabs.Screen name="points" options={{ title: 'Punkty', tabBarIcon: tabIcon('trophy') }} />
      <Tabs.Screen name="announcements" options={{ title: 'Ogłoszenia', tabBarIcon: tabIcon('bullhorn') }} />
      <Tabs.Screen name="chat" options={{ title: 'Czat', headerShown: false, tabBarIcon: tabIcon('forum') }} />
      <Tabs.Screen name="profile" options={{ href: null, title: 'Profil', headerLeft, headerRight: undefined }} />
    </Tabs>
  )
}
