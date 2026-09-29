import { useIsDesktop } from '../../hooks/useIsDesktop'
import { useLiturgyHeader } from '../../hooks/useLiturgyHeader'
import { fonts } from '../../lib/theme'

/**
 * Wspólne opcje nagłówków nawigatorów (Stack/Tabs).
 * Telefon: nagłówek w kolorze szat dnia, tytuł Instrument Serif.
 * Desktop: nagłówek ukryty — tytuł i „Wstecz” pokazuje topbar.
 */
export function useNavHeaderOptions() {
  const isDesktop = useIsDesktop()
  const { palette } = useLiturgyHeader()
  return {
    headerShown: !isDesktop,
    headerStyle: { backgroundColor: palette.bg },
    headerTintColor: palette.fg,
    headerTitleStyle: { fontFamily: fonts.serif, fontSize: 24, fontWeight: '400' as const },
    headerShadowVisible: false,
  }
}
