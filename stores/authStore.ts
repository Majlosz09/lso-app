// stores/authStore.ts
import { create } from 'zustand'
import { Platform } from 'react-native'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { Profile, Parish } from '../types/database'

async function ensureSchedulesCoverage(parishId: string) {
  const oneYearOut = new Date()
  oneYearOut.setFullYear(oneYearOut.getFullYear() + 1)
  const oneYearStr = oneYearOut.toISOString().split('T')[0]

  // Threshold: if last schedule is within 60 days of 1-year-out, extend
  const threshold = new Date(oneYearOut)
  threshold.setDate(threshold.getDate() - 60)
  const thresholdStr = threshold.toISOString().split('T')[0]

  const { data } = await supabase
    .from('schedules')
    .select('date')
    .eq('parish_id', parishId)
    .eq('category', 'msza')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()

  const lastDate = data?.date ?? null
  if (!lastDate || lastDate < thresholdStr) {
    const fromDate = lastDate
      ? new Date(new Date(lastDate + 'T12:00:00').getTime() + 86400000).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0]
    await supabase.rpc('generate_schedules_from_templates', {
      p_parish_id: parishId,
      p_from_date: fromDate,
      p_to_date: oneYearStr,
    })
  }
}

interface AuthState {
  session: Session | null
  user: User | null
  profile: Profile | null
  parish: Parish | null
  isLoading: boolean
  // Akcje
  setSession: (session: Session | null) => void
  fetchProfile: () => Promise<void>
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  parish: null,
  isLoading: true,

  setSession: (session) => {
    if (session) {
      set({ session, user: session.user, isLoading: false })
      get().fetchProfile()
    } else {
      set({ session: null, user: null, profile: null, parish: null, isLoading: false })
    }
  },

  fetchProfile: async () => {
    const { user } = get()
    if (!user) return

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (!error && data) {
      const profileData = data as Profile
      set({ profile: profileData, isLoading: false })

      if (profileData.parish_id) {
        const { data: parishData } = await supabase
          .from('parishes')
          .select('*')
          .eq('id', profileData.parish_id)
          .single()
        set({ parish: parishData ?? null })
        // Fire-and-forget: ensure schedules cover next year
        ensureSchedulesCoverage(profileData.parish_id).catch(() => {})
      } else {
        set({ parish: null })
      }
    } else {
      set({ isLoading: false })
    }
  },

  signOut: async () => {
    await supabase.auth.signOut({ scope: 'local' })
    set({ session: null, user: null, profile: null, parish: null })
    if (Platform.OS === 'web') {
      window.location.reload()
    }
  },
}))
