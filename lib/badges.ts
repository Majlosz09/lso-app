import { SupabaseClient } from '@supabase/supabase-js'

export type AssignmentForBadge = {
  status: string
  scheduleDate: string  // 'YYYY-MM-DD'
}

/**
 * Oblicza aktywne klucze kryteriów dla odznak auto-statusowych.
 * Nie wykonuje żadnych zapytań — dane przekazywane z zewnątrz.
 */
export function computeAutoStatusBadges(
  assignments: AssignmentForBadge[],
  now: Date,
): Set<string> {
  const active = new Set<string>()

  // Regularny: ≥80% present/confirmed w ostatnich 30 dniach
  // Porównanie stringów YYYY-MM-DD zamiast Date obiektów — unika błędów stref czasowych
  const cutoffStr = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
  const recent = assignments.filter(a => a.scheduleDate >= cutoffStr)
  if (recent.length > 0) {
    const presentCount = recent.filter(
      a => a.status === 'present' || a.status === 'confirmed'
    ).length
    if (presentCount / recent.length >= 0.8) {
      active.add('regularny')
    }
  }

  // Seria: liczymy kolejne non-absent od najnowszego
  const sorted = [...assignments].sort(
    (a, b) => new Date(b.scheduleDate).getTime() - new Date(a.scheduleDate).getTime()
  )
  let streak = 0
  for (const a of sorted) {
    if (a.status === 'absent') break
    streak++
  }
  if (streak >= 5)  active.add('seria_5')
  if (streak >= 10) active.add('seria_10')
  if (streak >= 15) active.add('seria_15')
  if (streak >= 20) active.add('seria_20')

  return active
}

/**
 * Oblicza zarobione klucze kryteriów dla odznak auto-trwałych.
 * Czysta funkcja — nie wykonuje zapytań.
 */
export function computeAutoPermanentBadges(
  totalServices: number,
  monthsSinceCreation: number,
  monthRank: number | null,
): Set<string> {
  const earned = new Set<string>()

  if (totalServices >= 100) earned.add('weteran_100')
  if (totalServices >= 250) earned.add('weteran_250')
  if (totalServices >= 500) earned.add('weteran_500')

  if (monthsSinceCreation >= 12) earned.add('rocznica_1')
  if (monthsSinceCreation >= 24) earned.add('rocznica_2')
  if (monthsSinceCreation >= 60) earned.add('rocznica_5')

  if (monthRank !== null && monthRank <= 3) earned.add('top3')

  return earned
}

/**
 * Pobiera dane z Supabase, oblicza odznaki i synchronizuje member_badges.
 * Wywoływana fire-and-forget: computeAndSyncBadges(...).catch(console.error)
 */
