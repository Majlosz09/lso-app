// Linki udostępniane poza aplikacją: grafik bez logowania i kalendarz w telefonie.
import { Platform } from 'react-native'

/** Adres wersji www aplikacji (strona publicznego grafiku). */
export function appWebUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin
  return process.env.EXPO_PUBLIC_WEB_URL || 'https://app.lsoapp.com'
}

export const publicScheduleUrl = (token: string) => `${appWebUrl()}/g/${token}`

/** Subskrypcja kalendarza: plik ICS z bazy (calendar_feed), aktualizowany przez aplikację kalendarza. */
export function calendarFeedUrls(token: string) {
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''
  const https = `${base}/rest/v1/rpc/calendar_feed?token=${token}&apikey=${key}`
  const webcal = https.replace(/^https?:\/\//, 'webcal://')
  return {
    https,
    webcal,
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
  }
}
