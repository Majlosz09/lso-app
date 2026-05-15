// stores/authStore.ts
import { create } from 'zustand'
import { Platform } from 'react-native'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { Profile, Parish } from '../types/database'

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
