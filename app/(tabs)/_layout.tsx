import { useEffect } from 'react'
import { Tabs, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { TouchableOpacity } from 'react-native'
import { useAuthStore } from '../../stores/authStore'
import { CustomTabBar } from '../../components/CustomTabBar'
import { useTheme } from '../../lib/ThemeContext'
import { AvatarImage } from '../../components/AvatarImage'

export default function TabsLayout() {
  const { profile } = useAuthStore()
  const router = useRouter()
  const { colors } = useTheme()
  const avatarUrl = profile?.avatar_url

  useEffect(() => {
    if (profile?.role === 'admin') {
      router.replace('/(admin)/(admin-tabs)')
    }
    if (profile?.role === 'parent') {
      router.replace('/(parent)/(parent-tabs)')
    }
  }, [profile])

  const headerRight = () => (
    <TouchableOpacity
      onPress={() => router.push('/(tabs)/profile')}
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
    <TouchableOpacity onPress={() => router.replace('/(tabs)')} style={{ marginLeft: 8 }} hitSlop={8}>
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
        name="schedule"
        options={{
          title: 'Dyżur',
          headerRight,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="points"
        options={{
          title: 'Punkty',
          headerRight,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trophy-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dom',
          headerRight,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="wiedza"
        options={{
          title: 'Wiedza',
          headerRight,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="book-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Czat',
          headerRight,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen name="announcements" options={{ href: null, title: 'Ogłoszenia', headerRight, headerLeft: backButton }} />
      <Tabs.Screen name="profile" options={{ href: null, title: 'Profil' }} />
      <Tabs.Screen name="badge-catalog" options={{ href: null, title: 'Katalog odznak' }} />
      <Tabs.Screen name="member-profile" options={{ href: null, title: 'Profil ministranta' }} />
    </Tabs>
  )
}
