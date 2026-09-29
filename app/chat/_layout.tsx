// app/chat/_layout.tsx
import { Stack } from 'expo-router'
import { useTheme } from '../../lib/ThemeContext'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { fonts } from '../../lib/theme'

export default function ChatRoutesLayout() {
  const { colors: c } = useTheme()
  const isDesktop = useIsDesktop()
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.surface },
        headerTintColor: c.text,
        headerTitleStyle: { fontFamily: fonts.bold, fontWeight: '700' },
        headerShown: !isDesktop,
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
