// app/chat/_layout.tsx
import { Stack } from 'expo-router'
import { useTheme } from '../../lib/ThemeContext'

export default function ChatRoutesLayout() {
  const { colors: c } = useTheme()
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.surface },
        headerTintColor: c.text,
        headerTitleStyle: { fontWeight: '600' },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="[channelId]" options={{ title: 'Wiadomości' }} />
      <Stack.Screen
        name="new-dm"
        options={{ title: 'Nowa wiadomość', presentation: 'modal' }}
      />
    </Stack>
  )
}
