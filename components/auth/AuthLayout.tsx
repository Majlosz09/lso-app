import { ReactNode } from 'react'
import {
  Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../../lib/ThemeContext'
import { sans, serif } from '../../lib/theme'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { AppText, Icon } from '../ui'

const LOGO = require('../../assets/images/icon.png')
export const NAVY_DEEP = '#071C3A'
const MUTED_ON_NAVY = '#C9D3E3'
export const GOLD_ITALIC = '#E3C98E'

type Props = {
  /** tytuł; `titleAccent` doklejany kursywą w złocie („Dołącz do *parafii*”) */
  title: string
  titleAccent?: string
  subtitle?: string
  onBack?: () => void
  /**
   * 'form'  — telefon: granatowy nagłówek + formularz na papierze (logowanie, rejestracja)
   * 'hero'  — telefon: cały ekran granatowy (powitanie, wybór, oczekiwanie)
   */
  variant?: 'form' | 'hero'
  /** element nad tytułem w wariancie hero (np. logo, klepsydra) */
  heroTop?: ReactNode
  children: ReactNode
  /** przyciski przyklejone do dołu (hero) */
  footer?: ReactNode
}

/**
 * Rama ekranów logowania/rejestracji.
 * Web ≥ 1024 px: granatowy panel z hasłem po lewej, formularz (max 440 px) po prawej.
 */
export function AuthLayout({
  title, titleAccent, subtitle, onBack, variant = 'form', heroTop, children, footer,
}: Props) {
  const isDesktop = useIsDesktop()
  const insets = useSafeAreaInsets()
  const { colors: c } = useTheme()

  const back = onBack && (
    <Pressable accessibilityRole="button" accessibilityLabel="Wstecz" onPress={onBack} hitSlop={8} style={styles.back}>
      <Icon name="chevron-left" size={22} color={isDesktop ? c.primary : MUTED_ON_NAVY} />
      <AppText style={[styles.backText, { color: isDesktop ? c.primary : MUTED_ON_NAVY }]}>Wstecz</AppText>
    </Pressable>
  )

  // złota kursywa: jasna na granacie, ciemniejsza na papierze (kontrast)
  const accentColor = isDesktop ? c.goldInk : GOLD_ITALIC
  const titleNode = (color: string, size: number) => (
    <AppText style={[serif(), { fontSize: size, lineHeight: size * 1.05, color }]} accessibilityRole="header">
      {title}
      {titleAccent ? <AppText style={[serif(true), { fontSize: size, color: accentColor }]}>{` ${titleAccent}`}</AppText> : null}
    </AppText>
  )

  if (isDesktop) {
    return (
      <View style={styles.split}>
        <StatusBar style="light" />
        <View style={[styles.brandPanel, { backgroundColor: NAVY_DEEP }]}>
          <View style={styles.brandRow}>
            <Image source={LOGO} style={styles.brandLogo} />
            <AppText variant="eyebrow" color={c.gold} style={styles.brandEyebrow}>Liturgiczna Służba{'\n'}Ołtarza</AppText>
          </View>
          <View style={styles.brandHero}>
            <AppText style={[serif(), styles.brandTitle]}>
              Służba przy ołtarzu,{'\n'}
              <AppText style={[serif(true), styles.brandTitle, { color: GOLD_ITALIC }]}>poukładana.</AppText>
            </AppText>
            <AppText style={styles.brandLead}>
              Grafik dyżurów, obecność, punkty i czat parafii — dla ministrantów, opiekunów i rodziców.
              W przeglądarce i w telefonie.
            </AppText>
          </View>
          <AppText style={styles.brandFoot}>Bezpłatna aplikacja misyjna · lsoapp.com</AppText>
        </View>
        <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={styles.formPane}>
          <View style={styles.formCol}>
            {back}
            {titleNode(c.text, 44)}
            {!!subtitle && <AppText muted style={styles.subtitleDesktop}>{subtitle}</AppText>}
            <View style={styles.formBody}>{children}</View>
            {footer && <View style={styles.footerDesktop}>{footer}</View>}
          </View>
        </ScrollView>
      </View>
    )
  }

  if (variant === 'hero') {
    return (
      <View style={[styles.flex, { backgroundColor: NAVY_DEEP }]}>
        <StatusBar style="light" />
        <ScrollView
          contentContainerStyle={[styles.heroScroll, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
        >
          {back}
          <View style={styles.heroCenter}>
            {heroTop}
            {titleNode('#FFFFFF', 46)}
            {!!subtitle && <AppText style={styles.heroSubtitle}>{subtitle}</AppText>}
            {children}
          </View>
          {footer && <View style={styles.footer}>{footer}</View>}
        </ScrollView>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: c.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={[styles.formHeader, { backgroundColor: NAVY_DEEP, paddingTop: insets.top + 6 }]}>
          {back}
          {titleNode('#FFFFFF', 38)}
          {!!subtitle && <AppText style={styles.headerSubtitle}>{subtitle}</AppText>}
        </View>
        <View style={[styles.formArea, { paddingBottom: insets.bottom + 28 }]}>
          {children}
          {footer}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

/** Separator z napisem („DANE PARAFII”). */
export function AuthDivider({ label }: { label: string }) {
  const { colors: c } = useTheme()
  return (
    <View style={styles.divider}>
      <View style={[styles.dividerLine, { backgroundColor: c.inputBorder }]} />
      <AppText style={[styles.dividerText, { color: c.textTertiary }]}>{label}</AppText>
      <View style={[styles.dividerLine, { backgroundColor: c.inputBorder }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: -6, alignSelf: 'flex-start', cursor: 'pointer' } as any,
  backText: { ...sans(700), fontSize: 13 },

  // telefon — formularz
  formHeader: {
    paddingHorizontal: 22,
    paddingBottom: 28,
    gap: 14,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },
  headerSubtitle: { ...sans(500), fontSize: 14, color: MUTED_ON_NAVY },
  formArea: { flex: 1, padding: 20, paddingTop: 24, gap: 14 },

  // telefon — hero
  heroScroll: { flexGrow: 1, paddingHorizontal: 28 },
  heroCenter: { flex: 1, justifyContent: 'center', gap: 18, paddingVertical: 24 },
  heroSubtitle: { ...sans(500), fontSize: 15, lineHeight: 23, color: MUTED_ON_NAVY },
  footer: { gap: 10 },

  // desktop
  split: { flex: 1, flexDirection: 'row' },
  brandPanel: { flex: 1, padding: 56, justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brandLogo: { width: 44, height: 44, borderRadius: 11 },
  brandEyebrow: { fontSize: 11, lineHeight: 15 },
  brandHero: { gap: 22, maxWidth: 480 },
  brandTitle: { fontSize: 60, lineHeight: 64, color: '#FFFFFF' },
  brandLead: { ...sans(500), fontSize: 17, lineHeight: 27, color: MUTED_ON_NAVY },
  brandFoot: { ...sans(500), fontSize: 12, color: '#8497B5' },
  formPane: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 48 },
  formCol: { width: '100%', maxWidth: 440, gap: 10 },
  subtitleDesktop: { marginTop: 2 },
  formBody: { gap: 14, marginTop: 14 },
  footerDesktop: { gap: 10, marginTop: 10 },

  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 4 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { ...sans(700), fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase' },
})
