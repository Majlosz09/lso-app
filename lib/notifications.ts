import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { supabase } from './supabase'

export async function registerForPushNotificationsAsync(profileId: string): Promise<void> {
  if (Platform.OS === 'web') return

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Powiadomienia LSO',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1A237E',
    })
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') return

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    )
    const token = tokenData.data
    await supabase.from('profiles').update({ push_token: token }).eq('id', profileId)
  } catch {
    // Silently fail on simulators or missing projectId
  }
}
