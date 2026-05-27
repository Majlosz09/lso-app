import * as Location from 'expo-location'
import { supabase } from './supabase'

export type CheckInResult =
  | { success: true }
  | { success: false; message: string }

function getDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

async function recordAttendance(
  scheduleId: string,
  profileId: string,
  parishId: string,
  method: 'manual' | 'qr' | 'gps',
  lat?: number,
  lng?: number,
): Promise<CheckInResult> {
  const { error: insErr } = await supabase.from('attendance').insert({
    schedule_id: scheduleId,
    profile_id: profileId,
    method,
    checked_at: new Date().toISOString(),
    parish_id: parishId,
    lat: lat ?? null,
    lng: lng ?? null,
  })
  if (insErr) return { success: false, message: insErr.message }

  const { error: updErr } = await supabase
    .from('schedule_assignments')
    .update({ status: 'present' })
    .eq('schedule_id', scheduleId)
    .eq('profile_id', profileId)
  if (updErr) return { success: false, message: updErr.message }

  return { success: true }
}

export async function checkInButton(
  scheduleId: string,
  profileId: string,
  parishId: string,
): Promise<CheckInResult> {
  return recordAttendance(scheduleId, profileId, parishId, 'manual')
}

const GPS_TIMEOUT_MS = 15_000

export async function validateGps(params: {
  parishLat: number
  parishLng: number
  parishRadius: number
}): Promise<CheckInResult> {
  const { status } = await Location.requestForegroundPermissionsAsync()
  if (status !== 'granted') {
    return { success: false, message: 'Brak dostępu do lokalizacji. Zezwól aplikacji na dostęp w ustawieniach.' }
  }
  let pos: Location.LocationObject
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), GPS_TIMEOUT_MS)
    )
    pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      timeoutPromise,
    ])
  } catch {
    return { success: false, message: 'Przekroczono czas oczekiwania na lokalizację (15s). Sprawdź czy GPS jest włączony.' }
  }
  const dist = Math.round(
    getDistanceMeters(pos.coords.latitude, pos.coords.longitude, params.parishLat, params.parishLng)
  )
  if (dist > params.parishRadius) {
    return { success: false, message: `Jesteś ${dist}m od kościoła (wymagane: ${params.parishRadius}m).` }
  }
  return { success: true }
}

export async function checkInGps(params: {
  scheduleId: string
  profileId: string
  parishId: string
  parishLat: number
  parishLng: number
  parishRadius: number
}): Promise<CheckInResult> {
  const gpsResult = await validateGps(params)
  if (!gpsResult.success) return gpsResult
  return recordAttendance(params.scheduleId, params.profileId, params.parishId, 'gps')
}

export function validateParishQr(scannedValue: string, parishId: string): boolean {
  return scannedValue === `lso-checkin:${parishId}`
}

export async function checkInQr(
  scheduleId: string,
  profileId: string,
  parishId: string,
): Promise<CheckInResult> {
  return recordAttendance(scheduleId, profileId, parishId, 'qr')
}

export function buildParishQrValue(parishId: string): string {
  return `lso-checkin:${parishId}`
}
