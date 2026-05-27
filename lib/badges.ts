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
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - 30)
  const recent = assignments.filter(a => new Date(a.scheduleDate) >= cutoff)
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
  const { data: defs } = await supabase
    .from('badge_definitions')
    .select('id, criteria_key, persistence')
    .or(`parish_id.is.null,parish_id.eq.${parishId}`)
    .eq('type', 'auto')

  if (!defs || defs.length === 0) return

  // 2. Pobierz wszystkie schedule_assignments tego profilu
  const { data: rawAssignments } = await supabase
    .from('schedule_assignments')
    .select('status, schedule:schedules(date)')
    .eq('profile_id', profileId)

  const assignments: AssignmentForBadge[] = (rawAssignments ?? [])
    .filter((a: any) => a.schedule !== null)
    .map((a: any) => ({ status: a.status, scheduleDate: a.schedule.date }))

  // 3. Pobierz created_at profilu (rocznice)
  const { data: profileData } = await supabase
    .from('profiles')
    .select('created_at')
    .eq('id', profileId)
    .single()

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

  // 5. Pobierz ranking bieżącego miesiąca (top3)
  const { data: rankingData } = await supabase
    .from('points_summary')
    .select('profile_id')
    .eq('parish_id', parishId)
    .order('total_points', { ascending: false })

  let monthRank: number | null = null
  if (rankingData) {
    const pos = (rankingData as any[]).findIndex(r => r.profile_id === profileId) + 1
    monthRank = pos > 0 ? pos : null
  }

  // 6. Oblicz aktywne/zarobione odznaki
  const activeStatusKeys = computeAutoStatusBadges(assignments, now)
  const earnedPermanentKeys = computeAutoPermanentBadges(totalServices, monthsSince, monthRank)

  const statusDefs = defs.filter((d: any) => d.persistence === 'status')
  const permanentDefs = defs.filter((d: any) => d.persistence === 'permanent')

  // 7. Sync: status-owe — upsert z aktualnym is_active
  for (const def of statusDefs) {
    const isActive = activeStatusKeys.has(def.criteria_key)
    await supabase.from('member_badges').upsert(
      {
        profile_id: profileId,
        badge_definition_id: def.id,
        is_active: isActive,
        awarded_by: null,
      },
      { onConflict: 'profile_id,badge_definition_id' }
    )
  }

  // 8. Sync: trwałe — insert tylko gdy próg osiągnięty, ignore conflicts
  for (const def of permanentDefs) {
    if (earnedPermanentKeys.has(def.criteria_key)) {
      await supabase.from('member_badges').upsert(
        {
          profile_id: profileId,
          badge_definition_id: def.id,
          is_active: true,
          awarded_by: null,
        },
        { onConflict: 'profile_id,badge_definition_id', ignoreDuplicates: true }
      )
    }
  }
}
