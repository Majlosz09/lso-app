// stores/themeStore.ts
import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type ThemeOverride = 'light' | 'dark' | 'system'

type ThemeStore = {
  themeOverride: ThemeOverride
  setThemeOverride: (v: ThemeOverride) => void
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      themeOverride: 'system',
      setThemeOverride: (v) => set({ themeOverride: v }),
    }),
    {
      name: 'lso-theme',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
)
