// types/database.ts
// Typy odpowiadają dokładnie tabelom w Supabase

export type Role = 'admin' | 'member' | 'parent'
export type AssignmentStatus = 'assigned' | 'present' | 'confirmed' | 'absent' | 'excused' | 'swapped'
export type ScheduleCategory = 'msza' | 'nabozenstwo' | 'zbiorka'

export const CATEGORY_CONFIG: Record<ScheduleCategory, { label: string; color: string; bg: string }> = {
  msza:        { label: 'Msza Święta',  color: '#534AB7', bg: '#534AB714' },
  nabozenstwo: { label: 'Nabożeństwo', color: '#1A8FD1', bg: '#1A8FD114' },
  zbiorka:     { label: 'Zbiórka',      color: '#2EAD7A', bg: '#2EAD7A14' },
}

export interface Parish {
  id: string
  name: string
  city: string | null
  invite_code: string
  setup_done: boolean
  created_at: string
  created_by: string | null
}

export interface PointRule {
  id: string
  parish_id: string
  label: string
  points: number
  created_at: string
}

export interface Rank {
  id: string
  name: string
  order: number
  is_system: boolean
  parish_id: string | null
  created_at: string
}
export type AttendanceMethod = 'gps' | 'qr' | 'manual'
export type SwapStatus = 'open' | 'accepted' | 'rejected' | 'cancelled'

export interface Profile {
  id: string
  full_name: string
  role: Role
  phone: string | null
  avatar_url: string | null
  parent_id: string | null
  is_active: boolean
  is_admin: boolean
  rocznik: number | null
  rank_id: string | null
  parish_id: string | null
  created_at: string
}

export interface Group {
  id: string
  name: string
  description: string | null
  created_by: string | null
  created_at: string
}

export interface GroupMember {
  id: string
  group_id: string
  profile_id: string
  position: string | null
  joined_at: string
  // Relacje (opcjonalne, ładowane z join)
  profile?: Profile
  group?: Group
}

export interface Schedule {
  id: string
  group_id: string | null
  title: string
  date: string       // format: "2025-12-24"
  time: string       // format: "10:00:00"
  category: ScheduleCategory
  location?: string
  series_id?: string | null
  lat: number | null
  lng: number | null
  gps_radius: number
  notes: string | null
  created_by: string | null
  parish_id: string
  created_at: string
  // Relacje
  group?: Group
  assignments?: ScheduleAssignment[]
}

export interface ScheduleAssignment {
  id: string
  schedule_id: string
  profile_id: string
  role: string
  status: AssignmentStatus
  absence_reason?: string | null
  // Relacje
  profile?: Profile
  schedule?: Schedule
}

export interface Attendance {
  id: string
  schedule_id: string
  profile_id: string
  method: AttendanceMethod
  lat: number | null
  lng: number | null
  checked_at: string
  marked_by: string | null
  parish_id: string
}

export interface ExtraAttendance {
  id: string
  profile_id: string
  event_type: 'msza' | 'nabożeństwo'
  event_date: string
  event_time: string
  checked_at: string
}

export interface Point {
  id: string
  profile_id: string
  amount: number
  reason: string
  schedule_id: string | null
  awarded_by: string | null
  parish_id: string
  created_at: string
}

export interface PointsSummary {
  profile_id: string
  total_points: number
  services_count: number
  // Relacje
  profile?: Profile
}

export interface RecurringCommitment {
  id: string
  profile_id: string
  day_of_week: number
  time_slot: string | null
  created_at: string
}

export interface Announcement {
  id: string
  title: string
  content: string
  author_id: string | null
  is_pinned: boolean
  target_audience: string
  parish_id: string
  created_at: string
  author?: Profile
}

export interface MassTemplate {
  id: string
  parish_id: string
  day_of_week: number   // 0=Nd, 1=Pn, 2=Wt, 3=Śr, 4=Cz, 5=Pt, 6=So
  time: string          // "HH:MM:SS"
  label: string | null
  sort_order: number
  created_at: string
}

export interface SwapOffer {
  id: string
  schedule_id: string
  from_profile_id: string
  to_profile_id: string | null
  message: string | null
  status: SwapStatus
  created_at: string
  resolved_at: string | null
  // Relacje
  schedule?: Schedule
  from_profile?: Profile
  to_profile?: Profile
}
