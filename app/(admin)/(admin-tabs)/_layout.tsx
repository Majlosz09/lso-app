import { useState } from 'react'
import { Tabs } from 'expo-router'
import { Pressable, View } from 'react-native'
import { CustomTabBar } from '../../../components/CustomTabBar'
import { ExportModal } from '../../../components/ExportModal'
import { Icon } from '../../../components/ui'
import { HeaderAvatar, HeaderBack } from '../../../components/layout/HeaderAvatar'
import { useNavHeaderOptions } from '../../../components/layout/navOptions'
import { useLiturgyHeader } from '../../../hooks/useLiturgyHeader'

const tabIcon = (name: string) => ({ color, size, focused }: { color: string; size: number; focused: boolean }) =>
  <Icon name={name} size={size} color={color} filled={focused} />

const PROFILE = '/(admin)/(admin-tabs)/profile'

export default function AdminTabsLayout() {
  const headerOptions = useNavHeaderOptions()
  const { palette } = useLiturgyHeader()
  const [exportVisible, setExportVisible] = useState(false)

  const headerRight = () => <HeaderAvatar href={PROFILE} />
  const headerLeft = () => <HeaderBack fallback="/(admin)/(admin-tabs)" />

  const pointsHeaderRight = () => (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Eksport punktów"
        onPress={() => setExportVisible(true)}
        hitSlop={8}
        style={{ marginRight: 12 }}
      >
        <Icon name="download" size={22} color={palette.fg} />
      </Pressable>
      <HeaderAvatar href={PROFILE} />
    </View>
  )

  return (
    <>
      <Tabs
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{ ...headerOptions, headerRight }}
      >
        <Tabs.Screen name="index" options={{ title: 'Pulpit', headerTitle: 'Pulpit opiekuna', tabBarIcon: tabIcon('view-dashboard') }} />
        <Tabs.Screen name="schedules" options={{ title: 'Grafik', tabBarIcon: tabIcon('calendar-month') }} />
        <Tabs.Screen name="members" options={{ title: 'Członkowie', tabBarIcon: tabIcon('account-group') }} />
        <Tabs.Screen name="points" options={{ title: 'Punkty', headerRight: pointsHeaderRight, tabBarIcon: tabIcon('trophy') }} />
        <Tabs.Screen name="chat" options={{ title: 'Czat', tabBarIcon: tabIcon('forum') }} />
        <Tabs.Screen name="announcements" options={{ href: null, title: 'Ogłoszenia', headerLeft }} />
        <Tabs.Screen name="profile" options={{ href: null, title: 'Profil', headerLeft, headerRight: undefined }} />
      </Tabs>
      <ExportModal visible={exportVisible} onClose={() => setExportVisible(false)} pointsOnly />
    </>
  )
}
