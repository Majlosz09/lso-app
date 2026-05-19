// lib/ThemeContext.tsx
import React, { createContext, useContext, useMemo } from 'react'
import { useColorScheme } from 'react-native'
import { lightColors, darkColors, Colors } from './theme'
import { useThemeStore } from '../stores/themeStore'

type ThemeContextValue = {
  colors: Colors
  isDark: boolean
  scheme: 'light' | 'dark'
}

const ThemeContext = createContext<ThemeContextValue>({
  colors: lightColors,
  isDark: false,
  scheme: 'light',
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme() ?? 'light'
  const themeOverride = useThemeStore((s) => s.themeOverride)

  const scheme: 'light' | 'dark' =
    themeOverride === 'system' ? systemScheme : themeOverride

  const isDark = scheme === 'dark'
  const colors = isDark ? darkColors : lightColors

  const value = useMemo(
    () => ({ colors, isDark, scheme }),
    [colors, isDark, scheme]
  )

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}
