import { Platform, useWindowDimensions } from 'react-native'

export const DESKTOP_MIN_WIDTH = 1024

/** Layout desktopowy (sidebar + topbar) — tylko web i okno ≥ 1024 px. */
export function useIsDesktop(): boolean {
  const { width } = useWindowDimensions()
  return Platform.OS === 'web' && width >= DESKTOP_MIN_WIDTH
}
