import { forwardRef, ReactNode, useState } from 'react'
import { Linking, Platform, Pressable, StyleSheet, TextInput, TextInputProps, View } from 'react-native'
import { useTheme } from '../../lib/ThemeContext'
import { radius, sans } from '../../lib/theme'
import { AppText, Icon } from '../ui'

/** Na webie opakowuje pola w <form> — autouzupełnianie haseł i Enter działają jak w przeglądarce. */
export function WebFormWrapper({ onSubmit, children }: { onSubmit: () => void; children: ReactNode }) {
  if (Platform.OS !== 'web') return <>{children}</>
  return (
    // @ts-ignore — <form> jest poprawnym elementem na webie
    <form onSubmit={(e: any) => { e.preventDefault(); onSubmit() }} style={{ display: 'contents' }}>
      {children}
    </form>
  )
}

/** Pole hasła z przyciskiem pokaż/ukryj. */
export const PasswordField = forwardRef<TextInput, TextInputProps & { label?: string }>(function PasswordField(
  { label, style, ...rest }, ref,
) {
  const { colors: c } = useTheme()
  const [show, setShow] = useState(false)
  return (
    <View style={styles.wrap}>
      {!!label && <AppText variant="label" muted>{label}</AppText>}
      <View style={[styles.row, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
        <TextInput
          ref={ref}
          secureTextEntry={!show}
          placeholderTextColor={c.textTertiary}
          autoCapitalize="none"
          style={[styles.input, { color: c.text }, style]}
          {...rest}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={show ? 'Ukryj hasło' : 'Pokaż hasło'}
          onPress={() => setShow(s => !s)}
          hitSlop={8}
        >
          <Icon name={show ? 'eye-off' : 'eye'} size={20} color={c.textTertiary} />
        </Pressable>
      </View>
    </View>
  )
})

/** Zgoda (regulamin, zgoda rodzica…) — pole wyboru w stylu prototypu. */
export function ConsentCheckbox({ checked, onToggle, children }: {
  checked: boolean; onToggle: () => void; children: ReactNode
}) {
  const { colors: c } = useTheme()
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onToggle}
      style={styles.consent}
    >
      <Icon name={checked ? 'checkbox-marked' : 'checkbox-blank-outline'} size={22} color={c.primary} />
      <AppText style={[styles.consentText, { color: c.subtext }]}>{children}</AppText>
    </Pressable>
  )
}

export function LegalLink({ url, label }: { url: string; label: string }) {
  const { colors: c } = useTheme()
  return (
    <AppText style={[styles.link, { color: c.primary }]} onPress={() => Linking.openURL(url)}>{label}</AppText>
  )
}

/** Duża karta wyboru (rola, rodzaj rejestracji). */
export function ChoiceCard({ icon, title, subtitle, selected, onPress, tone = 'light' }: {
  icon: string
  title: string
  subtitle?: string
  selected?: boolean
  onPress: () => void
  /** 'light' — na papierze; 'navy' — ciemna karta na granatowym tle */
  tone?: 'light' | 'navy'
}) {
  const { colors: c } = useTheme()
  const navy = tone === 'navy'
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ hovered }: any) => [
        styles.choice,
        navy
          ? { backgroundColor: hovered ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.12)' }
          : {
            backgroundColor: selected ? c.highlight : c.surface,
            borderColor: selected ? c.gold : c.border,
          },
      ]}
    >
      <Icon name={icon} size={26} color={navy ? c.gold : c.goldInk} />
      <View style={styles.choiceBody}>
        <AppText style={[styles.choiceTitle, { color: navy ? '#FFFFFF' : c.text }]}>{title}</AppText>
        {!!subtitle && <AppText style={[styles.choiceSub, { color: navy ? '#C9D3E3' : c.subtext }]}>{subtitle}</AppText>}
      </View>
      <Icon
        name={selected !== undefined ? (selected ? 'radiobox-marked' : 'radiobox-blank') : 'chevron-right'}
        size={22}
        color={selected ? c.primary : navy ? '#8497B5' : c.iconMuted}
      />
    </Pressable>
  )
}

/** Komunikat błędu pod formularzem. */
export function FormError({ message }: { message: string | null | undefined }) {
  const { colors: c } = useTheme()
  if (!message) return null
  return (
    <View style={[styles.error, { backgroundColor: c.dangerSurface }]}>
      <Icon name="alert-circle" size={18} color={c.dangerStrong} filled />
      <AppText style={[styles.errorText, { color: c.danger }]}>{message}</AppText>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: radius.input,
    borderWidth: 1,
    paddingLeft: 14,
    paddingRight: 12,
    gap: 8,
  },
  input: { flex: 1, height: '100%', fontSize: 15, ...sans(600), outlineStyle: 'none' } as any,
  consent: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', cursor: 'pointer' } as any,
  consentText: { flex: 1, ...sans(500), fontSize: 13, lineHeight: 19 },
  link: { ...sans(700), textDecorationLine: 'underline' },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    cursor: 'pointer',
  } as any,
  choiceBody: { flex: 1, gap: 2 },
  choiceTitle: { ...sans(800), fontSize: 15, lineHeight: 20 },
  choiceSub: { ...sans(500), fontSize: 12, lineHeight: 17 },
  error: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12 },
  errorText: { flex: 1, ...sans(600), fontSize: 13 },
})
