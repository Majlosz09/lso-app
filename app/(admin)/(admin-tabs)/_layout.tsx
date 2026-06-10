import { Tabs, useRouter } from 'expo-router'
import { TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '../../../stores/authStore'
import { CustomTabBar } from '../../../components/CustomTabBar'
import { useTheme } from '../../../lib/ThemeContext'
import { AvatarImage } from '../../../components/AvatarImage'

export default function AdminTabsLayout() {
  const router = useRouter()
  const { profile } = useAuthStore()
  const { colors } = useTheme()
  const avatarUrl = profile?.avatar_url

  const avatarButton = () => (
    <TouchableOpacity
      onPress={() => router.push('/(admin)/(admin-tabs)/profile')}
      style={{ marginRight: 16 }}
      hitSlop={8}
    >
      {avatarUrl
        ? <AvatarImage avatarUrl={avatarUrl} size={32} borderColor="rgba(255,255,255,0.6)" borderWidth={2} />
        : <Ionicons name="person-circle-outline" size={30} color="#fff" />
      }
    </TouchableOpacity>
  )

  const backButton = () => (
    <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: 8 }} hitSlop={8}>
      <Ionicons name="chevron-back" size={28} color="#fff" />
    </TouchableOpacity>
  )

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: colors.header },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="members"
        options={{
          title: 'Ministranci',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
          headerRight: avatarButton,
        }}
      />
      <Tabs.Screen
        name="schedules"
        options={{
          title: 'Grafiki',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
          headerRight: avatarButton,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Panel',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
          headerTitle: 'Panel administratora',
          headerRight: avatarButton,
        }}
      />
      <Tabs.Screen
        name="announcements"
        options={{ href: null, title: 'Ogłoszenia', headerRight: avatarButton, headerLeft: backButton }}
      />
      <Tabs.Screen
        name="points"
        options={{
          title: 'Punkty',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trophy-outline" size={size} color={color} />
          ),
          headerRight: avatarButton,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Czat',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles-outline" size={size} color={color} />
          ),
          headerRight: avatarButton,
        }}
      />
      <Tabs.Screen name="profile" options={{ href: null, title: 'Profil' }} />
    </Tabs>
  )
}
