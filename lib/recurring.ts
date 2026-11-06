import { supabase } from './supabase'

/** Stały dyżur, do którego należy zapis (zapis „co tydzień” ministranta albo dyżur od opiekuna). */
export type Cycle = {
  ruleId: string
  dayOfWeek: number
  /** HH:MM */
  time: string
  endDate: string
  /** ministrant / rodzic może zakończyć cały cykl (ustawili go sami; dyżur od opiekuna zmienia opiekun) */
  canLeave: boolean
  /** ile przyszłych służb usunie zakończenie cyklu */
  future: number
}

const DAY_ACC = ['niedzielę', 'poniedziałek', 'wtorek', 'środę', 'czwartek', 'piątek', 'sobotę']
export const cycleLabel = (c: Cycle) => `co ${DAY_ACC[c.dayOfWeek]} ${c.time}`

/** null = zwykła służba (albo baza jeszcze bez tej funkcji — wtedy zwykły wypis). */
export async function fetchCycle(assignmentId: string): Promise<Cycle | null> {
  const { data, error } = await supabase.rpc('assignment_cycle', { p_assignment_id: assignmentId })
  if (error || !data) return null
  const d = data as any
  return { ruleId: d.rule_id, dayOfWeek: d.day_of_week, time: d.time, endDate: d.end_date, canLeave: !!d.can_leave, future: d.future ?? 0 }
}

/** Kończy cały cykl: usuwa wszystkie przyszłe służby z niego. Zwraca liczbę usuniętych albo błąd. */
export async function leaveCycle(assignmentId: string): Promise<{ removed: number } | { error: string }> {
  const { data, error } = await supabase.rpc('leave_recurring', { p_assignment_id: assignmentId })
  if (error) return { error: error.message }
  return { removed: (data as any)?.removed_assignments ?? 0 }
}

export const servicesWord = (n: number) =>
  n === 1 ? 'służbę' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'służby' : 'służb'
