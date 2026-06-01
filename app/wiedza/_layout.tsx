import { Stack } from 'expo-router'
import { useTheme } from '../../lib/ThemeContext'

export default function WiedzaLayout() {
  const { colors: c } = useTheme()
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.header },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
      }}
    />
  )
}
