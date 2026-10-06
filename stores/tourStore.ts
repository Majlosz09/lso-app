// Stan interaktywnego przewodnika (components/tour). Kroki: lib/tour.ts.
import { create } from 'zustand'
import type { View } from 'react-native'
import { supabase } from '../lib/supabase'
import { TourRole, TourStep, tourSteps } from '../lib/tour'
import { useAuthStore } from './authStore'

type TourState = {
  active: boolean
  steps: TourStep[]
  index: number
  start: (role: TourRole) => void
  next: () => void
  back: () => void
  /** koniec albo „Pomiń” — zapamiętuje na koncie, że przewodnik był pokazany */
  stop: () => void
}

export const useTour = create<TourState>((set, get) => ({
  active: false,
  steps: [],
  index: 0,
  start: (role) => set({ active: true, steps: tourSteps(role), index: 0 }),
  next: () => {
    const { index, steps } = get()
    if (index + 1 >= steps.length) get().stop()
    else set({ index: index + 1 })
  },
  back: () => set(s => ({ index: Math.max(0, s.index - 1) })),
  stop: () => {
    set({ active: false, index: 0 })
    const { profile, fetchProfile } = useAuthStore.getState()
    if (profile?.id && profile.onboarding_completed === false) {
      supabase.from('profiles').update({ onboarding_completed: true }).eq('id', profile.id).then(() => fetchProfile(), () => {})
    }
  },
}))

// Rejestr elementów do podświetlenia (poza stanem — referencje widoków nie powodują renderów).
const targets = new Map<string, Set<View>>()

export function registerTourTarget(id: string, view: View | null, prev: View | null) {
  if (prev) targets.get(id)?.delete(prev)
  if (view) {
    if (!targets.has(id)) targets.set(id, new Set())
    targets.get(id)!.add(view)
  }
}

export function tourTargetViews(id: string): View[] {
  return [...(targets.get(id) ?? [])]
}
