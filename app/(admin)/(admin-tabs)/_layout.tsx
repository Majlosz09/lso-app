import { Tabs, useRouter } from 'expo-router'
import { TouchableOpacity, Image } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '../../../stores/authStore'

export default function AdminTabsLayout() {
  const router = useRouter()
  const { profile } = useAuthStore()
  const avatarUrl = profile?.avatar_url

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#534AB7',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#e0e0e0',
          paddingBottom: 4,
        },
        headerStyle: { backgroundColor: '#534AB7' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Panel',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
          headerTitle: 'Panel administratora',
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push('/(admin)/(admin-tabs)/profile')}
              style={{ marginRight: 16 }}
              hitSlop={8}
            >
              {avatarUrl
                ? <Image
                    source={{ uri: avatarUrl }}
                    style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)' }}
                  />
                : <Ionicons name="person-circle-outline" size={30} color="#fff" />
              }
            </TouchableOpacity>
          ),
        }}
      />
      <Tabs.Screen
        name="members"
        options={{
          title: 'Ministranci',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push('/(admin)/rank-management')}
              style={{ marginRight: 16 }}
              hitSlop={8}
            >
              <Ionicons name="ribbon-outline" size={22} color="#fff" />
            </TouchableOpacity>
          ),
        }}
      />
      <Tabs.Screen
        name="schedules"
        options={{
          title: 'Grafiki',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="announcements"
        options={{
          title: 'Ogłoszenia',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="megaphone-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="points"
        options={{
          title: 'Punkty',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trophy-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{ href: null }}
      />
    </Tabs>
  )
}