export async function computeAndSyncBadges(
  supabase: SupabaseClient,
  profileId: string,
  parishId: string,
): Promise<void> {
  const now = new Date()

  // 1. Pobierz auto-definicje odznak (systemowe + parafialne)
  const [systemDefsRes, parishDefsRes] = await Promise.all([
    supabase
      .from('badge_definitions')
      .select('id, criteria_key, persistence')
      .is('parish_id', null)
      .eq('type', 'auto'),
    supabase
      .from('badge_definitions')
      .select('id, criteria_key, persistence')
      .eq('parish_id', parishId)
      .eq('type', 'auto'),
  ])
  if (systemDefsRes.error) console.error('[badges] system defs error:', systemDefsRes.error)
  if (parishDefsRes.error) console.error('[badges] parish defs error:', parishDefsRes.error)
  // Deduplicate by criteria_key — prefer parish-specific over global
  const defsByKey = new Map<string, any>()
  for (const def of [...(systemDefsRes.data ?? []), ...(parishDefsRes.data ?? [])]) {
    const existing = defsByKey.get(def.criteria_key)
    if (!existing || (existing.parish_id === null && def.parish_id !== null)) {
      defsByKey.set(def.criteria_key, def)
    }
  }
  const defs = Array.from(defsByKey.values())

  if (defs.length === 0) return

  // 2. Pobierz wszystkie schedule_assignments tego profilu
  const { data: rawAssignments, error: assignErr } = await supabase
    .from('schedule_assignments')
    .select('status, schedule:schedules(date)')
    .eq('profile_id', profileId)
  if (assignErr) console.error('[badges] assignments error:', assignErr)

  const assignments: AssignmentForBadge[] = (rawAssignments ?? [])
    .filter((a: any) => a.schedule !== null)
    .map((a: any) => ({ status: a.status, scheduleDate: a.schedule.date }))

  // 3. Pobierz created_at profilu (rocznice)
  const { data: profileData, error: profileErr } = await supabase
    .from('profiles')
    .select('created_at')
    .eq('id', profileId)
    .single()
  if (profileErr) console.error('[badges] profile error:', profileErr)

  const monthsSince = profileData
    ? Math.floor(
        (now.getTime() - new Date(profileData.created_at).getTime()) /
        (1000 * 60 * 60 * 24 * 30.44)
      )
    : 0

  // 4. Policz łączną liczbę służb (present + confirmed)
  const totalServices = assignments.filter(
    a => a.status === 'present' || a.status === 'confirmed'
  ).length

  // 5. Pobierz top 3 rankingu punktowego (pobieramy tylko 3 wiersze)
  const { data: top3Data, error: rankErr } = await supabase
    .from('points_summary')
    .select('profile_id')
    .eq('parish_id', parishId)
    .order('total_points', { ascending: false })
    .limit(3)
  if (rankErr) console.error('[badges] ranking error:', rankErr)

  const rankIdx = top3Data
    ? (top3Data as any[]).findIndex(r => r.profile_id === profileId)
    : -1
  const monthRank = rankIdx >= 0 ? rankIdx + 1 : null

  // 6. Oblicz aktywne/zarobione odznaki
  const activeStatusKeys = computeAutoStatusBadges(assignments, now)
  const earnedPermanentKeys = computeAutoPermanentBadges(totalServices, monthsSince, monthRank)

  const statusDefs = defs.filter((d: any) => d.persistence === 'status')
  const permanentDefs = defs.filter((d: any) => d.persistence === 'permanent')

  // 7. Sync: status-owe — jeden batched upsert z aktualnym is_active
  if (statusDefs.length > 0) {
    const statusRows = statusDefs.map((def: any) => ({
      profile_id: profileId,
      badge_definition_id: def.id,
      is_active: activeStatusKeys.has(def.criteria_key),
      awarded_by: null,
    }))
    const { error: statusErr } = await supabase
      .from('member_badges')
      .upsert(statusRows, { onConflict: 'profile_id,badge_definition_id' })
    if (statusErr) console.error('[badges] status upsert error:', statusErr)
  }

  // 8. Sync: trwałe — jeden batched upsert tylko dla osiągniętych progów
  const earnedPermanentRows = permanentDefs
    .filter((def: any) => earnedPermanentKeys.has(def.criteria_key))
    .map((def: any) => ({
      profile_id: profileId,
      badge_definition_id: def.id,
      is_active: true,
      awarded_by: null,
    }))
  if (earnedPermanentRows.length > 0) {
    const { error: permErr } = await supabase
      .from('member_badges')
      .upsert(earnedPermanentRows, {
        onConflict: 'profile_id,badge_definition_id',
        ignoreDuplicates: true,
      })
    if (permErr) console.error('[badges] permanent upsert error:', permErr)
  }
}

export const BADGE_CATALOG: Record<string, string> = {
  regularny:   'Minimum 80% obecności w ostatnich 30 dniach',
  seria_5:     '5 dyżurów z rzędu bez nieobecności',
  seria_10:    '10 dyżurów z rzędu bez nieobecności',
  seria_15:    '15 dyżurów z rzędu bez nieobecności',
  seria_20:    '20 dyżurów z rzędu bez nieobecności',
  weteran_100: 'Łącznie 100 zaliczonych dyżurów',
  weteran_250: 'Łącznie 250 zaliczonych dyżurów',
  weteran_500: 'Łącznie 500 zaliczonych dyżurów',
  rocznica_1:  '1 rok w aplikacji',
  rocznica_2:  '2 lata w aplikacji',
  rocznica_5:  '5 lat w aplikacji',
  top3:        'Top 3 w rankingu parafii (przyznawana raz)',
  sumienny:    'Przyznawana ręcznie przez animatora',
  animator:    'Przyznawana ręcznie przez animatora',
  szczegolna:  'Przyznawana ręcznie przez animatora',
}
